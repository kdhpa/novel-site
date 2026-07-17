-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "hasSpoiler" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_novelId_idx" ON "reviews"("novelId");

-- CreateIndex
CREATE INDEX "reviews_userId_idx" ON "reviews"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_userId_novelId_key" ON "reviews"("userId", "novelId");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
