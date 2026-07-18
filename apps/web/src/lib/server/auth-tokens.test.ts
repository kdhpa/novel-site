import { describe, expect, it, vi } from 'vitest';
import {
  AUTH_TOKEN_TTL_MS,
  authTokenIdentifier,
  consumeAuthToken,
  createAuthToken,
  hashAuthToken,
  storeAuthToken,
} from './auth-tokens';

describe('auth tokens', () => {
  it('목적과 소문자 이메일을 identifier에 포함하고 원문 대신 SHA-256 해시를 저장한다', async () => {
    const token = createAuthToken('emailVerification', ' User@Example.COM ');
    const client = {
      verificationToken: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({}),
      },
    };

    await storeAuthToken(client as never, token);

    expect(token.identifier).toBe('email-verification:user@example.com');
    expect(token.tokenHash).toBe(hashAuthToken(token.rawToken));
    expect(token.tokenHash).not.toContain(token.rawToken);
    expect(client.verificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ token: token.tokenHash }),
    });
  });

  it('목적이 다른 토큰 identifier를 분리한다', () => {
    expect(authTokenIdentifier('passwordReset', 'USER@example.com'))
      .toBe('password-reset:user@example.com');
    expect(authTokenIdentifier('accountDeletion', 'USER@example.com'))
      .toBe('account-deletion:user@example.com');
    expect(authTokenIdentifier('accountExport', 'USER@example.com'))
      .toBe('account-export:user@example.com');
    expect(AUTH_TOKEN_TTL_MS.accountDeletion).toBe(10 * 60_000);
    expect(AUTH_TOKEN_TTL_MS.accountExport).toBe(10 * 60_000);
  });

  it('만료 전 일치 토큰을 원자적 deleteMany로 한 번만 소비한다', async () => {
    const deleteMany = vi.fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const client = { verificationToken: { deleteMany } };
    const now = new Date('2026-07-17T00:00:00.000Z');

    await expect(consumeAuthToken(
      client as never,
      'passwordReset',
      'user@example.com',
      'raw-token',
      now,
    )).resolves.toBe(true);
    await expect(consumeAuthToken(
      client as never,
      'passwordReset',
      'user@example.com',
      'raw-token',
      now,
    )).resolves.toBe(false);

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        identifier: 'password-reset:user@example.com',
        token: hashAuthToken('raw-token'),
        expires: { gt: now },
      },
    });
  });
});
