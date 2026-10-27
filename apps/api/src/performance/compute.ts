import { gameMargin } from '@sports-better/display';
import { classifyMarket, gameMarket, spreadPick, type GameMarket } from '@sports-better/markets';
import type { StatKey } from '@sports-better/sports-data';
import { DEFAULT_FUNDING_MAX_ODDS, MIN_SAMPLE, type Performance, type StyleStats, type CashOutCheck, type MarketStats, type NearMiss, type ParlayBucket, type RecordRow, type SportCount, type WeekRow } from './types';

/**
 * Plain input so the performance can be tested without a database. Built by
 * load.ts from coupons, their legs/selections/progress and final game states.
 */
export interface PerformanceCoupon {
  id: string;
  status: string;
  rewardType: string | null;
  placedAt: Date | null;
  stakeMinor: number;
  payoutMinor: number;
  potentialPayoutMinor: number | null;
  oddsRaw: number | null;
  legs: PerformanceLeg[];
}

export interface PerformanceLeg {
  selectionType: string;
  oddsRaw: number | null;
  sport: string | null;
  league: string | null;
  eventName: string | null;
  /** Final/live game state, when the tracker has one. */
  game: { state: string; homeScore: number | null; awayScore: number | null } | null;
  /** Which side each moneyline pick is on (computed by the loader). */
  selections: PerformanceSelection[];
}

export interface PerformanceSelection {
  status: string;
  marketName: string | null;
  participantName: string | null;
  participantId: string | null;
  selectionSide: string | null;
  line: number | null;
  moneylineSide: 'home' | 'away' | null;
  progress: { status: string; current: number | null; target: number | null; operator: string | null; metric: string | null } | null;
}

const MARKET_NAMES: Partial<Record<StatKey, string>> = {
  TOUCHDOWNS: 'Anytime TD',
  INTERCEPTIONS_THROWN: 'Interceptions',
  RUSHING_YARDS: 'Rushing yards',
  RECEIVING_YARDS: 'Receiving yards',
  RUSHING_RECEIVING_YARDS: 'Rush + rec yards',
  SACKS: 'Sacks',
  FIELD_GOALS_MADE: 'Field goals (game)',
  RECEPTIONS: 'Receptions',
  PASSING_YARDS: 'Passing yards',
  PASSING_TDS: 'Passing TDs',
  PASS_COMPLETIONS: 'Pass completions',
  PASS_ATTEMPTS: 'Pass attempts',
  POINTS: 'Points',
  REBOUNDS: 'Rebounds',
  ASSISTS: 'Assists',
  STEALS: 'Steals',
  BLOCKS: 'Blocks',
  THREES_MADE: 'Threes',
  POINTS_REBOUNDS: 'Pts + reb',
  POINTS_ASSISTS: 'Pts + ast',
  REBOUNDS_ASSISTS: 'Reb + ast',
  POINTS_REBOUNDS_ASSISTS: 'Pts + reb + ast',
  STEALS_BLOCKS: 'Stl + blk',
  DOUBLE_DOUBLE: 'Double-double',
  TRIPLE_DOUBLE: 'Triple-double',
  HITS: 'Hits',
  RUNS: 'Runs',
  RBIS: 'RBIs',
  HOME_RUNS: 'Home runs',
  HITS_RUNS_RBIS: 'Hits + runs + RBIs',
  PITCHER_STRIKEOUTS: 'Strikeouts (pitcher)',
  OUTS_RECORDED: 'Outs recorded',
  GOALS: 'Goals',
  SHOTS_ON_GOAL: 'Shots on goal',
  CARDS: 'Cards',
  RED_CARDS: 'Red cards',
  CORNERS: 'Corners (game)',
};
const UNITS: Partial<Record<string, string>> = {
  RUSHING_YARDS: 'rush yds',
  RECEIVING_YARDS: 'rec yds',
  RUSHING_RECEIVING_YARDS: 'rush+rec yds',
  PASSING_YARDS: 'pass yds',
  PASS_COMPLETIONS: 'pass comp',
  PASS_ATTEMPTS: 'pass att',
  RECEPTIONS: 'rec',
  FIELD_GOALS_MADE: 'FG',
  POINTS: 'pts',
  REBOUNDS: 'reb',
  ASSISTS: 'ast',
  STEALS: 'stl',
  BLOCKS: 'blk',
  THREES_MADE: 'threes',
  POINTS_REBOUNDS: 'pts+reb',
  POINTS_ASSISTS: 'pts+ast',
  REBOUNDS_ASSISTS: 'reb+ast',
  POINTS_REBOUNDS_ASSISTS: 'pts+reb+ast',
  STEALS_BLOCKS: 'stl+blk',
  HITS: 'hits',
  RUNS: 'runs',
  RBIS: 'RBIs',
  HITS_RUNS_RBIS: 'H+R+RBI',
  PITCHER_STRIKEOUTS: 'K',
  OUTS_RECORDED: 'outs',
  GOALS: 'goals',
  SHOTS_ON_GOAL: 'SOG',
  CORNERS: 'corners',
};

const BUCKETS: Array<[string, number, number | null]> = [
  ['1 pick', 1, 1],
  ['2–3 picks', 2, 3],
  ['4–6 picks', 4, 6],
  ['7–9 picks', 7, 9],
  ['10+ picks', 10, null],
];

const settledPick = (s: PerformanceSelection) => s.status === 'WON' || s.status === 'LOST';
const picksOf = (c: PerformanceCoupon) => c.legs.flatMap((l) => l.selections);
const real = (c: PerformanceCoupon) => (c.rewardType === 'FREE_BET' ? 0 : c.stakeMinor);
const rate = (won: number, n: number) => (n > 0 ? won / n : null);
/** The sports a bet's picks are in. */
const sportsOf = (c: PerformanceCoupon) => new Set(c.legs.flatMap((l) => (l.sport ? [l.sport] : [])));

/** Bets with a pick in `sport`, or with `only`, bets in nothing else; a bet can span sports. */
export function inSport(coupons: PerformanceCoupon[], sport: string, only: boolean): PerformanceCoupon[] {
  return coupons.filter((c) => {
    const in_ = sportsOf(c);
    return in_.has(sport) && (!only || in_.size === 1);
  });
}

/** Every sport in `coupons`, most bets first. */
export function sportCounts(coupons: PerformanceCoupon[]): SportCount[] {
  const counts = new Map<string, SportCount>();
  for (const c of coupons) {
    const in_ = sportsOf(c);
    for (const sport of in_) {
      const n = counts.get(sport) ?? { sport, bets: 0, only: 0 };
      n.bets++;
      if (in_.size === 1) n.only++;
      counts.set(sport, n);
    }
  }
  return [...counts.values()].sort((a, b) => b.bets - a.bets || a.sport.localeCompare(b.sport));
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const GAME_MARKET_NAMES: Record<GameMarket, string> = {
  MONEYLINE: 'Moneyline',
  SPREAD: 'Point spread',
  TOTAL: 'Total points',
  TEAM_TOTAL: 'Team total',
  RESULT: 'Match result',
  BTTS: 'Both teams to score',
  FIGHT: 'UFC',
};

export function marketOf(s: PerformanceSelection, sport: string | null): string {
  const gm = gameMarket(s.marketName);
  if (gm) return GAME_MARKET_NAMES[gm];
  const cls = classifyMarket({ sport, marketName: s.marketName, selectionSide: s.selectionSide as never, line: s.line });
  return cls.supported ? (MARKET_NAMES[cls.metric] ?? 'Other') : 'Other';
}

export function computePerformance(
  coupons: PerformanceCoupon[],
  now = new Date(),
  fundingMaxOdds = DEFAULT_FUNDING_MAX_ODDS,
  /** Count only this sport's picks in the market, player, team and near-miss stats; the bets still count whole. */
  pickSport?: string,
): Performance {
  const settled = coupons.filter((c) => c.status !== 'OPEN');
  const open = coupons.filter((c) => c.status === 'OPEN');

  // ── money ──────────────────────────────────────────────────────
  const staked = settled.reduce((n, c) => n + c.stakeMinor, 0);
  const realStaked = settled.reduce((n, c) => n + real(c), 0);
  const returned = settled.reduce((n, c) => n + c.payoutMinor, 0);

  const weeks = new Map<string, WeekRow>();
  for (const c of coupons) {
    if (!c.placedAt) continue;
    const key = weekOf(c.placedAt);
    const w = weeks.get(key) ?? { weekOf: key, bets: 0, settled: 0, realStakedMinor: 0, returnedMinor: 0, netMinor: 0 };
    w.bets++;
    w.realStakedMinor += real(c);
    if (c.status !== 'OPEN') {
      w.settled++;
      w.returnedMinor += c.payoutMinor;
      w.netMinor += c.payoutMinor - real(c);
    }
    weeks.set(key, w);
  }

  const promos = new Map<string, { rewardType: string; bets: number; settled: number; won: number; stakedMinor: number; returnedMinor: number }>();
  for (const c of coupons) {
    const key = c.rewardType ?? 'NONE';
    const p = promos.get(key) ?? { rewardType: key, bets: 0, settled: 0, won: 0, stakedMinor: 0, returnedMinor: 0 };
    p.bets++;
    p.stakedMinor += c.stakeMinor;
    if (c.status !== 'OPEN') {
      p.settled++;
      p.returnedMinor += c.payoutMinor;
      if (c.status === 'WON') p.won++;
    }
    promos.set(key, p);
  }

  // ── betting style: smaller payouts are the conservative "funding" bets ──
  const styleStats = (list: PerformanceCoupon[]): StyleStats => {
    const done = list.filter((c) => c.status !== 'OPEN');
    const realStakedSettled = done.reduce((n, c) => n + real(c), 0);
    const returnedSettled = done.reduce((n, c) => n + c.payoutMinor, 0);
    const won = done.filter((c) => c.status === 'WON').length;
    return {
      bets: list.length,
      settled: done.length,
      won,
      lost: done.filter((c) => c.status === 'LOST').length,
      cashedOut: done.filter((c) => c.status === 'CASHED_OUT').length,
      open: list.length - done.length,
      realStakedMinor: list.reduce((n, c) => n + real(c), 0),
      returnedMinor: returnedSettled,
      netMinor: returnedSettled - realStakedSettled,
      winRate: rate(won, done.length),
    };
  };
  const isFunding = (c: PerformanceCoupon) => c.oddsRaw !== null && c.oddsRaw <= Math.round(fundingMaxOdds * 1000);

  // ── picks (official Island Luck results, from any bet) ─────────
  const allPicks = coupons.flatMap((c) => c.legs.flatMap((l) => l.selections.map((s) => ({ s, l, c }))));
  const decided = allPicks.filter(({ s }) => settledPick(s));
  const pickHitRate = rate(decided.filter(({ s }) => s.status === 'WON').length, decided.length);
  // A bet with basketball can carry a soccer pick; under Basketball, its soccer pick is no basketball market.
  const sportPicks = pickSport ? allPicks.filter(({ l }) => l.sport === pickSport) : allPicks;

  const buckets: ParlayBucket[] = BUCKETS.map(([label, min, max]) => {
    const inBucket = settled.filter((c) => {
      const n = picksOf(c).length;
      return n >= min && (max === null || n <= max);
    });
    return {
      label,
      minPicks: min,
      maxPicks: max,
      bets: inBucket.length,
      won: inBucket.filter((c) => c.status === 'WON').length,
      chanceAtYourRate: pickHitRate === null ? null : mean(inBucket.map((c) => pickHitRate ** picksOf(c).length)),
      chanceByOdds: mean(inBucket.filter((c) => c.oddsRaw).map((c) => 1000 / c.oddsRaw!)),
    };
  });

  const byMarket = new Map<string, { picks: number; won: number; priced: number; pricedWon: number; implied: number[] }>();
  for (const { s, l } of sportPicks.filter(({ s }) => settledPick(s))) {
    const m = marketOf(s, l.sport);
    const row = byMarket.get(m) ?? { picks: 0, won: 0, priced: 0, pricedWon: 0, implied: [] };
    row.picks++;
    if (s.status === 'WON') row.won++;
    // A single pick has its own price; bet builder picks share one.
    if (l.selectionType === 'SIMPLE' && l.selections.length === 1 && l.oddsRaw) {
      row.priced++;
      if (s.status === 'WON') row.pricedWon++;
      row.implied.push(1000 / l.oddsRaw);
    }
    byMarket.set(m, row);
  }
  const markets: MarketStats[] = [...byMarket]
    .map(([market, r]) => ({
      market,
      picks: r.picks,
      won: r.won,
      hitRate: rate(r.won, r.picks),
      early: r.picks < MIN_SAMPLE,
      pricedPicks: r.priced,
      pricedHitRate: rate(r.pricedWon, r.priced),
      impliedRate: mean(r.implied),
    }))
    .sort((a, b) => b.picks - a.picks);

  // ── how close ──────────────────────────────────────────────────
  const lost = settled.filter((c) => c.status === 'LOST');
  const missedCounts = lost.map((c) => picksOf(c).filter((s) => s.status === 'LOST').length);
  const missedDistribution = ['1', '2', '3', '4', '5', '6'].map((k) => ({
    missed: k,
    bets: missedCounts.filter((n) => (k === '6' ? n >= 6 : n === Number(k))).length,
  }));

  // The same pick can sit in several bets; list each miss once.
  const nearMissByKey = new Map<string, NearMiss>();
  for (const miss of sportPicks.flatMap(({ s, l }) => {
      const p = s.progress;
      if (!p || p.status !== 'FINAL_MISSED' || p.current === null || p.target === null) return [];
      if (p.operator !== 'GTE' && p.operator !== 'GT') return [];
      const unit = UNITS[p.metric ?? ''];
      if (!unit) return []; // yardage/receptions only; a missed TD isn't "short by" anything useful
      const needed = p.operator === 'GT' ? Math.floor(p.target) + 1 : p.target;
      return [
        {
          participantName: s.participantName ?? `Game ${s.selectionSide === 'UNDER' ? 'under' : 'over'} ${s.line ?? ''}`.trim(),
          market: marketOf(s, l.sport),
          current: p.current,
          needed,
          shortBy: needed - p.current,
          unit,
          eventName: l.eventName,
          bets: 1,
        },
      ];
  })) {
    const key = [miss.participantName, miss.market, miss.needed, miss.current, miss.eventName].join('|');
    const seen = nearMissByKey.get(key);
    if (seen) seen.bets++;
    else nearMissByKey.set(key, miss);
  }
  const nearMisses = [...nearMissByKey.values()].sort((a, b) => a.shortBy - b.shortBy);

  // ── players & teams ────────────────────────────────────────────
  const record = (rows: Array<{ key: string; name: string; s: PerformanceSelection }>): RecordRow[] => {
    const m = new Map<string, RecordRow>();
    for (const { key, name, s } of rows) {
      const r = m.get(key) ?? { name, picks: 0, won: 0, lost: 0, open: 0 };
      r.picks++;
      if (s.status === 'WON') r.won++;
      else if (s.status === 'LOST') r.lost++;
      else r.open++;
      m.set(key, r);
    }
    return [...m.values()].sort((a, b) => b.picks - a.picks || b.won - a.won || a.name.localeCompare(b.name));
  };
  const players = record(
    sportPicks
      .filter(({ s }) => !gameMarket(s.marketName) && s.participantName)
      .map(({ s }) => ({ key: s.participantId ?? s.participantName!, name: s.participantName!, s })),
  );
  const teams = record(
    sportPicks
      .filter(({ s }) => gameMarket(s.marketName) && s.participantName)
      // A spread pick's name carries its line ("LV Raiders +5.0"); the team is the same either way.
      .map(({ s }) => ({ key: s.participantId ?? spreadPick(s.participantName, null).team!, name: spreadPick(s.participantName, null).team!, s })),
  );

  // ── cash-out check ─────────────────────────────────────────────
  const cashOuts: CashOutCheck[] = settled
    .filter((c) => c.status === 'CASHED_OUT')
    .map((c) => {
      const results = c.legs.flatMap((l) => l.selections.map((s) => resultAfterCashOut(s, l)));
      const won = results.filter((r) => r === 'WON').length;
      const lostN = results.filter((r) => r === 'LOST').length;
      const unknown = results.length - won - lostN;
      return {
        couponId: c.id,
        placedAt: c.placedAt?.toISOString() ?? null,
        oddsRaw: c.oddsRaw,
        cashedOutMinor: c.payoutMinor,
        potentialPayoutMinor: c.potentialPayoutMinor,
        picks: results.length,
        verdict: lostN > 0 ? 'WOULD_HAVE_LOST' : unknown === 0 ? 'WOULD_HAVE_WON' : 'PENDING',
        picksWon: won,
        picksLost: lostN,
        picksUnknown: unknown,
      };
    });

  return {
    generatedAt: now.toISOString(),
    // The caller narrows the coupons to a period and says which; computed on its own, it is everything given.
    period: 'all',
    sport: null,
    sportOnly: false,
    sports: sportCounts(coupons),
    money: {
      settledBets: settled.length,
      stakedMinor: staked,
      realStakedMinor: realStaked,
      returnedMinor: returned,
      netMinor: returned - realStaked,
      roi: realStaked > 0 ? (returned - realStaked) / realStaked : null,
      openBets: open.length,
      openRealStakedMinor: open.reduce((n, c) => n + real(c), 0),
      weeks: [...weeks.values()].sort((a, b) => a.weekOf.localeCompare(b.weekOf)),
      promos: [...promos.values()].sort((a, b) => b.bets - a.bets),
    },
    styles: {
      fundingMaxOdds,
      funding: styleStats(coupons.filter(isFunding)),
      fun: styleStats(coupons.filter((c) => !isFunding(c))),
    },
    parlaySize: { pickHitRate, settledPicks: decided.length, buckets },
    markets,
    howClose: {
      lostBets: lost.length,
      missedDistribution,
      lostByOne: missedCounts.filter((n) => n === 1).length,
      nearMisses,
    },
    players,
    teams,
    cashOuts,
  };
}

/**
 * Island Luck stops settling picks once a bet is cashed out, so work out what
 * would have happened: its own result if it has one, else the final score
 * (moneylines, spreads, totals) or final live stats (props).
 */
function resultAfterCashOut(s: PerformanceSelection, l: PerformanceLeg): 'WON' | 'LOST' | null {
  if (s.status === 'WON' || s.status === 'LOST') return s.status;
  const gm = gameMarket(s.marketName);
  if (gm) {
    const g = l.game;
    if (!g || g.state !== 'FINAL' || g.homeScore === null || g.awayScore === null) return null;
    const line = gm === 'SPREAD' ? spreadPick(s.participantName, s.line).line : gm === 'TOTAL' || gm === 'TEAM_TOTAL' ? s.line : null;
    const margin = gameMargin({ type: gm, moneylineSide: s.moneylineSide, line, selectionSide: s.selectionSide }, g);
    // A draw beats both teams on a three-way result; anywhere else a tie or push decides nothing.
    if (margin === null || (margin === 0 && gm !== 'RESULT')) return null;
    return margin > 0 ? 'WON' : 'LOST';
  }
  if (s.progress?.status === 'FINAL_HIT') return 'WON';
  if (s.progress?.status === 'FINAL_MISSED') return 'LOST';
  return null;
}

/** Monday (Nassau time) of the week containing `d`, as YYYY-MM-DD. */
export function weekOf(d: Date): string {
  const local = new Date(d.toLocaleString('en-US', { timeZone: 'America/Nassau' }));
  const day = (local.getDay() + 6) % 7; // Mon = 0
  local.setDate(local.getDate() - day);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
}
