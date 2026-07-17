import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { ApiError, handleApiError, message, ok } from '@/lib/server/api';
import { requireUser } from '@/lib/server/authz';
import { assertCommentMutationRateLimit } from '@/lib/server/comment-rate-limit';
import {
  commentPatchSchema,
  DELETED_COMMENT_CONTENT,
  toPublicComment,
} from '@/lib/server/comments';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';

type RouteParams = {
  params: Promise<{ id: string; commentId: string }>;
};

const JSON_BODY_LIMIT = 8 * 1024;
const publicUserSelect = {
  id: true,
  nickname: true,
  image: true,
} as const;

async function getScopedComment(novelId: string, commentId: string) {
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, novelId },
    select: {
      id: true,
      userId: true,
      content: true,
      isHidden: true,
      parentId: true,
      _count: { select: { replies: true } },
    },
  });

  if (!comment) throw new ApiError(404, '댓글을 찾을 수 없습니다.');
  return comment;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id, commentId } = await params;
    await assertCommentMutationRateLimit(user.id);
    const comment = await getScopedComment(id, commentId);
    if (user.id !== comment.userId) {
      throw new ApiError(403, '댓글 수정 권한이 없습니다.');
    }
    if (comment.isHidden) throw new ApiError(409, '운영 검토로 숨겨진 댓글은 수정할 수 없습니다.');

    if (comment.content === DELETED_COMMENT_CONTENT) {
      throw new ApiError(400, '삭제된 댓글은 수정할 수 없습니다.');
    }

    const body = commentPatchSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, JSON_BODY_LIMIT),
    );
    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { content: body.content },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        parentId: true,
        user: { select: publicUserSelect },
      },
    });

    return ok(toPublicComment(updated));
  } catch (error) {
    return handleApiError(error, '댓글 수정에 실패했습니다.');
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id, commentId } = await params;
    await assertCommentMutationRateLimit(user.id);
    const comment = await getScopedComment(id, commentId);
    if (user.id !== comment.userId) {
      throw new ApiError(403, '댓글 삭제 권한이 없습니다.');
    }

    if (comment._count.replies > 0) {
      if (comment.content !== DELETED_COMMENT_CONTENT) {
        await prisma.comment.update({
          where: { id: commentId },
          data: { content: DELETED_COMMENT_CONTENT },
          select: { id: true },
        });
      }
    } else {
      await prisma.comment.delete({ where: { id: commentId } });

      if (comment.parentId) {
        await prisma.comment.deleteMany({
          where: {
            id: comment.parentId,
            novelId: id,
            content: DELETED_COMMENT_CONTENT,
            replies: { none: {} },
          },
        });
      }
    }

    return message('댓글이 삭제되었습니다.');
  } catch (error) {
    return handleApiError(error, '댓글 삭제에 실패했습니다.');
  }
}
