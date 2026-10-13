/**
 * Shape of Kambi's coupon/history.json as returned to Island Luck, verified
 * against a real capture (fixtures/captured/). Only fields we rely on are
 * typed; everything else is preserved via the raw payload.
 *
 * Scales: money, odds and lines are all × 1000 (stake 5000 → $5.00, odds 1410 → 1.41).
 */

export interface RawHistoryResponse {
  range?: { start?: number; size?: number; more?: boolean };
  coupons?: RawCoupon[];
  /** Same coupon shape under a different key; Island Luck returns both. */
  historyCoupons?: RawCoupon[];
  [key: string]: unknown;
}

export interface RawCoupon {
  couponRef: number;
  couponExternalRef?: string;
  placedDate?: string;
  currency?: string;
  channel?: string;
  /** Promotion attached to the coupon: FREE_BET, INSURANCE, SECOND_CHANCE. */
  rewardType?: string;
  tags?: string[];
  bets?: RawBet[];
  couponRows?: RawCouponRow[];
  outcomes?: RawOutcome[];
  events?: RawEvent[];
  betOffers?: RawBetOffer[];
  systemBets?: unknown[];
  [key: string]: unknown;
}

export interface RawBet {
  betRef: number;
  stake?: number;
  /** Odds at placement. Present on every bet, settled or not. */
  playedOdds?: number;
  /** Current odds; 0 once the bet is lost. */
  betOdds?: number;
  /** 0 once the bet is lost. */
  potentialPayout?: number;
  payout?: number;
  betStatus?: string;
  couponRowIndexes?: number[];
  tags?: string[];
  [key: string]: unknown;
}

export interface RawOutcomeGroup {
  operation?: string;
  outcomeIds?: number[];
  groups?: RawOutcomeGroup[];
}

export interface RawCouponRow {
  index: number;
  selectionType?: string;
  /** SIMPLE rows. */
  outcomeId?: number;
  /** BET_BUILDER rows. */
  outcomeGroup?: RawOutcomeGroup;
  playedOdds?: number;
  /** 0 when the row lost. */
  payoutOdds?: number;
  status?: string;
  /** Contains "LIVE" when placed in-play. */
  tags?: string[];
  [key: string]: unknown;
}

export interface RawOutcome {
  outcomeId: number;
  betOfferId?: number;
  eventId?: number;
  /** e.g. "Derrick Henry - Yes", "Drake London - Over 5.5", "TB Buccaneers". */
  label?: string;
  participantId?: number;
  line?: number;
  status?: string;
  settledInfo?: { result?: { correct?: string[]; score?: string; scratched?: string[] } };
  [key: string]: unknown;
}

export interface RawBetOffer {
  betOfferId: number;
  /** Market name, e.g. "80+ Rushing Yards By The Player - Including Overtime". */
  criterion?: string;
  boType?: string;
  boTypeId?: number;
  line?: number;
  [key: string]: unknown;
}

export interface RawEvent {
  eventId: number;
  eventName?: string;
  homeName?: string;
  awayName?: string;
  eventStartDate?: string;
  sport?: string;
  /** Path from sport to league, e.g. [Football, NFL]. */
  eventGroups?: Array<{ id?: number; name?: string }>;
  [key: string]: unknown;
}

/** Flattens a bet builder outcome group into its outcome ids, in order. */
export function outcomeIdsOfGroup(group: RawOutcomeGroup | undefined): number[] {
  if (!group) return [];
  return [...(group.outcomeIds ?? []), ...(group.groups ?? []).flatMap(outcomeIdsOfGroup)];
}

/** Coupons from either response variant. */
export function couponsOf(res: RawHistoryResponse): RawCoupon[] {
  return res.coupons ?? res.historyCoupons ?? [];
}
