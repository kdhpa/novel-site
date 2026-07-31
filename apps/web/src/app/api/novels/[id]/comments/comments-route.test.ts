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
  commentFindUnique: vi.fn(),
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
      findUnique: mocks.commentFindUnique,
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
import { buildIdempotentCommentId, DELETED_COMMENT_CONTENT } from '@/lib/server/comments';

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
  mocks.commentFindUnique.mockResolvedValue(null);
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
  it('같은 사용자·요청 ID의 재전송은 기존 댓글을 반환하고 다시 생성하지 않는다', async () => {
    const clientRequestId = '0198a574-bb7a-7e1a-a8a8-77983a281f05';
    mocks.commentFindUnique.mockResolvedValue({
      id: buildIdempotentCommentId('user-a', clientRequestId),
      novelId: 'novel-a',
      userId: 'user-a',
      content: '좋은 작품이에요.',
      parentId: null,
      createdAt: new Date('2026-07-19T00:00:00.000Z'),
      updatedAt: new Date('2026-07-19T00:00:00.000Z'),
      user: { id: 'user-a', nickname: '독자', image: null },
    });

    const response = await POST(
      jsonRequest(
        'https://novelverse.test/api/novels/novel-a/comments',
        'POST',
        { content: '좋은 작품이에요.', clientRequestId },
      ),
      { params: Promise.resolve({ id: 'novel-a' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.assertCommentMutationRateLimit).not.toHaveBeenCalled();
    expect(mocks.commentCreate).not.toHaveBeenCalled();
  });

  it('요청 ID를 다른 댓글 입력에 재사용하면 409로 거부한다', async () => {
    const clientRequestId = '0198a574-bb7a-7e1a-a8a8-77983a281f05';
    mocks.commentFindUnique.mockResolvedValue({
      id: buildIdempotentCommentId('user-a', clientRequestId),
      novelId: 'novel-a',
      userId: 'user-a',
      content: '원래 댓글',
      parentId: null,
      createdAt: new Date('2026-07-19T00:00:00.000Z'),
      updatedAt: new Date('2026-07-19T00:00:00.000Z'),
      user: { id: 'user-a', nickname: '독자', image: null },
    });

    const response = await POST(
      jsonRequest(
        'https://novelverse.test/api/novels/novel-a/comments',
        'POST',
        { content: '다른 댓글', clientRequestId },
      ),
      { params: Promise.resolve({ id: 'novel-a' }) },
    );

    expect(response.status).toBe(409);
    expect(mocks.commentCreate).not.toHaveBeenCalled();
  });

  it('새 요청 ID는 결정적 댓글 ID로 한 번 생성한다', async () => {
    const clientRequestId = '0198a574-bb7a-7e1a-a8a8-77983a281f05';
    const id = buildIdempotentCommentId('user-a', clientRequestId);
    mocks.novelFindFirst.mockResolvedValue({ id: 'novel-a' });
    mocks.commentCreate.mockResolvedValue({
      id,
      content: '새 댓글',
      parentId: null,
      createdAt: new Date('2026-07-19T00:00:00.000Z'),
      updatedAt: new Date('2026-07-19T00:00:00.000Z'),
      user: { id: 'user-a', nickname: '독자', image: null },
    });

    const response = await POST(
      jsonRequest(
        'https://novelverse.test/api/novels/novel-a/comments',
        'POST',
        { content: '새 댓글', clientRequestId },
      ),
      { params: Promise.resolve({ id: 'novel-a' }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.commentCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ id, content: '새 댓글' }),
    }));
  });

  it('동시 생성 경합에서 P2002가 발생해도 먼저 생성된 같은 댓글을 회수한다', async () => {
    const clientRequestId = '0198a574-bb7a-7e1a-a8a8-77983a281f05';
    const existing = {
      id: buildIdempotentCommentId('user-a', clientRequestId),
      novelId: 'novel-a',
      userId: 'user-a',
      content: '동시 요청 댓글',
      parentId: null,
      createdAt: new Date('2026-07-19T00:00:00.000Z'),
      updatedAt: new Date('2026-07-19T00:00:00.000Z'),
      user: { id: 'user-a', nickname: '독자', image: null },
    };
    mocks.commentFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    mocks.novelFindFirst.mockResolvedValue({ id: 'novel-a' });
    mocks.commentCreate.mockRejectedValue({ code: 'P2002' });

    const response = await POST(
      jsonRequest(
        'https://novelverse.test/api/novels/novel-a/comments',
        'POST',
        { content: '동시 요청 댓글', clientRequestId },
      ),
      { params: Promise.resolve({ id: 'novel-a' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.commentFindUnique).toHaveBeenCalledTimes(2);
  });

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
