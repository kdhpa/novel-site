-- Reconcile the migration history with the current application schema.
--
-- This migration intentionally uses existence checks because some environments
-- were previously brought up to date with `prisma db push`. It must therefore
-- work both on a database created only from migrations and on an already
-- reconciled database.

-- The second historical migration removed AUTHOR, while the application and
-- current Prisma schema still support the role.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'AUTHOR';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApprovalStatus') THEN
    CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');
  END IF;
END
$$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "isVerifiedAuthor" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);

-- Convert the original scalar `genre` field into the genre array used by the
-- current application. Preserve the existing value when this is a fresh
-- migration-only database.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'novels'
      AND column_name = 'genres'
  ) THEN
    ALTER TABLE "novels"
      ADD COLUMN "genres" "Genre"[] NOT NULL DEFAULT ARRAY[]::"Genre"[];

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'novels'
        AND column_name = 'genre'
    ) THEN
      UPDATE "novels" SET "genres" = ARRAY["genre"]::"Genre"[];
    END IF;
  END IF;
END
$$;

ALTER TABLE "novels"
  DROP COLUMN IF EXISTS "genre";

-- Preserve the visibility of legacy published novels by treating them as
-- approved when the approval column is introduced for the first time.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'novels'
      AND column_name = 'approvalStatus'
  ) THEN
    ALTER TABLE "novels"
      ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT';

    UPDATE "novels"
    SET "approvalStatus" = 'APPROVED'
    WHERE "isPublished" = true;
  END IF;
END
$$;

ALTER TABLE "novels"
  ADD COLUMN IF NOT EXISTS "approvalNote" TEXT,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'novels_reviewedById_fkey'
  ) THEN
    ALTER TABLE "novels"
      ADD CONSTRAINT "novels_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
