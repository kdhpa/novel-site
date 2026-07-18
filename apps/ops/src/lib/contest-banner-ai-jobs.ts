import crypto from 'node:crypto';
import { prisma } from '@novelverse/db';
import type { ImageGenerationJob } from '@novelverse/db';
import { consumeSecurityRateLimit } from '@novelverse/auth';
import { logServerError } from '@novelverse/shared';
import { OpsApiError } from './api-error';
import {
  assertContestBannerAiProviderConfigured,
  buildContestBannerAiPrompt,
  CONTEST_BANNER_AI_STYLES,
  createContestBannerPrediction,
  getContestBannerPrediction,
  type ContestBannerAiStyle,
} from './contest-banner-ai-provider';
import {
  CONTEST_BANNER_AI_TOKEN_TTL_MS,
  signContestBannerAiToken,
  verifyContestBannerAiToken,
} from './contest-banner-ai-token';
import {
  MAX_CONTEST_BANNER_FILE_BYTES,
  storeContestBanner,
} from './contest-banner-storage';
import { fetchContestBannerAiImage } from './contest-banner-ai-remote';

export const CONTEST_BANNER_AI_JOB_TYPE = 'contest-banner';
export const CONTEST_BANNER_AI_RETRY_AFTER_MS = 2_000;

const REQUEST_FINGERPRINT_KEY = 'requestFingerprint';
const FINALIZATION_LEASE_MS = 2 * 60_000;
const MAX_FINALIZATION_ATTEMPTS = 5;
const CREATE_LEASE_MS = 2 * 60_000;

export type ContestBannerAiJobStatus =
  | 'starting'
  | 'processing'
  | 'finalizing'
  | 'succeeded'
  | 'failed';

export type ContestBannerAiJobInput = {
  prompt: string;
  style: ContestBannerAiStyle;
  clientRequestId: string;
};

export type ContestBannerAiJobSnapshot = {
  id: string;
  status: ContestBannerAiJobStatus;
  imageUrl: string | null;
  error: string | null;
  retryAfterMs: number;
};

type JobMetadata = {
  version: 1;
  purpose: 'ops-contest-banner';
  style: ContestBannerAiStyle;
  requestFingerprint: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseContestBannerAiJobInput(value: unknown): ContestBannerAiJobInput {
  if (!isRecord(value)) throw new OpsApiError(400, '배너 생성 입력값을 확인해 주세요.');
  const allowedKeys = new Set(['prompt', 'style', 'clientRequestId']);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new OpsApiError(400, '지원하지 않는 배너 생성 입력값이 포함되어 있습니다.');
  }

  const prompt = typeof value.prompt === 'string' ? value.prompt.trim() : '';
  const style = typeof value.style === 'string' ? value.style.trim() : '';
  const clientRequestId = typeof value.clientRequestId === 'string'
    ? value.clientRequestId.trim()
    : '';

  if (!prompt || prompt.length > 2_000) {
    throw new OpsApiError(400, '배너 프롬프트는 1자 이상 2,000자 이하로 입력해 주세요.');
  }
  if (!CONTEST_BANNER_AI_STYLES.includes(style as ContestBannerAiStyle)) {
    throw new OpsApiError(400, '지원하지 않는 배너 이미지 스타일입니다.');
  }
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(clientRequestId)) {
    throw new OpsApiError(400, '올바른 배너 생성 요청 ID를 입력해 주세요.');
  }

  return { prompt, style: style as ContestBannerAiStyle, clientRequestId };
}

function requestFingerprint(input: ContestBannerAiJobInput) {
  return crypto.createHash('sha256').update(JSON.stringify({
    version: 1,
    prompt: input.prompt,
    style: input.style,
    renderedPrompt: buildContestBannerAiPrompt(input.prompt, input.style),
  })).digest('hex');
}

function metadataFingerprint(metadata: unknown) {
  if (!isRecord(metadata)) return null;
  const value = metadata[REQUEST_FINGERPRINT_KEY];
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

function normalizeProviderStatus(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'succeeded' || normalized === 'successful') return 'succeeded';
  if (
    normalized === 'failed' ||
    normalized === 'canceled' ||
    normalized === 'cancelled'
  ) {
    return 'failed';
  }
  return normalized === 'starting' ? 'starting' : 'processing';
}

function retryAfterFor(job: ImageGenerationJob, now = Date.now()) {
  if (job.status === 'succeeded' || job.status === 'failed') return 0;
  if (job.nextFinalizationAt && job.nextFinalizationAt.getTime() > now) {
    return Math.max(500, job.nextFinalizationAt.getTime() - now);
  }
  return CONTEST_BANNER_AI_RETRY_AFTER_MS;
}

export function contestBannerAiJobSnapshot(
  job: ImageGenerationJob,
  now = Date.now(),
): ContestBannerAiJobSnapshot {
  let status: ContestBannerAiJobStatus;
  if (job.status === 'succeeded' && job.imageUrl) status = 'succeeded';
  else if (job.status === 'failed' || job.status === 'canceled') status = 'failed';
  else if (
    job.providerImageUrl &&
    job.finalizationLeaseToken &&
    job.finalizationLeaseUntil &&
    job.finalizationLeaseUntil.getTime() > now
  ) {
    status = 'finalizing';
  } else if (!job.providerPredictionId) status = 'starting';
  else status = 'processing';

  return {
    id: job.id,
    status,
    imageUrl: status === 'succeeded' ? job.imageUrl : null,
    error: status === 'failed'
      ? job.error || '배너 이미지 생성 작업에 실패했습니다.'
      : null,
    retryAfterMs: retryAfterFor(job, now),
  };
}

function tokenForJob(job: ImageGenerationJob) {
  return signContestBannerAiToken({
    jobId: job.id,
    userId: job.userId,
    nonce: job.tokenNonce,
    expiresAt: job.tokenExpiresAt.getTime(),
  });
}

async function assertLimit(key: string, limit: number, windowMs: number) {
  if (!(await consumeSecurityRateLimit(key, limit, windowMs))) {
    throw new OpsApiError(429, 'AI 배너 생성 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  }
}

export async function assertContestBannerAiRequestLimits(userId: string) {
  await assertLimit(`ai:image-job:burst:${userId}`, 8, 60_000);
  await assertLimit(`ai:image-job:hour:${userId}`, 30, 60 * 60_000);
}

async function assertContestBannerAiProviderLimits(userId: string, clientIp: string) {
  await assertLimit(`ai:image-provider:user-day:${userId}`, 50, 24 * 60 * 60_000);
  await assertLimit(`ai:image-provider:ip-day:${clientIp}`, 100, 24 * 60 * 60_000);
  const configured = Number(process.env.AI_GLOBAL_DAILY_LIMIT);
  const globalLimit = Number.isInteger(configured) && configured > 0 ? configured : 1_000;
  await assertLimit('ai:global:rolling-day', globalLimit, 24 * 60 * 60_000);
}

function isUniqueConstraintError(error: unknown) {
  return isRecord(error) && error.code === 'P2002';
}

function jobMatchesInput(job: ImageGenerationJob, input: ContestBannerAiJobInput) {
  return job.type === CONTEST_BANNER_AI_JOB_TYPE &&
    job.novelId === null &&
    job.prompt === buildContestBannerAiPrompt(input.prompt, input.style) &&
    metadataFingerprint(job.metadata) === requestFingerprint(input);
}

export function isAmbiguousContestBannerProviderCreation(
  job: Pick<ImageGenerationJob, 'providerPredictionId' | 'status' | 'finalizationLeaseUntil'>,
  now = new Date(),
) {
  return !job.providerPredictionId &&
    job.status === 'starting' &&
    (!job.finalizationLeaseUntil || job.finalizationLeaseUntil <= now);
}

async function closeAmbiguousContestBannerProviderCreation(
  job: ImageGenerationJob,
  now: Date,
) {
  await prisma.imageGenerationJob.updateMany({
    where: {
      id: job.id,
      userId: job.userId,
      type: CONTEST_BANNER_AI_JOB_TYPE,
      novelId: null,
      providerPredictionId: null,
      status: 'starting',
      OR: [
        { finalizationLeaseUntil: null },
        { finalizationLeaseUntil: { lte: now } },
      ],
    },
    data: {
      status: 'failed',
      error: '이전 AI 생성 요청의 처리 결과를 확인할 수 없습니다. 중복 결제를 막기 위해 자동 재시도하지 않았습니다. 새로 생성해 주세요.',
      finalizationLeaseToken: null,
      finalizationLeaseUntil: null,
      lastFinalizationError: 'provider_creation_ambiguous',
    },
  });
  return (await prisma.imageGenerationJob.findUnique({ where: { id: job.id } })) || job;
}

export async function createContestBannerAiJob(
  userId: string,
  input: ContestBannerAiJobInput,
  clientIp: string,
) {
  assertContestBannerAiProviderConfigured();
  await assertContestBannerAiRequestLimits(userId);
  const now = new Date();
  const creationLeaseToken = crypto.randomUUID();
  const creationLeaseUntil = new Date(now.getTime() + CREATE_LEASE_MS);
  const fingerprint = requestFingerprint(input);
  const renderedPrompt = buildContestBannerAiPrompt(input.prompt, input.style);
  const metadata: JobMetadata = {
    version: 1,
    purpose: 'ops-contest-banner',
    style: input.style,
    requestFingerprint: fingerprint,
  };
  let ownsProviderCreation = false;

  let job = await prisma.imageGenerationJob.findUnique({
    where: { userId_clientRequestId: { userId, clientRequestId: input.clientRequestId } },
  });

  if (!job) {
    try {
      job = await prisma.imageGenerationJob.create({
        data: {
          userId,
          novelId: null,
          clientRequestId: input.clientRequestId,
          tokenNonce: crypto.randomUUID(),
          type: CONTEST_BANNER_AI_JOB_TYPE,
          prompt: renderedPrompt,
          status: 'starting',
          storageProvider: 'none',
          metadata,
          tokenExpiresAt: new Date(now.getTime() + CONTEST_BANNER_AI_TOKEN_TTL_MS),
          finalizationLeaseToken: creationLeaseToken,
          finalizationLeaseUntil: creationLeaseUntil,
        },
      });
      ownsProviderCreation = true;
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      job = await prisma.imageGenerationJob.findUnique({
        where: { userId_clientRequestId: { userId, clientRequestId: input.clientRequestId } },
      });
      if (!job) throw error;
    }
  }

  if (!jobMatchesInput(job, input)) {
    throw new OpsApiError(409, '같은 요청 ID가 다른 배너 생성 작업에 이미 사용되었습니다.');
  }

  if (!ownsProviderCreation && isAmbiguousContestBannerProviderCreation(job, now)) {
    job = await closeAmbiguousContestBannerProviderCreation(job, now);
  }

  if (ownsProviderCreation) {
    try {
      await assertContestBannerAiProviderLimits(userId, clientIp);
      const leaseCheckAt = new Date();
      const confirmedLease = await prisma.imageGenerationJob.updateMany({
        where: {
          id: job.id,
          userId,
          type: CONTEST_BANNER_AI_JOB_TYPE,
          providerPredictionId: null,
          status: 'starting',
          finalizationLeaseToken: creationLeaseToken,
          finalizationLeaseUntil: { gt: leaseCheckAt },
        },
        data: {
          finalizationLeaseUntil: new Date(leaseCheckAt.getTime() + CREATE_LEASE_MS),
        },
      });
      if (confirmedLease.count === 1) {
        const prediction = await createContestBannerPrediction(input.prompt, input.style);
        const providerStatus = normalizeProviderStatus(prediction.status);
        const persistedStatus = providerStatus === 'failed'
          ? 'failed'
          : providerStatus === 'succeeded'
            ? 'processing'
            : providerStatus;
        await prisma.imageGenerationJob.updateMany({
          where: {
            id: job.id,
            userId,
            type: CONTEST_BANNER_AI_JOB_TYPE,
            providerPredictionId: null,
            finalizationLeaseToken: creationLeaseToken,
          },
          data: {
            providerPredictionId: prediction.id,
            providerImageUrl: prediction.imageUrl,
            status: persistedStatus,
            error: providerStatus === 'failed' ? 'AI 이미지 공급자가 생성 작업에 실패했습니다.' : null,
            finalizationLeaseToken: null,
            finalizationLeaseUntil: null,
          },
        });
      }
    } catch (error) {
      const retryableLimit = error instanceof OpsApiError && error.status === 429;
      if (retryableLimit) {
        await prisma.imageGenerationJob.deleteMany({
          where: {
            id: job.id,
            userId,
            type: CONTEST_BANNER_AI_JOB_TYPE,
            providerPredictionId: null,
            finalizationLeaseToken: creationLeaseToken,
          },
        });
      } else {
        await prisma.imageGenerationJob.updateMany({
          where: {
            id: job.id,
            userId,
            type: CONTEST_BANNER_AI_JOB_TYPE,
            providerPredictionId: null,
            finalizationLeaseToken: creationLeaseToken,
          },
          data: {
            status: 'failed',
            error: 'AI 이미지 공급자에 생성 작업을 요청하지 못했습니다.',
            finalizationLeaseToken: null,
            finalizationLeaseUntil: null,
          },
        });
      }
      throw error;
    }
    job = await prisma.imageGenerationJob.findUnique({ where: { id: job.id } }) || job;
  }

  return {
    id: job.id,
    token: tokenForJob(job),
    status: contestBannerAiJobSnapshot(job).status,
    retryAfterMs: CONTEST_BANNER_AI_RETRY_AFTER_MS,
  };
}

export async function assertContestBannerAiStatusLimits(userId: string, jobId: string) {
  await assertLimit(`ai:image-job-status:burst:${userId}:${jobId}`, 60, 60_000);
  await assertLimit(`ai:image-job-status:window:${userId}:${jobId}`, 240, 15 * 60_000);
}

function assertJobToken(job: ImageGenerationJob, userId: string, token: string) {
  const payload = verifyContestBannerAiToken(token);
  if (
    !payload ||
    payload.jobId !== job.id ||
    payload.userId !== userId ||
    payload.nonce !== job.tokenNonce ||
    payload.expiresAt !== job.tokenExpiresAt.getTime()
  ) {
    throw new OpsApiError(401, '올바른 배너 AI 작업 토큰이 필요합니다.');
  }
}

async function loadContestBannerAiJob(jobId: string, userId: string, token: string) {
  const payload = verifyContestBannerAiToken(token);
  if (!payload || payload.jobId !== jobId || payload.userId !== userId) {
    throw new OpsApiError(401, '올바른 배너 AI 작업 토큰이 필요합니다.');
  }
  const job = await prisma.imageGenerationJob.findFirst({
    where: { id: jobId, userId, type: CONTEST_BANNER_AI_JOB_TYPE, novelId: null },
  });
  if (!job) throw new OpsApiError(404, '배너 AI 생성 작업을 찾을 수 없습니다.');
  assertJobToken(job, userId, token);
  return job;
}

function uploadFileForBytes(bytes: Buffer, type: string) {
  return {
    size: bytes.byteLength,
    type,
    async arrayBuffer() {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return copy.buffer;
    },
  };
}

function finalizationBackoff(attempt: number) {
  return Math.min(2_000 * 2 ** Math.max(0, attempt - 1), 30_000);
}

async function finalizeContestBannerAiJob(
  job: ImageGenerationJob,
  providerImageUrl: string,
) {
  const now = new Date();
  const leaseToken = crypto.randomUUID();
  const leaseUntil = new Date(now.getTime() + FINALIZATION_LEASE_MS);
  const claim = await prisma.imageGenerationJob.updateMany({
    where: {
      id: job.id,
      userId: job.userId,
      type: CONTEST_BANNER_AI_JOB_TYPE,
      novelId: null,
      imageUrl: null,
      status: { in: ['starting', 'processing'] },
      finalizationAttempts: { lt: MAX_FINALIZATION_ATTEMPTS },
      AND: [
        {
          OR: [
            { nextFinalizationAt: null },
            { nextFinalizationAt: { lte: now } },
          ],
        },
        {
          OR: [
            { finalizationLeaseUntil: null },
            { finalizationLeaseUntil: { lte: now } },
          ],
        },
      ],
    },
    data: {
      status: 'processing',
      providerImageUrl,
      finalizationLeaseToken: leaseToken,
      finalizationLeaseUntil: leaseUntil,
      finalizationAttempts: { increment: 1 },
      nextFinalizationAt: null,
    },
  });

  if (claim.count !== 1) {
    const current = await prisma.imageGenerationJob.findUnique({ where: { id: job.id } });
    if (!current) throw new OpsApiError(404, '배너 AI 생성 작업을 찾을 수 없습니다.');
    if (
      current.finalizationAttempts >= MAX_FINALIZATION_ATTEMPTS &&
      (!current.finalizationLeaseUntil || current.finalizationLeaseUntil <= now) &&
      current.status !== 'succeeded' &&
      current.status !== 'failed'
    ) {
      await prisma.imageGenerationJob.updateMany({
        where: { id: current.id, userId: current.userId, type: CONTEST_BANNER_AI_JOB_TYPE },
        data: {
          status: 'failed',
          error: '생성된 배너 이미지를 안전하게 저장하지 못했습니다.',
          finalizationLeaseToken: null,
          finalizationLeaseUntil: null,
          nextFinalizationAt: null,
        },
      });
      return (await prisma.imageGenerationJob.findUnique({ where: { id: current.id } })) || current;
    }
    return current;
  }

  const attempt = job.finalizationAttempts + 1;
  try {
    const verified = await fetchContestBannerAiImage(providerImageUrl, {
      timeoutMs: 30_000,
      maxBytes: MAX_CONTEST_BANNER_FILE_BYTES,
    });
    const stored = await storeContestBanner(
      uploadFileForBytes(verified.bytes, verified.contentType),
    );
    await prisma.imageGenerationJob.updateMany({
      where: {
        id: job.id,
        userId: job.userId,
        type: CONTEST_BANNER_AI_JOB_TYPE,
        finalizationLeaseToken: leaseToken,
      },
      data: {
        status: 'succeeded',
        imageUrl: stored.url,
        providerImageUrl,
        storageProvider: 'source-tree',
        error: null,
        finalizationLeaseToken: null,
        finalizationLeaseUntil: null,
        nextFinalizationAt: null,
        lastFinalizationError: null,
      },
    });
  } catch (error) {
    const exhausted = attempt >= MAX_FINALIZATION_ATTEMPTS;
    logServerError('ops-contest-banner-ai.finalize', error, {
      jobId: job.id,
      attempt,
    });
    await prisma.imageGenerationJob.updateMany({
      where: {
        id: job.id,
        userId: job.userId,
        type: CONTEST_BANNER_AI_JOB_TYPE,
        finalizationLeaseToken: leaseToken,
      },
      data: {
        status: exhausted ? 'failed' : 'processing',
        error: exhausted ? '생성된 배너 이미지를 안전하게 저장하지 못했습니다.' : null,
        finalizationLeaseToken: null,
        finalizationLeaseUntil: null,
        nextFinalizationAt: exhausted
          ? null
          : new Date(Date.now() + finalizationBackoff(attempt)),
        lastFinalizationError: error instanceof Error
          ? error.name.slice(0, 80)
          : 'UnknownError',
      },
    });
  }

  return (await prisma.imageGenerationJob.findUnique({ where: { id: job.id } })) || job;
}

export async function getContestBannerAiJob(
  jobId: string,
  userId: string,
  token: string,
) {
  let job = await loadContestBannerAiJob(jobId, userId, token);
  if (job.status === 'succeeded' || job.status === 'failed') {
    return contestBannerAiJobSnapshot(job);
  }
  const now = new Date();
  if (!job.providerPredictionId) {
    if (isAmbiguousContestBannerProviderCreation(job, now)) {
      job = await closeAmbiguousContestBannerProviderCreation(job, now);
    }
    return contestBannerAiJobSnapshot(job);
  }

  if (
    (job.nextFinalizationAt && job.nextFinalizationAt > now) ||
    (job.providerImageUrl && job.finalizationLeaseUntil && job.finalizationLeaseUntil > now)
  ) {
    return contestBannerAiJobSnapshot(job);
  }

  const prediction = await getContestBannerPrediction(job.providerPredictionId);
  const providerStatus = normalizeProviderStatus(prediction.status);
  if (providerStatus === 'failed') {
    await prisma.imageGenerationJob.updateMany({
      where: {
        id: job.id,
        userId,
        type: CONTEST_BANNER_AI_JOB_TYPE,
        status: { notIn: ['succeeded', 'failed'] },
      },
      data: {
        status: 'failed',
        error: 'AI 이미지 공급자가 생성 작업에 실패했습니다.',
        finalizationLeaseToken: null,
        finalizationLeaseUntil: null,
      },
    });
  } else if (providerStatus === 'succeeded') {
    if (!prediction.imageUrl) {
      await prisma.imageGenerationJob.updateMany({
        where: { id: job.id, userId, type: CONTEST_BANNER_AI_JOB_TYPE },
        data: {
          status: 'failed',
          error: 'AI 이미지 공급자가 결과 이미지를 반환하지 않았습니다.',
        },
      });
    } else {
      job = await finalizeContestBannerAiJob(job, prediction.imageUrl);
      return contestBannerAiJobSnapshot(job);
    }
  } else {
    await prisma.imageGenerationJob.updateMany({
      where: {
        id: job.id,
        userId,
        type: CONTEST_BANNER_AI_JOB_TYPE,
        status: { notIn: ['succeeded', 'failed'] },
      },
      data: { status: providerStatus },
    });
  }

  job = (await prisma.imageGenerationJob.findUnique({ where: { id: job.id } })) || job;
  return contestBannerAiJobSnapshot(job);
}
