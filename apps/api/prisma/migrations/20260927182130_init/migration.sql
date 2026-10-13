-- CreateEnum
CREATE TYPE "SportsbookProvider" AS ENUM ('ISLAND_LUCK_KAMBI');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'VOID', 'CASHED_OUT', 'MIXED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "BetKind" AS ENUM ('SINGLE', 'COMBINATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SelectionType" AS ENUM ('SIMPLE', 'BET_BUILDER');

-- CreateEnum
CREATE TYPE "SelectionSide" AS ENUM ('YES', 'NO', 'OVER', 'UNDER');

-- CreateTable
CREATE TABLE "SportsbookAccount" (
    "id" TEXT NOT NULL,
    "provider" "SportsbookProvider" NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportsbookAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "sportsbookAccountId" TEXT NOT NULL,
    "externalCouponRef" TEXT NOT NULL,
    "externalCouponUuid" TEXT,
    "placedAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "channel" TEXT,
    "rewardType" TEXT,
    "status" "SettlementStatus" NOT NULL,
    "totalStakeMinor" INTEGER,
    "potentialPayoutMinor" INTEGER,
    "actualPayoutMinor" INTEGER,
    "rawPayload" JSONB NOT NULL,
    "rawPayloadHash" TEXT NOT NULL,
    "parserVersion" INTEGER NOT NULL,
    "parseWarnings" TEXT[],
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bet" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "externalBetRef" TEXT NOT NULL,
    "kind" "BetKind" NOT NULL,
    "oddsRaw" INTEGER,
    "stakeMinor" INTEGER,
    "potentialPayoutMinor" INTEGER,
    "potentialPayoutDerived" BOOLEAN NOT NULL,
    "payoutMinor" INTEGER,
    "status" "SettlementStatus" NOT NULL,
    "rawStatus" TEXT,

    CONSTRAINT "Bet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BetLeg" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "externalRowIndex" INTEGER NOT NULL,
    "selectionType" "SelectionType" NOT NULL,
    "eventId" TEXT,
    "eventName" TEXT,
    "homeName" TEXT,
    "awayName" TEXT,
    "sport" TEXT,
    "league" TEXT,
    "eventStartAt" TIMESTAMP(3),
    "oddsRaw" INTEGER,
    "payoutOddsRaw" INTEGER,
    "placedLive" BOOLEAN NOT NULL,
    "status" "SettlementStatus" NOT NULL,
    "rawStatus" TEXT,

    CONSTRAINT "BetLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BetLegLink" (
    "betId" TEXT NOT NULL,
    "betLegId" TEXT NOT NULL,

    CONSTRAINT "BetLegLink_pkey" PRIMARY KEY ("betId","betLegId")
);

-- CreateTable
CREATE TABLE "LegSelection" (
    "id" TEXT NOT NULL,
    "betLegId" TEXT NOT NULL,
    "externalOutcomeId" TEXT NOT NULL,
    "externalBetOfferId" TEXT,
    "externalParticipantId" TEXT,
    "participantName" TEXT,
    "marketName" TEXT,
    "marketType" TEXT,
    "marketTypeId" INTEGER,
    "selectionLabel" TEXT,
    "selectionSide" "SelectionSide",
    "lineRaw" INTEGER,
    "status" "SettlementStatus" NOT NULL,
    "rawStatus" TEXT,
    "settledResult" TEXT[],
    "rawOutcome" JSONB,
    "rawBetOffer" JSONB,

    CONSTRAINT "LegSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SportsbookAccount_provider_label_key" ON "SportsbookAccount"("provider", "label");

-- CreateIndex
CREATE INDEX "Coupon_status_idx" ON "Coupon"("status");

-- CreateIndex
CREATE INDEX "Coupon_placedAt_idx" ON "Coupon"("placedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_sportsbookAccountId_externalCouponRef_key" ON "Coupon"("sportsbookAccountId", "externalCouponRef");

-- CreateIndex
CREATE UNIQUE INDEX "Bet_couponId_externalBetRef_key" ON "Bet"("couponId", "externalBetRef");

-- CreateIndex
CREATE INDEX "BetLeg_eventId_idx" ON "BetLeg"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "BetLeg_couponId_externalRowIndex_key" ON "BetLeg"("couponId", "externalRowIndex");

-- CreateIndex
CREATE INDEX "LegSelection_externalParticipantId_idx" ON "LegSelection"("externalParticipantId");

-- CreateIndex
CREATE UNIQUE INDEX "LegSelection_betLegId_externalOutcomeId_key" ON "LegSelection"("betLegId", "externalOutcomeId");

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_sportsbookAccountId_fkey" FOREIGN KEY ("sportsbookAccountId") REFERENCES "SportsbookAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetLeg" ADD CONSTRAINT "BetLeg_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetLegLink" ADD CONSTRAINT "BetLegLink_betId_fkey" FOREIGN KEY ("betId") REFERENCES "Bet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetLegLink" ADD CONSTRAINT "BetLegLink_betLegId_fkey" FOREIGN KEY ("betLegId") REFERENCES "BetLeg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegSelection" ADD CONSTRAINT "LegSelection_betLegId_fkey" FOREIGN KEY ("betLegId") REFERENCES "BetLeg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
