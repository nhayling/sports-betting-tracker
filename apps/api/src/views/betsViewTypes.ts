import type { FightResult, GameSituation } from '@sports-better/sports-data';

/**
 * Response shape of GET /api/bets, shared with the web app (type-only).
 * Money in cents; odds as raw Kambi ×1000 integers; times ISO UTC.
 * Formatting (American odds, Nassau time) is the client's job.
 */

export interface BetsView {
  generatedAt: string;
  /** Newest time Island Luck data was seen (the page loaded history), even if nothing changed. */
  lastSyncedAt: string | null;
  /**
   * Set on someone else's bets when they don't share amounts with you. Every
   * money figure is then what the bet pays at this stake (the sportsbook's
   * minimum bet), not what they staked or stand to win.
   */
  minBetMinor?: number;
  /** Games under way in this person's open bets, whichever list was asked for. */
  liveGames: number;
  coupons: CouponView[];
}

export interface CouponView {
  id: string;
  externalCouponRef: string;
  placedAt: string | null;
  /** Official Island Luck/Kambi status. */
  status: string;
  rewardType: string | null;
  currency: string;
  kind: string | null;
  oddsRaw: number | null;
  stakeMinor: number | null;
  potentialPayoutMinor: number | null;
  /** True when Kambi zeroed it (lost/cashed out) and it was recomputed from stake × odds. */
  potentialPayoutDerived: boolean;
  payoutMinor: number | null;
  pickCount: number;
  /**
   * Picks in this bet that have hit: settled WON by Island Luck, at target by
   * live stats, or a moneyline or spread whose team won or covered at the final whistle.
   * Out of pickCount.
   */
  picksHit: number;
  lastSyncedAt: string;
  /**
   * Still OPEN at Island Luck, but every game looks finished: a nudge to
   * open My Bets and sync. Never changes the official status.
   */
  probablySettled: 'ALL_GAMES_FINAL' | 'ALL_GAMES_LONG_OVER' | null;
  games: GameView[];
}

export interface GameView {
  eventId: string | null;
  name: string | null;
  /** Kambi's sport id ("AMERICAN_FOOTBALL", "FOOTBALL" for soccer). */
  sport: string | null;
  league: string | null;
  startAt: string | null;
  homeName: string | null;
  awayName: string | null;
  state: GameStateView | null;
  picks: PickView[];
}

export interface GameStateView {
  state: string;
  period: number | null;
  clock: string | null;
  detail: string | null;
  homeScore: number | null;
  awayScore: number | null;
  /** A fighter, for UFC. */
  home: { id: string; abbreviation: string | null; displayName?: string | null };
  away: { id: string; abbreviation: string | null; displayName?: string | null };
  situation: GameSituation | null;
  /** UFC: how the bout went. Null for every other sport. */
  fight: FightResult | null;
  updatedAt: string;
}

export interface PickView {
  id: string;
  participantName: string | null;
  marketName: string | null;
  selectionLabel: string | null;
  selectionSide: string | null;
  line: number | null;
  /** Official Kambi status for this pick. */
  status: string;
  /** Picks in the same same-game bet builder share a group. */
  betBuilderGroup: number | null;
  /** Odds at placement of this pick's row; a bet builder's picks share the group's one price. */
  oddsRaw: number | null;
  type: 'STAT' | 'MONEYLINE' | 'SPREAD' | 'TOTAL' | 'TEAM_TOTAL' | 'RESULT' | 'BTTS' | 'FIGHT' | 'OTHER';
  display: 'PROGRESS' | 'BINARY' | null;
  /** Moneyline, spread, three-way result or team total: which side of the game the pick is on (spreads add `line`, the picked side's). */
  moneylineSide: 'home' | 'away' | 'draw' | null;
  /** UFC: the pick graded from the result (1 won, -1 lost, 0 void), once the fight is over and ESPN says enough. */
  fightGrade: 1 | -1 | 0 | null;
  progress: ProgressView | null;
}

export interface ProgressView {
  status: string;
  metric: string | null;
  operator: string | null;
  target: number | null;
  current: number | null;
  unavailableReason: string | null;
  updatedAt: string;
}
