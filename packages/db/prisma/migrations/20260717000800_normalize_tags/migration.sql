-- Phase 1 only expands the tag row and installs normalization for new writes.
-- The ACCESS EXCLUSIVE window is kept separate from legacy-data remapping.
BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE "tags" IN ACCESS EXCLUSIVE MODE;

ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "normalizedName" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tags_normalized_name_not_null'
      AND conrelid = '"tags"'::regclass
  ) THEN
    ALTER TABLE "tags"
      ADD CONSTRAINT "tags_normalized_name_not_null"
      CHECK ("normalizedName" IS NOT NULL) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION novelverse_normalize_tag()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."name" := novelverse_nfkc_trim(NEW."name");
  NEW."normalizedName" := novelverse_ascii_fold(NEW."name");
  IF NEW."normalizedName" = '' THEN
    RAISE EXCEPTION 'Tag name cannot be empty';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "tags_normalize_name" ON "tags";
CREATE TRIGGER "tags_normalize_name"
BEFORE INSERT OR UPDATE OF "name", "normalizedName"
ON "tags"
FOR EACH ROW
EXECUTE FUNCTION novelverse_normalize_tag();

COMMIT;

-- Phase 2 keeps public reads available. It first blocks novel-level mutations
-- (including cascade deletes), then protects the tag catalog. Current and old
-- application paths do not share one tag/join lock order, so the final join
-- lock is deliberately NOWAIT: retry during the release write freeze instead
-- of waiting in a cross-table cycle.
BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE "novels" IN SHARE MODE;
LOCK TABLE "tags" IN SHARE MODE;
LOCK TABLE "tags_on_novels" IN SHARE ROW EXCLUSIVE MODE NOWAIT;

-- Empty legacy labels carry no usable meaning. NFKC runs before ECMAScript-
-- compatible trimming, so compatibility spaces such as U+3000 are removed.
DELETE FROM "tags"
WHERE novelverse_nfkc_trim("name") = '';

UPDATE "tags"
SET
  "name" = novelverse_nfkc_trim("name"),
  "normalizedName" = novelverse_ascii_fold(novelverse_nfkc_trim("name"));

-- Preserve every novel relation while coalescing legacy ASCII-case and Unicode
-- compatibility variants. Non-ASCII case remains significant by design.
WITH canonical AS (
  SELECT "normalizedName", MIN(id) AS canonical_id
  FROM "tags"
  GROUP BY "normalizedName"
), remapped AS (
  SELECT DISTINCT links."novelId", canonical.canonical_id AS "tagId"
  FROM "tags_on_novels" links
  JOIN "tags" source ON source.id = links."tagId"
  JOIN canonical ON canonical."normalizedName" = source."normalizedName"
)
INSERT INTO "tags_on_novels" ("novelId", "tagId")
SELECT "novelId", "tagId" FROM remapped
ON CONFLICT ("novelId", "tagId") DO NOTHING;

WITH canonical AS (
  SELECT "normalizedName", MIN(id) AS canonical_id
  FROM "tags"
  GROUP BY "normalizedName"
)
DELETE FROM "tags" duplicate
USING canonical
WHERE duplicate."normalizedName" = canonical."normalizedName"
  AND duplicate.id <> canonical.canonical_id;

CREATE UNIQUE INDEX IF NOT EXISTS "tags_normalizedName_key"
  ON "tags"("normalizedName");

COMMIT;

-- Validation permits normal reads and writes. The validated check lets the
-- final SET NOT NULL take a short metadata lock without rescanning all tags.
ALTER TABLE "tags"
  VALIDATE CONSTRAINT "tags_normalized_name_not_null";

BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE "tags" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "tags" ALTER COLUMN "normalizedName" SET NOT NULL;
ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_normalized_name_not_null";
COMMIT;
