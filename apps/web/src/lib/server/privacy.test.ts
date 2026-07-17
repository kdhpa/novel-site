import { describe, expect, it } from 'vitest';
import { scrubJsonIdentifier } from './privacy';

describe('privacy JSON scrubbing', () => {
  it('중첩 객체와 배열의 탈퇴 사용자 ID만 재귀적으로 제거한다', () => {
    expect(scrubJsonIdentifier({
      reporterId: 'deleted-user',
      targetAuthorId: 'deleted-user',
      reportedTargetSnapshot: {
        authorId: 'deleted-user',
        title: '증거 제목',
      },
      reviewers: ['admin-a', 'deleted-user'],
      unrelated: 'deleted-user-suffix',
    }, 'deleted-user')).toEqual({
      reportedTargetSnapshot: { title: '증거 제목' },
      reviewers: ['admin-a'],
      unrelated: 'deleted-user-suffix',
    });
  });
});
