import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ApiError, handleApiError, ok } from '@/lib/server/api';
import { requireUser, isCurrentAdmin } from '@/lib/server/authz';
import { assertCommentMutationRateLimit } from '@/lib/server/comment-rate-limit';
import {
  buildIdempotentCommentId,
  commentCreateSchema,
  isEligibleReplyParent,
  toPublicComment,
} from '@/lib/server/comments';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';

type RouteParams = {
  params: Promise<{ id: string }>;
};

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;
const REPLY_PREVIEW_SIZE = 5;
const MAX_REPLY_PAGE_SIZE = 50;
const JSON_BODY_LIMIT = 8 * 1024;

const publicUserSelect = {
  id: true,
  nickname: true,
  image: true,
} as const;

const commentResponseSelect = {
  id: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  parentId: true,
  user: { select: publicUserSelect },
} as const;

const idempotentCommentSelect = {
  ...commentResponseSelect,
  novelId: true,
  chapterId: true,
  userId: true,
} as const;

type IdempotentComment = Awaited<ReturnType<typeof findIdempotentComment>>;

function isUniqueConflict(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && (error as { code?: string }).code === 'P2002';
}

function findIdempotentComment(id: string) {
  return prisma.comment.findUnique({
    where: { id },
    select: idempotentCommentSelect,
  });
}

function matchesIdempotentRequest(
  comment: NonNullable<IdempotentComment>,
  input: {
    novelId: string;
    chapterId?: string;
    userId: string;
    content: string;
    parentId?: string;
  },
) {
  return comment.novelId === input.novelId
    && comment.chapterId === (input.chapterId ?? null)
    && comment.userId === input.userId
    && comment.content === input.content
    && comment.parentId === (input.parentId ?? null);
}

function toIdempotentCommentResponse(comment: NonNullable<IdempotentComment>) {
  return toPublicComment({
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    parentId: comment.parentId,
    user: comment.user,
  });
}

function parsePositiveInteger(value: string | null, fallback: number, max?: number) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

function parseNonNegativeInteger(value: string | null, fallback: number, max?: number) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

async function assertCanReadComments(novelId: string, chapterId?: string) {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: {
      authorId: true,
      isPublished: true,
      approvalStatus: true,
    },
  });

  if (!novel) throw new ApiError(404, '작품을 찾을 수 없습니다.');
  if (!novel.isPublished || novel.approvalStatus !== 'APPROVED') {
    const session = await auth();
    const isAuthor = session?.user?.id === novel.authorId;
    const isAdmin = Boolean(
      session?.user?.id && !isAuthor && (await isCurrentAdmin(session.user.id)),
    );

    if (!isAuthor && !isAdmin) {
      throw new ApiError(404, '작품을 찾을 수 없습니다.');
    }
  }

  if (chapterId) {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId, isPublished: true },
      select: { id: true },
    });
    if (!chapter) throw new ApiError(404, '회차를 찾을 수 없습니다.');
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapterId')?.trim() || undefined;
    if (chapterId && chapterId.length > 100) {
      throw new ApiError(400, '회차 정보를 확인해 주세요.');
    }
    await assertCanReadComments(id, chapterId);
    const commentScope = { novelId: id, chapterId: chapterId ?? null };
    const parentId = searchParams.get('parentId')?.trim();

    if (parentId) {
      if (parentId.length > 100) throw new ApiError(400, '댓글 정보를 확인해 주세요.');
      const offset = parseNonNegativeInteger(searchParams.get('offset'), 0, 100_000);
      const limit = parsePositiveInteger(
        searchParams.get('limit'),
        20,
        MAX_REPLY_PAGE_SIZE,
      );
      const parent = await prisma.comment.findFirst({
        where: { id: parentId, ...commentScope, parentId: null, isHidden: false },
        select: { id: true },
      });
      if (!parent) throw new ApiError(404, '댓글을 찾을 수 없습니다.');

      const where = { ...commentScope, parentId, isHidden: false };
      const [replies, total] = await Promise.all([
        prisma.comment.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            content: true,
            createdAt: true,
            updatedAt: true,
            parentId: true,
            user: { select: publicUserSelect },
          },
        }),
        prisma.comment.count({ where }),
      ]);

      return ok(
        {
          items: replies.map(toPublicComment),
          total,
          offset,
          limit,
          hasMore: offset + replies.length < total,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const page = parsePositiveInteger(searchParams.get('page'), 1, 10_000);
    const limit = parsePositiveInteger(
      searchParams.get('limit'),
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    const where = { ...commentScope, parentId: null, isHidden: false };

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          content: true,
          createdAt: true,
          updatedAt: true,
          parentId: true,
          user: { select: publicUserSelect },
          _count: { select: { replies: { where: { isHidden: false } } } },
          replies: {
            where: { isHidden: false },
            take: REPLY_PREVIEW_SIZE,
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              content: true,
              createdAt: true,
              updatedAt: true,
              parentId: true,
              user: { select: publicUserSelect },
            },
          },
        },
      }),
      prisma.comment.count({ where }),
    ]);

    return ok(
      {
        items: comments.map((comment) => {
          const { _count, replies, ...parent } = comment;
          return {
            ...toPublicComment(parent),
            replies: replies.map(toPublicComment),
            replyTotal: _count.replies,
            hasMoreReplies: replies.length < _count.replies,
          };
        }),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error, '댓글 목록을 불러오지 못했습니다.');
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = commentCreateSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, JSON_BODY_LIMIT),
    );
    const idempotentId = body.clientRequestId
      ? buildIdempotentCommentId(user.id, body.clientRequestId)
      : null;
    const idempotentInput = {
      novelId: id,
      chapterId: body.chapterId,
      userId: user.id,
      content: body.content,
      parentId: body.parentId,
    };

    if (idempotentId) {
      const existing = await findIdempotentComment(idempotentId);
      if (existing) {
        if (!matchesIdempotentRequest(existing, idempotentInput)) {
          throw new ApiError(409, '같은 요청 ID를 다른 댓글에 다시 사용할 수 없습니다.');
        }
        return ok(toIdempotentCommentResponse(existing));
      }
    }

    await assertCommentMutationRateLimit(user.id);

    const novel = await prisma.novel.findFirst({
      where: {
        id,
        isPublished: true,
        approvalStatus: 'APPROVED',
      },
      select: { id: true },
    });

    if (!novel) {
      throw new ApiError(404, '댓글을 작성할 수 있는 작품을 찾을 수 없습니다.');
    }

    if (body.chapterId) {
      const chapter = await prisma.chapter.findFirst({
        where: {
          id: body.chapterId,
          novelId: id,
          isPublished: true,
        },
        select: { id: true },
      });
      if (!chapter) {
        throw new ApiError(404, '댓글을 작성할 수 있는 회차를 찾을 수 없습니다.');
      }
    }

    if (body.parentId) {
      const parent = await prisma.comment.findFirst({
        where: {
          id: body.parentId,
          novelId: id,
          chapterId: body.chapterId ?? null,
          isHidden: false,
        },
        select: { novelId: true, chapterId: true, parentId: true, content: true },
      });

      if (!isEligibleReplyParent(parent, id, body.chapterId)) {
        throw new ApiError(400, '답글을 작성할 수 있는 댓글을 찾을 수 없습니다.');
      }
    }

    let comment;
    try {
      comment = await prisma.comment.create({
        data: {
          ...(idempotentId ? { id: idempotentId } : {}),
          novelId: id,
          chapterId: body.chapterId,
          userId: user.id,
          content: body.content,
          parentId: body.parentId,
        },
        select: commentResponseSelect,
      });
    } catch (error) {
      if (!idempotentId || !isUniqueConflict(error)) throw error;
      const existing = await findIdempotentComment(idempotentId);
      if (!existing || !matchesIdempotentRequest(existing, idempotentInput)) {
        throw new ApiError(409, '같은 요청 ID를 다른 댓글에 다시 사용할 수 없습니다.');
      }
      return ok(toIdempotentCommentResponse(existing));
    }

    return ok(toPublicComment(comment), { status: 201 });
  } catch (error) {
    return handleApiError(error, '댓글 작성에 실패했습니다.');
  }
}
