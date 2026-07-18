-- Stable server-side pagination for public discovery and author/contest lists.
DROP INDEX IF EXISTS "novels_isPublished_approvalStatus_viewCount_idx";
DROP INDEX IF EXISTS "novels_isPublished_approvalStatus_createdAt_idx";
DROP INDEX IF EXISTS "novels_isPublished_approvalStatus_updatedAt_idx";
DROP INDEX IF EXISTS "novels_authorId_isPublished_approvalStatus_idx";
DROP INDEX IF EXISTS "novels_seasonId_isPublished_approvalStatus_idx";

CREATE INDEX "novels_isPublished_approvalStatus_viewCount_id_idx" ON "novels"("isPublished", "approvalStatus", "viewCount", "id");
CREATE INDEX "novels_isPublished_approvalStatus_createdAt_id_idx" ON "novels"("isPublished", "approvalStatus", "createdAt", "id");
CREATE INDEX "novels_isPublished_approvalStatus_updatedAt_id_idx" ON "novels"("isPublished", "approvalStatus", "updatedAt", "id");
CREATE INDEX "novels_authorId_isPublished_approvalStatus_viewCount_id_idx" ON "novels"("authorId", "isPublished", "approvalStatus", "viewCount", "id");
CREATE INDEX "novels_seasonId_isPublished_approvalStatus_updatedAt_id_idx" ON "novels"("seasonId", "isPublished", "approvalStatus", "updatedAt", "id");
