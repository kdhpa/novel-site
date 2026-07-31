import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireOpsAdmin: vi.fn(),
  currentAdminFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  userCount: vi.fn(),
  userUpdateMany: vi.fn(),
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

import { PATCH } from './[id]/role/route';

function request(body: object) {
  return new Request('https://ops.novelverse.test/api/ops/users/author-a/role', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function author(overrides: Record<string, unknown> = {}) {
  return {
    email: 'author@example.com',
    nickname: '작가',
    role: 'AUTHOR',
    isVerifiedAuthor: true,
    canSkipReview: false,
    suspendedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOpsAdmin.mockResolvedValue({ id: 'admin-a', role: 'ADMIN' });
  mocks.currentAdminFindFirst.mockResolvedValue({ id: 'admin-a' });
  mocks.queryRaw.mockResolvedValue([]);
  mocks.userCount.mockResolvedValue(2);
  mocks.userUpdateMany.mockResolvedValue({ count: 1 });
  mocks.auditCreate.mockResolvedValue({ id: 'audit-a' });
});

describe('Ops 계정 역할 변경 API', () => {
  it('작가의 수정 재심사 면제를 설정하고 감사로그에 이전·이후 값을 기록한다', async () => {
    mocks.userFindUnique.mockResolvedValue(author());

    const response = await PATCH(request({ role: 'AUTHOR', canSkipReview: true }), {
      params: Promise.resolve({ id: 'author-a' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'author-a',
        role: 'AUTHOR',
        isVerifiedAuthor: true,
        canSkipReview: false,
      },
      data: {
        role: 'AUTHOR',
        isVerifiedAuthor: true,
        canSkipReview: true,
      },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'user.review-exemption.enable',
        metadata: expect.objectContaining({
          previousCanSkipReview: false,
          nextCanSkipReview: true,
        }),
      }),
    }));
  });

  it('작가 요청에서 면제 필드가 누락되면 기존 값을 보존한다', async () => {
    mocks.userFindUnique.mockResolvedValue(author({ canSkipReview: true }));

    const response = await PATCH(request({ role: 'AUTHOR' }), {
      params: Promise.resolve({ id: 'author-a' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('작가가 아닌 역할에는 요청값과 관계없이 면제를 해제한다', async () => {
    mocks.userFindUnique.mockResolvedValue(author({ canSkipReview: true }));

    const response = await PATCH(request({ role: 'USER', canSkipReview: true }), {
      params: Promise.resolve({ id: 'author-a' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.userUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        role: 'USER',
        canSkipReview: false,
      }),
    }));
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'user.role.update',
        metadata: expect.objectContaining({
          previousCanSkipReview: true,
          nextCanSkipReview: false,
        }),
      }),
    }));
  });
});
