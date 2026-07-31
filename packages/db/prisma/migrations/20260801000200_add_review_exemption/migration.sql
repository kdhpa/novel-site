BEGIN;

ALTER TABLE "users"
  ADD COLUMN "canSkipReview" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users"
  ADD CONSTRAINT "users_can_skip_review_author"
  CHECK (NOT "canSkipReview" OR "role" = 'AUTHOR')
  NOT VALID;

COMMIT;

ALTER TABLE "users"
  VALIDATE CONSTRAINT "users_can_skip_review_author";
