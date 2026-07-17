import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireOpsAdmin: vi.fn(),
  currentAdminFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  userCount: vi.fn(),
  userUpdateMany: vi.fn(),
  sessionDeleteMany: vi.fn(),
  auditCreate: vi.fn(),
  queryRaw: vi.fn(),
}));

const transaction = {
  $queryRaw: mocks.queryRaw,
  user: {
    findFirst: mocks.currentAdminFindFirst,
    findUnique: mocks.userFindUnique,
    count: mocks.userCount,
    updateMany: mocks.userUpdateMany,
  },
  session: { deleteMany: mocks.sessionDeleteMany },
  adminAuditLog: { create: mocks.auditCreate },
};

vi.mock('../../../../lib/api', () => {
  class OpsApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    OpsApiError,
    requireOpsAdmin: mocks.requireOpsAdmin,
    fail: (status: number, error: string) => Response.json({ success: false, error }, { status }),
    message: (message: string) => Response.json({ success: true, message }),
    handleOpsApiError: (error: unknown, fallback: string) => error instanceof OpsApiError
      ? Response.json({ success: false, error: error.message }, { status: error.status })
      : Response.json({ success: false, error: fallback }, { status: 500 }),
  };
});
vi.mock('@novelverse/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('@novelverse/db')>();
  return {
    ...original,
    prisma: {
      $transaction: vi.fn((callback: (client: typeof transaction) => unknown) => callback(transaction)),
    },
  };
});

import { PATCH } from './[id]/suspension/route';

function request(body: object) {
  return new Request('https://ops.novelverse.test/api/ops/users/user-a/suspension', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOpsAdmin.mockResolvedValue({ id: 'admin-a', role: 'ADMIN' });
  mocks.currentAdminFindFirst.mockResolvedValue({ id: 'admin-a' });
  mocks.queryRaw.mockResolvedValue([]);
  mocks.userCount.mockResolvedValue(2);
  mocks.userUpdateMany.mockResolvedValue({ count: 1 });
  mocks.sessionDeleteMany.mockResolvedValue({ count: 0 });
  mocks.auditCreate.mockResolvedValue({ id: 'audit-a' });
});

describe('Ops account suspension route', () => {
  it('일반 계정을 정지하고 세션 폐기와 감사 로그를 같은 트랜잭션에 기록한다', async () => {
    mocks.userFindUnique.mockResolvedValue({
      email: 'user@example.com',
      nickname: '독자',
      role: 'USER',
      suspendedAt: null,
      suspensionReason: null,
    });

    const response = await PATCH(request({ suspended: true, reason: '반복적인 괴롭힘' }), {
      params: Promise.resolve({ id: 'user-a' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.userUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-a', suspendedAt: null },
      data: expect.objectContaining({
        suspendedAt: expect.any(Date),
        suspensionReason: '반복적인 괴롭힘',
      }),
    }));
    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user-a' } });
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'user.suspend', targetId: 'user-a' }),
    }));
  });

  it('마지막 활성 관리자 정지를 차단한다', async () => {
    mocks.userFindUnique.mockResolvedValue({
      email: 'other-admin@example.com',
      nickname: null,
      role: 'ADMIN',
      suspendedAt: null,
      suspensionReason: null,
    });
    mocks.userCount.mockResolvedValue(1);

    const response = await PATCH(request({ suspended: true, reason: '보안 사고 조사' }), {
      params: Promise.resolve({ id: 'other-admin' }),
    });

    expect(response.status).toBe(409);
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
  });

  it('관리자 본인 정지는 트랜잭션 전에 차단한다', async () => {
    const response = await PATCH(request({ suspended: true, reason: '실수' }), {
      params: Promise.resolve({ id: 'admin-a' }),
    });
    expect(response.status).toBe(400);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });
});
