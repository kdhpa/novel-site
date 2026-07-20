BEGIN;

ALTER TABLE "image_generation_jobs"
  DROP CONSTRAINT IF EXISTS "image_jobs_type";
ALTER TABLE "image_generation_jobs"
  ADD CONSTRAINT "image_jobs_type"
  CHECK ("type" IN ('cover', 'illustration', 'custom', 'portrait', 'contest-banner'))
  NOT VALID;
ALTER TABLE "image_generation_jobs"
  VALIDATE CONSTRAINT "image_jobs_type";

ALTER TABLE "image_generation_jobs"
  DROP CONSTRAINT IF EXISTS "image_jobs_storage_provider";
ALTER TABLE "image_generation_jobs"
  ADD CONSTRAINT "image_jobs_storage_provider"
  CHECK ("storageProvider" IN ('none', 'supabase', 'local', 'source-tree'))
  NOT VALID;
ALTER TABLE "image_generation_jobs"
  VALIDATE CONSTRAINT "image_jobs_storage_provider";

COMMIT;
