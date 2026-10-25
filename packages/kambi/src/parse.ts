import { kambiMoneyToMinor } from './money';
import { expectedPayoutMinor, kambiLineToNumber, kambiOdds } from './odds';
import {
  couponsOf,
  outcomeIdsOfGroup,
  type RawBet,
  type RawBetOffer,
  type RawCoupon,
  type RawCouponRow,
  type RawEvent,
  type RawHistoryResponse,
  type RawOutcome,
} from './raw';
import { deriveCouponStatus, normalizeKambiStatus } from './status';
import type {
  BetKind,
  ParsedBet,
  ParsedCoupon,
  ParsedLeg,
  ParsedSelection,
  SelectionSide,
  SelectionType,
} from './types';

/** Kambi rounds potentialPayout to the cent; allow for our own rounding too. */
const PAYOUT_TOLERANCE_MINOR = 1;

export function parseHistoryResponse(res: RawHistoryResponse): ParsedCoupon[] {
  return couponsOf(res).map(parseCoupon);
}

/**
 * Far above any real ticket (the captured ones have at most 14 picks and 3 bets; a big system
 * bet is a few hundred). Coupons arrive as their sender wrote them, and each pick and bet
 * becomes database rows.
 */
const MAX_PICKS = 100;
const MAX_BETS = 1000;

export function parseCoupon(raw: RawCoupon): ParsedCoupon {
  const warnings: string[] = [];
  const ref = String(raw.couponRef);
  const betCount = raw.bets?.length ?? 0;
  if (betCount > MAX_BETS) throw new Error(`coupon has ${betCount} bets; at most ${MAX_BETS} are read`);
  const picks = (raw.bets ?? []).reduce((most, b) => Math.max(most, b.couponRowIndexes?.length ?? 0), raw.couponRows?.length ?? 0);
  if (picks > MAX_PICKS) throw new Error(`coupon has ${picks} picks; at most ${MAX_PICKS} are read`);

  const lookups: Lookups = {
    outcomes: new Map((raw.outcomes ?? []).map((o) => [o.outcomeId, o])),
    betOffers: new Map((raw.betOffers ?? []).map((b) => [b.betOfferId, b])),
    events: new Map((raw.events ?? []).map((e) => [e.eventId, e])),
  };

  const rows = (raw.couponRows ?? []).map((row) => parseRow(row, lookups, warnings));
  const isSystem = (raw.systemBets ?? []).length > 0;
  const currency = raw.currency ?? 'USD';
  const rowsByIndex = new Map(rows.map((r) => [r.externalRowIndex, r]));
  const bets = (raw.bets ?? []).map((bet) => parseBet(bet, rowsByIndex, isSystem, currency, warnings));

  if (isSystem) warnings.push(`coupon ${ref}: has systemBets, which are kept raw but not normalized yet`);
  if (bets.length === 0) warnings.push(`coupon ${ref}: no bets`);

  return {
    externalCouponRef: ref,
    externalCouponUuid: raw.couponExternalRef ?? null,
    placedAt: toIso(raw.placedDate),
    currency,
    channel: raw.channel ?? null,
    rewardType: raw.rewardType ?? null,
    status: deriveCouponStatus(bets.map((b) => b.status)),
    totalStakeMinor: sumOrNull(bets.map((b) => b.stakeMinor)),
    potentialPayoutMinor: sumOrNull(bets.map((b) => b.potentialPayoutMinor)),
    actualPayoutMinor: sumOrNull(bets.map((b) => b.payoutMinor)),
    bets,
    warnings,
    raw,
  };
}

interface Lookups {
  outcomes: Map<number, RawOutcome>;
  betOffers: Map<number, RawBetOffer>;
  events: Map<number, RawEvent>;
}

function parseRow(row: RawCouponRow, lk: Lookups, warnings: string[]): ParsedLeg {
  const index = row.index;
  const rawType = row.selectionType?.toUpperCase();
  const selectionType: SelectionType = rawType === 'BET_BUILDER' ? 'BET_BUILDER' : 'SIMPLE';
  if (rawType !== 'SIMPLE' && rawType !== 'BET_BUILDER') {
    warnings.push(`row ${index}: unknown selectionType ${row.selectionType ?? '(missing)'}, treated as SIMPLE`);
  }

  const outcomeIds =
    selectionType === 'BET_BUILDER'
      ? outcomeIdsOfGroup(row.outcomeGroup)
      : row.outcomeId !== undefined
        ? [row.outcomeId]
        : [];
  if (outcomeIds.length === 0) warnings.push(`row ${index}: no outcome ids`);
  if (row.outcomeGroup && row.outcomeGroup.operation !== 'AND') {
    warnings.push(`row ${index}: outcome group operation ${row.outcomeGroup.operation}, expected AND`);
  }

  const selections = outcomeIds.map((id) => parseSelection(id, lk, warnings));

  // A row's event comes from its outcomes. Bet builder outcomes share one event.
  const eventIds = unique(
    outcomeIds.map((id) => lk.outcomes.get(id)?.eventId).filter((e): e is number => e !== undefined),
  );
  if (eventIds.length > 1) warnings.push(`row ${index}: outcomes span multiple events (${eventIds.join(', ')})`);
  const eventId = eventIds[0];
  const event = eventId !== undefined ? lk.events.get(eventId) : undefined;
  if (eventId !== undefined && !event) warnings.push(`row ${index}: event ${eventId} not found in coupon.events`);

  const odds = kambiOdds(row.playedOdds);
  const rawStatus = row.status ?? null;

  return {
    externalRowIndex: index,
    selectionType,
    eventId: eventId !== undefined ? String(eventId) : null,
    eventName: event?.eventName ?? null,
    homeName: event?.homeName ?? null,
    awayName: event?.awayName ?? null,
    sport: event?.sport ?? null,
    league: leagueOf(event?.eventGroups),
    eventStartAt: toIso(event?.eventStartDate),
    oddsRaw: odds?.raw ?? null,
    odds: odds?.decimal ?? null,
    payoutOddsRaw: typeof row.payoutOdds === 'number' ? row.payoutOdds : null,
    placedLive: row.tags?.includes('LIVE') ?? false,
    status: normalizeKambiStatus(rawStatus),
    rawStatus,
    selections,
  };
}

function parseSelection(outcomeId: number, lk: Lookups, warnings: string[]): ParsedSelection {
  const outcome = lk.outcomes.get(outcomeId) ?? null;
  if (!outcome) warnings.push(`outcome ${outcomeId} not found in coupon.outcomes`);
  const betOffer = outcome?.betOfferId !== undefined ? (lk.betOffers.get(outcome.betOfferId) ?? null) : null;
  if (outcome && !betOffer) warnings.push(`outcome ${outcomeId}: betOffer ${outcome.betOfferId} not found`);

  const lineRaw = outcome?.line ?? betOffer?.line ?? null;
  const line = kambiLineToNumber(lineRaw);
  const label = parseOutcomeLabel(outcome?.label);
  if (label.labelLine !== null && line !== null && label.labelLine !== line) {
    warnings.push(`outcome ${outcomeId}: label line ${label.labelLine} ≠ line ${line}`);
  }
  // Only treat the label as a participant name when Kambi says there is a participant.
  const participantName = outcome?.participantId !== undefined ? label.name : null;

  return {
    externalOutcomeId: String(outcomeId),
    externalBetOfferId: outcome?.betOfferId !== undefined ? String(outcome.betOfferId) : null,
    externalParticipantId: outcome?.participantId !== undefined ? String(outcome.participantId) : null,
    participantName,
    marketName: betOffer?.criterion ?? null,
    marketType: betOffer?.boType ?? null,
    marketTypeId: betOffer?.boTypeId ?? null,
    selectionLabel: outcome?.label ?? null,
    selectionSide: label.side,
    lineRaw,
    line,
    status: normalizeKambiStatus(outcome?.status),
    rawStatus: outcome?.status ?? null,
    settledResult: outcome?.settledInfo?.result?.correct ?? null,
    rawOutcome: outcome,
    rawBetOffer: betOffer,
  };
}

/**
 * Splits Kambi outcome labels:
 *   "Derrick Henry - Yes"       → Derrick Henry, YES
 *   "Drake London - Over 5.5"   → Drake London, OVER, 5.5
 *   "TB Buccaneers"             → TB Buccaneers, no side
 */
/**
 * The league under the sport group: "NFL", "NBA", "UFC". Soccer leagues keep
 * their country ("England / Premier League"), since Kambi has a Premier League
 * in a dozen countries.
 */
function leagueOf(groups: Array<{ name?: string }> | undefined): string | null {
  const names = (groups ?? []).map((g) => g.name).filter((n): n is string => !!n);
  if (names.length === 0) return null;
  return names.length > 1 ? names.slice(1).join(' / ') : names[0]!;
}

export function parseOutcomeLabel(label: string | undefined): {
  name: string | null;
  side: SelectionSide | null;
  labelLine: number | null;
} {
  if (!label) return { name: null, side: null, labelLine: null };
  const yesNo = /^(.+?) - (Yes|No)$/i.exec(label);
  if (yesNo) return { name: yesNo[1]!.trim(), side: yesNo[2]!.toUpperCase() as SelectionSide, labelLine: null };
  const overUnder = /^(.+?) - (Over|Under) (\d+(?:\.\d+)?)$/i.exec(label);
  if (overUnder) {
    return {
      name: overUnder[1]!.trim(),
      side: overUnder[2]!.toUpperCase() as SelectionSide,
      labelLine: Number(overUnder[3]),
    };
  }
  // Yes/no on the whole game ("Both Teams To Score", "To go the distance") has no name either.
  const bareYesNo = /^(Yes|No)$/i.exec(label.trim());
  if (bareYesNo) return { name: null, side: bareYesNo[1]!.toUpperCase() as SelectionSide, labelLine: null };
  // Whole-game totals have no name: "Over 3.5".
  const bare = /^(Over|Under) (\d+(?:\.\d+)?)$/i.exec(label.trim());
  if (bare) return { name: null, side: bare[1]!.toUpperCase() as SelectionSide, labelLine: Number(bare[2]) };
  return { name: label.trim(), side: null, labelLine: null };
}

function parseBet(
  bet: RawBet,
  rowsByIndex: Map<number, ParsedLeg>,
  isSystem: boolean,
  currency: string,
  warnings: string[],
): ParsedBet {
  const ref = String(bet.betRef);

  const indexes = bet.couponRowIndexes ?? [];
  const legs = indexes.map((i) => rowsByIndex.get(i)).filter((r) => r !== undefined);
  if (indexes.length === 0) warnings.push(`bet ${ref}: no couponRowIndexes`);
  if (legs.length !== indexes.length) warnings.push(`bet ${ref}: references coupon rows that do not exist`);

  const odds = kambiOdds(bet.playedOdds) ?? kambiOdds(bet.betOdds);
  const stake = kambiMoneyToMinor(bet.stake, currency);
  const kambiPotential = kambiMoneyToMinor(bet.potentialPayout, currency);
  const expected = odds && stake !== null ? expectedPayoutMinor(stake, odds.raw) : null;

  let potential = kambiPotential;
  let potentialPayoutDerived = false;
  if ((kambiPotential === null || kambiPotential === 0) && expected !== null) {
    potential = expected;
    potentialPayoutDerived = true;
  } else if (kambiPotential !== null && expected !== null && Math.abs(expected - kambiPotential) > PAYOUT_TOLERANCE_MINOR) {
    warnings.push(`bet ${ref}: potentialPayout ${kambiPotential} ≠ stake×odds ${expected}; money/odds scale may be wrong`);
  }

  const kind: BetKind = isSystem ? 'SYSTEM' : legs.length > 1 ? 'COMBINATION' : 'SINGLE';

  return {
    externalBetRef: ref,
    kind,
    oddsRaw: odds?.raw ?? null,
    odds: odds?.decimal ?? null,
    stakeMinor: stake,
    potentialPayoutMinor: potential,
    potentialPayoutDerived,
    payoutMinor: kambiMoneyToMinor(bet.payout, currency),
    status: normalizeKambiStatus(bet.betStatus),
    rawStatus: bet.betStatus ?? null,
    legs,
  };
}

function toIso(v: string | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function sumOrNull(values: Array<number | null>): number | null {
  if (values.length === 0 || values.some((v) => v === null)) return null;
  return (values as number[]).reduce((a, b) => a + b, 0);
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
