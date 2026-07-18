-- Phase 1 is metadata-only on PostgreSQL 17. ACCESS EXCLUSIVE is still needed,
-- but it is released before the count backfill and index builds.
BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE "novels" IN ACCESS EXCLUSIVE MODE;

ALTER TABLE "novels"
  ADD COLUMN IF NOT EXISTS "likeCount" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'novels_like_count_nonnegative'
      AND conrelid = '"novels"'::regclass
  ) THEN
    ALTER TABLE "novels"
      ADD CONSTRAINT "novels_like_count_nonnegative"
      CHECK ("likeCount" >= 0) NOT VALID;
  END IF;
END $$;

COMMIT;

CREATE OR REPLACE FUNCTION sync_novel_like_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE "novels"
    SET "likeCount" = "likeCount" + 1
    WHERE id = NEW."novelId";
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE "novels"
    SET "likeCount" = GREATEST("likeCount" - 1, 0)
    WHERE id = OLD."novelId";
    RETURN OLD;
  ELSIF NEW."novelId" IS DISTINCT FROM OLD."novelId" THEN
    UPDATE "novels"
    SET "likeCount" = GREATEST("likeCount" - 1, 0)
    WHERE id = OLD."novelId";
    UPDATE "novels"
    SET "likeCount" = "likeCount" + 1
    WHERE id = NEW."novelId";
  END IF;
  RETURN NEW;
END;
$$;

-- Phase 2 allows novel reads, while pausing novel writes and like writes long
-- enough to install the trigger and take an exact count. The second lock is
-- NOWAIT deliberately: application paths can reach these tables in different
-- orders (including cascade deletes), so a busy deployment must fail cleanly
-- and be retried during the documented write freeze instead of deadlocking.
BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE "novels" IN SHARE MODE;
LOCK TABLE "likes" IN SHARE ROW EXCLUSIVE MODE NOWAIT;

DROP TRIGGER IF EXISTS "likes_sync_novel_count" ON "likes";
CREATE TRIGGER "likes_sync_novel_count"
AFTER INSERT OR DELETE OR UPDATE OF "novelId" ON "likes"
FOR EACH ROW
EXECUTE FUNCTION sync_novel_like_count();

UPDATE "novels" n
SET "likeCount" = counts.value
FROM (
  SELECT n2.id, COUNT(l.id)::INTEGER AS value
  FROM "novels" n2
  LEFT JOIN "likes" l ON l."novelId" = n2.id
  GROUP BY n2.id
) counts
WHERE counts.id = n.id
  AND n."likeCount" IS DISTINCT FROM counts.value;

COMMIT;

-- NOT VALID enforced new writes from phase 1 onward; validation does not need
-- the broad locks held by the exact backfill.
ALTER TABLE "novels"
  VALIDATE CONSTRAINT "novels_like_count_nonnegative";

-- These regular builds allow reads but can briefly queue novel writes. They run
-- after the likes lock is released, removing the former cross-table deadlock.
CREATE INDEX IF NOT EXISTS "novels_isPublished_approvalStatus_likeCount_id_idx"
  ON "novels"("isPublished", "approvalStatus", "likeCount", "id");

CREATE INDEX IF NOT EXISTS "novels_public_combined_rank_idx"
  ON "novels"(
    (("viewCount"::bigint + "likeCount"::bigint * 10)) DESC,
    id DESC
  )
  WHERE "isPublished" = true
    AND "approvalStatus" = 'APPROVED'::"ApprovalStatus";
