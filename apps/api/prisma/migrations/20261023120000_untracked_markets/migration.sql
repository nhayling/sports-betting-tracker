-- Markets seen on synced picks that the tracker can't follow yet.

-- CreateTable
CREATE TABLE "UntrackedMarket" (
    "id" TEXT NOT NULL,
    "sport" TEXT NOT NULL DEFAULT '',
    "marketName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "example" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UntrackedMarket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UntrackedMarket_sport_marketName_key" ON "UntrackedMarket"("sport", "marketName");
