import crypto from 'node:crypto';
import type { Session } from 'next-auth';
import {
  acquireAdminRoleReadLock,
  acquireNovelMutationLock,
} from '@novelverse/db';
import { logServerError } from '@novelverse/shared';
import {
  buildChapterIllustrationImageRequest,
  buildCharacterPortraitImageRequest,
  buildNovelCoverImageRequest,
  createImagePrediction,
  getImageProviderErrorDetails,
} from '@/lib/ai';
import { prisma } from '@/lib/prisma';
import { hasDurableImageStorage } from '@/lib/supabase';
import type { AIImageRequest, CoverGenerationOptions } from '@/types';
import { ApiError } from './api';
import { assertGlobalAiBudget } from './ai-budget';
import { assertContestContentMutationAllowed } from './contest-entry';
import { IMAGE_JOB_TOKEN_TTL_MS, signImageJobToken } from './image-job-token';
import {
  type ImageJobType,
  isSupportedImageJobType,
  normalizeImageJobStatus,
} from './image-job-state';
import { stripHtmlToText } from './sanitize';
import { assertRateLimit } from './rate-limit';
import { cleanupStoredImageIfUnreferenced } from './storage-cleanup';

type SessionUser = NonNullable<Session['user']>;

const imageJobMaintenanceState = globalThis as typeof globalThis & {
  __novelverseImageJobMaintenanceAt?: number;
};
const REQUEST_FINGERPRINT_KEY = 'requestFingerprint';

export interface CreateImageJobBody extends Partial<AIImageRequest> {
  type: ImageJobType;
  clientRequestId: string;
  title?: string;
  genre?: string;
  description?: string;
  novelId?: string;
  characterId?: string;
  characterIds?: string[];
  appearance?: string;
  variation?: string;
  options?: Partial<CoverGenerationOptions>;
}

export type PreparedImageJob = {
  type: ImageJobType;
  novelId: string | null;
  imageRequest: AIImageRequest;
  metadata: Record<string, string | number | boolean | string[]>;
};

export type CreatedImageJob = {
  id: string;
  token: string;
  status: string;
  type: ImageJobType;
  prompt: string;
  imageUrl: string | null;
  clientRequestId: string;
  createdAt: string;
};

function requirePrompt(prompt: string | undefined, message: string) {
  if (!prompt?.trim()) throw new ApiError(400, message);
  return prompt.trim();
}

export function stableImageSeed(identity: string): number {
  return crypto.createHash('sha256').update(identity).digest().readUInt32BE(0) & 0x7fffffff;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return value === undefined ? 'null' : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) =>
    `${JSON.stringify(key)}:${canonicalJson(item)}`
  ).join(',')}}`;
}

function imageJobRequestFingerprint(prepared: PreparedImageJob) {
  return crypto.createHash('sha256').update(canonicalJson({
    type: prepared.type,
    novelId: prepared.novelId,
    imageRequest: prepared.imageRequest,
    metadata: prepared.metadata,
  })).digest('hex');
}

function storedRequestFingerprint(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[REQUEST_FINGERPRINT_KEY];
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export async function runImageJobMaintenance(now: Date, options: { force?: boolean } = {}) {
  const lastRun = imageJobMaintenanceState.__novelverseImageJobMaintenanceAt || 0;
  if (!options.force && now.getTime() - lastRun < 60 * 60 * 1000) return null;
  imageJobMaintenanceState.__novelverseImageJobMaintenanceAt = now.getTime();

  try {
    const expired = await prisma.imageGenerationJob.updateMany({
      where: {
        tokenExpiresAt: { lte: now },
        status: { in: ['starting', 'processing'] },
        // Provider-complete jobs are owned by the authenticated maintenance
        // recovery path even after the client capability token expires.
        providerImageUrl: null,
        OR: [
          { finalizationLeaseUntil: null },
          { finalizationLeaseUntil: { lte: now } },
        ],
      },
      data: {
        status: 'failed',
        error: '이미지 생성 작업의 조회 기간이 만료되었습니다.',
        lastFinalizationError: 'job_expired',
        nextFinalizationAt: null,
        finalizationLeaseToken: null,
        finalizationLeaseUntil: null,
      },
    });
    const removedFailures = await prisma.imageGenerationJob.deleteMany({
      where: {
        status: { in: ['failed', 'canceled'] },
        updatedAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      },
    });

    const configuredRetention = Number.parseInt(process.env.IMAGE_JOB_RETENTION_DAYS || '', 10);
    const retentionDays = Number.isFinite(configuredRetention)
      ? Math.min(365, Math.max(7, configuredRetention))
      : 30;
    const completedBefore = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const completedJobs = await prisma.imageGenerationJob.findMany({
      where: { status: 'succeeded', updatedAt: { lt: completedBefore } },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 250,
      select: { id: true, type: true, imageUrl: true },
    });

    if (completedJobs.length) {
      await prisma.imageGenerationJob.deleteMany({
        where: { id: { in: completedJobs.map((job) => job.id) } },
      });
      await Promise.all(completedJobs.map((job) => {
        const bucket = job.type === 'cover'
          ? 'COVERS' as const
          : job.type === 'portrait'
            ? 'PORTRAITS' as const
            : 'ILLUSTRATIONS' as const;
        return cleanupStoredImageIfUnreferenced({
          bucket,
          source: job.imageUrl,
          scope: 'image-job-retention.storage-cleanup',
        });
      }));
    }

    return {
      expired: expired.count,
      removedFailures: removedFailures.count,
      removedCompleted: completedJobs.length,
    };
  } catch (error) {
    logServerError('image-job-maintenance', error);
    return null;
  }
}

async function assertImageJobCreationAllowed(novelId: string, user: SessionUser) {
  await prisma.$transaction(async (transaction) => {
    await acquireAdminRoleReadLock(transaction);
    await acquireNovelMutationLock(transaction, novelId);
    const [currentUser, novel] = await Promise.all([
      transaction.user.findUnique({
        where: { id: user.id },
        select: { role: true },
      }),
      transaction.novel.findUnique({
        where: { id: novelId },
        select: {
          authorId: true,
          seasonId: true,
          season: { select: { endsAt: true } },
        },
      }),
    ]);

    if (!currentUser || !novel) throw new ApiError(404, '작품을 찾을 수 없습니다.');
    const isAdmin = currentUser.role === 'ADMIN';
    if (novel.authorId !== user.id && !isAdmin) {
      throw new ApiError(403, '이미지 생성 권한이 없습니다.');
    }
    assertContestContentMutationAllowed(novel, { isAdmin });
  });
}

async function prepareCoverJob(
  body: CreateImageJobBody,
  user: SessionUser
): Promise<PreparedImageJob> {
  const title = requirePrompt(body.title, '표지를 생성하려면 제목이 필요합니다.');

  let firstChapterContent: string | undefined;
  if (body.novelId) {
    await assertImageJobCreationAllowed(body.novelId, user);
    const firstChapter = await prisma.chapter.findFirst({
      where: { novelId: body.novelId, chapterNumber: 1 },
      select: { content: true },
    });
    if (firstChapter?.content) {
      firstChapterContent = stripHtmlToText(firstChapter.content);
    }
  }

  const imageRequest = buildNovelCoverImageRequest(
    title,
    body.genre || 'OTHER',
    body.description,
    body.options,
    firstChapterContent
  );

  return {
    type: 'cover',
    novelId: body.novelId || null,
    imageRequest,
    metadata: {
      version: 1,
      style: imageRequest.style || 'anime',
      mood: body.options?.mood || 'mystical',
    },
  };
}

async function preparePortraitJob(
  body: CreateImageJobBody,
  user: SessionUser
): Promise<PreparedImageJob> {
  const characterId = requirePrompt(
    body.characterId,
    '초상화를 생성하려면 캐릭터 ID가 필요합니다.'
  );
  const appearance = requirePrompt(
    body.appearance,
    '초상화를 생성하려면 외형 설명이 필요합니다.'
  );

  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: {
      novelId: true,
      novel: {
        select: {
          authorId: true,
          genres: true,
        },
      },
    },
  });

  if (!character) {
    throw new ApiError(404, '캐릭터를 찾을 수 없습니다.');
  }
  if (body.novelId && body.novelId !== character.novelId) {
    throw new ApiError(400, '캐릭터와 작품 정보가 일치하지 않습니다.');
  }

  await assertImageJobCreationAllowed(character.novelId, user);

  const genre = body.genre || character.novel.genres[0] || 'OTHER';
  const style = body.style || 'anime';
  const seed = stableImageSeed(`portrait-dna:v1:${characterId}`);
  return {
    type: 'portrait',
    novelId: character.novelId,
    imageRequest: buildCharacterPortraitImageRequest(
      appearance,
      genre,
      style,
      seed,
      body.variation
    ),
    metadata: {
      version: 1,
      characterId,
      genre,
      style,
      seed,
      identityVersion: 1,
    },
  };
}

export async function prepareImageGenerationJob(
  body: CreateImageJobBody,
  user: SessionUser
): Promise<PreparedImageJob> {
  if (body.type === 'cover') return prepareCoverJob(body, user);
  if (body.type === 'portrait') return preparePortraitJob(body, user);

  if (body.novelId) {
    await assertImageJobCreationAllowed(body.novelId, user);
  }

  if (body.type === 'illustration') {
    const prompt = requirePrompt(
      body.prompt,
      '삽화를 생성하려면 프롬프트가 필요합니다.'
    );
    const characterIds = [...new Set(body.characterIds || [])].slice(0, 4);
    const identityCharacters = body.novelId && characterIds.length > 0
      ? await prisma.character.findMany({
          where: { novelId: body.novelId, id: { in: characterIds } },
          select: { id: true, name: true, appearance: true },
        })
      : [];
    const identityContext = identityCharacters
      .map((character) => `${character.name}: ${character.appearance}`)
      .join(' / ');
    const promptWithIdentity = identityContext
      ? `${prompt}\nCharacter identity DNA (preserve the same face, hair, eyes, age, and signature features): ${identityContext}`
      : prompt;
    const seed = identityCharacters.length > 0
      ? stableImageSeed(
          `illustration-dna:v1:${identityCharacters.map((item) => item.id).sort().join(':')}`
        )
      : undefined;
    const imageRequest = buildChapterIllustrationImageRequest(
      promptWithIdentity,
      body.genre || 'fantasy',
      body.style
    );
    imageRequest.seed = seed;
    return {
      type: body.type,
      novelId: body.novelId || null,
      imageRequest,
      metadata: {
        version: 1,
        style: imageRequest.style || 'anime',
        ...(seed === undefined ? {} : {
          seed,
          identityVersion: 1,
          characterIds: identityCharacters.map((item) => item.id),
        }),
      },
    };
  }

  if (body.type === 'custom') {
    const prompt = requirePrompt(body.prompt, '프롬프트를 입력해 주세요.');
    return {
      type: body.type,
      novelId: body.novelId || null,
      imageRequest: {
        prompt,
        negativePrompt: body.negativePrompt,
        style: body.style,
        aspectRatio: body.aspectRatio,
      },
      metadata: { version: 1, style: body.style || 'anime' },
    };
  }

  throw new ApiError(400, '지원하지 않는 이미지 작업 유형입니다.');
}

export async function createPersistentImageGenerationJob(
  prepared: PreparedImageJob,
  userId: string,
  clientRequestId: string,
  clientIp: string
): Promise<CreatedImageJob> {
  if (process.env.NODE_ENV === 'production' && !hasDurableImageStorage) {
    throw new ApiError(
      503,
      '영구 이미지 저장소가 설정되지 않아 이미지 생성을 시작할 수 없습니다. 관리자에게 문의해 주세요.'
    );
  }

  const now = new Date();
  await runImageJobMaintenance(now);
  const expiresAt = new Date(now.getTime() + IMAGE_JOB_TOKEN_TTL_MS);
  const creationLeaseToken = crypto.randomUUID();
  const creationLeaseUntil = new Date(now.getTime() + 2 * 60 * 1000);
  const requestFingerprint = imageJobRequestFingerprint(prepared);
  const persistedMetadata = {
    ...prepared.metadata,
    [REQUEST_FINGERPRINT_KEY]: requestFingerprint,
  };
  let ownsProviderCreation = false;

  let job = await prisma.imageGenerationJob.findUnique({
    where: { userId_clientRequestId: { userId, clientRequestId } },
  });

  if (!job) {
    try {
      job = await prisma.imageGenerationJob.create({
        data: {
          userId,
          novelId: prepared.novelId,
          clientRequestId,
          tokenNonce: crypto.randomUUID(),
          type: prepared.type,
          prompt: prepared.imageRequest.prompt,
          status: 'starting',
          storageProvider: 'none',
          metadata: persistedMetadata,
          tokenExpiresAt: expiresAt,
          finalizationLeaseToken: creationLeaseToken,
          finalizationLeaseUntil: creationLeaseUntil,
          targetBoundAt: prepared.novelId ? now : null,
          createdAt: now,
        },
      });
      ownsProviderCreation = true;
    } catch (error) {
      // A concurrent retry can win the unique (userId, clientRequestId) insert.
      job = await prisma.imageGenerationJob.findUnique({
        where: { userId_clientRequestId: { userId, clientRequestId } },
      });
      if (!job) throw error;
    }
  }

  const targetMatches = job.novelId === prepared.novelId ||
    (job.type === 'cover' && prepared.novelId === null && job.targetBoundAt !== null);
  const existingFingerprint = storedRequestFingerprint(job.metadata);
  if (
    job.type !== prepared.type ||
    !targetMatches ||
    job.prompt !== prepared.imageRequest.prompt ||
    (existingFingerprint !== null && existingFingerprint !== requestFingerprint)
  ) {
    throw new ApiError(409, '같은 요청 ID가 다른 이미지 작업에 이미 사용되었습니다.');
  }

  if (
    !ownsProviderCreation &&
    !job.providerPredictionId &&
    job.status === 'starting' &&
    (!job.finalizationLeaseUntil || job.finalizationLeaseUntil <= now)
  ) {
    const claimed = await prisma.imageGenerationJob.updateMany({
      where: {
        id: job.id,
        userId,
        providerPredictionId: null,
        status: 'starting',
        OR: [
          { finalizationLeaseUntil: null },
          { finalizationLeaseUntil: { lte: now } },
        ],
      },
      data: {
        finalizationLeaseToken: creationLeaseToken,
        finalizationLeaseUntil: creationLeaseUntil,
      },
    });
    ownsProviderCreation = claimed.count === 1;
  }

  if (ownsProviderCreation) {
    try {
      await assertRateLimit({
        key: `ai:image-provider:user-day:${userId}`,
        limit: 50,
        windowMs: 24 * 60 * 60 * 1000,
      });
      await assertRateLimit({
        key: `ai:image-provider:ip-day:${clientIp}`,
        limit: 100,
        windowMs: 24 * 60 * 60 * 1000,
      });
      await assertGlobalAiBudget();
      const prediction = await createImagePrediction(prepared.imageRequest);
      const providerStatus = normalizeImageJobStatus(prediction.status);
      const persistedStatus = providerStatus === 'succeeded' ? 'processing' : providerStatus;
      const providerError = prediction.failure?.userMessage || (
        providerStatus === 'failed'
          ? '이미지 생성 제공자가 작업에 실패했습니다.'
          : providerStatus === 'canceled'
            ? '이미지 생성 작업이 취소되었습니다.'
            : null
      );

      await prisma.imageGenerationJob.updateMany({
        where: {
          id: job.id,
          userId,
          providerPredictionId: null,
          finalizationLeaseToken: creationLeaseToken,
        },
        data: {
          providerPredictionId: prediction.id,
          prompt: prediction.prompt,
          status: persistedStatus,
          providerImageUrl: prediction.imageUrl || null,
          error: providerError,
          lastFinalizationError: prediction.failure
            ? `provider_${prediction.failure.code}`
            : null,
          finalizationLeaseToken: null,
          finalizationLeaseUntil: null,
        },
      });
    } catch (error) {
      if (error instanceof ApiError) {
        await prisma.imageGenerationJob.updateMany({
          where: {
            id: job.id,
            userId,
            providerPredictionId: null,
            finalizationLeaseToken: creationLeaseToken,
          },
          data: {
            status: 'starting',
            error: null,
            finalizationLeaseToken: null,
            finalizationLeaseUntil: null,
          },
        });
        throw error;
      }
      const providerFailure = getImageProviderErrorDetails(error);
      logServerError('image-job-provider-create', new Error('AI provider request failed'), {
        jobId: job.id,
        userId,
        errorType: error instanceof Error ? error.name.slice(0, 80) : 'UnknownError',
        providerCode: providerFailure.code,
        providerStatus: providerFailure.status,
        retryable: providerFailure.retryable,
      });
      if (providerFailure.retryable) {
        await prisma.imageGenerationJob.updateMany({
          where: {
            id: job.id,
            userId,
            providerPredictionId: null,
            finalizationLeaseToken: creationLeaseToken,
          },
          data: {
            status: 'starting',
            error: null,
            lastFinalizationError: `provider_create_${providerFailure.code}`,
            finalizationLeaseToken: null,
            finalizationLeaseUntil: null,
          },
        });
        throw new ApiError(
          providerFailure.status === 429 ? 429 : 503,
          providerFailure.userMessage
        );
      }
      await prisma.imageGenerationJob.updateMany({
        where: {
          id: job.id,
          userId,
          providerPredictionId: null,
          finalizationLeaseToken: creationLeaseToken,
        },
        data: {
          status: 'failed',
          error: providerFailure.userMessage,
          lastFinalizationError: `provider_create_${providerFailure.code}`,
          finalizationLeaseToken: null,
          finalizationLeaseUntil: null,
        },
      });
    }

    job = await prisma.imageGenerationJob.findUnique({ where: { id: job.id } }) || job;
  }

  if (!isSupportedImageJobType(job.type)) {
    throw new ApiError(500, '저장된 이미지 작업 유형이 올바르지 않습니다.');
  }

  return {
    id: job.id,
    token: signImageJobToken({
      jobId: job.id,
      userId: job.userId,
      nonce: job.tokenNonce,
      expiresAt: job.tokenExpiresAt.getTime(),
    }),
    status: normalizeImageJobStatus(job.status),
    type: job.type,
    prompt: job.prompt,
    imageUrl: job.status === 'succeeded' ? job.imageUrl : null,
    clientRequestId: job.clientRequestId,
    createdAt: job.createdAt.toISOString(),
  };
}
