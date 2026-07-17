import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  assertRateLimit: vi.fn(),
  userFindUnique: vi.fn(),
  transactionUserFindUnique: vi.fn(),
  transactionUserCount: vi.fn(),
  transactionUserDelete: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  verificationDeleteMany: vi.fn(),
  verificationCreate: vi.fn(),
  auditUpdateMany: vi.fn(),
  auditUpdate: vi.fn(),
  reviewUpdateMany: vi.fn(),
  commentUpdateMany: vi.fn(),
  contentReportUpdateMany: vi.fn(),
  comparePassword: vi.fn(),
  cookieDelete: vi.fn(),
  after: vi.fn(),
  emailDeliveryEnabled: vi.fn(),
  emailConfigured: vi.fn(),
  sendDeletionConfirmation: vi.fn(),
  sendExportConfirmation: vi.fn(),
}));

const transaction = {
  $queryRaw: mocks.queryRaw,
  $executeRaw: mocks.executeRaw,
  user: {
    findUnique: mocks.transactionUserFindUnique,
    count: mocks.transactionUserCount,
    delete: mocks.transactionUserDelete,
  },
  verificationToken: {
    deleteMany: mocks.verificationDeleteMany,
    create: mocks.verificationCreate,
  },
  adminAuditLog: {
    updateMany: mocks.auditUpdateMany,
    update: mocks.auditUpdate,
  },
  review: { updateMany: mocks.reviewUpdateMany },
  comment: { updateMany: mocks.commentUpdateMany },
  contentReport: { updateMany: mocks.contentReportUpdateMany },
};

vi.mock('@/lib/server/authz', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/server/rate-limit', () => ({
  assertRateLimit: mocks.assertRateLimit,
  getClientIp: vi.fn(() => '203.0.113.10'),
}));
vi.mock('@/lib/prisma', () => ({
  default: {
    user: { findUnique: mocks.userFindUnique },
    verificationToken: { deleteMany: mocks.verificationDeleteMany },
    $transaction: vi.fn((callback: (client: typeof transaction) => unknown) => callback(transaction)),
  },
}));
vi.mock('bcryptjs', () => ({ default: { compare: mocks.comparePassword } }));
vi.mock('@/lib/server/auth-email', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/server/auth-email')>(),
  isAuthEmailDeliveryEnabled: mocks.emailDeliveryEnabled,
  isAuthEmailConfigured: mocks.emailConfigured,
  sendAccountDeletionConfirmation: mocks.sendDeletionConfirmation,
  sendAccountExportConfirmation: mocks.sendExportConfirmation,
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [
      { name: 'authjs.session-token', value: 'secret' },
      { name: 'theme', value: 'dark' },
    ],
    delete: mocks.cookieDelete,
  })),
}));
vi.mock('next/server', async (importOriginal) => ({
  ...await importOriginal<typeof import('next/server')>(),
  after: mocks.after,
}));

import { GET as exportAccountGet, POST as exportAccount } from './export/route';
import { POST as requestAccountExport } from './export/request/route';
import { POST as deleteAccount } from './delete-account/route';
import { POST as requestAccountDeletion } from './delete-account/request/route';

function deletionRequest(body: object) {
  return new NextRequest('https://novelverse.test/api/user/delete-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function exportRequest(body: object) {
  return new NextRequest('https://novelverse.test/api/user/export', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: 'user-a' });
  mocks.assertRateLimit.mockResolvedValue(undefined);
  mocks.queryRaw.mockResolvedValue([]);
  mocks.executeRaw.mockResolvedValue(0);
  mocks.verificationDeleteMany.mockResolvedValue({ count: 1 });
  mocks.verificationCreate.mockResolvedValue({});
  mocks.auditUpdateMany.mockResolvedValue({ count: 0 });
  mocks.auditUpdate.mockResolvedValue({ id: 'audit-a' });
  mocks.reviewUpdateMany.mockResolvedValue({ count: 0 });
  mocks.commentUpdateMany.mockResolvedValue({ count: 0 });
  mocks.contentReportUpdateMany.mockResolvedValue({ count: 0 });
  mocks.transactionUserCount.mockResolvedValue(2);
  mocks.transactionUserDelete.mockResolvedValue({ id: 'user-a' });
  mocks.comparePassword.mockResolvedValue(true);
  mocks.after.mockImplementation(() => undefined);
  mocks.emailDeliveryEnabled.mockReturnValue(true);
  mocks.emailConfigured.mockReturnValue(true);
  mocks.sendDeletionConfirmation.mockResolvedValue(undefined);
  mocks.sendExportConfirmation.mockResolvedValue(undefined);
});

describe('account data routes', () => {
  it('비밀 필드를 선택하지 않고 사용자 데이터 JSON을 no-store attachment로 내보낸다', async () => {
    mocks.transactionUserFindUnique
      .mockResolvedValueOnce({
        id: 'user-a',
        email: 'user@example.com',
        password: null,
        emailVerified: new Date(),
        suspendedAt: null,
      })
      .mockResolvedValueOnce({
      id: 'user-a',
      email: 'user@example.com',
      novels: [],
      reviews: [],
      });

    const response = await exportAccount(exportRequest({ token: 'e'.repeat(32) }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(payload.user.password).toBeUndefined();
    const exportSelect = mocks.transactionUserFindUnique.mock.calls[1][0].select;
    expect(exportSelect.password).toBeUndefined();
    expect(exportSelect.novels.select.reviewedById).toBeUndefined();
    expect(exportSelect.reviews.select.moderatedById).toBeUndefined();
    expect(exportSelect.comments.select.moderatedById).toBeUndefined();
    expect(exportSelect.contentReports.select.targetSnapshot).toBeUndefined();
  });

  it('GET 직접 데이터 내보내기는 405로 차단한다', () => {
    const response = exportAccountGet();
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('검증된 계정의 내보내기 step-up 토큰을 이메일로 요청한다', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-a',
      email: 'user@example.com',
      emailVerified: new Date(),
      suspendedAt: null,
    });
    mocks.transactionUserFindUnique.mockResolvedValue({
      email: 'user@example.com',
      emailVerified: new Date(),
      suspendedAt: null,
    });

    const response = await requestAccountExport(new NextRequest(
      'https://novelverse.test/api/user/export/request',
      { method: 'POST' },
    ));

    expect(response.status).toBe(200);
    expect(mocks.verificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        identifier: 'account-export:user@example.com',
        token: expect.any(String),
        expires: expect.any(Date),
      }),
    });
    expect(mocks.sendExportConfirmation).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(String),
    );
  });

  it('검증된 계정의 삭제 step-up 토큰을 이메일로 요청한다', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-a',
      email: 'user@example.com',
      emailVerified: new Date(),
      suspendedAt: null,
    });
    mocks.transactionUserFindUnique.mockResolvedValue({
      email: 'user@example.com',
      emailVerified: new Date(),
      suspendedAt: null,
    });

    const response = await requestAccountDeletion(new NextRequest(
      'https://novelverse.test/api/user/delete-account/request',
      { method: 'POST' },
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.verificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        identifier: 'account-deletion:user@example.com',
        token: expect.any(String),
        expires: expect.any(Date),
      }),
    });
    expect(mocks.sendDeletionConfirmation).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(String),
    );
  });

  it('운영 메일 설정이 없으면 삭제 확인 요청을 503으로 차단한다', async () => {
    mocks.emailDeliveryEnabled.mockReturnValue(false);

    const response = await requestAccountDeletion(new NextRequest(
      'https://novelverse.test/api/user/delete-account/request',
      { method: 'POST' },
    ));

    expect(response.status).toBe(503);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it('credentials 계정은 이메일과 현재 비밀번호를 확인한 뒤 cascade 삭제한다', async () => {
    mocks.transactionUserFindUnique.mockResolvedValue({
      id: 'user-a',
      email: 'user@example.com',
      password: 'password-hash',
      role: 'USER',
    });

    const response = await deleteAccount(deletionRequest({
      emailConfirmation: 'USER@example.com',
      token: 'd'.repeat(32),
      password: 'current-password',
    }));

    expect(response.status).toBe(200);
    expect(mocks.comparePassword).toHaveBeenCalledWith('current-password', 'password-hash');
    expect(mocks.verificationDeleteMany.mock.calls[0][0]).toEqual({
      where: expect.objectContaining({
        identifier: 'account-deletion:user@example.com',
        token: expect.any(String),
        expires: { gt: expect.any(Date) },
      }),
    });
    expect(mocks.auditUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { targetType: 'user', targetId: 'user-a' },
      data: expect.objectContaining({
        message: expect.not.stringContaining('user@example.com'),
      }),
    }));
    expect(mocks.executeRaw).toHaveBeenCalled();
    expect(mocks.reviewUpdateMany).toHaveBeenCalledWith({
      where: { moderatedById: 'user-a' },
      data: { moderatedById: null },
    });
    expect(mocks.commentUpdateMany).toHaveBeenCalledWith({
      where: { moderatedById: 'user-a' },
      data: { moderatedById: null },
    });
    expect(mocks.contentReportUpdateMany).toHaveBeenCalledWith({
      where: { resolvedById: 'user-a' },
      data: { resolvedById: null },
    });
    expect(mocks.verificationDeleteMany).toHaveBeenCalledWith({
      where: {
        identifier: {
          in: expect.arrayContaining([
            'account-deletion:user@example.com',
            'account-export:user@example.com',
          ]),
        },
      },
    });
    expect(mocks.transactionUserDelete).toHaveBeenCalledWith({
      where: { id: 'user-a' },
      select: { id: true },
    });
    expect(mocks.cookieDelete).toHaveBeenCalledWith('authjs.session-token');
    expect(mocks.cookieDelete).not.toHaveBeenCalledWith('theme');
  });

  it('OAuth 전용 계정은 확인 이메일이 일치하면 비밀번호 없이 삭제한다', async () => {
    mocks.transactionUserFindUnique.mockResolvedValue({
      id: 'user-a',
      email: 'user@example.com',
      password: null,
      role: 'USER',
    });

    const response = await deleteAccount(deletionRequest({
      emailConfirmation: 'user@example.com',
      token: 'd'.repeat(32),
    }));

    expect(response.status).toBe(200);
    expect(mocks.comparePassword).not.toHaveBeenCalled();
    expect(mocks.transactionUserDelete).toHaveBeenCalled();
  });

  it('삭제 확인 토큰이 만료되었거나 재사용되면 계정을 삭제하지 않는다', async () => {
    mocks.transactionUserFindUnique.mockResolvedValue({
      id: 'user-a',
      email: 'user@example.com',
      password: null,
      role: 'USER',
    });
    mocks.verificationDeleteMany.mockResolvedValueOnce({ count: 0 });

    const response = await deleteAccount(deletionRequest({
      emailConfirmation: 'user@example.com',
      token: 'd'.repeat(32),
    }));

    expect(response.status).toBe(403);
    expect(mocks.transactionUserDelete).not.toHaveBeenCalled();
  });

  it('마지막 관리자의 계정 삭제를 차단한다', async () => {
    mocks.transactionUserFindUnique.mockResolvedValue({
      id: 'admin-a',
      email: 'admin@example.com',
      password: null,
      role: 'ADMIN',
    });
    mocks.transactionUserCount.mockResolvedValue(1);

    const response = await deleteAccount(deletionRequest({
      emailConfirmation: 'admin@example.com',
      token: 'd'.repeat(32),
    }));

    expect(response.status).toBe(409);
    expect(mocks.transactionUserCount).toHaveBeenCalledWith({
      where: { role: 'ADMIN', suspendedAt: null },
    });
    expect(mocks.queryRaw.mock.calls[0][0].join('')).toContain(
      "pg_advisory_xact_lock(hashtext('novelverse:admin-role-change'))",
    );
    expect(mocks.transactionUserDelete).not.toHaveBeenCalled();
  });
});
