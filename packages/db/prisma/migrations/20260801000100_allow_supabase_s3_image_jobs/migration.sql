BEGIN;

ALTER TABLE "image_generation_jobs"
  DROP CONSTRAINT IF EXISTS "image_jobs_storage_provider";
ALTER TABLE "image_generation_jobs"
  ADD CONSTRAINT "image_jobs_storage_provider"
  CHECK ("storageProvider" IN ('none', 'supabase', 'supabase-s3', 'local', 'source-tree'))
  NOT VALID;
ALTER TABLE "image_generation_jobs"
  VALIDATE CONSTRAINT "image_jobs_storage_provider";

-- Jobs whose provider output was already stored through the Supabase S3 API
-- could not commit while the old constraint rejected the provider label.
-- Release only jobs left terminal or exhausted by this exact commit failure so
-- the deterministic storage finalizer can reuse the existing object without
-- interrupting an active worker or starting another AI run.
UPDATE "image_generation_jobs"
SET
  "status" = 'processing',
  "error" = NULL,
  "finalizationAttempts" = 0,
  "nextFinalizationAt" = NULL,
  "finalizationLeaseToken" = NULL,
  "finalizationLeaseUntil" = NULL,
  "lastFinalizationError" = 'storage_provider_constraint_recovered',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "providerImageUrl" IS NOT NULL
  AND "imageUrl" IS NULL
  AND "storageProvider" = 'none'
  AND (
    "finalizationLeaseUntil" IS NULL
    OR "finalizationLeaseUntil" <= CURRENT_TIMESTAMP
  )
  AND (
    (
      "status" = 'failed'
      AND "lastFinalizationError" IN ('max_finalization_attempts', 'job_expired')
    )
    OR (
      "status" = 'processing'
      AND "finalizationAttempts" >= 5
    )
  );

COMMIT;
