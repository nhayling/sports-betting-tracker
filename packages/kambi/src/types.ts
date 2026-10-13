import type { SettlementStatus } from './status';
import type { RawBetOffer, RawCoupon, RawOutcome } from './raw';

/**
 * Normalized sportsbook data. This is the sync contract between the Kambi
 * parser and the tracker's UPSERT logic, and it deliberately contains nothing
 * about live stats or prop metrics — that belongs to the tracker.
 *
 * Money is integer minor units; odds/lines keep the raw Kambi integer.
 */

export type SelectionType = 'SIMPLE' | 'BET_BUILDER';
export type BetKind = 'SINGLE' | 'COMBINATION' | 'SYSTEM';
/** The side taken, read from the Kambi outcome label ("… - Yes", "… - Over 5.5"). */
export type SelectionSide = 'YES' | 'NO' | 'OVER' | 'UNDER';

export interface ParsedSelection {
  externalOutcomeId: string;
  externalBetOfferId: string | null;
  externalParticipantId: string | null;
  /** From the label; Kambi sends no separate name field. */
  participantName: string | null;
  /** Kambi criterion, e.g. "80+ Rushing Yards By The Player - Including Overtime". */
  marketName: string | null;
  /** Kambi bet offer type, e.g. "Player Occurrence Line", "Match". */
  marketType: string | null;
  marketTypeId: number | null;
  selectionLabel: string | null;
  selectionSide: SelectionSide | null;
  lineRaw: number | null;
  line: number | null;
  status: SettlementStatus;
  rawStatus: string | null;
  /** Kambi's settled result, e.g. ["Yes"], ["Over"], ["2"]. */
  settledResult: string[] | null;
  rawOutcome: RawOutcome | null;
  rawBetOffer: RawBetOffer | null;
}

export interface ParsedLeg {
  externalRowIndex: number;
  selectionType: SelectionType;
  eventId: string | null;
  eventName: string | null;
  homeName: string | null;
  awayName: string | null;
  sport: string | null;
  league: string | null;
  eventStartAt: string | null;
  oddsRaw: number | null;
  odds: number | null;
  /** Row odds used for payout; 0 when the row lost. */
  payoutOddsRaw: number | null;
  placedLive: boolean;
  status: SettlementStatus;
  rawStatus: string | null;
  selections: ParsedSelection[];
}

export interface ParsedBet {
  externalBetRef: string;
  kind: BetKind;
  /** Odds at placement (Kambi playedOdds). */
  oddsRaw: number | null;
  odds: number | null;
  stakeMinor: number | null;
  potentialPayoutMinor: number | null;
  /**
   * Kambi zeroes potentialPayout once a bet loses. In that case it is
   * recomputed from stake × played odds and this flag is set.
   */
  potentialPayoutDerived: boolean;
  payoutMinor: number | null;
  status: SettlementStatus;
  rawStatus: string | null;
  legs: ParsedLeg[];
}

export interface ParsedCoupon {
  externalCouponRef: string;
  externalCouponUuid: string | null;
  placedAt: string | null;
  currency: string;
  channel: string | null;
  /** FREE_BET, INSURANCE, SECOND_CHANCE; matters for profit/loss. */
  rewardType: string | null;
  status: SettlementStatus;
  totalStakeMinor: number | null;
  potentialPayoutMinor: number | null;
  actualPayoutMinor: number | null;
  bets: ParsedBet[];
  /** Non-fatal issues found while parsing. Never silently dropped. */
  warnings: string[];
  raw: RawCoupon;
}
