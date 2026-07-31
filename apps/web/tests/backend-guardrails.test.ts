import { describe, expect, it } from 'vitest';
import {
  reviewResetData,
  shouldResetReviewAfterAuthorChange,
} from '../src/lib/server/novel-review';
import {
  extractIllustrationStoragePath,
  findDeletedOwnedIllustrationPaths,
  isOwnedIllustrationStoragePath,
} from '../src/lib/server/illustration-storage';

describe('심사 상태 가드레일', () => {
  it('작가가 심사 대기 또는 승인된 작품을 변경하면 심사 상태를 초기화한다', () => {
    const actor = { id: 'author-1', role: 'AUTHOR', canSkipReview: false };

    expect(shouldResetReviewAfterAuthorChange(
      { authorId: 'author-1', approvalStatus: 'PENDING_REVIEW' }, actor
    )).toBe(true);
    expect(shouldResetReviewAfterAuthorChange(
      { authorId: 'author-1', approvalStatus: 'APPROVED' }, actor
    )).toBe(true);
    expect(reviewResetData()).toEqual({
      approvalStatus: 'DRAFT',
      isPublished: false,
      submittedAt: null,
      reviewedAt: null,
      reviewedById: null,
      approvalNote: null,
    });
  });

  it('초안·반려 상태, 다른 사용자, 관리자의 변경은 초기화하지 않는다', () => {
    const approvedNovel = { authorId: 'author-1', approvalStatus: 'APPROVED' };

    expect(shouldResetReviewAfterAuthorChange(
      { authorId: 'author-1', approvalStatus: 'DRAFT' },
      { id: 'author-1', role: 'AUTHOR', canSkipReview: false }
    )).toBe(false);
    expect(shouldResetReviewAfterAuthorChange(
      { authorId: 'author-1', approvalStatus: 'REJECTED' },
      { id: 'author-1', role: 'AUTHOR', canSkipReview: false }
    )).toBe(false);
    expect(shouldResetReviewAfterAuthorChange(
      approvedNovel, { id: 'author-2', role: 'AUTHOR', canSkipReview: false }
    )).toBe(false);
    expect(shouldResetReviewAfterAuthorChange(
      approvedNovel, { id: 'author-1', role: 'ADMIN', canSkipReview: false }
    )).toBe(false);
  });

  it('수정 재심사 면제 작가는 승인 작품만 승인·공개 상태를 유지한다', () => {
    const actor = { id: 'author-1', role: 'AUTHOR', canSkipReview: true };

    expect(shouldResetReviewAfterAuthorChange(
      { authorId: 'author-1', approvalStatus: 'APPROVED' }, actor
    )).toBe(false);
    expect(shouldResetReviewAfterAuthorChange(
      { authorId: 'author-1', approvalStatus: 'PENDING_REVIEW' }, actor
    )).toBe(true);
    expect(shouldResetReviewAfterAuthorChange(
      { authorId: 'author-1', approvalStatus: 'APPROVED' },
      { ...actor, role: 'USER' }
    )).toBe(true);
  });
});

describe('삽화 소유 경로 가드레일', () => {
  it('현재 작품 또는 회차 폴더에서 제거된 삽화만 반환한다', () => {
    const owner = { novelId: 'novel-1', chapterId: 'chapter-1' };
    const previousHtml = `
      <img src="https://project.supabase.co/storage/v1/object/public/chapter-illustrations/novel-1/cover-scene.png?version=1" />
      <img src='/uploads/chapter-illustrations/chapter-1/kept.png' />
      <img src="https://project.supabase.co/storage/v1/object/public/chapter-illustrations/other-novel/victim.png" />
    `;
    const nextHtml = '<img src="/uploads/chapter-illustrations/chapter-1/kept.png?version=2" />';

    expect(findDeletedOwnedIllustrationPaths(previousHtml, nextHtml, owner)).toEqual([
      'novel-1/cover-scene.png',
    ]);
    expect(isOwnedIllustrationStoragePath('novel-10/file.png', owner)).toBe(false);
  });

  it('경로 이동과 역슬래시를 거부한다', () => {
    const base = 'https://project.supabase.co/storage/v1/object/public/chapter-illustrations/';

    expect(extractIllustrationStoragePath(`${base}chapter-1/%2e%2e/other/victim.png`)).toBeNull();
    expect(extractIllustrationStoragePath(`${base}chapter-1%2F..%2Fother%2Fvictim.png`)).toBeNull();
    expect(extractIllustrationStoragePath(`${base}chapter-1%5C..%5Cother%5Cv.png`)).toBeNull();
    expect(extractIllustrationStoragePath(`${base}chapter-1/safe.png#preview`)).toBe('chapter-1/safe.png');
  });
});
