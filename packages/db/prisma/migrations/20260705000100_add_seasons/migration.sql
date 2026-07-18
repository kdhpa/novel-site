CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImage" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "novels" ADD COLUMN "seasonId" TEXT;

CREATE UNIQUE INDEX "seasons_slug_key" ON "seasons"("slug");
CREATE INDEX "seasons_isActive_idx" ON "seasons"("isActive");
CREATE INDEX "novels_seasonId_idx" ON "novels"("seasonId");

ALTER TABLE "novels" ADD CONSTRAINT "novels_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
