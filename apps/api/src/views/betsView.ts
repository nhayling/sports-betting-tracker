import type { Prisma } from '@prisma/client';
import { addDays, gameMargin, nassauMidnight, TOTAL_TYPES } from '@sports-better/display';
import { classifyMarket, fightPick, gameMarket, gradeFight, spreadPick, teamTotalTeam, type GameMarket } from '@sports-better/markets';
import { sameTeams, sportForLeague, stripRanking, teamMatches } from '@sports-better/matching';
import type { FightResult, GameSituation, ProviderTeam, Sport } from '@sports-better/sports-data';
import type { BetsView, CouponView, GameStateView, GameView } from './betsViewTypes';

export type * from './betsViewTypes';
import type { Db } from '../db';

/**
 * The tracker UI's view of bets: each coupon with its picks grouped by game,
 * Kambi's official status alongside (never replaced by) live progress, and
 * the latest game state. Types live in betsViewTypes.ts.
 */

const include = {
  bets: { orderBy: { externalBetRef: 'asc' }, include: { legs: { select: { betLegId: true } } } },
  legs: {
    orderBy: { externalRowIndex: 'asc' },
    include: { selections: { omit: { rawOutcome: true, rawBetOffer: true }, include: { progress: true } } },
  },
} satisfies Prisma.CouponInclude;

type CouponRow = Prisma.CouponGetPayload<{ include: typeof include; omit: { rawPayload: true } }>;

/** `from` and `to` are Nassau days (YYYY-MM-DD), both included, matched against when the bet was placed. */
export async function loadBetsView(db: Db, filter: { userId: string; view: 'open' | 'settled' | 'all'; limit: number; from?: string; to?: string }): Promise<BetsView> {
  const mine = { sportsbookAccount: { userId: filter.userId } } satisfies Prisma.CouponWhereInput;
  // Filtered by bet, not coupon: one checkout can hold a settled single next to an open one.
  const inView = (status: string) => filter.view === 'all' || (filter.view === 'open') === (status === 'OPEN');
  const where: Prisma.CouponWhereInput = {
    ...mine,
    ...(filter.view === 'open' ? { bets: { some: { status: 'OPEN' } } } : filter.view === 'settled' ? { bets: { some: { status: { not: 'OPEN' } } } } : {}),
    ...(filter.from || filter.to
      ? { placedAt: { ...(filter.from ? { gte: nassauMidnight(filter.from) } : {}), ...(filter.to ? { lt: nassauMidnight(addDays(filter.to, 1)) } : {}) } }
      : {}),
  };
  const coupons = await db.coupon.findMany({
    where,
    orderBy: { placedAt: 'desc' },
    take: filter.limit,
    omit: { rawPayload: true },
    include,
  });

  const eventIds = coupons.flatMap((c) => c.legs.map((l) => l.eventId)).filter((e): e is string => !!e);
  const stateByKambiEvent = await loadEventStates(db, eventIds);

  // "Last synced" = newest time Island Luck data was seen, including syncs with no changes.
  // Older accounts without it fall back to the newest coupon capture.
  const lastSync = await db.sportsbookAccount.aggregate({ where: { userId: filter.userId }, _max: { lastCapturedAt: true } });
  const lastSyncedAt = lastSync._max.lastCapturedAt ?? (await db.coupon.aggregate({ where: mine, _max: { capturedAt: true } }))._max.capturedAt;
  const now = new Date();
  return {
    generatedAt: now.toISOString(),
    lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
    liveGames: await countLiveGames(db, filter.userId),
    coupons: coupons.flatMap((c) => betsOfCoupon(c).filter((b) => inView(b.status)).map((b) => couponView(c, b, stateByKambiEvent, now))),
  };
}

/** A bet as the app shows and counts it: one of the bets on a coupon, with its own legs and money. */
export interface CouponBet<L> {
  /** The coupon's id when it holds one bet, else the bet's. */
  id: string;
  status: string;
  kind: string | null;
  oddsRaw: number | null;
  stakeMinor: number | null;
  potentialPayoutMinor: number | null;
  potentialPayoutDerived: boolean;
  payoutMinor: number | null;
  legs: L[];
}

type BetRow = {
  id: string;
  kind: string;
  oddsRaw: number | null;
  stakeMinor: number | null;
  potentialPayoutMinor: number | null;
  potentialPayoutDerived: boolean;
  payoutMinor: number | null;
  status: string;
  legs: { betLegId: string }[];
};

/**
 * Island Luck lets you put several bets on one ticket and check out once; Kambi
 * sends that as one coupon holding several bets, each naming its own rows. A
 * parlay is one bet over several rows, so each bet is its own card and its own
 * record. A one-bet coupon keeps the coupon's id, so earlier links and
 * notifications still find it. A system coupon stays whole: its bets overlap.
 */
export function betsOfCoupon<L extends { id: string }>(c: {
  id: string;
  status: string;
  totalStakeMinor: number | null;
  potentialPayoutMinor: number | null;
  actualPayoutMinor: number | null;
  bets: BetRow[];
  legs: L[];
}): CouponBet<L>[] {
  if (c.bets.length <= 1 || c.bets.some((b) => b.kind === 'SYSTEM')) {
    const only = c.bets.length === 1 ? c.bets[0]! : null;
    return [
      {
        id: c.id,
        status: c.status,
        kind: only?.kind ?? c.bets[0]?.kind ?? null,
        oddsRaw: only?.oddsRaw ?? null,
        stakeMinor: c.totalStakeMinor,
        potentialPayoutMinor: c.potentialPayoutMinor,
        potentialPayoutDerived: c.bets.some((b) => b.potentialPayoutDerived),
        payoutMinor: c.actualPayoutMinor,
        legs: c.legs,
      },
    ];
  }
  return c.bets.map((b) => {
    const ids = new Set(b.legs.map((l) => l.betLegId));
    return {
      id: b.id,
      status: b.status,
      kind: b.kind,
      oddsRaw: b.oddsRaw,
      stakeMinor: b.stakeMinor,
      potentialPayoutMinor: b.potentialPayoutMinor,
      potentialPayoutDerived: b.potentialPayoutDerived,
      payoutMinor: b.payoutMinor,
      legs: c.legs.filter((l) => ids.has(l.id)),
    };
  });
}

/** Games under way in a person's open bets. By bet, so a settled single on a ticket with an open one doesn't count. */
async function countLiveGames(db: Db, userId: string): Promise<number> {
  const legs = await db.betLeg.findMany({
    where: { eventId: { not: null }, coupon: { sportsbookAccount: { userId } }, bets: { some: { bet: { status: 'OPEN' } } } },
    select: { eventId: true, homeName: true, awayName: true },
  });
  const states = await loadEventStates(db, legs.map((l) => l.eventId!));
  return new Set(legs.filter((l) => stateForLeg(states, l)?.state === 'LIVE').map((l) => l.eventId)).size;
}

/** Island Luck's minimum bet, in cents. It's the only sportsbook so far; with a second one this becomes per provider. */
export const MIN_BET_MINOR = 500;

/**
 * A person's bets as a friend or follower sees them: without the owner-only
 * parts (Island Luck's reference, the nudge to sync). Unless the owner shares
 * amounts with that viewer, every dollar figure is restated at the minimum
 * bet, so the viewer sees what the bet is worth without learning the stake.
 */
export function asSeenByOthers(view: BetsView, showAmounts: boolean): BetsView {
  return {
    ...view,
    ...(showAmounts ? {} : { minBetMinor: MIN_BET_MINOR }),
    coupons: view.coupons.map((c) => ({ ...c, externalCouponRef: '', probablySettled: null, ...(showAmounts ? {} : atMinimumBet(c)) })),
  };
}

/**
 * The bet's money at the minimum stake. Scales what the bet really pays per
 * dollar staked (so free bets, boosts and system bets come out right), which
 * is a ratio and so the same whatever was staked; falls back to the odds.
 */
function atMinimumBet(c: CouponView): Pick<CouponView, 'stakeMinor' | 'potentialPayoutMinor' | 'payoutMinor'> {
  const scaled = (minor: number | null) => (c.stakeMinor && minor !== null ? Math.round((MIN_BET_MINOR * minor) / c.stakeMinor) : null);
  return {
    stakeMinor: MIN_BET_MINOR,
    potentialPayoutMinor: scaled(c.potentialPayoutMinor) ?? (c.oddsRaw ? Math.round((MIN_BET_MINOR * c.oddsRaw) / 1000) : null),
    payoutMinor: c.status === 'OPEN' ? null : scaled(c.payoutMinor),
  };
}

type GamePick = { type: string; moneylineSide: 'home' | 'away' | 'draw' | null; line: number | null; selectionSide: string | null; fightGrade: 1 | -1 | 0 | null };

/**
 * A pick counts as hit once Island Luck settles it WON, live stats reach its target, (moneyline, spread, result)
 * its side wins or covers, (total, both teams to score) the score gets there, or (UFC) the result says so.
 */
function pickHit(status: string, progress: { status: string } | null, game: GamePick | null, state: GameStateView | null): boolean {
  if (status === 'WON') return true;
  if (status !== 'OPEN') return false;
  if (progress?.status === 'TARGET_REACHED' || progress?.status === 'FINAL_HIT') return true;
  if (game && state && (game.type === 'FIGHT' || (state.homeScore !== null && state.awayScore !== null))) {
    // Final for every game market; an over past its line, or both teams having scored, has also hit mid-game.
    const early = state.state === 'LIVE' && ((TOTAL_TYPES.has(game.type) && game.selectionSide === 'OVER') || (game.type === 'BTTS' && game.selectionSide === 'YES'));
    if (state.state === 'FINAL' || early) return (gameMargin(game, state) ?? 0) > 0;
  }
  return false;
}

/** Three-way and fight picks are labelled by position ("1", "X", "2"); this names them after their side. */
function sideName(label: string | null, leg: { homeName: string | null; awayName: string | null }): string | null {
  const l = label?.trim() ?? '';
  if (l === '1') return leg.homeName;
  if (l === '2') return leg.awayName;
  if (/^(x|draw|tie)$/i.test(l)) return 'Draw';
  return label;
}

export type StateRow = Awaited<ReturnType<Db['providerEventState']['findMany']>>[number];

/** Latest provider game state for each Kambi event id that has a confirmed mapping. */
export async function loadEventStates(db: Db, kambiEventIds: string[]): Promise<Map<string, StateRow>> {
  const ids = [...new Set(kambiEventIds)];
  if (ids.length === 0) return new Map();
  const mappings = await db.externalEventMapping.findMany({
    where: { sportsbookEventId: { in: ids }, status: { in: ['AUTO', 'CONFIRMED'] } },
  });
  if (mappings.length === 0) return new Map();
  const states = await db.providerEventState.findMany({
    where: { OR: mappings.map((m) => ({ provider: m.provider, providerEventId: m.providerEventId })) },
  });
  return new Map(
    mappings.flatMap((m) => {
      const st = states.find((s) => s.provider === m.provider && s.providerEventId === m.providerEventId);
      return st ? [[m.sportsbookEventId, st] as const] : [];
    }),
  );
}

/**
 * A leg's game state, only when that game has the leg's own teams. The link from a Kambi event
 * to a game is shared by everyone betting on it, and a synced coupon's teams are whatever its
 * sender wrote, so one ticket can't put another game's score on someone else's.
 */
export function stateForLeg(
  states: Map<string, StateRow>,
  leg: { eventId: string | null; homeName: string | null; awayName: string | null },
): StateRow | undefined {
  const st = leg.eventId ? states.get(leg.eventId) : undefined;
  return st && sameTeams(st.sport as Sport, leg.homeName ?? '', leg.awayName ?? '', st.homeTeam as unknown as ProviderTeam, st.awayTeam as unknown as ProviderTeam) ? st : undefined;
}

/** Which side of the game a moneyline, spread or fight pick ("KC Chiefs", "LV Raiders +5.0", "Kody Steele") is on, or null if unclear. */
export function moneylineSideOf(
  league: string | null,
  participantName: string | null,
  home: ProviderTeam,
  away: ProviderTeam,
): 'home' | 'away' | null {
  const sport = sportForLeague(league);
  const team = spreadPick(participantName, null).team;
  if (!sport || !team) return null;
  const h = teamMatches(sport, team, home);
  const a = teamMatches(sport, team, away);
  return h && !a ? 'home' : a && !h ? 'away' : null;
}

function couponView(c: CouponRow, bet: CouponBet<CouponRow['legs'][number]>, states: Map<string, StateRow>, now: Date): CouponView {
  const games: GameView[] = [];
  let picksHit = 0;

  for (const leg of bet.legs) {
    const key = leg.eventId ?? `row-${leg.externalRowIndex}`;
    let game = games.find((g) => (g.eventId ?? `row-${leg.externalRowIndex}`) === key);
    if (!game) {
      const st = stateForLeg(states, leg);
      game = {
        eventId: leg.eventId,
        name: leg.eventName,
        sport: leg.sport,
        league: leg.league,
        startAt: leg.eventStartAt?.toISOString() ?? null,
        homeName: leg.homeName,
        awayName: leg.awayName,
        state: st ? stateView(st) : null,
        picks: [],
      };
      games.push(game);
    }

    for (const s of leg.selections) {
      const ml: GameMarket | null = gameMarket(s.marketName);
      const cls = ml ? null : classifyMarket({ sport: leg.sport, marketName: s.marketName, selectionSide: s.selectionSide, line: s.lineRaw === null ? null : s.lineRaw / 1000 });
      // A saved "unsupported" reason is stale once the market becomes supported
      // (the poller only revisits it near kickoff).
      const p =
        s.progress?.status === 'UNAVAILABLE' && s.progress.unavailableReason?.startsWith('UNSUPPORTED') && cls?.supported ? null : s.progress;
      const st = game.state;
      // Game picks are named after their side; a team or fighter stands in for Kambi's "1"/"2".
      const name = ml ? sideName(s.participantName ?? s.selectionLabel, leg) : s.participantName;
      const sideOf = (n: string | null) => (st ? moneylineSideOf(leg.league, n, st.home as ProviderTeam, st.away as ProviderTeam) : null);
      // A team total's side is the team in its market name; its pick is just "Over 30.5".
      const pickSide =
        ml === 'RESULT' && name === 'Draw' ? 'draw' : ml === 'TEAM_TOTAL' ? sideOf(teamTotalTeam(s.marketName)) : ml && ml !== 'TOTAL' && ml !== 'BTTS' ? sideOf(name) : null;
      const moneylineSide = pickSide ?? null;
      const outcomeLine = s.lineRaw === null ? null : s.lineRaw / 1000;
      const line = ml === 'SPREAD' ? spreadPick(s.participantName ?? s.selectionLabel, outcomeLine).line : outcomeLine;
      const type = ml ?? (cls?.supported ? 'STAT' : 'OTHER');
      const fight = ml === 'FIGHT' ? fightPick(s.marketName, name, s.selectionSide, outcomeLine) : null;
      const fightGrade = fight && st?.state === 'FINAL' && st.fight ? gradeFight(fight, st.fight, (n) => sideOf(n)) : null;
      if (pickHit(s.status, cls?.supported ? p : null, ml ? { type, moneylineSide, line, selectionSide: s.selectionSide, fightGrade } : null, st)) picksHit++;
      // Shown as the pick's name: a fighter named in the market ("Kody Steele to win by Decision"); nothing for
      // fight-wide picks, which show the bout. Both teams to score has no participant at all.
      const fighter = fight && 'fighter' in fight ? fight.fighter : null;
      const shownName = ml === 'BTTS' ? 'Both teams to score' : ml === 'FIGHT' ? (fighter ? stripRanking(fighter) : null) : name;
      game.picks.push({
        id: s.id,
        participantName: shownName,
        marketName: s.marketName,
        selectionLabel: s.selectionLabel,
        selectionSide: s.selectionSide,
        line,
        status: s.status,
        betBuilderGroup: leg.selectionType === 'BET_BUILDER' ? leg.externalRowIndex : null,
        oddsRaw: leg.oddsRaw,
        type,
        display: cls?.supported ? cls.display : null,
        moneylineSide,
        fightGrade,
        progress: p
          ? {
              status: p.status,
              metric: p.metric,
              operator: p.operator,
              target: p.target,
              current: p.currentValue,
              unavailableReason: p.unavailableReason,
              updatedAt: p.updatedAt.toISOString(),
            }
          : null,
      });
    }
  }

  return {
    id: bet.id,
    externalCouponRef: c.externalCouponRef,
    placedAt: c.placedAt?.toISOString() ?? null,
    status: bet.status,
    rewardType: c.rewardType,
    currency: c.currency,
    kind: bet.kind,
    oddsRaw: bet.oddsRaw,
    stakeMinor: bet.stakeMinor,
    potentialPayoutMinor: bet.potentialPayoutMinor,
    potentialPayoutDerived: bet.potentialPayoutDerived,
    payoutMinor: bet.payoutMinor,
    pickCount: bet.legs.reduce((n, l) => n + l.selections.length, 0),
    picksHit,
    lastSyncedAt: c.lastSyncedAt.toISOString(),
    probablySettled: bet.status === 'OPEN' ? probablySettled(games, now) : null,
    games,
  };
}

/** Games with no live data count as over this long after kickoff. */
const LONG_OVER_MS = 5 * 60 * 60_000;

export function probablySettled(
  games: Pick<GameView, 'startAt' | 'state'>[],
  now: Date,
): CouponView['probablySettled'] {
  if (games.length === 0) return null;
  const over = games.map((g) => {
    if (g.state?.state === 'FINAL') return 'FINAL' as const;
    if (g.state && g.state.state !== 'UNKNOWN') return null; // scheduled or live
    return g.startAt && now.getTime() - Date.parse(g.startAt) > LONG_OVER_MS ? ('LONG_OVER' as const) : null;
  });
  if (over.some((o) => o === null)) return null;
  return over.every((o) => o === 'FINAL') ? 'ALL_GAMES_FINAL' : 'ALL_GAMES_LONG_OVER';
}

function stateView(st: StateRow): GameStateView {
  const home = st.homeTeam as unknown as ProviderTeam;
  const away = st.awayTeam as unknown as ProviderTeam;
  return {
    state: st.state,
    period: st.period,
    clock: st.clock,
    detail: st.detail,
    homeScore: st.homeScore,
    awayScore: st.awayScore,
    home: { ...home, abbreviation: home.abbreviation },
    away: { ...away, abbreviation: away.abbreviation },
    situation: (st.situation as unknown as GameSituation | null) ?? null,
    fight: (st.result as unknown as FightResult | null) ?? null,
    updatedAt: st.updatedAt.toISOString(),
  };
}
