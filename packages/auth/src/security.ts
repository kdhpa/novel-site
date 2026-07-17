import { createHmac } from 'node:crypto';
import { prisma } from '@novelverse/db';
import { getTrustedClientIp } from '@novelverse/shared/proxy';
import { normalizeIdentityEmail } from '@novelverse/shared';

type RateLimitRow = { count: number };
type FallbackBucket = { count: number; resetAt: number };
type HeaderSource = Pick<Request, 'headers'>;

const globalSecurityState = globalThis as typeof globalThis & {
  __novelverseOpsAuthBuckets?: Map<string, FallbackBucket>;
};
const fallbackBuckets = globalSecurityState.__novelverseOpsAuthBuckets ?? new Map<string, FallbackBucket>();
globalSecurityState.__novelverseOpsAuthBuckets = fallbackBuckets;

export function normalizeAuthEmail(value: unknown) {
  return typeof value === 'string' ? normalizeIdentityEmail(value) : '';
}

export function getAuthClientIp(request: HeaderSource) {
  return getTrustedClientIp(request.headers);
}

function rateLimitStorageKey(key: string) {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'novelverse-local-rate-limit';
  return `rl:v1:${createHmac('sha256', secret).update(key).digest('hex')}`;
}

function consumeFallback(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = fallbackBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    fallbackBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;

  if (fallbackBuckets.size > 5_000) {
    for (const [candidate, value] of fallbackBuckets) {
      if (value.resetAt <= now) fallbackBuckets.delete(candidate);
    }
    while (fallbackBuckets.size > 5_000) {
      const oldest = fallbackBuckets.keys().next().value as string | undefined;
      if (!oldest) break;
      fallbackBuckets.delete(oldest);
    }
  }

  return bucket.count <= limit;
}

export async function consumeAuthRateLimit(key: string, limit: number, windowMs: number) {
  const storageKey = rateLimitStorageKey(key);
  try {
    const rows = await prisma.$queryRaw<RateLimitRow[]>`
      INSERT INTO "rate_limit_buckets" ("key", "count", "resetAt", "updatedAt")
      VALUES (${storageKey}, 1, NOW() + ${windowMs} * INTERVAL '1 millisecond', NOW())
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
      RETURNING "count"
    `;
    return Boolean(rows[0] && rows[0].count <= limit);
  } catch {
    // Allows local development before migrations while retaining a bounded
    // per-process defense. Production health checks surface DB failures.
    return consumeFallback(storageKey, limit, windowMs);
  }
}

export async function resetAuthRateLimit(key: string) {
  const storageKey = rateLimitStorageKey(key);
  fallbackBuckets.delete(storageKey);
  try {
    await prisma.$executeRaw`DELETE FROM "rate_limit_buckets" WHERE "key" = ${storageKey}`;
  } catch {
    // A successful login must not fail because cleanup is temporarily unavailable.
  }
}
