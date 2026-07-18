import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import {
  acquireAdminRoleReadLock,
  acquireNovelMutationLock,
  type Prisma,
} from '@novelverse/db';
import { logServerError } from '@novelverse/shared';
import { auth } from '@/lib/auth';
import { extractPredictionImageUrl, getImagePrediction } from '@/lib/ai';
import { prisma } from '@/lib/prisma';
import { deleteFile } from '@/lib/supabase';
import { ApiError, handleApiError } from '@/lib/server/api';
import { requireNovelOwnerOrAdmin } from '@/lib/server/authz';
import { assertContestContentMutationAllowed } from '@/lib/server/contest-entry';
import {
  finalizationLeaseClaimWhere,
  finalizationLeaseCommitWhere,
  getImageJobStorageTarget,
  imageFinalizationRetryPolicy,
  imageJobTokenMatchesRecord,
  isSupportedImageJobType,
  MAX_IMAGE_FINALIZATION_ATTEMPTS,
  normalizeImageJobStatus,
  parsePortraitJobMetadata,
  type ImageJobStatus,
} from '@/lib/server/image-job-state';
import { fetchAndUploadImageJobOnce } from '@/lib/server/image-storage';
import { verifyImageJobToken } from '@/lib/server/image-job-token';
import { reviewResetData, shouldResetReviewAfterAuthorChange } from '@/lib/server/novel-review';
import { assertRateLimit } from '@/lib/server/rate-limit';
import type { ApiResponse } from '@/types';

export const runtime = 'nodejs';

const FINALIZATION_LEASE_MS = 2 * 60 * 1000;
const FINALIZATION_HEARTBEAT_MS = 30 * 1000;
const FINALIZATION_OPERATION_TIMEOUT_MS = 90 * 1000;
const TERMINAL_STATUSES = ['succeeded', 'failed', 'canceled'];

type ImageJobRecord = NonNullable<
  Awaited<ReturnType<typeof prisma.imageGenerationJob.findUnique>>
>;
type AuthenticatedUser = NonNullable<Session['user']>;

type ImageJobResponse = {
  id: string;
  status: ImageJobStatus;
  prompt: string;
  imageUrl: string | null;
  stored: boolean;
  storageProvider: string;
  error: string | null;
  retryAfterMs: number | null;
};

class FinalizationLeaseLostError extends Error {}
class FinalizationTargetUnavailableError extends Error {}

function retryAfterMs(job: ImageJobRecord) {
  if (!job.nextFinalizationAt) return null;
  return Math.max(job.nextFinalizationAt.getTime() - Date.now(), 0);
}

function imageJobResponse(job: ImageJobRecord, overrides?: Partial<ImageJobResponse>) {
  const status = normalizeImageJobStatus(job.status);
  const data: ImageJobResponse = {
    id: job.id,
    status,
    prompt: job.prompt,
    imageUrl: job.imageUrl,
    stored: Boolean(job.imageUrl && job.storageProvider !== 'none'),
    storageProvider: job.storageProvider,
    error: job.error,
    retryAfterMs: retryAfterMs(job),
    ...overrides,
  };

  return NextResponse.json<ApiResponse<ImageJobResponse>>(
    { success: true, data },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

function notFoundResponse() {
  return NextResponse.json<ApiResponse>(
    { success: false, error: '이미지 생성 작업을 찾을 수 없습니다.' },
    { status: 404, headers: { 'Cache-Control': 'private, no-store' } }
  );
}

async function getJob(id: string) {
  return prisma.imageGenerationJob.findUnique({ where: { id } });
}

async function assertTransactionNovelAccess(
  transaction: Prisma.TransactionClient,
  job: ImageJobRecord
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
      error instanceof Error ? error.message : '마감된 공모전 응모작은 수정할 수 없습니다.'
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
  storageProvider: string
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
  internalError: string
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
  operation: () => Promise<T>
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
          FINALIZATION_OPERATION_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    clearInterval(heartbeat);
    if (operationTimeout) clearTimeout(operationTimeout);
  }
}

async function attachDraftCoverToNovel(
  job: ImageJobRecord,
  requestedNovelId: string | undefined,
  sessionUser: AuthenticatedUser
) {
  if (!requestedNovelId) return job;
  if (job.novelId && job.novelId !== requestedNovelId) return null;
  if (job.novelId) return job;
  if (job.type !== 'cover' || job.targetBoundAt) return null;

  await prisma.$transaction(async (transaction) => {
    await acquireAdminRoleReadLock(transaction);
    await acquireNovelMutationLock(transaction, requestedNovelId);
    const [user, novel] = await Promise.all([
      transaction.user.findUnique({
        where: { id: sessionUser.id },
        select: { role: true },
      }),
      transaction.novel.findUnique({
        where: { id: requestedNovelId },
        select: {
          authorId: true,
          seasonId: true,
          season: { select: { endsAt: true } },
        },
      }),
    ]);
    if (!user || !novel) throw new ApiError(404, '작품을 찾을 수 없습니다.');
    if (novel.authorId !== sessionUser.id && user.role !== 'ADMIN') {
      throw new ApiError(403, '작품에 이미지 작업을 연결할 권한이 없습니다.');
    }
    assertContestContentMutationAllowed(novel, { isAdmin: user.role === 'ADMIN' });

    const attached = await transaction.imageGenerationJob.updateMany({
      where: {
        id: job.id,
        userId: job.userId,
        type: 'cover',
        novelId: null,
        targetBoundAt: null,
      },
      data: { novelId: requestedNovelId, targetBoundAt: new Date() },
    });
    if (attached.count !== 1) {
      throw new ApiError(409, '표지 작업이 이미 다른 작품에 연결되었습니다.');
    }
  });

  return getJob(job.id);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { id } = await params;
    let job = await getJob(id);
    if (
      !job ||
      job.userId !== session.user.id ||
      !isSupportedImageJobType(job.type)
    ) {
      return notFoundResponse();
    }

    const requestedNovelId = request.nextUrl.searchParams.get('novelId') || undefined;
    if (requestedNovelId && !job.novelId) {
      const bindingToken = request.headers.get('x-image-job-token');
      const bindingPayload = bindingToken ? verifyImageJobToken(bindingToken) : null;
      if (!bindingPayload || !imageJobTokenMatchesRecord(bindingPayload, job)) {
        return notFoundResponse();
      }
      job = await attachDraftCoverToNovel(job, requestedNovelId, session.user);
      if (!job) return notFoundResponse();
    }

    // A permanent result is recoverable by its DB owner even after the short
    // capability expires. No provider URL or prompt-bearing token is needed.
    if (job.status === 'succeeded' && job.imageUrl) return imageJobResponse(job);

    const now = new Date();
    if (job.tokenExpiresAt <= now) {
      const activeLease = Boolean(
        job.finalizationLeaseToken &&
        job.finalizationLeaseUntil &&
        job.finalizationLeaseUntil > now
      );
      if (!activeLease) {
        await prisma.imageGenerationJob.updateMany({
          where: {
            id: job.id,
            userId: job.userId,
            status: { notIn: TERMINAL_STATUSES },
            OR: [
              { finalizationLeaseUntil: null },
              { finalizationLeaseUntil: { lte: now } },
            ],
          },
          data: {
            status: 'failed',
            error: '이미지 생성 작업의 조회 기간이 만료되었습니다.',
            lastFinalizationError: 'job_expired',
            finalizationLeaseToken: null,
            finalizationLeaseUntil: null,
          },
        });
      }
      return NextResponse.json<ApiResponse>(
        { success: false, error: '이미지 생성 작업의 조회 기간이 만료되었습니다.' },
        { status: 410, headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    const token = request.headers.get('x-image-job-token');
    const payload = token ? verifyImageJobToken(token) : null;
    if (!payload || !imageJobTokenMatchesRecord(payload, job)) return notFoundResponse();

    await assertRateLimit({
      key: `ai:image-job-status:burst:${session.user.id}:${job.id}`,
      limit: 60,
      windowMs: 60 * 1000,
    });
    await assertRateLimit({
      key: `ai:image-job-status:window:${session.user.id}:${job.id}`,
      limit: 240,
      windowMs: 15 * 60 * 1000,
    });

    job = await attachDraftCoverToNovel(job, requestedNovelId, session.user);
    if (!job) return notFoundResponse();
    if (job.novelId) await requireNovelOwnerOrAdmin(job.novelId, session.user);

    if (job.status === 'failed' || job.status === 'canceled') return imageJobResponse(job);
    if (!job.providerPredictionId) {
      return imageJobResponse(job, { status: 'starting', error: null, retryAfterMs: 3_000 });
    }
    if (job.finalizationLeaseUntil && job.finalizationLeaseUntil > now) {
      return imageJobResponse(job, { status: 'processing', error: null, retryAfterMs: 3_000 });
    }
    if (job.nextFinalizationAt && job.nextFinalizationAt > now) {
      return imageJobResponse(job, { status: 'processing', error: null });
    }
    if (job.finalizationAttempts >= MAX_IMAGE_FINALIZATION_ATTEMPTS) {
      await prisma.imageGenerationJob.updateMany({
        where: { id: job.id, userId: job.userId, imageUrl: null },
        data: {
          status: 'failed',
          error: '생성 결과를 영구 저장하지 못했습니다.',
          lastFinalizationError: 'max_finalization_attempts',
        },
      });
      job = (await getJob(job.id)) || job;
      return imageJobResponse(job);
    }

    let providerImageUrl = job.providerImageUrl;
    if (!providerImageUrl) {
      let prediction;
      try {
        prediction = await getImagePrediction(job.providerPredictionId);
      } catch (error) {
        logServerError('image-job-provider-status', new Error('AI provider request failed'), {
          jobId: job.id,
          userId: job.userId,
          errorType: error instanceof Error ? error.name.slice(0, 80) : 'UnknownError',
        });
        await prisma.imageGenerationJob.updateMany({
          where: {
            id: job.id,
            userId: job.userId,
            imageUrl: null,
            status: { in: ['starting', 'processing'] },
          },
          data: {
            status: 'processing',
            error: '이미지 생성 제공자의 상태를 일시적으로 확인하지 못했습니다.',
            lastFinalizationError: 'provider_status_unavailable',
          },
        });
        job = (await getJob(job.id)) || job;
        return imageJobResponse(job, { status: 'processing', error: null, retryAfterMs: 5_000 });
      }

      const providerStatus = normalizeImageJobStatus(prediction.status);
      if (providerStatus === 'failed' || providerStatus === 'canceled') {
        await prisma.imageGenerationJob.updateMany({
          where: { id: job.id, userId: job.userId, imageUrl: null },
          data: {
            status: providerStatus,
            error: providerStatus === 'failed'
              ? '이미지 생성 제공자가 작업에 실패했습니다.'
              : '이미지 생성 작업이 취소되었습니다.',
            lastFinalizationError: `provider_${providerStatus}`,
            finalizationLeaseToken: null,
            finalizationLeaseUntil: null,
          },
        });
        job = (await getJob(job.id)) || job;
        return imageJobResponse(job);
      }
      if (providerStatus !== 'succeeded') {
        await prisma.imageGenerationJob.updateMany({
          where: { id: job.id, userId: job.userId, imageUrl: null },
          data: { status: providerStatus, error: null, lastFinalizationError: null },
        });
        job = (await getJob(job.id)) || job;
        return imageJobResponse(job, { error: null, retryAfterMs: 4_000 });
      }

      providerImageUrl = extractPredictionImageUrl(prediction);
      if (!providerImageUrl) {
        await prisma.imageGenerationJob.updateMany({
          where: { id: job.id, userId: job.userId, imageUrl: null },
          data: {
            status: 'failed',
            error: '이미지 생성은 완료됐지만 결과 파일이 없습니다.',
            lastFinalizationError: 'provider_output_missing',
          },
        });
        job = (await getJob(job.id)) || job;
        return imageJobResponse(job);
      }

      await prisma.imageGenerationJob.updateMany({
        where: { id: job.id, userId: job.userId, imageUrl: null },
        data: {
          status: 'processing',
          providerImageUrl,
          error: null,
          lastFinalizationError: null,
        },
      });
      job = (await getJob(job.id)) || job;
    }

    try {
      await preflightFinalizationTarget(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : '이미지 반영 대상을 찾을 수 없습니다.';
      await prisma.imageGenerationJob.updateMany({
        where: { id: job.id, userId: job.userId, imageUrl: null },
        data: { status: 'failed', error: message, lastFinalizationError: 'target_unavailable' },
      });
      job = (await getJob(job.id)) || job;
      return imageJobResponse(job);
    }

    const leaseStartedAt = new Date();
    const leaseToken = crypto.randomUUID();
    const claim = await prisma.imageGenerationJob.updateMany({
      where: finalizationLeaseClaimWhere(job.id, job.userId, leaseStartedAt),
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
      job = (await getJob(job.id)) || job;
      return imageJobResponse(job, {
        status: job.imageUrl ? 'succeeded' : 'processing',
        error: null,
        retryAfterMs: 3_000,
      });
    }

    job = (await getJob(job.id)) || job;
    const storageTarget = getImageJobStorageTarget(job);
    if (!storageTarget) {
      await releaseFinalizationLease(
        job,
        leaseToken,
        'failed',
        '이미지 작업의 저장 정보가 올바르지 않습니다.',
        null,
        'storage_target_invalid'
      );
      job = (await getJob(job.id)) || job;
      return imageJobResponse(job);
    }

    const finalizingJob = job;
    let storageResult;
    try {
      storageResult = await withFinalizationHeartbeat(finalizingJob, leaseToken, () =>
        fetchAndUploadImageJobOnce(
          providerImageUrl!,
          storageTarget.bucket,
          storageTarget.folder,
          finalizingJob.id
        )
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
        retryPolicy.exhausted ? 'max_finalization_attempts' : 'storage_retry_scheduled'
      );
      job = (await getJob(job.id)) || job;
      return imageJobResponse(job, {
        status: retryPolicy.exhausted ? 'failed' : 'processing',
        imageUrl: null,
        error: retryPolicy.exhausted ? job.error : null,
        retryAfterMs: retryPolicy.retryAfterMs,
      });
    }

    try {
      await commitFinalizedImage(job, leaseToken, storageResult.url, storageResult.storageProvider);
    } catch (error) {
      if (error instanceof FinalizationLeaseLostError) {
        job = (await getJob(job.id)) || job;
        return imageJobResponse(job, {
          status: job.imageUrl ? 'succeeded' : 'processing',
          error: null,
          retryAfterMs: 3_000,
        });
      }

      if (error instanceof FinalizationTargetUnavailableError) {
        await releaseFinalizationLease(
          job,
          leaseToken,
          'failed',
          error.message,
          null,
          'target_unavailable'
        );
        if (storageResult.path) {
          await deleteFile(storageTarget.bucket, storageResult.path);
        }
        job = (await getJob(job.id)) || job;
        return imageJobResponse(job);
      }
      throw error;
    }

    job = (await getJob(job.id)) || job;
    return imageJobResponse(job);
  } catch (error) {
    return handleApiError(error, '이미지 생성 작업 상태를 확인하지 못했습니다.');
  }
}
