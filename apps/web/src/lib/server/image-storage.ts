import crypto from 'node:crypto';
import { findStoredFile, uploadFile, uploadFileOnce } from '@/lib/supabase';
import { fetchVerifiedRemoteImage } from './remote-image';

export type StoredImageResult = {
  url: string;
  stored: boolean;
  storageProvider: 'supabase' | 'local' | 'none';
  path?: string;
};

type ImageBucket = 'COVERS' | 'ILLUSTRATIONS' | 'PORTRAITS';

type ImageJobCacheEntry = {
  result: StoredImageResult;
  expiresAt: number;
};

const IMAGE_JOB_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const globalImageJobs = globalThis as typeof globalThis & {
  __novelverseImageJobResults?: Map<string, ImageJobCacheEntry>;
  __novelverseImageJobFinalizers?: Map<string, Promise<StoredImageResult>>;
};

const jobResults = globalImageJobs.__novelverseImageJobResults
  ?? new Map<string, ImageJobCacheEntry>();
const jobFinalizers = globalImageJobs.__novelverseImageJobFinalizers
  ?? new Map<string, Promise<StoredImageResult>>();
globalImageJobs.__novelverseImageJobResults = jobResults;
globalImageJobs.__novelverseImageJobFinalizers = jobFinalizers;

function toImageBlob(bytes: Buffer) {
  return new Blob([new Uint8Array(bytes)], { type: 'image/webp' });
}

function safePathSegment(value: string, fallback: string) {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return normalized || fallback;
}

function imageJobPath(folderId: string, predictionId: string) {
  const safeFolder = safePathSegment(folderId, 'general');
  const jobKey = crypto.createHash('sha256').update(predictionId).digest('hex').slice(0, 40);
  return `${safeFolder}/jobs/${jobKey}.webp`;
}

function getCachedJobResult(cacheKey: string) {
  const cached = jobResults.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    jobResults.delete(cacheKey);
    return null;
  }
  return cached.result;
}

function cacheJobResult(cacheKey: string, result: StoredImageResult) {
  if (!result.stored) return;
  jobResults.set(cacheKey, {
    result,
    expiresAt: Date.now() + IMAGE_JOB_CACHE_TTL_MS,
  });

  if (jobResults.size > 1_000) {
    const now = Date.now();
    for (const [key, entry] of jobResults) {
      if (entry.expiresAt <= now) jobResults.delete(key);
    }

    while (jobResults.size > 1_000) {
      const oldestKey = jobResults.keys().next().value;
      if (!oldestKey) break;
      jobResults.delete(oldestKey);
    }
  }
}

export async function fetchAndUploadExternalImage(
  externalUrl: string,
  bucket: ImageBucket,
  folderId: string
): Promise<StoredImageResult> {
  try {
    const image = await fetchVerifiedRemoteImage(externalUrl);
    const timestamp = Date.now();
    const randomId = crypto.randomUUID();
    const safeFolder = safePathSegment(folderId, 'general');
    const filePath = `${safeFolder}/${timestamp}-${randomId}.${image.extension}`;

    const { url, error, storageProvider } = await uploadFile(
      bucket,
      filePath,
      toImageBlob(image.bytes),
      image.contentType
    );
    if (error || !url) {
      return { url: externalUrl, stored: false, storageProvider: 'none' };
    }

    return {
      url,
      stored: true,
      storageProvider: storageProvider || 'none',
      path: filePath,
    };
  } catch {
    return { url: externalUrl, stored: false, storageProvider: 'none' };
  }
}

export async function findStoredImageJobResult(
  bucket: ImageBucket,
  folderId: string,
  predictionId: string
): Promise<StoredImageResult | null> {
  const filePath = imageJobPath(folderId, predictionId);
  const cacheKey = `${bucket}:${filePath}`;
  const cached = getCachedJobResult(cacheKey);
  if (cached) return cached;

  const existing = await findStoredFile(bucket, filePath);
  if (!existing) return null;

  const result: StoredImageResult = {
    url: existing.url,
    stored: true,
    storageProvider: existing.storageProvider,
    path: filePath,
  };
  cacheJobResult(cacheKey, result);
  return result;
}

export async function fetchAndUploadImageJobOnce(
  externalUrl: string,
  bucket: ImageBucket,
  folderId: string,
  predictionId: string
): Promise<StoredImageResult> {
  const filePath = imageJobPath(folderId, predictionId);
  const cacheKey = `${bucket}:${filePath}`;
  const cached = await findStoredImageJobResult(bucket, folderId, predictionId);
  if (cached) return cached;

  const currentFinalizer = jobFinalizers.get(cacheKey);
  if (currentFinalizer) return currentFinalizer;

  const finalizer = (async () => {
    try {
      const image = await fetchVerifiedRemoteImage(externalUrl);
      const { url, error, storageProvider } = await uploadFileOnce(
        bucket,
        filePath,
        toImageBlob(image.bytes),
        image.contentType
      );

      if (error || !url) {
        return { url: externalUrl, stored: false, storageProvider: 'none' } as StoredImageResult;
      }

      const result: StoredImageResult = {
        url,
        stored: true,
        storageProvider,
        path: filePath,
      };
      cacheJobResult(cacheKey, result);
      return result;
    } catch {
      return { url: externalUrl, stored: false, storageProvider: 'none' } as StoredImageResult;
    } finally {
      jobFinalizers.delete(cacheKey);
    }
  })();

  jobFinalizers.set(cacheKey, finalizer);
  return finalizer;
}
