import type { Prisma } from '@prisma/client';
import { gameMargin } from '@sports-better/display';
import { classifyMarket, gameMarket, spreadPick } from '@sports-better/markets';
import { sportForLeague, teamMatches } from '@sports-better/matching';
import type { GameSituation, ProviderTeam } from '@sports-better/sports-data';
import type { BetsView, CouponView, GameStateView, GameView } from './betsViewTypes';

export type * from './betsViewTypes';
import type { Db } from '../db';

/**
 * The tracker UI's view of bets: each coupon with its picks grouped by game,
 * Kambi's official status alongside (never replaced by) live progress, and
 * the latest game state. Types live in betsViewTypes.ts.
 */

const include = {
  bets: { orderBy: { externalBetRef: 'asc' } },
  legs: {
    orderBy: { externalRowIndex: 'asc' },
    include: { selections: { omit: { rawOutcome: true, rawBetOffer: true }, include: { progress: true } } },
  },
} satisfies Prisma.CouponInclude;

type CouponRow = Prisma.CouponGetPayload<{ include: typeof include; omit: { rawPayload: true } }>;

export async function loadBetsView(db: Db, filter: { userId: string; view: 'open' | 'settled' | 'all'; limit: number }): Promise<BetsView> {
  const mine = { sportsbookAccount: { userId: filter.userId } } satisfies Prisma.CouponWhereInput;
  const where: Prisma.CouponWhereInput = {
    ...mine,
    ...(filter.view === 'open' ? { status: 'OPEN' } : filter.view === 'settled' ? { status: { not: 'OPEN' } } : {}),
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
    coupons: coupons.map((c) => couponView(c, stateByKambiEvent, now)),
  };
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

/** A pick counts as hit once Island Luck settles it WON, live stats reach its target, (moneyline, spread) its team wins or covers, or (total) it goes over. */
function pickHit(
  status: string,
  progress: { status: string } | null,
  game: { type: string; moneylineSide: 'home' | 'away' | null; line: number | null; selectionSide: string | null } | null,
  state: GameStateView | null,
): boolean {
  if (status === 'WON') return true;
  if (status !== 'OPEN') return false;
  if (progress?.status === 'TARGET_REACHED' || progress?.status === 'FINAL_HIT') return true;
  if (game && state && state.homeScore !== null && state.awayScore !== null) {
    // Final for every game market; an over that has passed its line has also hit mid-game.
    const over = game.type === 'TOTAL' && game.selectionSide === 'OVER' && state.state === 'LIVE';
    if (state.state === 'FINAL' || over) return (gameMargin(game, state) ?? 0) > 0;
  }
  return false;
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

/** Which side of the game a moneyline or spread pick ("KC Chiefs", "LV Raiders +5.0") is on, or null if unclear. */
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

function couponView(c: CouponRow, states: Map<string, StateRow>, now: Date): CouponView {
  const bet = c.bets[0];
  const games: GameView[] = [];
  let picksHit = 0;

  for (const leg of c.legs) {
    const key = leg.eventId ?? `row-${leg.externalRowIndex}`;
    let game = games.find((g) => (g.eventId ?? `row-${leg.externalRowIndex}`) === key);
    if (!game) {
      const st = leg.eventId ? states.get(leg.eventId) : undefined;
      game = {
        eventId: leg.eventId,
        name: leg.eventName,
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
      const ml = gameMarket(s.marketName);
      const cls = ml ? null : classifyMarket({ sport: leg.sport, marketName: s.marketName, selectionSide: s.selectionSide, line: s.lineRaw === null ? null : s.lineRaw / 1000 });
      // A saved "unsupported" reason is stale once the market becomes supported
      // (the poller only revisits it near kickoff).
      const p =
        s.progress?.status === 'UNAVAILABLE' && s.progress.unavailableReason?.startsWith('UNSUPPORTED') && cls?.supported ? null : s.progress;
      const moneylineSide =
        ml && game.state ? moneylineSideOf(leg.league, s.participantName, game.state.home as ProviderTeam, game.state.away as ProviderTeam) : null;
      const outcomeLine = s.lineRaw === null ? null : s.lineRaw / 1000;
      const line = ml === 'SPREAD' ? spreadPick(s.participantName ?? s.selectionLabel, outcomeLine).line : outcomeLine;
      const type = ml ?? (cls?.supported ? 'STAT' : 'OTHER');
      if (pickHit(s.status, cls?.supported ? p : null, ml ? { type, moneylineSide, line, selectionSide: s.selectionSide } : null, game.state)) picksHit++;
      game.picks.push({
        id: s.id,
        participantName: s.participantName,
        marketName: s.marketName,
        selectionLabel: s.selectionLabel,
        selectionSide: s.selectionSide,
        line,
        status: s.status,
        betBuilderGroup: leg.selectionType === 'BET_BUILDER' ? leg.externalRowIndex : null,
        type,
        display: cls?.supported ? cls.display : null,
        moneylineSide,
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
    id: c.id,
    externalCouponRef: c.externalCouponRef,
    placedAt: c.placedAt?.toISOString() ?? null,
    status: c.status,
    rewardType: c.rewardType,
    currency: c.currency,
    kind: bet?.kind ?? null,
    oddsRaw: bet?.oddsRaw ?? null,
    stakeMinor: c.totalStakeMinor,
    potentialPayoutMinor: c.potentialPayoutMinor,
    potentialPayoutDerived: c.bets.some((b) => b.potentialPayoutDerived),
    payoutMinor: c.actualPayoutMinor,
    pickCount: c.legs.reduce((n, l) => n + l.selections.length, 0),
    picksHit,
    lastSyncedAt: c.lastSyncedAt.toISOString(),
    probablySettled: c.status === 'OPEN' ? probablySettled(games, now) : null,
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
    updatedAt: st.updatedAt.toISOString(),
  };
}
