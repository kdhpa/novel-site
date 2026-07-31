import { logServerError } from '@novelverse/shared';
import { prisma } from '@/lib/prisma';
import { processImageProviderUpdate } from './image-job-finalization';

const RECOVERY_BATCH_SIZE = 3;

type RecoveryOutcome = 'recovered' | 'pending' | 'failed';

async function reopenExpiredJob(job: Awaited<ReturnType<typeof findRecoverableJobs>>[number], now: Date) {
  if (job.status !== 'failed') return job;

  const reopened = await prisma.imageGenerationJob.updateMany({
    where: {
      id: job.id,
      userId: job.userId,
      status: 'failed',
      imageUrl: null,
      storageProvider: 'none',
      providerPredictionId: job.providerPredictionId,
      providerImageUrl: job.providerImageUrl,
      lastFinalizationError: 'job_expired',
      OR: [
        { finalizationLeaseUntil: null },
        { finalizationLeaseUntil: { lte: now } },
      ],
    },
    data: {
      status: 'processing',
      error: null,
      finalizationAttempts: 0,
      nextFinalizationAt: null,
      finalizationLeaseToken: null,
      finalizationLeaseUntil: null,
      lastFinalizationError: 'job_expiry_recovered',
    },
  });

  if (reopened.count !== 1) return null;
  return {
    ...job,
    status: 'processing',
    error: null,
    finalizationAttempts: 0,
    nextFinalizationAt: null,
    finalizationLeaseToken: null,
    finalizationLeaseUntil: null,
    lastFinalizationError: 'job_expiry_recovered',
  };
}

function findRecoverableJobs(now: Date) {
  return prisma.imageGenerationJob.findMany({
    where: {
      type: { in: ['cover', 'illustration', 'custom', 'portrait'] },
      providerPredictionId: { not: null },
      providerImageUrl: { not: null },
      imageUrl: null,
      storageProvider: 'none',
      AND: [
        {
          OR: [
            { finalizationLeaseUntil: null },
            { finalizationLeaseUntil: { lte: now } },
          ],
        },
        {
          OR: [
            {
              status: 'processing',
              OR: [
                { nextFinalizationAt: null },
                { nextFinalizationAt: { lte: now } },
              ],
            },
            {
              status: 'failed',
              lastFinalizationError: 'job_expired',
            },
          ],
        },
      ],
    },
    orderBy: [{ updatedAt: 'asc' as const }, { id: 'asc' as const }],
    take: RECOVERY_BATCH_SIZE,
  });
}

async function recoverJob(
  initialJob: Awaited<ReturnType<typeof findRecoverableJobs>>[number],
  now: Date,
): Promise<RecoveryOutcome> {
  try {
    const job = await reopenExpiredJob(initialJob, now);
    if (!job || !job.providerPredictionId || !job.providerImageUrl) return 'pending';

    const finalized = await processImageProviderUpdate(job, {
      predictionId: job.providerPredictionId,
      status: 'succeeded',
      imageUrl: job.providerImageUrl,
    }, {
      allowEarlyFinalizationRetry: true,
      allowExpiredJobRecovery: true,
    });

    if (finalized.status === 'succeeded') return 'recovered';
    if (finalized.status === 'failed' || finalized.status === 'canceled') return 'failed';
    return 'pending';
  } catch (error) {
    logServerError('image-job-recovery', error, {
      jobId: initialJob.id,
      userId: initialJob.userId,
    });
    return 'failed';
  }
}

export async function recoverPendingImageJobs(now = new Date()) {
  const jobs = await findRecoverableJobs(now);
  // Provider outputs are at most 8 MiB after verification. A batch of three
  // keeps the maintenance request within one 90-second finalization window
  // without unbounded memory or execution time.
  const outcomes = await Promise.all(jobs.map((job) => recoverJob(job, now)));

  return {
    scanned: jobs.length,
    recovered: outcomes.filter((outcome) => outcome === 'recovered').length,
    pending: outcomes.filter((outcome) => outcome === 'pending').length,
    failed: outcomes.filter((outcome) => outcome === 'failed').length,
  };
}
