import type { Prisma } from '@prisma/client';
import type { ParsedBet, ParsedCoupon, ParsedLeg, ParsedSelection } from '@sports-better/kambi';

/**
 * Maps parser output to Prisma column data. Pure, so the mapping can be tested
 * without a database. Relations are wired up by the sync service.
 */

const json = (v: unknown) => (v ?? undefined) as Prisma.InputJsonValue | undefined;
const date = (iso: string | null) => (iso ? new Date(iso) : null);

export function couponFields(c: ParsedCoupon, meta: { hash: string; parserVersion: number; capturedAt: Date }) {
  return {
    externalCouponUuid: c.externalCouponUuid,
    placedAt: date(c.placedAt),
    currency: c.currency,
    channel: c.channel,
    rewardType: c.rewardType,
    status: c.status,
    totalStakeMinor: c.totalStakeMinor,
    potentialPayoutMinor: c.potentialPayoutMinor,
    actualPayoutMinor: c.actualPayoutMinor,
    rawPayload: json(c.raw)!,
    rawPayloadHash: meta.hash,
    parserVersion: meta.parserVersion,
    parseWarnings: c.warnings,
    capturedAt: meta.capturedAt,
    lastSyncedAt: new Date(),
  } satisfies Omit<Prisma.CouponUncheckedCreateInput, 'sportsbookAccountId' | 'externalCouponRef'>;
}

export function betFields(b: ParsedBet) {
  return {
    kind: b.kind,
    oddsRaw: b.oddsRaw,
    stakeMinor: b.stakeMinor,
    potentialPayoutMinor: b.potentialPayoutMinor,
    potentialPayoutDerived: b.potentialPayoutDerived,
    payoutMinor: b.payoutMinor,
    status: b.status,
    rawStatus: b.rawStatus,
  } satisfies Omit<Prisma.BetUncheckedCreateInput, 'couponId' | 'externalBetRef'>;
}

export function legFields(l: ParsedLeg) {
  return {
    selectionType: l.selectionType,
    eventId: l.eventId,
    eventName: l.eventName,
    homeName: l.homeName,
    awayName: l.awayName,
    sport: l.sport,
    league: l.league,
    eventStartAt: date(l.eventStartAt),
    oddsRaw: l.oddsRaw,
    payoutOddsRaw: l.payoutOddsRaw,
    placedLive: l.placedLive,
    status: l.status,
    rawStatus: l.rawStatus,
  } satisfies Omit<Prisma.BetLegUncheckedCreateInput, 'couponId' | 'externalRowIndex'>;
}

export function selectionFields(s: ParsedSelection) {
  return {
    externalBetOfferId: s.externalBetOfferId,
    externalParticipantId: s.externalParticipantId,
    participantName: s.participantName,
    marketName: s.marketName,
    marketType: s.marketType,
    marketTypeId: s.marketTypeId,
    selectionLabel: s.selectionLabel,
    selectionSide: s.selectionSide,
    lineRaw: s.lineRaw,
    status: s.status,
    rawStatus: s.rawStatus,
    settledResult: s.settledResult ?? [],
    rawOutcome: json(s.rawOutcome),
    rawBetOffer: json(s.rawBetOffer),
  } satisfies Omit<Prisma.LegSelectionUncheckedCreateInput, 'betLegId' | 'externalOutcomeId'>;
}
