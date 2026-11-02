-- Fixing untracked markets from the admin site.

-- AlterTable
ALTER TABLE "UntrackedMarket" ADD COLUMN "ignoredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MarketRule" (
    "id" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "marketName" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketRule_sport_pattern_key" ON "MarketRule"("sport", "pattern");
