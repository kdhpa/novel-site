import { z } from 'zod';
import { createHash } from 'node:crypto';

export const DELETED_COMMENT_CONTENT = '[삭제된 댓글입니다.]';

const commentContentSchema = z
  .string()
  .trim()
  .min(1, '댓글 내용을 입력해 주세요.')
  .max(1000, '댓글은 1,000자 이하여야 합니다.')
  .refine(
    (content) => content !== DELETED_COMMENT_CONTENT,
    '사용할 수 없는 댓글 내용입니다.',
  );

export const commentCreateSchema = z
  .object({
    content: commentContentSchema,
    chapterId: z.string().trim().min(1).max(100).optional(),
    parentId: z.string().trim().min(1).max(100).optional(),
    clientRequestId: z.string().trim().min(16).max(100).optional(),
  })
  .strict();

export const commentPatchSchema = z
  .object({
    content: commentContentSchema,
  })
  .strict();

export function buildIdempotentCommentId(userId: string, clientRequestId: string) {
  const digest = createHash('sha256')
    .update(userId)
    .update('\0')
    .update(clientRequestId)
    .digest('hex');
  return `comment_${digest}`;
}

type ReplyParent = {
  novelId: string;
  chapterId: string | null;
  parentId: string | null;
  content: string;
};

export function isEligibleReplyParent(
  parent: ReplyParent | null,
  novelId: string,
  chapterId?: string,
) {
  return Boolean(
    parent &&
      parent.novelId === novelId &&
      parent.chapterId === (chapterId ?? null) &&
      parent.parentId === null &&
      parent.content !== DELETED_COMMENT_CONTENT,
  );
}

type PublicCommentInput = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  parentId: string | null;
  user: {
    id: string;
    nickname: string | null;
    image: string | null;
  };
};

export function toPublicComment<T extends PublicCommentInput>(comment: T) {
  const isDeleted = comment.content === DELETED_COMMENT_CONTENT;

  return {
    ...comment,
    isDeleted,
    user: isDeleted
      ? { id: null, nickname: null, image: null }
      : comment.user,
  };
}
