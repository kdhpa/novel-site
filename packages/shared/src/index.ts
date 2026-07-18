import type { ApprovalStatus, Role } from '@novelverse/db/browser';

export * from './image-source';
export * from './google-auth';
export * from './auth-session';
export * from './identity';
export * from './google-account-link';

export const RoleLabels: Record<Role, string> = {
  USER: '사용자',
  AUTHOR: '작가',
  ADMIN: '관리자',
};

export const ApprovalStatusLabels: Record<ApprovalStatus, string> = {
  DRAFT: '임시 저장',
  PENDING_REVIEW: '심사 대기',
  APPROVED: '승인됨',
  REJECTED: '반려됨',
};

export const OPS_REVIEW_ACTIONS = {
  approve: 'approve',
  reject: 'reject',
} as const;

export type OpsReviewAction = (typeof OPS_REVIEW_ACTIONS)[keyof typeof OPS_REVIEW_ACTIONS];

export type OpsAuditAction =
  | 'review.approve'
  | 'review.reject'
  | 'novel.publish'
  | 'novel.unpublish'
  | 'season.create'
  | 'season.update'
  | 'moderation.hide'
  | 'moderation.dismiss'
  | 'user.role.update'
  | 'user.author.verify'
  | 'user.author.unverify'
  | 'user.suspend'
  | 'user.unsuspend';

export type ServerLogContext = Record<string, string | number | boolean | null | undefined>;

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(process.env.NODE_ENV !== 'production' && error.stack ? { stack: error.stack } : {}),
    };
  }

  return { message: typeof error === 'string' ? error : 'Unknown error' };
}

export function logServerError(
  scope: string,
  error: unknown,
  context: ServerLogContext = {}
) {
  console.error(JSON.stringify({
    level: 'error',
    time: new Date().toISOString(),
    scope,
    ...context,
    error: serializeError(error),
  }));
}
