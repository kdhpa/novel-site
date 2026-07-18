import type { Prisma } from '@novelverse/db/runtime-client';

/** 관리자 권한 변경과 관리자 권한을 사용하는 쓰기 작업의 경합을 막는다. */
export async function acquireAdminRoleReadLock(
  transaction: Prisma.TransactionClient
) {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock_shared(hashtext('novelverse:admin-role-change'))::text
  `;
}

/**
 * 작품 내용 변경, 심사 제출, 승인/반려가 서로 엇갈리지 않도록
 * 같은 작품의 쓰기 작업을 PostgreSQL 트랜잭션 단위로 직렬화한다.
 */
export async function acquireNovelMutationLock(
  transaction: Prisma.TransactionClient,
  novelId: string
) {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`novelverse:novel-mutation:${novelId}`}, 0)
    )::text
  `;
}

/** Serializes per-user content creation so count-based quotas cannot race. */
export async function acquireUserContentLock(
  transaction: Prisma.TransactionClient,
  userId: string
) {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`novelverse:user-content:${userId}`}, 0)
    )::text
  `;
}

/**
 * Serializes writes that persist a user identifier outside a user-owned row
 * with account-deletion anonymization. Sorting prevents multi-user deadlocks.
 */
export async function acquireUserPrivacyLocks(
  transaction: Prisma.TransactionClient,
  userIds: Array<string | null | undefined>
) {
  const identifiers = [...new Set(userIds.filter((value): value is string => Boolean(value)))].sort();
  for (const userId of identifiers) {
    await transaction.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`novelverse:user-privacy:${userId}`}, 0)
      )::text
    `;
  }
}
