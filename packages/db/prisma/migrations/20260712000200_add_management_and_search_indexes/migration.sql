-- Trigram indexes support case-insensitive contains searches used by browse and ops pages.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "users_createdAt_id_idx" ON "users"("createdAt", "id");
CREATE INDEX "users_role_createdAt_id_idx" ON "users"("role", "createdAt", "id");
CREATE INDEX "users_email_trgm_idx" ON "users" USING GIN ("email" gin_trgm_ops);
CREATE INDEX "users_name_trgm_idx" ON "users" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "users_nickname_trgm_idx" ON "users" USING GIN ("nickname" gin_trgm_ops);

CREATE INDEX "seasons_createdAt_idx" ON "seasons"("createdAt");
CREATE INDEX "seasons_startsAt_id_idx" ON "seasons"("startsAt", "id");

CREATE INDEX "novels_updatedAt_id_idx" ON "novels"("updatedAt", "id");
CREATE INDEX "novels_authorId_updatedAt_idx" ON "novels"("authorId", "updatedAt");
CREATE INDEX "novels_approvalStatus_updatedAt_id_idx" ON "novels"("approvalStatus", "updatedAt", "id");
CREATE INDEX "novels_title_trgm_idx" ON "novels" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "novels_description_trgm_idx" ON "novels" USING GIN ("description" gin_trgm_ops);

DROP INDEX IF EXISTS "novels_approvalStatus_submittedAt_createdAt_idx";
CREATE INDEX "novels_approvalStatus_submittedAt_createdAt_id_idx" ON "novels"("approvalStatus", "submittedAt", "createdAt", "id");

CREATE INDEX "characters_novelId_createdAt_idx" ON "characters"("novelId", "createdAt");
CREATE INDEX "tags_name_trgm_idx" ON "tags" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "likes_novelId_idx" ON "likes"("novelId");

DROP INDEX IF EXISTS "admin_audit_logs_createdAt_idx";
CREATE INDEX "admin_audit_logs_createdAt_id_idx" ON "admin_audit_logs"("createdAt", "id");
