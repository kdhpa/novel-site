import { describe, expect, it } from 'vitest';
import {
  commentCreateSchema,
  commentPatchSchema,
  DELETED_COMMENT_CONTENT,
  isEligibleReplyParent,
  toPublicComment,
} from './comments';

describe('comment schemas', () => {
  it('plain text content를 trim하고 알 수 없는 필드를 거부한다', () => {
    expect(commentCreateSchema.parse({ content: '  좋은 작품이에요.  ' })).toEqual({
      content: '좋은 작품이에요.',
    });
    expect(() => commentCreateSchema.parse({ content: '댓글', role: 'ADMIN' })).toThrow();
    expect(() => commentPatchSchema.parse({ content: 'x'.repeat(1001) })).toThrow();
    expect(() => commentPatchSchema.parse({ content: DELETED_COMMENT_CONTENT })).toThrow();
  });
});

describe('reply parent policy', () => {
  it('같은 작품의 최상위 일반 댓글에만 답글을 허용한다', () => {
    expect(isEligibleReplyParent(
      { novelId: 'novel-a', parentId: null, content: '원댓글' },
      'novel-a',
    )).toBe(true);
    expect(isEligibleReplyParent(
      { novelId: 'novel-b', parentId: null, content: '다른 작품 댓글' },
      'novel-a',
    )).toBe(false);
    expect(isEligibleReplyParent(
      { novelId: 'novel-a', parentId: 'root', content: '이미 답글' },
      'novel-a',
    )).toBe(false);
    expect(isEligibleReplyParent(
      { novelId: 'novel-a', parentId: null, content: DELETED_COMMENT_CONTENT },
      'novel-a',
    )).toBe(false);
  });
});

describe('deleted comment presentation', () => {
  const baseComment = {
    id: 'comment-1',
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    parentId: null,
    user: { id: 'user-secret', nickname: '비공개 사용자', image: 'https://example.com/me.png' },
  };

  it('tombstone 댓글의 작성자 공개 필드를 모두 가린다', () => {
    const result = toPublicComment({ ...baseComment, content: DELETED_COMMENT_CONTENT });
    expect(result).toMatchObject({
      content: DELETED_COMMENT_CONTENT,
      isDeleted: true,
      user: { id: null, nickname: null, image: null },
    });
  });

  it('일반 댓글은 최소 공개 작성자 필드를 유지한다', () => {
    const result = toPublicComment({ ...baseComment, content: '공개 댓글' });
    expect(result.isDeleted).toBe(false);
    expect(result.user).toEqual(baseComment.user);
  });
});
