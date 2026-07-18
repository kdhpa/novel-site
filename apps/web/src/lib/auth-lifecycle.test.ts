import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    signIn(input: {
      user: { id: string };
      account: GoogleAccount;
      profile: unknown;
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
vi.mock('./prisma', () => ({
  default: {
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

import './auth';

const account = { provider: 'google', providerAccountId: 'google-subject' };
const profile = {
  sub: 'google-subject',
  email: 'Victim@Example.com',
  email_verified: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindUnique.mockResolvedValue(null);
  mocks.accountFindUnique.mockResolvedValue(null);
  mocks.finalizeGoogleLink.mockResolvedValue({ passwordInvalidated: false });
});

describe('web Google Auth.js lifecycle', () => {
  it('provider profile ID가 달라도 이메일로 찾은 기존 DB 계정을 JWT 전에 보호한다', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: 'db-user', suspendedAt: null });

    const allowed = await mocks.config.callbacks.signIn({
      account,
      profile,
      user: { id: 'provider-profile-id' },
    });

    expect(allowed).toBe(true);
    expect(mocks.finalizeGoogleLink).toHaveBeenCalledWith(
      mocks.transaction,
      'db-user',
      'victim@example.com',
    );
  });

  it('신규 사용자는 callback에서 DB update를 시도하지 않고 linkAccount 실제 user로 마무리한다', async () => {
    const allowed = await mocks.config.callbacks.signIn({
      account,
      profile,
      user: { id: 'provider-profile-id' },
    });

    expect(allowed).toBe(true);
    expect(mocks.finalizeGoogleLink).not.toHaveBeenCalled();

    await mocks.config.events.linkAccount({
      account,
      user: { id: 'created-db-user', email: 'victim@example.com' },
    });
    expect(mocks.finalizeGoogleLink).toHaveBeenCalledWith(
      mocks.transaction,
      'created-db-user',
      'victim@example.com',
    );
  });

  it('같은 Google 계정이 다른 DB 사용자에 연결돼 있으면 이메일 linking을 거부한다', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: 'victim-user', suspendedAt: null });
    mocks.accountFindUnique.mockResolvedValue({
      userId: 'different-user',
      user: { id: 'different-user', suspendedAt: null },
    });

    const allowed = await mocks.config.callbacks.signIn({
      account,
      profile,
      user: { id: 'different-user' },
    });

    expect(allowed).toBe(false);
    expect(mocks.finalizeGoogleLink).not.toHaveBeenCalled();
  });
});
