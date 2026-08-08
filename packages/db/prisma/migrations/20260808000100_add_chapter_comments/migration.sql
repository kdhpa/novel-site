ALTER TABLE "comments"
  ADD COLUMN "chapterId" TEXT;

CREATE INDEX "comments_novelId_chapterId_parentId_createdAt_id_idx"
  ON "comments"("novelId", "chapterId", "parentId", "createdAt", "id");

ALTER TABLE "comments"
  ADD CONSTRAINT "comments_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "chapters"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
