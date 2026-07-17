BEGIN;

-- Cross-instance rate limiting
CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "rate_limit_buckets_resetAt_idx"
    ON "rate_limit_buckets"("resetAt");

-- Daily unique content views
CREATE TABLE IF NOT EXISTS "content_views" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "viewerHash" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "content_views_targetType_targetId_viewerHash_bucketStart_key"
    ON "content_views"("targetType", "targetId", "viewerHash", "bucketStart");
CREATE INDEX IF NOT EXISTS "content_views_createdAt_idx"
    ON "content_views"("createdAt");
CREATE INDEX IF NOT EXISTS "content_views_targetType_targetId_bucketStart_idx"
    ON "content_views"("targetType", "targetId", "bucketStart");

-- Persistent AI image generation jobs
CREATE TABLE IF NOT EXISTS "image_generation_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "novelId" TEXT,
    "type" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'starting',
    "imageUrl" TEXT,
    "providerImageUrl" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'none',
    "error" TEXT,
    "metadata" JSONB,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "finalizationLeaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_generation_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "image_generation_jobs_userId_createdAt_idx"
    ON "image_generation_jobs"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "image_generation_jobs_novelId_createdAt_idx"
    ON "image_generation_jobs"("novelId", "createdAt");
CREATE INDEX IF NOT EXISTS "image_generation_jobs_status_updatedAt_idx"
    ON "image_generation_jobs"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "image_generation_jobs_tokenExpiresAt_idx"
    ON "image_generation_jobs"("tokenExpiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'image_generation_jobs_userId_fkey'
  ) THEN
    ALTER TABLE "image_generation_jobs"
      ADD CONSTRAINT "image_generation_jobs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'image_generation_jobs_novelId_fkey'
  ) THEN
    ALTER TABLE "image_generation_jobs"
      ADD CONSTRAINT "image_generation_jobs_novelId_fkey"
      FOREIGN KEY ("novelId") REFERENCES "novels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
