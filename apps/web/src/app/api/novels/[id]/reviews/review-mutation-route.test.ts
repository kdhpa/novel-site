import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  assertOwnerOrAdmin: vi.fn(),
  assertRateLimit: vi.fn(),
  reviewFindFirst: vi.fn(),
  reviewUpdate: vi.fn(),
  reviewDelete: vi.fn(),
}));

vi.mock('@/lib/server/authz', () => ({
  requireUser: mocks.requireUser,
  assertOwnerOrAdmin: mocks.assertOwnerOrAdmin,
}));
vi.mock('@/lib/server/rate-limit', () => ({
  assertRateLimit: mocks.assertRateLimit,
}));
vi.mock('@/lib/prisma', () => ({
  default: {
    review: {
      findFirst: mocks.reviewFindFirst,
      update: mocks.reviewUpdate,
      delete: mocks.reviewDelete,
    },
  },
}));

import { DELETE, PATCH } from './[reviewId]/route';

function patchRequest() {
  return new NextRequest(
    'https://novelverse.test/api/novels/novel-a/reviews/review-a',
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '수정한 리뷰' }),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: 'admin-a', role: 'ADMIN' });
  mocks.assertOwnerOrAdmin.mockResolvedValue(undefined);
  mocks.assertRateLimit.mockResolvedValue(undefined);
  mocks.reviewFindFirst.mockResolvedValue({
    id: 'review-a',
    userId: 'user-a',
    novelId: 'novel-a',
  });
});

describe('review PATCH/DELETE 권한', () => {
  it('관리자라도 다른 사용자의 리뷰를 수정할 수 없다', async () => {
    const response = await PATCH(patchRequest(), {
      params: Promise.resolve({ id: 'novel-a', reviewId: 'review-a' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.assertOwnerOrAdmin).not.toHaveBeenCalled();
    expect(mocks.reviewUpdate).not.toHaveBeenCalled();
  });

  it('관리자도 작성자 대신 리뷰를 직접 삭제할 수 없다', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'admin-a', role: 'ADMIN' });
    mocks.reviewDelete.mockResolvedValue({ id: 'review-a' });

    const response = await DELETE(
      new NextRequest(
        'https://novelverse.test/api/novels/novel-a/reviews/review-a',
        { method: 'DELETE' },
      ),
      { params: Promise.resolve({ id: 'novel-a', reviewId: 'review-a' }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.assertOwnerOrAdmin).not.toHaveBeenCalled();
    expect(mocks.reviewDelete).not.toHaveBeenCalled();
  });
});
