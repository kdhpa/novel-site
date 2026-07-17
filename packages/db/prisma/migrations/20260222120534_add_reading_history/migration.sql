-- CreateTable
CREATE TABLE "reading_history" (
    "id" TEXT NOT NULL,
    "lastChapter" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,

    CONSTRAINT "reading_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reading_history_userId_idx" ON "reading_history"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "reading_history_userId_novelId_key" ON "reading_history"("userId", "novelId");

-- AddForeignKey
ALTER TABLE "reading_history" ADD CONSTRAINT "reading_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_history" ADD CONSTRAINT "reading_history_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
