import { createHmac } from 'node:crypto';
import prisma from '@/lib/prisma';
import { logServerError } from '@novelverse/shared';
import { getTrustedClientIp } from '@novelverse/shared/proxy';
import { ApiError } from './api';

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitRow = {
  count: number;
  resetAt: Date;
};

type RequestWithHeaders = Pick<Request, 'headers'>;

const fallbackBuckets = new Map<string, Bucket>();
const PRUNE_INTERVAL_MS = 60_000;
const DATABASE_PRUNE_INTERVAL_MS = 60 * 60_000;
const DATABASE_WARNING_INTERVAL_MS = 60_000;
const FALLBACK_BUCKET_LIMIT = 10_000;
let nextFallbackPruneAt = 0;
let nextDatabasePruneAt = 0;
let nextDatabaseWarningAt = 0;

function validateOptions(options: RateLimitOptions) {
  if (!options.key.trim()) throw new Error('레이트리밋 키는 비어 있을 수 없습니다.');
  if (!Number.isInteger(options.limit) || options.limit <= 0) {
    throw new Error('레이트리밋 횟수는 양의 정수여야 합니다.');
  }
  if (!Number.isInteger(options.windowMs) || options.windowMs <= 0) {
    throw new Error('레이트리밋 시간은 양의 정수여야 합니다.');
  }
}

function storageKey(key: string) {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'novelverse-local-rate-limit';
  return `rl:v1:${createHmac('sha256', secret).update(key).digest('hex')}`;
}

function pruneFallback(now: number) {
  if (now < nextFallbackPruneAt && fallbackBuckets.size < FALLBACK_BUCKET_LIMIT) return;
  nextFallbackPruneAt = now + PRUNE_INTERVAL_MS;

  for (const [key, bucket] of fallbackBuckets.entries()) {
    if (bucket.resetAt <= now) fallbackBuckets.delete(key);
  }

  while (fallbackBuckets.size >= FALLBACK_BUCKET_LIMIT) {
    const oldestKey = fallbackBuckets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    fallbackBuckets.delete(oldestKey);
  }
}

function assertFallbackRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  pruneFallback(now);

  const current = fallbackBuckets.get(key);
  if (!current || current.resetAt <= now) {
    fallbackBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (current.count >= limit) {
    throw new ApiError(429, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  }

  current.count += 1;
}

function reportDatabaseFallback(error: unknown) {
  const now = Date.now();
  if (now < nextDatabaseWarningAt) return;
  nextDatabaseWarningAt = now + DATABASE_WARNING_INTERVAL_MS;
  logServerError('rate-limit-database-fallback', error);
}

async function pruneDatabase(now: number) {
  if (now < nextDatabasePruneAt) return;
  nextDatabasePruneAt = now + DATABASE_PRUNE_INTERVAL_MS;

  try {
    await prisma.$executeRaw`
      DELETE FROM "rate_limit_buckets"
      WHERE "resetAt" < NOW() - INTERVAL '1 day'
    `;
  } catch (error) {
    reportDatabaseFallback(error);
  }
}

export function getClientIp(request: RequestWithHeaders) {
  return getTrustedClientIp(request.headers);
}

export async function assertRateLimit(options: RateLimitOptions): Promise<void> {
  validateOptions(options);
  const key = storageKey(options.key);

  try {
    const rows = await prisma.$queryRaw<RateLimitRow[]>`
      INSERT INTO "rate_limit_buckets" ("key", "count", "resetAt", "updatedAt")
      VALUES (${key}, 1, NOW() + ${options.windowMs} * INTERVAL '1 millisecond', NOW())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "rate_limit_buckets"."resetAt" <= NOW() THEN 1
          ELSE "rate_limit_buckets"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "rate_limit_buckets"."resetAt" <= NOW() THEN EXCLUDED."resetAt"
          ELSE "rate_limit_buckets"."resetAt"
        END,
        "updatedAt" = NOW()
      RETURNING "count", "resetAt"
    `;

    const bucket = rows[0];
    if (!bucket) throw new Error('레이트리밋 버킷 결과가 없습니다.');
    void pruneDatabase(Date.now());

    if (bucket.count > options.limit) {
      throw new ApiError(429, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    reportDatabaseFallback(error);
    assertFallbackRateLimit(key, options.limit, options.windowMs);
  }
}

export async function resetRateLimit(key: string): Promise<void> {
  if (!key.trim()) return;
  const hashedKey = storageKey(key);
  fallbackBuckets.delete(hashedKey);

  try {
    await prisma.$executeRaw`
      DELETE FROM "rate_limit_buckets"
      WHERE "key" = ${hashedKey}
    `;
  } catch (error) {
    reportDatabaseFallback(error);
  }
}
