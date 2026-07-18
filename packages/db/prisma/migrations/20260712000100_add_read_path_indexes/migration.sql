-- Public discovery, ranking, and home-page sorts.
CREATE INDEX "seasons_isActive_startsAt_endsAt_idx" ON "seasons"("isActive", "startsAt", "endsAt");

CREATE INDEX "novels_isPublished_approvalStatus_viewCount_idx" ON "novels"("isPublished", "approvalStatus", "viewCount");
CREATE INDEX "novels_isPublished_approvalStatus_createdAt_idx" ON "novels"("isPublished", "approvalStatus", "createdAt");
CREATE INDEX "novels_isPublished_approvalStatus_updatedAt_idx" ON "novels"("isPublished", "approvalStatus", "updatedAt");
CREATE INDEX "novels_approvalStatus_submittedAt_createdAt_idx" ON "novels"("approvalStatus", "submittedAt", "createdAt");
CREATE INDEX "novels_authorId_isPublished_approvalStatus_idx" ON "novels"("authorId", "isPublished", "approvalStatus");
CREATE INDEX "novels_seasonId_isPublished_approvalStatus_idx" ON "novels"("seasonId", "isPublished", "approvalStatus");
CREATE INDEX "novels_genres_idx" ON "novels" USING GIN ("genres");

-- Reader navigation and published chapter lists.
CREATE INDEX "chapters_novelId_isPublished_chapterNumber_idx" ON "chapters"("novelId", "isPublished", "chapterNumber");

-- User library tabs and review lists.
CREATE INDEX "bookmarks_userId_createdAt_idx" ON "bookmarks"("userId", "createdAt");
CREATE INDEX "likes_userId_createdAt_idx" ON "likes"("userId", "createdAt");
CREATE INDEX "reviews_novelId_createdAt_idx" ON "reviews"("novelId", "createdAt");
CREATE INDEX "reviews_userId_updatedAt_idx" ON "reviews"("userId", "updatedAt");
CREATE INDEX "reading_history_userId_updatedAt_idx" ON "reading_history"("userId", "updatedAt");
CREATE INDEX "tags_on_novels_tagId_idx" ON "tags_on_novels"("tagId");
