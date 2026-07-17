BEGIN;

ALTER TABLE "content_reports"
  ALTER COLUMN "reporterId" DROP NOT NULL;

ALTER TABLE "content_reports"
  DROP CONSTRAINT "content_reports_reporterId_fkey";

ALTER TABLE "content_reports"
  ADD CONSTRAINT "content_reports_reporterId_fkey"
  FOREIGN KEY ("reporterId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
