BEGIN;

ALTER TABLE "comments"
  ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "moderationReason" TEXT,
  ADD COLUMN "moderatedAt" TIMESTAMP(3),
  ADD COLUMN "moderatedById" TEXT;

ALTER TABLE "reviews"
  ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "moderationReason" TEXT,
  ADD COLUMN "moderatedAt" TIMESTAMP(3),
  ADD COLUMN "moderatedById" TEXT;

CREATE TABLE "content_reports" (
  "id" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "resolution" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_reports_reporterId_fkey"
    FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "content_reports_target_type"
    CHECK ("targetType" IN ('comment', 'review')),
  CONSTRAINT "content_reports_reason"
    CHECK ("reason" IN ('spam', 'harassment', 'copyright', 'privacy', 'other')),
  CONSTRAINT "content_reports_status"
    CHECK ("status" IN ('open', 'resolved', 'dismissed'))
);

CREATE UNIQUE INDEX "content_reports_reporterId_targetType_targetId_key"
  ON "content_reports"("reporterId", "targetType", "targetId");
CREATE INDEX "content_reports_status_createdAt_id_idx"
  ON "content_reports"("status", "createdAt", "id");
CREATE INDEX "content_reports_targetType_targetId_idx"
  ON "content_reports"("targetType", "targetId");
CREATE INDEX "comments_isHidden_createdAt_id_idx"
  ON "comments"("isHidden", "createdAt", "id");
CREATE INDEX "reviews_isHidden_createdAt_id_idx"
  ON "reviews"("isHidden", "createdAt", "id");

COMMIT;
