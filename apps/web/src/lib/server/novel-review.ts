export type ReviewState = {
  authorId: string;
  approvalStatus: string;
};

export type ReviewActor = {
  id: string;
  role?: string | null;
};

const REVIEW_PROTECTED_STATUSES = new Set(['PENDING_REVIEW', 'APPROVED']);

/**
 * 작가가 심사 대상 데이터를 변경하면 기존 심사 결과를 더 이상 신뢰할 수 없다.
 * 관리자에 의한 교정/운영 작업은 별도의 심사 권한으로 간주해 예외 처리한다.
 */
export function shouldResetReviewAfterAuthorChange(
  novel: ReviewState,
  actor: ReviewActor
) {
  return actor.role !== 'ADMIN' &&
    novel.authorId === actor.id &&
    REVIEW_PROTECTED_STATUSES.has(novel.approvalStatus);
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
