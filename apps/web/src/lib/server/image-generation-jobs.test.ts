import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPrediction: vi.fn(),
  createJob: vi.fn(),
  findJob: vi.fn(),
  updateJobs: vi.fn(),
  deleteJobs: vi.fn(),
  findJobs: vi.fn(),
  globalBudget: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('@/lib/ai', () => ({
  buildChapterIllustrationImageRequest: vi.fn(),
  buildCharacterPortraitImageRequest: vi.fn(),
  buildNovelCoverImageRequest: vi.fn(),
  createImagePrediction: mocks.createPrediction,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    chapter: { findFirst: vi.fn() },
    character: { findUnique: vi.fn() },
    imageGenerationJob: {
      create: mocks.createJob,
      findUnique: mocks.findJob,
      updateMany: mocks.updateJobs,
      deleteMany: mocks.deleteJobs,
      findMany: mocks.findJobs,
    },
  },
}));

vi.mock('./ai-budget', () => ({ assertGlobalAiBudget: mocks.globalBudget }));
vi.mock('./rate-limit', () => ({ assertRateLimit: mocks.rateLimit }));
vi.mock('./authz', () => ({
  assertOwnerOrAdmin: vi.fn(),
  requireNovelOwnerOrAdmin: vi.fn(),
}));
vi.mock('./sanitize', () => ({ stripHtmlToText: vi.fn() }));

import { verifyImageJobToken } from './image-job-token';
import {
  createPersistentImageGenerationJob,
  runImageJobMaintenance,
  stableImageSeed,
} from './image-generation-jobs';

const now = new Date('2026-07-17T10:00:00.000Z');
const expiresAt = new Date('2026-07-17T12:00:00.000Z');

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'local-job-1',
    providerPredictionId: null,
    clientRequestId: 'client-request-0001',
    tokenNonce: 'nonce-with-16-chars',
    userId: 'user-1',
    novelId: 'novel-1',
    type: 'portrait',
    prompt: 'request prompt',
    status: 'starting',
    imageUrl: null,
    providerImageUrl: null,
    storageProvider: 'none',
    error: null,
    metadata: { version: 1, characterId: 'character-1', genre: 'FANTASY', style: 'anime' },
    tokenExpiresAt: expiresAt,
    finalizationLeaseUntil: new Date('2026-07-17T10:02:00.000Z'),
    finalizationLeaseToken: 'creation-lease',
    finalizationAttempts: 0,
    nextFinalizationAt: null,
    lastFinalizationError: null,
    targetBoundAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const prepared = {
  type: 'portrait' as const,
  novelId: 'novel-1',
  imageRequest: { prompt: 'request prompt', aspectRatio: '1:1' as const },
  metadata: {
    version: 1,
    characterId: 'character-1',
    genre: 'FANTASY',
    style: 'anime',
  },
};

describe('persistent image generation job creation', () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = 'persistent-image-job-test-secret';
    vi.useFakeTimers();
    vi.setSystemTime(now);
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.globalBudget.mockResolvedValue(undefined);
    mocks.rateLimit.mockResolvedValue(undefined);
    mocks.updateJobs.mockResolvedValue({ count: 1 });
    mocks.deleteJobs.mockResolvedValue({ count: 0 });
    mocks.findJobs.mockResolvedValue([]);
  });

  afterEach(() => {
    delete process.env.NEXTAUTH_SECRET;
    vi.useRealTimers();
  });

  it('preserves expired provider-complete jobs for server recovery', async () => {
    await runImageJobMaintenance(now, { force: true });

    expect(mocks.updateJobs).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tokenExpiresAt: { lte: now },
        providerImageUrl: null,
      }),
      data: expect.objectContaining({ lastFinalizationError: 'job_expired' }),
    }));
  });

  it('로컬 DB 행을 먼저 만든 뒤 provider ID를 별도 필드에 저장한다', async () => {
    const initial = job();
    const completedCreation = job({
      providerPredictionId: 'prediction-1',
      prompt: 'request prompt',
      status: 'processing',
      providerImageUrl: 'https://provider.example/output.webp',
      finalizationLeaseUntil: null,
      finalizationLeaseToken: null,
    });
    mocks.findJob.mockResolvedValueOnce(null).mockResolvedValueOnce(completedCreation);
    mocks.createJob.mockResolvedValue(initial);
    mocks.createPrediction.mockResolvedValue({
      id: 'prediction-1',
      status: 'succeeded',
      prompt: 'request prompt',
      imageUrl: 'https://provider.example/output.webp',
    });

    const result = await createPersistentImageGenerationJob(
      prepared,
      'user-1',
      'client-request-0001',
      '203.0.113.10'
    );

    expect(mocks.createJob).toHaveBeenCalledOnce();
    expect(mocks.createJob.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.createPrediction.mock.invocationCallOrder[0]!);
    expect(mocks.createJob).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        novelId: 'novel-1',
        clientRequestId: 'client-request-0001',
        type: 'portrait',
        prompt: 'request prompt',
        status: 'starting',
      }),
    });
    expect(mocks.createJob.mock.calls[0]?.[0]?.data)
      .not.toHaveProperty('providerPredictionId');
    expect(mocks.updateJobs).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ providerPredictionId: 'prediction-1' }),
    }));
    expect(result.id).toBe('local-job-1');
    expect(result.status).toBe('processing');
    expect(verifyImageJobToken(result.token)).toEqual({
      jobId: 'local-job-1',
      userId: 'user-1',
      nonce: 'nonce-with-16-chars',
      expiresAt: expiresAt.getTime(),
    });
  });

  it('같은 사용자·clientRequestId 재시도는 provider를 다시 만들지 않는다', async () => {
    mocks.findJob.mockResolvedValue(job({
      providerPredictionId: 'prediction-1',
      status: 'processing',
      finalizationLeaseUntil: null,
      finalizationLeaseToken: null,
    }));

    const result = await createPersistentImageGenerationJob(
      prepared,
      'user-1',
      'client-request-0001',
      '203.0.113.10'
    );

    expect(mocks.createJob).not.toHaveBeenCalled();
    expect(mocks.createPrediction).not.toHaveBeenCalled();
    expect(result.id).toBe('local-job-1');
    expect(result.clientRequestId).toBe('client-request-0001');
  });

  it('같은 clientRequestId를 다른 정규화 요청에 재사용하면 거부한다', async () => {
    mocks.findJob.mockResolvedValue(job({
      providerPredictionId: 'prediction-1',
      status: 'processing',
      finalizationLeaseUntil: null,
      finalizationLeaseToken: null,
      metadata: {
        version: 1,
        characterId: 'character-1',
        genre: 'FANTASY',
        style: 'anime',
        requestFingerprint: 'a'.repeat(64),
      },
    }));

    await expect(createPersistentImageGenerationJob(
      prepared,
      'user-1',
      'client-request-0001',
      '203.0.113.10'
    )).rejects.toMatchObject({ status: 409 });
    expect(mocks.createPrediction).not.toHaveBeenCalled();
  });
});

describe('character image DNA seed', () => {
  it('같은 인물 ID에는 항상 같은 시드를 만들고 다른 인물과는 구분한다', () => {
    const first = stableImageSeed('portrait-dna:v1:character-1');

    expect(stableImageSeed('portrait-dna:v1:character-1')).toBe(first);
    expect(stableImageSeed('portrait-dna:v1:character-2')).not.toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(0x7fffffff);
  });
});
