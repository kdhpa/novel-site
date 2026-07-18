BEGIN;

-- ECMAScript trim() runs after NFKC and removes this exact WhiteSpace /
-- LineTerminator set. Keeping the database function aligned with the shared
-- TypeScript normalizer prevents compatibility spaces (for example U+3000)
-- from creating a second account key.
CREATE OR REPLACE FUNCTION novelverse_nfkc_trim(input_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT btrim(
    normalize(input_value, NFKC),
    chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32)
      || chr(160) || chr(5760)
      || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196)
      || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201)
      || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287)
      || chr(12288) || chr(65279)
  )
$$;

-- PostgreSQL lower() follows the database collation while JavaScript
-- toLowerCase() follows Unicode default casing. Fold ASCII explicitly so the
-- same key is produced on every PostgreSQL 17 locale. Non-ASCII case remains
-- significant by design.
CREATE OR REPLACE FUNCTION novelverse_ascii_fold(input_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT translate(
    input_value,
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz'
  )
$$;

-- ALTER TABLE needs ACCESS EXCLUSIVE anyway. Acquire it once instead of first
-- taking a weaker lock and then risking a lock-upgrade deadlock with a
-- transaction that read a user before updating it.
LOCK TABLE "users" IN ACCESS EXCLUSIVE MODE;

ALTER TABLE "users"
  ADD COLUMN "emailNormalized" TEXT,
  ADD COLUMN "nicknameNormalized" TEXT,
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspensionReason" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users"
    WHERE novelverse_nfkc_trim("email") = ''
  ) THEN
    RAISE EXCEPTION 'Cannot normalize users.email: an empty normalized address exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "users"
    GROUP BY novelverse_ascii_fold(novelverse_nfkc_trim("email"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize users.email: duplicate NFKC ASCII-case-folded addresses exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "users"
    WHERE "nickname" IS NOT NULL AND novelverse_nfkc_trim("nickname") <> ''
    GROUP BY novelverse_ascii_fold(novelverse_nfkc_trim("nickname"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize users.nickname: duplicate NFKC ASCII-case-folded nicknames exist';
  END IF;
END $$;

UPDATE "users"
SET
  "email" = novelverse_ascii_fold(novelverse_nfkc_trim("email")),
  "emailNormalized" = novelverse_ascii_fold(novelverse_nfkc_trim("email")),
  "nickname" = CASE
    WHEN "nickname" IS NULL OR novelverse_nfkc_trim("nickname") = '' THEN NULL
    ELSE novelverse_nfkc_trim("nickname")
  END,
  "nicknameNormalized" = CASE
    WHEN "nickname" IS NULL OR novelverse_nfkc_trim("nickname") = '' THEN NULL
    ELSE novelverse_ascii_fold(novelverse_nfkc_trim("nickname"))
  END;

ALTER TABLE "users"
  ALTER COLUMN "emailNormalized" SET NOT NULL;

CREATE UNIQUE INDEX "users_emailNormalized_key" ON "users"("emailNormalized");
CREATE UNIQUE INDEX "users_nicknameNormalized_key" ON "users"("nicknameNormalized");
CREATE INDEX "users_suspendedAt_createdAt_id_idx" ON "users"("suspendedAt", "createdAt", "id");

CREATE FUNCTION novelverse_normalize_user_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."email" := novelverse_ascii_fold(novelverse_nfkc_trim(NEW."email"));
  IF NEW."email" = '' THEN
    RAISE EXCEPTION 'Email cannot be empty';
  END IF;
  NEW."emailNormalized" := NEW."email";

  IF NEW."nickname" IS NULL OR novelverse_nfkc_trim(NEW."nickname") = '' THEN
    NEW."nickname" := NULL;
    NEW."nicknameNormalized" := NULL;
  ELSE
    NEW."nickname" := novelverse_nfkc_trim(NEW."nickname");
    NEW."nicknameNormalized" := novelverse_ascii_fold(NEW."nickname");
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "users_normalize_identity"
BEFORE INSERT OR UPDATE OF "email", "emailNormalized", "nickname", "nicknameNormalized"
ON "users"
FOR EACH ROW
EXECUTE FUNCTION novelverse_normalize_user_identity();

-- email is now stored normalized and emailNormalized has its own unique index.
DROP INDEX IF EXISTS "users_email_normalized_key";

COMMIT;
