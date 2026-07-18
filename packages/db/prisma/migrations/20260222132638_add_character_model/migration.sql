-- AlterTable
ALTER TABLE "chapters" ADD COLUMN     "illustrationCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "appearance" TEXT NOT NULL,
    "personality" TEXT,
    "role" TEXT,
    "portraitUrl" TEXT,
    "portraitPrompt" TEXT,
    "novelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_illustrations" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "contextText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapter_illustrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "characters_novelId_idx" ON "characters"("novelId");

-- CreateIndex
CREATE INDEX "chapter_illustrations_chapterId_idx" ON "chapter_illustrations"("chapterId");

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_illustrations" ADD CONSTRAINT "chapter_illustrations_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
