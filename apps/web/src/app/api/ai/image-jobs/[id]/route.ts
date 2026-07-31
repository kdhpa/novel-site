import { NextRequest, NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import {
  acquireAdminRoleReadLock,
  acquireNovelMutationLock,
} from '@novelverse/db';
import { logServerError } from '@novelverse/shared';
import { auth } from '@/lib/auth';
import {
  extractPredictionImageUrl,
  getImagePrediction,
  getImagePredictionFailureDetails,
  getImageProviderErrorDetails,
} from '@/lib/ai';
import { prisma } from '@/lib/prisma';
import { ApiError, handleApiError } from '@/lib/server/api';
import { requireNovelOwnerOrAdmin } from '@/lib/server/authz';
import { assertContestContentMutationAllowed } from '@/lib/server/contest-entry';
import {
  imageJobTokenMatchesRecord,
  isSupportedImageJobType,
  normalizeImageJobStatus,
  type ImageJobStatus,
} from '@/lib/server/image-job-state';
import {
  processImageProviderUpdate,
  type ImageJobRecord,
} from '@/lib/server/image-job-finalization';
import { verifyImageJobToken } from '@/lib/server/image-job-token';
import { assertRateLimit } from '@/lib/server/rate-limit';
import type { ApiResponse } from '@/types';

export const runtime = 'nodejs';

const TERMINAL_STATUSES = ['succeeded', 'failed', 'canceled'];

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
    let providerUpdate;
    if (job.providerImageUrl) {
      providerUpdate = {
        predictionId: job.providerPredictionId,
        status: 'succeeded',
        imageUrl: job.providerImageUrl,
      };
    } else {
      let prediction;
      try {
        prediction = await getImagePrediction(job.providerPredictionId);
      } catch (error) {
        const providerFailure = getImageProviderErrorDetails(error);
        logServerError('image-job-provider-status', new Error('AI provider request failed'), {
          jobId: job.id,
          userId: job.userId,
          errorType: error instanceof Error ? error.name.slice(0, 80) : 'UnknownError',
          providerCode: providerFailure.code,
          providerStatus: providerFailure.status,
          retryable: providerFailure.retryable,
        });
        await prisma.imageGenerationJob.updateMany({
          where: {
            id: job.id,
            userId: job.userId,
            imageUrl: null,
            status: { in: ['starting', 'processing'] },
          },
          data: {
            status: providerFailure.retryable ? 'processing' : 'failed',
            error: providerFailure.userMessage,
            lastFinalizationError: `provider_status_${providerFailure.code}`,
            ...(providerFailure.retryable ? {} : {
              finalizationLeaseToken: null,
              finalizationLeaseUntil: null,
              nextFinalizationAt: null,
            }),
          },
        });
        job = (await getJob(job.id)) || job;
        return imageJobResponse(job, providerFailure.retryable
          ? { status: 'processing', error: null, retryAfterMs: 5_000 }
          : { status: 'failed', error: providerFailure.userMessage, retryAfterMs: null });
      }

      const providerFailure = getImagePredictionFailureDetails(prediction);
      providerUpdate = {
        predictionId: job.providerPredictionId,
        status: prediction.status,
        imageUrl: extractPredictionImageUrl(prediction),
        failureMessage: providerFailure?.userMessage,
        failureCode: providerFailure ? `provider_${providerFailure.code}` : undefined,
      };
    }

    const finalized = await processImageProviderUpdate(job, providerUpdate);
    return imageJobResponse(finalized.job, {
      status: finalized.status,
      error: finalized.exposeError ? finalized.job.error : null,
      retryAfterMs: finalized.retryAfterMs,
    });
  } catch (error) {
    return handleApiError(error, '이미지 생성 작업 상태를 확인하지 못했습니다.');
  }
}
