/**
 * Response of GET /api/analysis, shared with the web app (type-only).
 * Money in cents. Rates are 0..1. Only Island Luck's official results count
 * toward records; live stats are used only where noted (near misses, cash-out check).
 */

/** Below this many picks a rate is flagged as early / not yet meaningful. */
export const MIN_SAMPLE = 30;

export interface Analysis {
  generatedAt: string;
  money: MoneyStats;
  /** Conservative "funding" bets vs long-shot "fun" bets, split by payout. */
  styles: StyleSplit;
  parlaySize: ParlaySizeStats;
  markets: MarketStats[];
  howClose: HowCloseStats;
  players: RecordRow[];
  teams: RecordRow[];
  cashOuts: CashOutCheck[];
}

export interface MoneyStats {
  settledBets: number;
  /** Everything staked on settled bets, free bets included. */
  stakedMinor: number;
  /** Your own money only (free-bet stakes excluded). */
  realStakedMinor: number;
  returnedMinor: number;
  /** returned − real money staked. */
  netMinor: number;
  /** net / real money staked; null when nothing staked. */
  roi: number | null;
  openBets: number;
  openRealStakedMinor: number;
  weeks: WeekRow[];
  promos: PromoRow[];
}

/** Default cutoff: bets paying under 20× the stake count as funding. */
export const DEFAULT_FUNDING_MAX_ODDS = 20;

export interface StyleSplit {
  /** Decimal odds: a bet is Funding when its odds are below this. */
  fundingMaxOdds: number;
  funding: StyleStats;
  fun: StyleStats;
}

export interface StyleStats {
  bets: number;
  settled: number;
  won: number;
  lost: number;
  /** Settled by cashing out: neither a win nor a loss. */
  cashedOut: number;
  open: number;
  realStakedMinor: number;
  returnedMinor: number;
  /** Settled bets only: returned − your money staked. */
  netMinor: number;
  winRate: number | null;
}

export interface WeekRow {
  /** Monday of the week, YYYY-MM-DD (Nassau time). */
  weekOf: string;
  bets: number;
  settled: number;
  realStakedMinor: number;
  returnedMinor: number;
  /** Settled bets only. */
  netMinor: number;
}

export interface PromoRow {
  /** FREE_BET, INSURANCE, SECOND_CHANCE, or NONE. */
  rewardType: string;
  bets: number;
  settled: number;
  won: number;
  stakedMinor: number;
  returnedMinor: number;
}

export interface ParlaySizeStats {
  /** Your hit rate across all officially settled picks. */
  pickHitRate: number | null;
  settledPicks: number;
  buckets: ParlayBucket[];
}

export interface ParlayBucket {
  label: string;
  minPicks: number;
  maxPicks: number | null;
  bets: number;
  won: number;
  /** Average chance every pick hits at your hit rate (pickHitRate ^ picks). */
  chanceAtYourRate: number | null;
  /** Average chance Island Luck's odds implied (1 / decimal odds). */
  chanceByOdds: number | null;
}

export interface MarketStats {
  market: string;
  picks: number;
  won: number;
  hitRate: number | null;
  early: boolean;
  /** Single picks only (Island Luck prices each one); bet builder picks share one price. */
  pricedPicks: number;
  pricedHitRate: number | null;
  /** Average probability implied by the odds on those single picks. */
  impliedRate: number | null;
}

export interface HowCloseStats {
  lostBets: number;
  /** Lost bets by number of picks that missed (key "6" means 6 or more). */
  missedDistribution: Array<{ missed: string; bets: number }>;
  lostByOne: number;
  /** Yardage/reception picks that finished short, from live stats (tracked since the poller started). */
  nearMisses: NearMiss[];
}

export interface NearMiss {
  participantName: string;
  market: string;
  current: number;
  needed: number;
  shortBy: number;
  unit: string;
  eventName: string | null;
  /** How many of your bets had this exact pick. */
  bets: number;
}

export interface RecordRow {
  name: string;
  picks: number;
  won: number;
  lost: number;
  open: number;
}

export interface CashOutCheck {
  couponId: string;
  placedAt: string | null;
  oddsRaw: number | null;
  cashedOutMinor: number | null;
  potentialPayoutMinor: number | null;
  picks: number;
  /** From final scores / final stats; Island Luck stops settling picks after a cash out. */
  verdict: 'WOULD_HAVE_WON' | 'WOULD_HAVE_LOST' | 'PENDING';
  picksWon: number;
  picksLost: number;
  picksUnknown: number;
}
