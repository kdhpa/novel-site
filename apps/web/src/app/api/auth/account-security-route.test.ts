import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  verificationDeleteMany: vi.fn(),
  verificationCreate: vi.fn(),
  sessionDeleteMany: vi.fn(),
  assertRateLimit: vi.fn(),
  registrationEnabled: vi.fn(),
  emailConfigured: vi.fn(),
  sendPasswordReset: vi.fn(),
  sendEmailVerification: vi.fn(),
  hashPassword: vi.fn(),
}));

const transaction = {
  user: {
    findUnique: mocks.userFindUnique,
    update: mocks.userUpdate,
  },
  verificationToken: {
    deleteMany: mocks.verificationDeleteMany,
    create: mocks.verificationCreate,
  },
  session: { deleteMany: mocks.sessionDeleteMany },
};

vi.mock('@/lib/prisma', () => ({
  default: {
    user: { findUnique: mocks.userFindUnique },
    $transaction: vi.fn((callback: (client: typeof transaction) => unknown) => callback(transaction)),
  },
}));
vi.mock('@/lib/server/rate-limit', () => ({
  assertRateLimit: mocks.assertRateLimit,
  getClientIp: vi.fn(() => '203.0.113.10'),
}));
vi.mock('@/lib/server/auth-email', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/server/auth-email')>();
  return {
    ...original,
    isCredentialsRegistrationEnabled: mocks.registrationEnabled,
    isAuthEmailConfigured: mocks.emailConfigured,
    sendPasswordReset: mocks.sendPasswordReset,
    sendEmailVerification: mocks.sendEmailVerification,
  };
});
vi.mock('@/lib/auth', () => ({ hashPassword: mocks.hashPassword }));

import { POST as register } from './register/route';
import { POST as verifyEmail } from './verify-email/route';
import { POST as requestPasswordReset } from './password-reset/request/route';
import { POST as confirmPasswordReset } from './password-reset/confirm/route';

function jsonRequest(path: string, body: object) {
  return new NextRequest(`https://novelverse.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertRateLimit.mockResolvedValue(undefined);
  mocks.registrationEnabled.mockReturnValue(true);
  mocks.emailConfigured.mockReturnValue(true);
  mocks.verificationDeleteMany.mockResolvedValue({ count: 1 });
  mocks.verificationCreate.mockResolvedValue({});
  mocks.userUpdate.mockResolvedValue({ id: 'user-a' });
  mocks.sessionDeleteMany.mockResolvedValue({ count: 0 });
  mocks.sendPasswordReset.mockResolvedValue(undefined);
  mocks.hashPassword.mockResolvedValue('hashed-password');
});

describe('account security routes', () => {
  it('메일이 준비되지 않은 production credentials 가입을 503으로 닫는다', async () => {
    mocks.registrationEnabled.mockReturnValue(false);
    const response = await register(jsonRequest('/api/auth/register', {
      email: 'user@example.com',
      password: 'safe-password',
      nickname: '독자님',
    }));
    expect(response.status).toBe(503);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it('유효한 이메일 토큰을 소비한 뒤 emailVerified를 기록한다', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: 'user-a' });
    const response = await verifyEmail(jsonRequest('/api/auth/verify-email', {
      email: 'USER@example.com',
      token: 'a'.repeat(32),
    }));
    expect(response.status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-a' },
      data: expect.objectContaining({ email: 'user@example.com', emailVerified: expect.any(Date) }),
    }));
  });

  it('비밀번호 재설정 요청은 계정 존재 여부를 같은 공개 응답으로 숨긴다', async () => {
    mocks.userFindUnique.mockResolvedValueOnce(null);
    const missing = await requestPasswordReset(jsonRequest('/api/auth/password-reset/request', {
      email: 'missing@example.com',
    }));
    const missingPayload = await missing.json();

    mocks.userFindUnique.mockResolvedValueOnce({
      id: 'user-a',
      email: 'user@example.com',
      emailVerified: new Date(),
    });
    const existing = await requestPasswordReset(jsonRequest('/api/auth/password-reset/request', {
      email: 'user@example.com',
    }));
    const existingPayload = await existing.json();

    expect(missing.status).toBe(200);
    expect(existing.status).toBe(200);
    expect(missingPayload.data.message).toBe(existingPayload.data.message);
    expect(mocks.sendPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('재설정 토큰을 한 번 소비하고 비밀번호 변경 시각과 기존 세션 폐기를 함께 저장한다', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: 'user-a' });
    const response = await confirmPasswordReset(jsonRequest('/api/auth/password-reset/confirm', {
      email: 'user@example.com',
      token: 'b'.repeat(32),
      password: 'new-safe-password',
    }));

    expect(response.status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-a' },
      data: expect.objectContaining({
        password: 'hashed-password',
        passwordChangedAt: expect.any(Date),
      }),
    }));
    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user-a' } });
  });
});
