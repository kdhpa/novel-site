import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findJobs: vi.fn(),
  updateJobs: vi.fn(),
  processUpdate: vi.fn(),
  log: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    imageGenerationJob: {
      findMany: mocks.findJobs,
      updateMany: mocks.updateJobs,
    },
  },
}));
vi.mock('@novelverse/shared', () => ({ logServerError: mocks.log }));
vi.mock('./image-job-finalization', () => ({
  processImageProviderUpdate: mocks.processUpdate,
}));

import { recoverPendingImageJobs } from './image-job-recovery';

const now = new Date('2026-08-01T00:00:00.000Z');
const recoverableJob = {
  id: 'job-1',
  userId: 'user-1',
  status: 'processing',
  providerPredictionId: 'prediction-1',
  providerImageUrl: 'https://replicate.delivery/output.webp',
};

describe('image job recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findJobs.mockResolvedValue([recoverableJob]);
    mocks.updateJobs.mockResolvedValue({ count: 1 });
    mocks.processUpdate.mockResolvedValue({ status: 'succeeded' });
  });

  it('finalizes provider-complete jobs without requesting another generation', async () => {
    await expect(recoverPendingImageJobs(now)).resolves.toEqual({
      scanned: 1,
      recovered: 1,
      pending: 0,
      failed: 0,
    });
    expect(mocks.findJobs).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        providerImageUrl: { not: null },
        storageProvider: 'none',
      }),
      take: 3,
    }));
    expect(mocks.findJobs.mock.calls[0]?.[0]?.where).not.toHaveProperty('tokenExpiresAt');
    expect(mocks.processUpdate).toHaveBeenCalledWith(
      recoverableJob,
      {
        predictionId: 'prediction-1',
        status: 'succeeded',
        imageUrl: 'https://replicate.delivery/output.webp',
      },
      {
        allowEarlyFinalizationRetry: true,
        allowExpiredJobRecovery: true,
      },
    );
  });

  it('reopens a provider-complete job that client-token cleanup expired', async () => {
    const expiredJob = {
      ...recoverableJob,
      status: 'failed',
      finalizationAttempts: 4,
      lastFinalizationError: 'job_expired',
    };
    mocks.findJobs.mockResolvedValue([expiredJob]);

    await expect(recoverPendingImageJobs(now)).resolves.toEqual({
      scanned: 1,
      recovered: 1,
      pending: 0,
      failed: 0,
    });
    expect(mocks.updateJobs).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'job-1',
        status: 'failed',
        lastFinalizationError: 'job_expired',
      }),
      data: expect.objectContaining({
        status: 'processing',
        finalizationAttempts: 0,
      }),
    }));
    expect(mocks.processUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processing', finalizationAttempts: 0 }),
      expect.any(Object),
      expect.objectContaining({ allowExpiredJobRecovery: true }),
    );
  });

  it('includes a processing job whose fifth attempt lost its lease', async () => {
    const exhaustedProcessingJob = {
      ...recoverableJob,
      finalizationAttempts: 5,
      finalizationLeaseUntil: null,
    };
    mocks.findJobs.mockResolvedValue([exhaustedProcessingJob]);

    await expect(recoverPendingImageJobs(now)).resolves.toEqual({
      scanned: 1,
      recovered: 1,
      pending: 0,
      failed: 0,
    });
    const processingCondition = mocks.findJobs.mock.calls[0]?.[0]?.where?.AND?.[1]?.OR?.[0];
    expect(processingCondition).toEqual({
      status: 'processing',
      OR: [
        { nextFinalizationAt: null },
        { nextFinalizationAt: { lte: now } },
      ],
    });
    expect(mocks.processUpdate).toHaveBeenCalledWith(
      exhaustedProcessingJob,
      expect.any(Object),
      expect.objectContaining({ allowExpiredJobRecovery: true }),
    );
  });

  it('isolates a failed recovery so later maintenance runs can continue', async () => {
    mocks.processUpdate.mockRejectedValueOnce(new Error('temporary database error'));

    await expect(recoverPendingImageJobs(now)).resolves.toEqual({
      scanned: 1,
      recovered: 0,
      pending: 0,
      failed: 1,
    });
    expect(mocks.log).toHaveBeenCalledWith(
      'image-job-recovery',
      expect.any(Error),
      { jobId: 'job-1', userId: 'user-1' },
    );
  });

  it('isolates an expired-job reopen database failure', async () => {
    mocks.findJobs.mockResolvedValue([{
      ...recoverableJob,
      status: 'failed',
      lastFinalizationError: 'job_expired',
    }]);
    mocks.updateJobs.mockRejectedValueOnce(new Error('temporary reopen failure'));

    await expect(recoverPendingImageJobs(now)).resolves.toEqual({
      scanned: 1,
      recovered: 0,
      pending: 0,
      failed: 1,
    });
    expect(mocks.processUpdate).not.toHaveBeenCalled();
    expect(mocks.log).toHaveBeenCalledWith(
      'image-job-recovery',
      expect.any(Error),
      { jobId: 'job-1', userId: 'user-1' },
    );
  });
});
