import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acquireAdminLock: vi.fn(),
  acquireNovelLock: vi.fn(),
  findJob: vi.fn(),
  updateJobs: vi.fn(),
  findUser: vi.fn(),
  findNovel: vi.fn(),
  findCharacter: vi.fn(),
  transaction: vi.fn(),
  txFindUser: vi.fn(),
  txFindNovel: vi.fn(),
  txUpdateJobs: vi.fn(),
  txUpdateCharacters: vi.fn(),
  txUpdateNovel: vi.fn(),
  upload: vi.fn(),
  deleteFile: vi.fn(),
  contestMutation: vi.fn(),
  shouldResetReview: vi.fn(),
  reviewResetData: vi.fn(),
  log: vi.fn(),
}));

vi.mock('@novelverse/db', () => ({
  acquireAdminRoleReadLock: mocks.acquireAdminLock,
  acquireNovelMutationLock: mocks.acquireNovelLock,
}));

vi.mock('@novelverse/shared', () => ({ logServerError: mocks.log }));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    imageGenerationJob: {
      findUnique: mocks.findJob,
      updateMany: mocks.updateJobs,
    },
    user: { findUnique: mocks.findUser },
    novel: { findUnique: mocks.findNovel },
    character: { findFirst: mocks.findCharacter },
    $transaction: mocks.transaction,
  },
}));

vi.mock('@/lib/supabase', () => ({ deleteFile: mocks.deleteFile }));
vi.mock('./contest-entry', () => ({
  assertContestContentMutationAllowed: mocks.contestMutation,
}));
vi.mock('./image-storage', () => ({
  fetchAndUploadImageJobOnce: mocks.upload,
}));
vi.mock('./novel-review', () => ({
  shouldResetReviewAfterAuthorChange: mocks.shouldResetReview,
  reviewResetData: mocks.reviewResetData,
}));

import {
  ImageJobProviderMismatchError,
  processImageProviderUpdate,
} from './image-job-finalization';

const now = new Date('2026-07-22T00:00:00.000Z');
let currentJob: ReturnType<typeof makeJob> & Record<string, unknown>;

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    providerPredictionId: 'prediction-1',
    clientRequestId: 'request-1',
    tokenNonce: 'nonce-with-at-least-sixteen-characters',
    userId: 'user-1',
    novelId: 'novel-1',
    type: 'portrait',
    prompt: 'silver-haired knight portrait',
    status: 'processing',
    imageUrl: null,
    providerImageUrl: null,
    storageProvider: 'none',
    error: null,
    metadata: {
      version: 1,
      characterId: 'character-1',
      genre: 'FANTASY',
      style: 'anime',
    },
    tokenExpiresAt: new Date(now.getTime() + 60 * 60_000),
    finalizationLeaseUntil: null,
    finalizationLeaseToken: null,
    finalizationAttempts: 0,
    nextFinalizationAt: null,
    lastFinalizationError: null,
    targetBoundAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function applyJobData(data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    if (key === 'finalizationAttempts' && value && typeof value === 'object') {
      const increment = (value as { increment?: unknown }).increment;
      currentJob.finalizationAttempts += Number(increment || 0);
    } else {
      currentJob[key] = value;
    }
  }
}

describe('shared image job finalization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    currentJob = makeJob();
    for (const mock of Object.values(mocks)) mock.mockReset();

    mocks.findJob.mockImplementation(async () => ({ ...currentJob }));
    mocks.updateJobs.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      applyJobData(data);
      return { count: 1 };
    });
    mocks.findUser.mockResolvedValue({ role: 'AUTHOR' });
    mocks.findNovel.mockResolvedValue({ authorId: 'user-1' });
    mocks.findCharacter.mockResolvedValue({ id: 'character-1' });
    mocks.acquireAdminLock.mockResolvedValue(undefined);
    mocks.acquireNovelLock.mockResolvedValue(undefined);
    mocks.txFindUser.mockResolvedValue({ role: 'AUTHOR' });
    mocks.txFindNovel.mockResolvedValue({
      authorId: 'user-1',
      approvalStatus: 'APPROVED',
      seasonId: null,
      season: null,
    });
    mocks.txUpdateJobs.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      applyJobData(data);
      return { count: 1 };
    });
    mocks.txUpdateCharacters.mockResolvedValue({ count: 1 });
    mocks.txUpdateNovel.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback: (transaction: unknown) => unknown) =>
      callback({
        user: { findUnique: mocks.txFindUser },
        novel: { findUnique: mocks.txFindNovel, update: mocks.txUpdateNovel },
        character: { updateMany: mocks.txUpdateCharacters },
        imageGenerationJob: { updateMany: mocks.txUpdateJobs },
      }),
    );
    mocks.upload.mockResolvedValue({
      url: '/uploads/character-portraits/result.webp',
      stored: true,
      storageProvider: 'local',
      path: 'novel-1-character-1/jobs/result.webp',
    });
    mocks.deleteFile.mockResolvedValue({ success: true, error: null });
    mocks.shouldResetReview.mockReturnValue(true);
    mocks.reviewResetData.mockReturnValue({
      approvalStatus: 'DRAFT',
      isPublished: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores a successful output once and preserves portrait and review side effects', async () => {
    const finalized = await processImageProviderUpdate(currentJob as never, {
      predictionId: 'prediction-1',
      status: 'succeeded',
      imageUrl: 'https://replicate.delivery/output.webp',
    });

    expect(finalized.status).toBe('succeeded');
    expect(finalized.retryWebhook).toBe(false);
    expect(mocks.upload).toHaveBeenCalledWith(
      'https://replicate.delivery/output.webp',
      'PORTRAITS',
      'novel-1-character-1',
      'job-1',
    );
    expect(mocks.txUpdateCharacters).toHaveBeenCalledWith({
      where: { id: 'character-1', novelId: 'novel-1' },
      data: {
        portraitUrl: '/uploads/character-portraits/result.webp',
        portraitPrompt: 'silver-haired knight portrait',
      },
    });
    expect(mocks.txUpdateNovel).toHaveBeenCalledWith({
      where: { id: 'novel-1' },
      data: { approvalStatus: 'DRAFT', isPublished: false },
    });
    expect(currentJob).toMatchObject({
      status: 'succeeded',
      imageUrl: '/uploads/character-portraits/result.webp',
      storageProvider: 'local',
    });
  });

  it.each([
    ['failed', '안전 정책에 따라 이미지를 생성할 수 없습니다.', 'provider_safety_rejected'],
    ['canceled', '이미지 생성 작업이 취소되었습니다.', 'provider_canceled'],
  ] as const)('persists a terminal %s provider state without downloading output', async (
    status,
    failureMessage,
    failureCode,
  ) => {
    const finalized = await processImageProviderUpdate(currentJob as never, {
      predictionId: 'prediction-1',
      status,
      imageUrl: null,
      failureMessage,
      failureCode,
    });

    expect(finalized.status).toBe(status);
    expect(currentJob).toMatchObject({
      status,
      error: failureMessage,
      lastFinalizationError: failureCode,
    });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('is idempotent after a permanent result has already committed', async () => {
    currentJob = makeJob({
      status: 'succeeded',
      imageUrl: '/uploads/already-stored.webp',
      storageProvider: 'local',
    });

    const finalized = await processImageProviderUpdate(currentJob as never, {
      predictionId: 'prediction-1',
      status: 'succeeded',
      imageUrl: 'https://replicate.delivery/output.webp',
    });

    expect(finalized.status).toBe('succeeded');
    expect(mocks.updateJobs).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('releases the lease and asks the webhook sender to retry transient storage failures', async () => {
    currentJob = makeJob({
      novelId: null,
      type: 'cover',
      metadata: { version: 1 },
      targetBoundAt: null,
    });
    mocks.upload.mockResolvedValue({
      url: 'https://replicate.delivery/output.webp',
      stored: false,
      storageProvider: 'none',
    });

    const finalized = await processImageProviderUpdate(currentJob as never, {
      predictionId: 'prediction-1',
      status: 'succeeded',
      imageUrl: 'https://replicate.delivery/output.webp',
    });

    expect(finalized).toMatchObject({
      status: 'processing',
      retryAfterMs: 15_000,
      exposeError: false,
      retryWebhook: true,
    });
    expect(currentJob.lastFinalizationError).toBe('storage_retry_scheduled');
    expect(currentJob.finalizationLeaseToken).toBeNull();
    expect(currentJob.nextFinalizationAt).toBeInstanceOf(Date);
  });

  it('rejects a prediction ID mismatch before any DB or storage mutation', async () => {
    await expect(processImageProviderUpdate(currentJob as never, {
      predictionId: 'different-prediction',
      status: 'succeeded',
      imageUrl: 'https://replicate.delivery/output.webp',
    })).rejects.toBeInstanceOf(ImageJobProviderMismatchError);

    expect(mocks.findJob).not.toHaveBeenCalled();
    expect(mocks.updateJobs).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
