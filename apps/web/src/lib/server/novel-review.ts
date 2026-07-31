export type ReviewState = {
  authorId: string;
  approvalStatus: string;
};

export type ReviewActor = {
  id: string;
  role?: string | null;
  canSkipReview: boolean;
};

const REVIEW_PROTECTED_STATUSES = new Set(['PENDING_REVIEW', 'APPROVED']);

/**
 * 일반 작가가 심사 대상 데이터를 변경하면 기존 심사 결과를 더 이상 신뢰할 수 없다.
 * 관리자가 명시적으로 면제한 작가는 승인된 작품의 수정 재심사만 건너뛴다.
 * 심사 대기 중인 작품은 면제 작가도 초안으로 되돌려 검토 대상 변경을 막는다.
 */
export function shouldResetReviewAfterAuthorChange(
  novel: ReviewState,
  actor: ReviewActor
) {
  return actor.role !== 'ADMIN' &&
    novel.authorId === actor.id &&
    REVIEW_PROTECTED_STATUSES.has(novel.approvalStatus) &&
    !(
      novel.approvalStatus === 'APPROVED' &&
      actor.role === 'AUTHOR' &&
      actor.canSkipReview
    );
}

export function reviewResetData() {
  return {
    approvalStatus: 'DRAFT' as const,
    isPublished: false,
    submittedAt: null,
    reviewedAt: null,
    reviewedById: null,
    approvalNote: null,
  };
}
