BEGIN;

-- Normalize values that can be repaired without discarding user content.
UPDATE "novels"
SET
  "viewCount" = GREATEST("viewCount", 0),
  "isPublished" = CASE
    WHEN "approvalStatus" = 'APPROVED'::"ApprovalStatus" THEN "isPublished"
    ELSE false
  END;

WITH maxima AS (
  SELECT "novelId", GREATEST(COALESCE(MAX("chapterNumber") FILTER (WHERE "chapterNumber" > 0), 0), 0) AS max_number
  FROM "chapters"
  GROUP BY "novelId"
), invalid AS (
  SELECT
    c."id",
    m.max_number + ROW_NUMBER() OVER (PARTITION BY c."novelId" ORDER BY c."createdAt", c."id") AS replacement
  FROM "chapters" c
  JOIN maxima m ON m."novelId" = c."novelId"
  WHERE c."chapterNumber" <= 0
)
UPDATE "chapters" c
SET "chapterNumber" = invalid.replacement
FROM invalid
WHERE c."id" = invalid."id";

UPDATE "chapters"
SET
  "viewCount" = GREATEST("viewCount", 0),
  "publishedAt" = COALESCE("publishedAt", "updatedAt", "createdAt", NOW())
WHERE "isPublished" = true AND "publishedAt" IS NULL;

UPDATE "reviews" SET "rating" = LEAST(5, GREATEST(1, "rating"));
UPDATE "reading_history" SET "lastChapter" = GREATEST(1, "lastChapter");
UPDATE "rate_limit_buckets" SET "count" = GREATEST(0, "count");
UPDATE "image_generation_jobs"
SET
  "finalizationAttempts" = GREATEST(0, "finalizationAttempts"),
  "type" = CASE
    WHEN "type" IN ('cover', 'illustration', 'custom', 'portrait') THEN "type"
    ELSE 'custom'
  END,
  "status" = CASE
    WHEN "status" IN ('starting', 'processing', 'succeeded', 'failed', 'canceled') THEN "status"
    ELSE 'failed'
  END,
  "storageProvider" = CASE
    WHEN "storageProvider" IN ('none', 'supabase', 'local') THEN "storageProvider"
    ELSE 'none'
  END;

UPDATE "seasons"
SET
  "isActive" = false,
  "endsAt" = "startsAt" + INTERVAL '1 second'
WHERE "endsAt" <= "startsAt";

-- Preserve legacy illustration rows for manual export while removing the unused
-- duplicate runtime model and denormalized counter from the active schema.
ALTER TABLE "chapter_illustrations" RENAME TO "chapter_illustrations_legacy_archive";
ALTER TABLE "chapters" DROP COLUMN "illustrationCount";
COMMENT ON TABLE "chapter_illustrations_legacy_archive" IS
  'Archived during 20260717000400; active chapter illustrations live in sanitized chapter HTML/aiImage.';

-- Stable bounded-list indexes and schema/migration drift reconciliation.
CREATE INDEX IF NOT EXISTS "likes_novelId_idx" ON "likes"("novelId");
CREATE INDEX IF NOT EXISTS "characters_novelId_createdAt_id_idx"
  ON "characters"("novelId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "reviews_novelId_createdAt_id_idx"
  ON "reviews"("novelId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "comments_parentId_createdAt_id_idx"
  ON "comments"("parentId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "comments_novelId_parentId_createdAt_id_idx"
  ON "comments"("novelId", "parentId", "createdAt", "id");

-- Add constraints as NOT VALID first so PostgreSQL scans only during the explicit
-- validation phase and the deployment fails with a precise constraint name.
ALTER TABLE "novels" ADD CONSTRAINT "novels_view_count_nonnegative"
  CHECK ("viewCount" >= 0) NOT VALID;
ALTER TABLE "novels" ADD CONSTRAINT "novels_public_requires_approval"
  CHECK (NOT "isPublished" OR "approvalStatus" = 'APPROVED'::"ApprovalStatus") NOT VALID;
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_number_positive"
  CHECK ("chapterNumber" > 0) NOT VALID;
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_view_count_nonnegative"
  CHECK ("viewCount" >= 0) NOT VALID;
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_publication_timestamp"
  CHECK (NOT "isPublished" OR "publishedAt" IS NOT NULL) NOT VALID;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range"
  CHECK ("rating" BETWEEN 1 AND 5) NOT VALID;
ALTER TABLE "reading_history" ADD CONSTRAINT "reading_history_chapter_positive"
  CHECK ("lastChapter" > 0) NOT VALID;
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_date_order"
  CHECK ("startsAt" < "endsAt") NOT VALID;
ALTER TABLE "rate_limit_buckets" ADD CONSTRAINT "rate_limit_count_nonnegative"
  CHECK ("count" >= 0) NOT VALID;
ALTER TABLE "content_views" ADD CONSTRAINT "content_views_target_type"
  CHECK ("targetType" IN ('novel', 'chapter')) NOT VALID;
ALTER TABLE "image_generation_jobs" ADD CONSTRAINT "image_jobs_type"
  CHECK ("type" IN ('cover', 'illustration', 'custom', 'portrait')) NOT VALID;
ALTER TABLE "image_generation_jobs" ADD CONSTRAINT "image_jobs_status"
  CHECK ("status" IN ('starting', 'processing', 'succeeded', 'failed', 'canceled')) NOT VALID;
ALTER TABLE "image_generation_jobs" ADD CONSTRAINT "image_jobs_storage_provider"
  CHECK ("storageProvider" IN ('none', 'supabase', 'local')) NOT VALID;
ALTER TABLE "image_generation_jobs" ADD CONSTRAINT "image_jobs_attempts_nonnegative"
  CHECK ("finalizationAttempts" >= 0) NOT VALID;

ALTER TABLE "novels" VALIDATE CONSTRAINT "novels_view_count_nonnegative";
ALTER TABLE "novels" VALIDATE CONSTRAINT "novels_public_requires_approval";
ALTER TABLE "chapters" VALIDATE CONSTRAINT "chapters_number_positive";
ALTER TABLE "chapters" VALIDATE CONSTRAINT "chapters_view_count_nonnegative";
ALTER TABLE "chapters" VALIDATE CONSTRAINT "chapters_publication_timestamp";
ALTER TABLE "reviews" VALIDATE CONSTRAINT "reviews_rating_range";
ALTER TABLE "reading_history" VALIDATE CONSTRAINT "reading_history_chapter_positive";
ALTER TABLE "seasons" VALIDATE CONSTRAINT "seasons_date_order";
ALTER TABLE "rate_limit_buckets" VALIDATE CONSTRAINT "rate_limit_count_nonnegative";
ALTER TABLE "content_views" VALIDATE CONSTRAINT "content_views_target_type";
ALTER TABLE "image_generation_jobs" VALIDATE CONSTRAINT "image_jobs_type";
ALTER TABLE "image_generation_jobs" VALIDATE CONSTRAINT "image_jobs_status";
ALTER TABLE "image_generation_jobs" VALIDATE CONSTRAINT "image_jobs_storage_provider";
ALTER TABLE "image_generation_jobs" VALIDATE CONSTRAINT "image_jobs_attempts_nonnegative";

COMMIT;
