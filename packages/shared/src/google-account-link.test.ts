import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@novelverse/db/client';
import { finalizeVerifiedGoogleAccountLink } from './google-account-link';

function createClient(claimedCount: number) {
  const userUpdateMany = vi.fn().mockResolvedValue({ count: claimedCount });
  const userUpdate = vi.fn().mockResolvedValue({ id: 'user-a' });
  const sessionDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const verificationTokenDeleteMany = vi.fn().mockResolvedValue({ count: 2 });
  const client = {
    user: { updateMany: userUpdateMany, update: userUpdate },
    session: { deleteMany: sessionDeleteMany },
    verificationToken: { deleteMany: verificationTokenDeleteMany },
  } as unknown as Pick<Prisma.TransactionClient, 'user' | 'session' | 'verificationToken'>;

  return {
    client,
    userUpdateMany,
    userUpdate,
    sessionDeleteMany,
    verificationTokenDeleteMany,
  };
}

describe('Google account linking security', () => {
  it('미인증 credentials 선점 계정의 비밀번호와 기존 인증 상태를 폐기한다', async () => {
    const mocks = createClient(1);
    const now = new Date('2026-07-17T00:00:00.000Z');

    const result = await finalizeVerifiedGoogleAccountLink(
      mocks.client,
      'user-a',
      '  Victim@Example.COM  ',
      now,
    );

    expect(result.passwordInvalidated).toBe(true);
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-a',
        emailVerified: null,
        password: { not: null },
      },
      data: {
        email: 'victim@example.com',
        emailNormalized: 'victim@example.com',
        emailVerified: now,
        password: null,
        passwordChangedAt: now,
      },
    });
    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user-a' } });
    expect(mocks.verificationTokenDeleteMany).toHaveBeenCalledWith({
      where: {
        identifier: {
          in: [
            'email-verification:victim@example.com',
            'password-reset:victim@example.com',
            'account-deletion:victim@example.com',
            'account-export:victim@example.com',
          ],
        },
      },
    });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('이미 검증된 혼합 계정의 기존 비밀번호와 세션은 보존한다', async () => {
    const mocks = createClient(0);
    const now = new Date('2026-07-17T00:00:00.000Z');

    const result = await finalizeVerifiedGoogleAccountLink(
      mocks.client,
      'user-a',
      'victim@example.com',
      now,
    );

    expect(result.passwordInvalidated).toBe(false);
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-a' },
      data: {
        email: 'victim@example.com',
        emailNormalized: 'victim@example.com',
        emailVerified: now,
      },
      select: { id: true },
    });
    expect(mocks.sessionDeleteMany).not.toHaveBeenCalled();
    expect(mocks.verificationTokenDeleteMany).not.toHaveBeenCalled();
  });
});
