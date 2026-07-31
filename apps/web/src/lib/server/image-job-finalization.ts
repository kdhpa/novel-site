import crypto from 'node:crypto';
import {
  acquireAdminRoleReadLock,
  acquireNovelMutationLock,
  type Prisma,
} from '@novelverse/db';
import { logServerError } from '@novelverse/shared';
import { prisma } from '@/lib/prisma';
import { deleteFile } from '@/lib/supabase';
import { assertContestContentMutationAllowed } from './contest-entry';
import {
  finalizationLeaseClaimWhere,
  finalizationLeaseCommitWhere,
  getImageJobStorageTarget,
  imageFinalizationRetryPolicy,
  MAX_IMAGE_FINALIZATION_ATTEMPTS,
  normalizeImageJobStatus,
  parsePortraitJobMetadata,
  type ImageJobStatus,
} from './image-job-state';
import { fetchAndUploadImageJobOnce } from './image-storage';
import { reviewResetData, shouldResetReviewAfterAuthorChange } from './novel-review';

const FINALIZATION_LEASE_MS = 2 * 60 * 1000;
const FINALIZATION_HEARTBEAT_MS = 30 * 1000;
const FINALIZATION_OPERATION_TIMEOUT_MS = 90 * 1000;

export type ImageJobRecord = NonNullable<
  Awaited<ReturnType<typeof prisma.imageGenerationJob.findUnique>>
>;

export type ImageProviderJobUpdate = {
  predictionId: string;
  status?: string;
  imageUrl: string | null;
  failureMessage?: string;
  failureCode?: string;
};

export type ImageProviderUpdateOptions = {
  /**
   * Replicate already retries terminal webhooks with exponential backoff for
   * roughly one minute. Let those authenticated deliveries drive storage
   * retries even when the longer browser-polling schedule is still pending.
   */
  allowEarlyFinalizationRetry?: boolean;
};

export type ImageJobFinalizationResult = {
  job: ImageJobRecord;
  status: ImageJobStatus;
  retryAfterMs: number | null;
  exposeError: boolean;
  retryWebhook: boolean;
};

export class ImageJobProviderMismatchError extends Error {
  constructor() {
    super('이미지 공급자 작업 식별자가 일치하지 않습니다.');
    this.name = 'ImageJobProviderMismatchError';
  }
}

class FinalizationLeaseLostError extends Error {}
class FinalizationTargetUnavailableError extends Error {}

async function getJob(id: string) {
  return prisma.imageGenerationJob.findUnique({ where: { id } });
}

function result(
  job: ImageJobRecord,
  options: Partial<Omit<ImageJobFinalizationResult, 'job' | 'status'>> & {
    status?: ImageJobStatus;
  } = {},
): ImageJobFinalizationResult {
  const status = options.status || normalizeImageJobStatus(job.status);
  return {
    job,
    status,
    retryAfterMs: options.retryAfterMs ?? null,
    exposeError: options.exposeError ?? (status === 'failed' || status === 'canceled'),
    retryWebhook: options.retryWebhook ?? false,
  };
}

async function refreshedJob(job: ImageJobRecord) {
  return (await getJob(job.id)) || job;
}

async function assertTransactionNovelAccess(
  transaction: Prisma.TransactionClient,
  job: ImageJobRecord,
) {
  if (!job.novelId) return null;

  // Global lock order: admin role -> novel mutation -> current rows.
  await acquireAdminRoleReadLock(transaction);
  await acquireNovelMutationLock(transaction, job.novelId);
  const [user, novel] = await Promise.all([
    transaction.user.findUnique({
      where: { id: job.userId },
      select: { role: true },
    }),
    transaction.novel.findUnique({
      where: { id: job.novelId },
      select: {
        authorId: true,
        approvalStatus: true,
        seasonId: true,
        season: { select: { endsAt: true } },
      },
    }),
  ]);

  if (!user || !novel || (novel.authorId !== job.userId && user.role !== 'ADMIN')) {
    throw new FinalizationTargetUnavailableError('이미지를 반영할 권한이 없습니다.');
  }
  try {
    assertContestContentMutationAllowed(novel, { isAdmin: user.role === 'ADMIN' });
  } catch (error) {
    throw new FinalizationTargetUnavailableError(
      error instanceof Error ? error.message : '마감된 공모전 응모작은 수정할 수 없습니다.',
    );
  }
  return { user, novel };
}

async function preflightFinalizationTarget(job: ImageJobRecord) {
  if (!job.novelId) {
    if (job.type === 'portrait') {
      throw new FinalizationTargetUnavailableError('초상화 대상 작품을 찾을 수 없습니다.');
    }
    return;
  }

  const [user, novel] = await Promise.all([
    prisma.user.findUnique({ where: { id: job.userId }, select: { role: true } }),
    prisma.novel.findUnique({ where: { id: job.novelId }, select: { authorId: true } }),
  ]);
  if (!user || !novel || (novel.authorId !== job.userId && user.role !== 'ADMIN')) {
    throw new FinalizationTargetUnavailableError('이미지를 반영할 권한이 없습니다.');
  }

  if (job.type === 'portrait') {
    const metadata = parsePortraitJobMetadata(job.metadata);
    if (!metadata) {
      throw new FinalizationTargetUnavailableError('초상화 작업 정보가 올바르지 않습니다.');
    }
    const character = await prisma.character.findFirst({
      where: { id: metadata.characterId, novelId: job.novelId },
      select: { id: true },
    });
    if (!character) {
      throw new FinalizationTargetUnavailableError('캐릭터를 찾을 수 없습니다.');
    }
  }
}

async function commitFinalizedImage(
  job: ImageJobRecord,
  leaseToken: string,
  imageUrl: string,
  storageProvider: string,
) {
  await prisma.$transaction(async (transaction) => {
    const access = await assertTransactionNovelAccess(transaction, job);
    const metadata = job.type === 'portrait'
      ? parsePortraitJobMetadata(job.metadata)
      : null;
    if (job.type === 'portrait' && (!metadata || !job.novelId || !access)) {
      throw new FinalizationTargetUnavailableError('초상화 작업 정보가 올바르지 않습니다.');
    }

    const committed = await transaction.imageGenerationJob.updateMany({
      where: finalizationLeaseCommitWhere(job.id, job.userId, leaseToken),
      data: {
        status: 'succeeded',
        imageUrl,
        storageProvider,
        error: null,
        lastFinalizationError: null,
        nextFinalizationAt: null,
        finalizationLeaseToken: null,
        finalizationLeaseUntil: null,
      },
    });
    if (committed.count !== 1) {
      throw new FinalizationLeaseLostError('이미지 작업 완료 lease를 잃었습니다.');
    }

    if (metadata && job.novelId && access) {
      const character = await transaction.character.updateMany({
        where: { id: metadata.characterId, novelId: job.novelId },
        data: { portraitUrl: imageUrl, portraitPrompt: job.prompt },
      });
      if (character.count !== 1) {
        throw new FinalizationTargetUnavailableError('캐릭터를 찾을 수 없습니다.');
      }

      if (shouldResetReviewAfterAuthorChange(access.novel, {
        id: job.userId,
        role: access.user.role,
      })) {
        await transaction.novel.update({
          where: { id: job.novelId },
          data: reviewResetData(),
        });
      }
    }
  });
}

async function releaseFinalizationLease(
  job: ImageJobRecord,
  leaseToken: string,
  status: 'processing' | 'failed',
  error: string,
  nextFinalizationAt: Date | null,
  internalError: string,
) {
  await prisma.imageGenerationJob.updateMany({
    where: finalizationLeaseCommitWhere(job.id, job.userId, leaseToken),
    data: {
      status,
      error,
      lastFinalizationError: internalError,
      nextFinalizationAt,
      finalizationLeaseToken: null,
      finalizationLeaseUntil: null,
    },
  });
}

async function withFinalizationHeartbeat<T>(
  job: ImageJobRecord,
  leaseToken: string,
  operation: () => Promise<T>,
) {
  const heartbeat = setInterval(() => {
    void prisma.imageGenerationJob.updateMany({
      where: finalizationLeaseCommitWhere(job.id, job.userId, leaseToken),
      data: {
        finalizationLeaseUntil: new Date(Date.now() + FINALIZATION_LEASE_MS),
      },
    }).catch((error) => {
      logServerError('image-job-lease-heartbeat', error, {
        jobId: job.id,
        userId: job.userId,
      });
    });
  }, FINALIZATION_HEARTBEAT_MS);
  let operationTimeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        operationTimeout = setTimeout(
          () => reject(new Error('image_finalization_timeout')),
          FINALIZATION_OPERATION_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearInterval(heartbeat);
    if (operationTimeout) clearTimeout(operationTimeout);
  }
}

async function updateProviderTerminalState(
  job: ImageJobRecord,
  status: 'failed' | 'canceled',
  update: ImageProviderJobUpdate,
) {
  const message = update.failureMessage || (status === 'failed'
    ? '이미지 생성 제공자가 작업에 실패했습니다.'
    : '이미지 생성 작업이 취소되었습니다.');
  const internalCode = update.failureCode || `provider_${status}`;
  await prisma.imageGenerationJob.updateMany({
    where: {
      id: job.id,
      userId: job.userId,
      providerPredictionId: update.predictionId,
      imageUrl: null,
      status: { in: ['starting', 'processing'] },
    },
    data: {
      status,
      error: message,
      lastFinalizationError: internalCode,
      finalizationLeaseToken: null,
      finalizationLeaseUntil: null,
      nextFinalizationAt: null,
    },
  });
  return refreshedJob(job);
}

async function finalizeProviderOutput(
  initialJob: ImageJobRecord,
  providerImageUrl: string,
  options: ImageProviderUpdateOptions,
): Promise<ImageJobFinalizationResult> {
  let job = initialJob;

  if (job.finalizationAttempts >= MAX_IMAGE_FINALIZATION_ATTEMPTS) {
    await prisma.imageGenerationJob.updateMany({
      where: { id: job.id, userId: job.userId, imageUrl: null },
      data: {
        status: 'failed',
        error: '생성 결과를 영구 저장하지 못했습니다.',
        lastFinalizationError: 'max_finalization_attempts',
      },
    });
    job = await refreshedJob(job);
    return result(job, { status: 'failed', exposeError: true });
  }

  const leaseStartedAt = new Date();
  if (
    !options.allowEarlyFinalizationRetry &&
    job.nextFinalizationAt &&
    job.nextFinalizationAt > leaseStartedAt
  ) {
    return result(job, {
      status: 'processing',
      retryAfterMs: job.nextFinalizationAt.getTime() - leaseStartedAt.getTime(),
      exposeError: false,
    });
  }

  try {
    await preflightFinalizationTarget(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : '이미지 반영 대상을 찾을 수 없습니다.';
    await prisma.imageGenerationJob.updateMany({
      where: { id: job.id, userId: job.userId, imageUrl: null },
      data: { status: 'failed', error: message, lastFinalizationError: 'target_unavailable' },
    });
    job = await refreshedJob(job);
    return result(job, { status: 'failed', exposeError: true });
  }

  const leaseToken = crypto.randomUUID();
  const claim = await prisma.imageGenerationJob.updateMany({
    where: finalizationLeaseClaimWhere(job.id, job.userId, leaseStartedAt, {
      ignoreRetrySchedule: options.allowEarlyFinalizationRetry,
    }),
    data: {
      status: 'processing',
      providerImageUrl,
      finalizationLeaseToken: leaseToken,
      finalizationLeaseUntil: new Date(leaseStartedAt.getTime() + FINALIZATION_LEASE_MS),
      finalizationAttempts: { increment: 1 },
      nextFinalizationAt: null,
      error: null,
    },
  });
  if (claim.count !== 1) {
    job = await refreshedJob(job);
    const scheduledRetryAfterMs = job.nextFinalizationAt
      ? Math.max(job.nextFinalizationAt.getTime() - Date.now(), 0)
      : null;
    return result(job, {
      status: job.imageUrl ? 'succeeded' : normalizeImageJobStatus(job.status),
      retryAfterMs: job.imageUrl ? null : scheduledRetryAfterMs ?? 3_000,
      exposeError: false,
      retryWebhook: !job.imageUrl && job.status !== 'failed' && job.status !== 'canceled',
    });
  }

  job = await refreshedJob(job);
  const storageTarget = getImageJobStorageTarget(job);
  if (!storageTarget) {
    await releaseFinalizationLease(
      job,
      leaseToken,
      'failed',
      '이미지 작업의 저장 정보가 올바르지 않습니다.',
      null,
      'storage_target_invalid',
    );
    job = await refreshedJob(job);
    return result(job, { status: 'failed', exposeError: true });
  }

  const finalizingJob = job;
  let storageResult;
  try {
    storageResult = await withFinalizationHeartbeat(finalizingJob, leaseToken, () =>
      fetchAndUploadImageJobOnce(
        providerImageUrl,
        storageTarget.bucket,
        storageTarget.folder,
        finalizingJob.id,
      ),
    );
  } catch (error) {
    logServerError('image-job-permanent-storage', error, {
      jobId: job.id,
      userId: job.userId,
    });
    storageResult = { url: '', stored: false, storageProvider: 'none' as const };
  }

  if (!storageResult.stored) {
    const retryPolicy = imageFinalizationRetryPolicy(job.finalizationAttempts);
    const nextAttempt = retryPolicy.retryAfterMs === null
      ? null
      : new Date(Date.now() + retryPolicy.retryAfterMs);
    await releaseFinalizationLease(
      job,
      leaseToken,
      retryPolicy.exhausted ? 'failed' : 'processing',
      retryPolicy.exhausted
        ? '생성 결과를 영구 저장하지 못했습니다.'
        : '생성 결과 영구 저장을 잠시 후 다시 시도합니다.',
      nextAttempt,
      retryPolicy.exhausted ? 'max_finalization_attempts' : 'storage_retry_scheduled',
    );
    job = await refreshedJob(job);
    return result(job, {
      status: retryPolicy.exhausted ? 'failed' : 'processing',
      retryAfterMs: retryPolicy.retryAfterMs,
      exposeError: retryPolicy.exhausted,
      retryWebhook: !retryPolicy.exhausted,
    });
  }

  try {
    await commitFinalizedImage(job, leaseToken, storageResult.url, storageResult.storageProvider);
  } catch (error) {
    if (error instanceof FinalizationLeaseLostError) {
      job = await refreshedJob(job);
      return result(job, {
        status: job.imageUrl ? 'succeeded' : 'processing',
        retryAfterMs: job.imageUrl ? null : 3_000,
        exposeError: false,
        retryWebhook: !job.imageUrl,
      });
    }

    if (error instanceof FinalizationTargetUnavailableError) {
      await releaseFinalizationLease(
        job,
        leaseToken,
        'failed',
        error.message,
        null,
        'target_unavailable',
      );
      if (storageResult.path) {
        await deleteFile(storageTarget.bucket, storageResult.path);
      }
      job = await refreshedJob(job);
      return result(job, { status: 'failed', exposeError: true });
    }
    throw error;
  }

  job = await refreshedJob(job);
  return result(job, { status: 'succeeded', exposeError: false });
}

/**
 * Applies a provider state transition and, for successful predictions, owns the
 * permanent-storage and DB side effects shared by browser polling and webhooks.
 */
export async function processImageProviderUpdate(
  initialJob: ImageJobRecord,
  update: ImageProviderJobUpdate,
  options: ImageProviderUpdateOptions = {},
): Promise<ImageJobFinalizationResult> {
  if (
    !initialJob.providerPredictionId ||
    initialJob.providerPredictionId !== update.predictionId
  ) {
    throw new ImageJobProviderMismatchError();
  }

  let job = await refreshedJob(initialJob);
  if (job.providerPredictionId !== update.predictionId) {
    throw new ImageJobProviderMismatchError();
  }
  if (job.status === 'succeeded' && job.imageUrl) {
    return result(job, { status: 'succeeded', exposeError: false });
  }
  if (job.status === 'failed' || job.status === 'canceled') {
    return result(job, { exposeError: true });
  }

  const providerStatus = normalizeImageJobStatus(update.status);
  if (providerStatus === 'failed' || providerStatus === 'canceled') {
    job = await updateProviderTerminalState(job, providerStatus, update);
    return result(job, { status: providerStatus, exposeError: true });
  }

  if (providerStatus !== 'succeeded') {
    await prisma.imageGenerationJob.updateMany({
      where: {
        id: job.id,
        userId: job.userId,
        providerPredictionId: update.predictionId,
        imageUrl: null,
        status: { in: ['starting', 'processing'] },
      },
      data: { status: providerStatus, error: null, lastFinalizationError: null },
    });
    job = await refreshedJob(job);
    return result(job, {
      status: providerStatus,
      retryAfterMs: 4_000,
      exposeError: false,
    });
  }

  if (!update.imageUrl) {
    await prisma.imageGenerationJob.updateMany({
      where: {
        id: job.id,
        userId: job.userId,
        providerPredictionId: update.predictionId,
        imageUrl: null,
        status: { in: ['starting', 'processing'] },
      },
      data: {
        status: 'failed',
        error: '이미지 생성은 완료됐지만 결과 파일이 없습니다.',
        lastFinalizationError: 'provider_output_missing',
      },
    });
    job = await refreshedJob(job);
    return result(job, { status: 'failed', exposeError: true });
  }

  await prisma.imageGenerationJob.updateMany({
    where: {
      id: job.id,
      userId: job.userId,
      providerPredictionId: update.predictionId,
      imageUrl: null,
      status: { in: ['starting', 'processing'] },
    },
    data: {
      status: 'processing',
      providerImageUrl: update.imageUrl,
      error: null,
      lastFinalizationError: null,
    },
  });
  job = await refreshedJob(job);
  if (job.status === 'succeeded' && job.imageUrl) {
    return result(job, { status: 'succeeded', exposeError: false });
  }
  if (job.status === 'failed' || job.status === 'canceled') {
    return result(job, { exposeError: true });
  }

  return finalizeProviderOutput(job, update.imageUrl, options);
}
