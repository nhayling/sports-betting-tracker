-- CreateEnum
CREATE TYPE "MappingStatus" AS ENUM ('AUTO', 'CONFIRMED', 'NEEDS_REVIEW', 'REJECTED');

-- CreateTable
CREATE TABLE "ExternalEventMapping" (
    "id" TEXT NOT NULL,
    "sportsbookEventId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "status" "MappingStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalEventMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalParticipantMapping" (
    "id" TEXT NOT NULL,
    "sportsbookParticipantId" TEXT NOT NULL,
    "participantName" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerParticipantId" TEXT,
    "providerTeamId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "method" TEXT,
    "status" "MappingStatus" NOT NULL,
    "candidates" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalParticipantMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderEventState" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "homeTeam" JSONB NOT NULL,
    "awayTeam" JSONB NOT NULL,
    "state" TEXT NOT NULL,
    "period" INTEGER,
    "clock" TEXT,
    "detail" TEXT,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "situation" JSONB,
    "finalizedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderEventState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BetLegProgress" (
    "id" TEXT NOT NULL,
    "legSelectionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT,
    "externalPlayerId" TEXT,
    "metric" TEXT,
    "operator" TEXT,
    "target" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "unavailableReason" TEXT,
    "period" INTEGER,
    "clock" TEXT,
    "gameStatus" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "matchMethod" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BetLegProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalEventMapping_provider_providerEventId_idx" ON "ExternalEventMapping"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalEventMapping_sportsbookEventId_provider_key" ON "ExternalEventMapping"("sportsbookEventId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalParticipantMapping_sportsbookParticipantId_provider_key" ON "ExternalParticipantMapping"("sportsbookParticipantId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderEventState_provider_providerEventId_key" ON "ProviderEventState"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "BetLegProgress_legSelectionId_key" ON "BetLegProgress"("legSelectionId");

-- AddForeignKey
ALTER TABLE "BetLegProgress" ADD CONSTRAINT "BetLegProgress_legSelectionId_fkey" FOREIGN KEY ("legSelectionId") REFERENCES "LegSelection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
