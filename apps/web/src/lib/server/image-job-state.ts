import type { ImageJobTokenPayload } from './image-job-token';

export type ImageJobType = 'cover' | 'illustration' | 'custom' | 'portrait';
export type ImageJobStatus =
  | 'starting'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export type PersistedImageJobIdentity = {
  id: string;
  userId: string;
  novelId: string | null;
  type: string;
  prompt: string;
  tokenNonce: string;
  tokenExpiresAt: Date;
};

export type PortraitJobMetadata = {
  version: 1;
  characterId: string;
  genre: string;
  style: 'anime' | 'realistic' | 'fantasy' | 'watercolor';
};

export const MAX_IMAGE_FINALIZATION_ATTEMPTS = 5;

const STATUS_MAP: Record<string, ImageJobStatus> = {
  starting: 'starting',
  processing: 'processing',
  succeeded: 'succeeded',
  successful: 'succeeded',
  failed: 'failed',
  canceled: 'canceled',
  cancelled: 'canceled',
};

const IMAGE_JOB_TYPES = new Set<ImageJobType>([
  'cover',
  'illustration',
  'custom',
  'portrait',
]);

export function normalizeImageJobStatus(status?: string): ImageJobStatus {
  return STATUS_MAP[(status || '').toLowerCase()] || 'processing';
}

export function isTerminalImageJobStatus(status: string) {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

export function isSupportedImageJobType(type: string): type is ImageJobType {
  return IMAGE_JOB_TYPES.has(type as ImageJobType);
}

/**
 * 토큰은 추가 방어 수단일 뿐이며, 비교 대상은 항상 DB 레코드다.
 */
export function imageJobTokenMatchesRecord(
  payload: ImageJobTokenPayload,
  job: PersistedImageJobIdentity
) {
  return payload.jobId === job.id &&
    payload.userId === job.userId &&
    payload.nonce === job.tokenNonce &&
    payload.expiresAt === job.tokenExpiresAt.getTime();
}

export function parsePortraitJobMetadata(value: unknown): PortraitJobMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    typeof candidate.characterId !== 'string' ||
    candidate.characterId.length < 1 ||
    candidate.characterId.length > 100 ||
    typeof candidate.genre !== 'string' ||
    candidate.genre.length < 1 ||
    candidate.genre.length > 40 ||
    (candidate.style !== 'anime' &&
      candidate.style !== 'realistic' &&
      candidate.style !== 'fantasy' &&
      candidate.style !== 'watercolor')
  ) {
    return null;
  }

  return {
    version: 1,
    characterId: candidate.characterId,
    genre: candidate.genre,
    style: candidate.style,
  };
}

export function getImageJobStorageTarget(job: {
  userId: string;
  novelId: string | null;
  type: string;
  metadata: unknown;
}) {
  const baseFolder = job.novelId || `user-${job.userId}`;

  if (job.type === 'cover') {
    return { bucket: 'COVERS' as const, folder: baseFolder };
  }
  if (job.type === 'portrait') {
    const portrait = parsePortraitJobMetadata(job.metadata);
    return portrait
      ? { bucket: 'PORTRAITS' as const, folder: `${baseFolder}-${portrait.characterId}` }
      : null;
  }
  if (job.type === 'illustration' || job.type === 'custom') {
    return { bucket: 'ILLUSTRATIONS' as const, folder: baseFolder };
  }
  return null;
}

export function finalizationLeaseClaimWhere(id: string, userId: string, now: Date) {
  return {
    id,
    userId,
    imageUrl: null,
    tokenExpiresAt: { gt: now },
    status: { in: ['starting', 'processing'] },
    finalizationAttempts: { lt: 5 },
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
          { finalizationLeaseUntil: { lt: now } },
        ],
      },
    ],
  };
}

export function finalizationLeaseCommitWhere(
  id: string,
  userId: string,
  leaseToken: string
) {
  return {
    id,
    userId,
    imageUrl: null,
    status: 'processing',
    finalizationLeaseToken: leaseToken,
  };
}

export function imageFinalizationRetryPolicy(attempts: number) {
  const normalizedAttempts = Math.max(1, Math.trunc(attempts));
  const exhausted = normalizedAttempts >= MAX_IMAGE_FINALIZATION_ATTEMPTS;
  const retryAfterMs = exhausted
    ? null
    : Math.min(15_000 * 2 ** (normalizedAttempts - 1), 5 * 60_000);
  return { exhausted, retryAfterMs };
}
