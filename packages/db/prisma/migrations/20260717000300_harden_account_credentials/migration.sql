BEGIN;

-- Match String.prototype.normalize('NFKC').trim() exactly for the whitespace
-- characters ECMAScript removes. These helpers are recreated in 00600 so an
-- existing installation that starts at either release boundary gets the same
-- canonicalization contract.
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

-- A single ACCESS EXCLUSIVE request avoids upgrading a weaker table lock after
-- readers have entered. Authentication reads are blocked while this bounded
-- identity rewrite and unique-index build completes.
LOCK TABLE "users" IN ACCESS EXCLUSIVE MODE;

-- Abort before rewriting when legacy rows would collapse to the same NFKC +
-- ASCII-folded account key. Non-ASCII case remains significant by design.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users"
    WHERE novelverse_nfkc_trim("email") = ''
  ) THEN
    RAISE EXCEPTION 'Cannot normalize users.email: an empty normalized address exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "users"
    GROUP BY novelverse_ascii_fold(novelverse_nfkc_trim("email"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot normalize users.email: duplicate NFKC ASCII-case-folded addresses exist';
  END IF;
END $$;

UPDATE "users"
SET "email" = novelverse_ascii_fold(novelverse_nfkc_trim("email"))
WHERE "email" IS DISTINCT FROM novelverse_ascii_fold(novelverse_nfkc_trim("email"));

CREATE UNIQUE INDEX "users_email_normalized_key"
  ON "users" (novelverse_ascii_fold(novelverse_nfkc_trim("email")));

ALTER TABLE "users"
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

COMMIT;
