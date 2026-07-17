BEGIN;

-- Decouple the local, idempotent request from the paid provider prediction.
-- Existing rows used the provider id as their primary key; preserve that value
-- while assigning deterministic legacy request identifiers and nonce values.
ALTER TABLE "image_generation_jobs"
  ADD COLUMN IF NOT EXISTS "providerPredictionId" TEXT,
  ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT,
  ADD COLUMN IF NOT EXISTS "tokenNonce" TEXT,
  ADD COLUMN IF NOT EXISTS "finalizationLeaseToken" TEXT,
  ADD COLUMN IF NOT EXISTS "finalizationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nextFinalizationAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastFinalizationError" TEXT,
  ADD COLUMN IF NOT EXISTS "targetBoundAt" TIMESTAMP(3);

UPDATE "image_generation_jobs"
SET
  "providerPredictionId" = COALESCE("providerPredictionId", "id"),
  "clientRequestId" = COALESCE("clientRequestId", 'legacy-' || "id"),
  "tokenNonce" = COALESCE("tokenNonce", 'legacy-' || "id"),
  "targetBoundAt" = CASE
    WHEN "novelId" IS NOT NULL THEN COALESCE("targetBoundAt", "createdAt")
    ELSE "targetBoundAt"
  END;

ALTER TABLE "image_generation_jobs"
  ALTER COLUMN "clientRequestId" SET NOT NULL,
  ALTER COLUMN "tokenNonce" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "image_generation_jobs_providerPredictionId_key"
  ON "image_generation_jobs"("providerPredictionId");
CREATE UNIQUE INDEX IF NOT EXISTS "image_generation_jobs_tokenNonce_key"
  ON "image_generation_jobs"("tokenNonce");
CREATE UNIQUE INDEX IF NOT EXISTS "image_generation_jobs_userId_clientRequestId_key"
  ON "image_generation_jobs"("userId", "clientRequestId");

COMMIT;
