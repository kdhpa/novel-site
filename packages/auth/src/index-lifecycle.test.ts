import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type GoogleAccount = {
  provider: string;
  providerAccountId: string;
};

type CapturedAuthConfig = {
  callbacks: {
    signIn(input: {
      account: GoogleAccount;
      profile: unknown;
      user: { id: string };
    }): Promise<boolean>;
  };
  events: {
    linkAccount(input: {
      user: { id: string; email: string | null };
      account: GoogleAccount;
    }): Promise<void>;
  };
};

const mocks = vi.hoisted(() => {
  const transaction = { kind: 'transaction' };
  return {
    config: null as unknown as CapturedAuthConfig,
    transaction,
    userFindUnique: vi.fn(),
    accountFindUnique: vi.fn(),
    runTransaction: vi.fn((callback: (client: typeof transaction) => unknown) =>
      callback(transaction)
    ),
    finalizeGoogleLink: vi.fn().mockResolvedValue({ passwordInvalidated: false }),
  };
});

vi.mock('next-auth', () => ({
  default: vi.fn((config: CapturedAuthConfig) => {
    mocks.config = config;
    return {
      handlers: {},
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
  }),
}));
vi.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: vi.fn(() => ({})) }));
vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn((config) => ({ id: 'credentials', ...config })),
}));
vi.mock('next-auth/providers/google', () => ({
  default: vi.fn((config) => ({ id: 'google', ...config })),
}));
vi.mock('@novelverse/db', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    account: { findUnique: mocks.accountFindUnique },
    $transaction: mocks.runTransaction,
  },
}));
vi.mock('./auth.config', () => ({ authConfig: { callbacks: {} } }));
vi.mock('@novelverse/shared', async (importOriginal) => ({
  ...await importOriginal<typeof import('@novelverse/shared')>(),
  finalizeVerifiedGoogleAccountLink: mocks.finalizeGoogleLink,
}));

import './index';

const account = { provider: 'google', providerAccountId: 'google-subject' };
const profile = {
  sub: 'google-subject',
  email: 'Admin@Novel.Example',
  email_verified: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('OPS_GOOGLE_HOSTED_DOMAIN', '');
  mocks.userFindUnique.mockResolvedValue(null);
  mocks.accountFindUnique.mockResolvedValue(null);
  mocks.finalizeGoogleLink.mockResolvedValue({ passwordInvalidated: false });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Ops Google Auth.js lifecycle', () => {
  it('provider profile ID가 달라도 기존 활성 ADMIN 이메일의 최초 연결을 허용한다', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'admin-db-user',
      role: 'ADMIN',
      suspendedAt: null,
    });

    const allowed = await mocks.config.callbacks.signIn({
      account,
      profile,
      user: { id: 'provider-profile-id' },
    });

    expect(allowed).toBe(true);
    expect(mocks.finalizeGoogleLink).toHaveBeenCalledWith(
      mocks.transaction,
      'admin-db-user',
      'admin@novel.example',
    );
  });

  it('일반 사용자와 다른 사용자에게 이미 연결된 Google 계정은 거부한다', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-a',
      role: 'USER',
      suspendedAt: null,
    });
    expect(await mocks.config.callbacks.signIn({
      account,
      profile,
      user: { id: 'provider-profile-id' },
    })).toBe(false);

    mocks.userFindUnique.mockResolvedValue({
      id: 'admin-db-user',
      role: 'ADMIN',
      suspendedAt: null,
    });
    mocks.accountFindUnique.mockResolvedValue({ userId: 'different-user' });
    expect(await mocks.config.callbacks.signIn({
      account,
      profile,
      user: { id: 'different-user' },
    })).toBe(false);
  });

  it('linkAccount 이벤트에서는 실제 DB ADMIN user ID로 finalize한다', async () => {
    await mocks.config.events.linkAccount({
      account,
      user: { id: 'admin-db-user', email: 'admin@novel.example' },
    });

    expect(mocks.finalizeGoogleLink).toHaveBeenCalledWith(
      mocks.transaction,
      'admin-db-user',
      'admin@novel.example',
    );
  });
});
