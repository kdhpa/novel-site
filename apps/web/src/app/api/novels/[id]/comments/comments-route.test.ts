import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireUser: vi.fn(),
  isCurrentAdmin: vi.fn(),
  assertOwnerOrAdmin: vi.fn(),
  assertCommentMutationRateLimit: vi.fn(),
  novelFindUnique: vi.fn(),
  novelFindFirst: vi.fn(),
  commentFindMany: vi.fn(),
  commentCount: vi.fn(),
  commentFindFirst: vi.fn(),
  commentCreate: vi.fn(),
  commentUpdate: vi.fn(),
  commentDelete: vi.fn(),
  commentDeleteMany: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/server/authz', () => ({
  requireUser: mocks.requireUser,
  isCurrentAdmin: mocks.isCurrentAdmin,
  assertOwnerOrAdmin: mocks.assertOwnerOrAdmin,
}));
vi.mock('@/lib/server/comment-rate-limit', () => ({
  assertCommentMutationRateLimit: mocks.assertCommentMutationRateLimit,
}));
vi.mock('@/lib/prisma', () => ({
  default: {
    novel: {
      findUnique: mocks.novelFindUnique,
      findFirst: mocks.novelFindFirst,
    },
    comment: {
      findMany: mocks.commentFindMany,
      count: mocks.commentCount,
      findFirst: mocks.commentFindFirst,
      create: mocks.commentCreate,
      update: mocks.commentUpdate,
      delete: mocks.commentDelete,
      deleteMany: mocks.commentDeleteMany,
    },
  },
}));

import { GET, POST } from './route';
import { DELETE, PATCH } from './[commentId]/route';
import { DELETED_COMMENT_CONTENT } from '@/lib/server/comments';

function jsonRequest(url: string, method: string, body: object) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(null);
  mocks.requireUser.mockResolvedValue({ id: 'user-a' });
  mocks.assertOwnerOrAdmin.mockResolvedValue(undefined);
  mocks.assertCommentMutationRateLimit.mockResolvedValue(undefined);
  mocks.commentFindMany.mockResolvedValue([]);
  mocks.commentCount.mockResolvedValue(0);
});

describe('comments GET', () => {
  it('공개 승인 작품의 최상위 댓글을 안정된 순서로 조회한다', async () => {
    mocks.novelFindUnique.mockResolvedValue({
      authorId: 'author-a',
      isPublished: true,
      approvalStatus: 'APPROVED',
    });

    const response = await GET(
      new NextRequest('https://novelverse.test/api/novels/novel-a/comments?page=2'),
      { params: Promise.resolve({ id: 'novel-a' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.commentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { novelId: 'novel-a', parentId: null, isHidden: false },
      skip: 10,
      take: 10,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
  });
});

describe('comments POST', () => {
  it('다른 작품이나 중첩 댓글 ID를 답글 부모로 사용할 수 없다', async () => {
    mocks.novelFindFirst.mockResolvedValue({ id: 'novel-a' });
    mocks.commentFindFirst.mockResolvedValue({
      novelId: 'novel-b',
      parentId: null,
      content: '다른 작품 댓글',
    });

    const response = await POST(
      jsonRequest(
        'https://novelverse.test/api/novels/novel-a/comments',
        'POST',
        { content: '답글', parentId: 'foreign-comment' },
      ),
      { params: Promise.resolve({ id: 'novel-a' }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.commentFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'foreign-comment', novelId: 'novel-a', isHidden: false },
    }));
    expect(mocks.commentCreate).not.toHaveBeenCalled();

    mocks.commentFindFirst.mockResolvedValue({
      novelId: 'novel-a',
      parentId: 'root-comment',
      content: '이미 답글',
    });
    const nestedResponse = await POST(
      jsonRequest(
        'https://novelverse.test/api/novels/novel-a/comments',
        'POST',
        { content: '중첩 답글', parentId: 'reply-comment' },
      ),
      { params: Promise.resolve({ id: 'novel-a' }) },
    );
    expect(nestedResponse.status).toBe(400);
    expect(mocks.commentCreate).not.toHaveBeenCalled();
  });
});

describe('comments PATCH/DELETE', () => {
  it('route의 novelId와 일치하지 않는 댓글 수정을 404로 차단한다', async () => {
    mocks.commentFindFirst.mockResolvedValue(null);

    const response = await PATCH(
      jsonRequest(
        'https://novelverse.test/api/novels/novel-a/comments/comment-b',
        'PATCH',
        { content: '바꾼 내용' },
      ),
      { params: Promise.resolve({ id: 'novel-a', commentId: 'comment-b' }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.commentFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'comment-b', novelId: 'novel-a' },
    }));
    expect(mocks.commentUpdate).not.toHaveBeenCalled();
  });

  it('관리자라도 다른 사용자의 댓글을 수정할 수 없다', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'admin-a', role: 'ADMIN' });
    mocks.commentFindFirst.mockResolvedValue({
      id: 'comment-a',
      userId: 'user-a',
      content: '원문',
      parentId: null,
      _count: { replies: 0 },
    });

    const response = await PATCH(
      jsonRequest(
        'https://novelverse.test/api/novels/novel-a/comments/comment-a',
        'PATCH',
        { content: '관리자가 바꾼 내용' },
      ),
      { params: Promise.resolve({ id: 'novel-a', commentId: 'comment-a' }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.assertOwnerOrAdmin).not.toHaveBeenCalled();
    expect(mocks.commentUpdate).not.toHaveBeenCalled();
  });

  it('관리자도 작성자 대신 댓글을 직접 삭제할 수 없다', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'admin-a', role: 'ADMIN' });
    mocks.commentFindFirst.mockResolvedValue({
      id: 'comment-a',
      userId: 'user-a',
      content: '원문',
      parentId: null,
      _count: { replies: 0 },
    });
    mocks.commentDelete.mockResolvedValue({ id: 'comment-a' });

    const response = await DELETE(
      new NextRequest('https://novelverse.test/api/novels/novel-a/comments/comment-a', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: 'novel-a', commentId: 'comment-a' }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.assertOwnerOrAdmin).not.toHaveBeenCalled();
    expect(mocks.commentDelete).not.toHaveBeenCalled();
  });

  it('답글이 있는 댓글은 원문을 폐기한 tombstone으로 바꾼다', async () => {
    mocks.commentFindFirst.mockResolvedValue({
      id: 'comment-a',
      userId: 'user-a',
      content: '민감한 원문',
      parentId: null,
      _count: { replies: 2 },
    });
    mocks.commentUpdate.mockResolvedValue({ id: 'comment-a' });

    const response = await DELETE(
      new NextRequest('https://novelverse.test/api/novels/novel-a/comments/comment-a', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: 'novel-a', commentId: 'comment-a' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.commentUpdate).toHaveBeenCalledWith({
      where: { id: 'comment-a' },
      data: { content: DELETED_COMMENT_CONTENT },
      select: { id: true },
    });
    expect(mocks.commentDelete).not.toHaveBeenCalled();
  });
});
