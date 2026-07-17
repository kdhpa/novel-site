BEGIN;

ALTER TABLE "content_reports"
  ADD COLUMN "targetSnapshot" JSONB;

UPDATE "content_reports" AS report
SET "targetSnapshot" = jsonb_build_object(
  'authorId', comment."userId",
  'novelId', comment."novelId",
  'parentId', comment."parentId",
  'content', left(comment."content", 1000),
  'createdAt', comment."createdAt"
)
FROM "comments" AS comment
WHERE report."targetType" = 'comment'
  AND report."targetId" = comment."id"
  AND report."targetSnapshot" IS NULL;

UPDATE "content_reports" AS report
SET "targetSnapshot" = jsonb_build_object(
  'authorId', review."userId",
  'novelId', review."novelId",
  'rating', review."rating",
  'hasSpoiler', review."hasSpoiler",
  'content', left(review."content", 2000),
  'createdAt', review."createdAt"
)
FROM "reviews" AS review
WHERE report."targetType" = 'review'
  AND report."targetId" = review."id"
  AND report."targetSnapshot" IS NULL;

-- A target may already have been removed before this migration. Keep that
-- distinction explicit so operators do not confuse missing evidence with a
-- report created by the snapshot-aware application.
UPDATE "content_reports"
SET "targetSnapshot" = jsonb_build_object('targetUnavailable', true)
WHERE "targetSnapshot" IS NULL;

COMMIT;
