import { Prisma } from '@prisma/client';
import { classifyMarket, evaluateProgress, gameMarket, type Classification } from '@sports-better/markets';
import { AUTO_LINK_THRESHOLD, matchEvent, matchPlayer, sameTeams, sportForLeague } from '@sports-better/matching';
import { SPORT_KIND, type EventSnapshot, type ProviderEvent, type ProviderPlayer, type Sport, type SportsDataProvider } from '@sports-better/sports-data';
import type { Db } from '../db';

/**
 * One pass of the live-progress poller. Network use is limited to:
 *  - one scoreboard per sport, only when a bet (open or settled) has a game between
 *    15 min before kickoff and 6 h after it;
 *  - one box score per LIVE game that has a player/total prop (plus one after FINAL);
 *  - team rosters only while a player is still unmatched (cached 12 h).
 * Saved event/player mappings are reused, so matching runs once per game/player.
 * Nothing here writes Kambi settlement fields.
 */

const PREGAME_MS = 15 * 60_000;
const MAX_GAME_MS = 6 * 60 * 60_000;
const ROSTER_TTL_MS = 12 * 60 * 60_000;

export interface CycleReport {
  at: string;
  legsInWindow: number;
  requests: { scoreboard: number; summary: number; roster: number };
  eventsMapped: number;
  eventsUnmatched: string[];
  liveEvents: number;
  progressWritten: number;
  errors: string[];
}

// The owner is there to count bettors, not to scope anything: the poller works on everyone's legs.
const LEG_INCLUDE = {
  selections: { include: { progress: true } },
  coupon: { select: { sportsbookAccount: { select: { userId: true } } } },
} satisfies Prisma.BetLegInclude;
type Leg = Prisma.BetLegGetPayload<{ include: typeof LEG_INCLUDE }>;
type Selection = Leg['selections'][number];

const rosterCache = new Map<string, { at: number; players: ProviderPlayer[] }>();

export interface CycleOptions {
  /**
   * Kambi events whose final box score is read again even though it was
   * already read once (npm run backfill: picks that stopped updating before
   * their game ended).
   */
  refetchFinal?: Set<string>;
}

export async function runPollCycle(db: Db, provider: SportsDataProvider, now = new Date(), opts: CycleOptions = {}): Promise<CycleReport> {
  const report: CycleReport = {
    at: now.toISOString(),
    legsInWindow: 0,
    requests: { scoreboard: 0, summary: 0, roster: 0 },
    eventsMapped: 0,
    eventsUnmatched: [],
    liveEvents: 0,
    progressWritten: 0,
    errors: [],
  };

  const legs: Leg[] = await db.betLeg.findMany({
    where: {
      // Settled bets too, until their games end: a parlay that loses early
      // still shows each pick's final stat (Island Luck only says won or
      // lost), and the Analysis tab's cash-out check needs final scores.
      eventStartAt: { gte: new Date(now.getTime() - MAX_GAME_MS), lte: new Date(now.getTime() + PREGAME_MS) },
    },
    include: LEG_INCLUDE,
  });
  report.legsInWindow = legs.length;
  if (legs.length === 0) return report;

  const write = progressWriter(db, provider.id, report);

  // Legs in leagues the provider doesn't cover get a reason once and no requests.
  const bySport = new Map<Sport, Leg[]>();
  for (const leg of legs) {
    const sport = sportForLeague(leg.league);
    if (!sport || !provider.sports.includes(sport)) {
      for (const s of leg.selections) if (!gameMarket(s.marketName)) await write.unavailable(s, 'UNSUPPORTED_LEAGUE');
      continue;
    }
    bySport.set(sport, [...(bySport.get(sport) ?? []), leg]);
  }

  for (const [sport, sportLegs] of bySport) {
    let events: ProviderEvent[];
    try {
      const days = [...new Set(sportLegs.map((l) => easternDay(l.eventStartAt!)))];
      report.requests.scoreboard += days.length;
      events = await provider.listEvents(sport, days);
    } catch (err) {
      report.errors.push(`${sport} scoreboard: ${message(err)}`);
      continue; // keep last known progress
    }
    const eventById = new Map(events.map((e) => [e.id, e]));

    // ── event mapping ─────────────────────────────────────────────
    const legsByKambiEvent = groupBy(sportLegs.filter((l) => l.eventId), (l) => l.eventId!);
    const saved = await db.externalEventMapping.findMany({
      where: { provider: provider.id, sportsbookEventId: { in: [...legsByKambiEvent.keys()] } },
    });
    const mapping = new Map(saved.filter((m) => m.status === 'AUTO' || m.status === 'CONFIRMED').map((m) => [m.sportsbookEventId, m.providerEventId]));

    for (const [kambiEventId, eventLegs] of legsByKambiEvent) {
      const row = saved.find((m) => m.sportsbookEventId === kambiEventId);
      // Someone's decision (confirmed, rejected, or waiting for review) stands.
      if (row && row.status !== 'AUTO') continue;
      const current = mapping.has(kambiEventId) ? eventById.get(mapping.get(kambiEventId)!) : undefined;
      // A saved game that isn't on today's scoreboard can't be checked; keep it.
      if (mapping.has(kambiEventId) && !current) continue;
      const onCurrent = (l: Leg) => !!current && sameTeams(sport, l.homeName ?? '', l.awayName ?? '', current.home, current.away);
      // This link is shared by everyone betting on the event, and a synced coupon's teams are
      // whatever its sender wrote, so it follows the teams the most bettors name.
      const l = mostNamedTeams(eventLegs, onCurrent);
      if (onCurrent(l)) continue;
      const m = matchEvent({ sport, homeName: l.homeName ?? '', awayName: l.awayName ?? '', startAt: l.eventStartAt!.toISOString() }, events);
      if (!m.ok || m.confidence < AUTO_LINK_THRESHOLD) {
        if (row) continue; // the legs that disagree with it get no progress below
        // Not persisted: the game may simply not be listed yet. Retried next cycle at no extra request cost.
        report.eventsUnmatched.push(`${l.eventName} (${m.ok ? 'low confidence' : m.reason})`);
        for (const leg of eventLegs) for (const s of leg.selections) if (!gameMarket(s.marketName)) await write.unavailable(s, 'EVENT_NOT_MATCHED');
        continue;
      }
      const link = { sport, providerEventId: m.event.id, confidence: m.confidence, method: m.method, status: 'AUTO' as const };
      if (row) await db.externalEventMapping.update({ where: { id: row.id }, data: link });
      else await db.externalEventMapping.create({ data: { sportsbookEventId: kambiEventId, provider: provider.id, ...link } });
      mapping.set(kambiEventId, m.event.id);
    }
    report.eventsMapped += mapping.size;

    // ── per game ──────────────────────────────────────────────────
    for (const [kambiEventId, providerEventId] of mapping) {
      const event = eventById.get(providerEventId);
      if (!event) {
        report.errors.push(`event ${providerEventId} missing from ${sport} scoreboard`);
        continue;
      }
      // Only the legs whose own teams are this game's.
      const eventLegs: Leg[] = [];
      for (const l of legsByKambiEvent.get(kambiEventId) ?? []) {
        if (sameTeams(sport, l.homeName ?? '', l.awayName ?? '', event.home, event.away)) eventLegs.push(l);
        else for (const s of l.selections) if (!gameMarket(s.marketName)) await write.unavailable(s, 'EVENT_NOT_MATCHED');
      }
      const stored = await saveEventState(db, provider.id, event);
      if (event.state.state === 'LIVE') report.liveEvents++;

      const statPicks = eventLegs.flatMap((l) => l.selections).map((s) => ({ s, cls: classify(s, eventLegs) })).filter(({ s }) => !gameMarket(s.marketName));
      for (const { s, cls } of statPicks) if (!cls.supported) await write.unavailable(s, cls.reason);
      const tracked = statPicks.filter((p): p is { s: Selection; cls: Extract<Classification, { supported: true }> } => p.cls.supported);
      if (tracked.length === 0) continue;

      if (event.state.state === 'SCHEDULED') {
        for (const { s, cls } of tracked) await write.progress(s, cls, evaluateProgress(cls, null, 'SCHEDULED')!, event, null);
        continue;
      }
      const needsBoxScore =
        event.state.state === 'LIVE' || (event.state.state === 'FINAL' && (!stored.finalizedAt || !!opts.refetchFinal?.has(kambiEventId)));
      if (!needsBoxScore) continue;

      let snap: EventSnapshot;
      try {
        report.requests.summary++;
        snap = await provider.getEventSnapshot(sport, providerEventId);
      } catch (err) {
        report.errors.push(`${event.away.abbreviation} @ ${event.home.abbreviation} box score: ${message(err)}`);
        for (const { s } of tracked) if (s.progress?.currentValue == null) await write.unavailable(s, 'PROVIDER_ERROR');
        continue;
      }

      for (const { s, cls } of tracked) {
        const inPlay = snap.state.state === 'LIVE' || snap.state.state === 'FINAL';
        if (cls.scope === 'GAME') {
          // Whole-game totals (e.g. field goals): sum the stat across both teams, or ESPN's own team total (corners).
          const total = snap.gameStats?.[cls.metric] ?? snap.players.reduce((n, p) => n + (p.stats[cls.metric] ?? 0), 0);
          const p = evaluateProgress(cls, inPlay ? total : null, snap.state.state);
          if (!p) await write.unavailable(s, 'NO_STAT');
          else await write.progress(s, cls, p, event, null);
          continue;
        }
        const player = await resolvePlayer(db, provider, sport, s, snap, report);
        if (!player.ok) {
          await write.unavailable(s, player.reason);
          continue;
        }
        const stats = snap.players.find((p) => p.player.id === player.id)?.stats;
        // Listed on a roster but no box score line yet during a game = 0 so far.
        const current = stats?.[cls.metric] ?? (inPlay ? 0 : null);
        const p = evaluateProgress(cls, current, snap.state.state);
        if (!p) await write.unavailable(s, 'NO_STAT');
        else await write.progress(s, cls, p, event, player);
      }

      if (snap.state.state === 'FINAL') {
        await db.providerEventState.update({ where: { id: stored.id }, data: { finalizedAt: now } });
      }
    }
  }
  return report;
}

// ── helpers ──────────────────────────────────────────────────────────

function classify(s: Selection, legs: Leg[]): Classification {
  const leg = legs.find((l) => l.id === s.betLegId);
  return classifyMarket({
    sport: leg?.sport ?? null,
    marketName: s.marketName,
    selectionSide: s.selectionSide,
    line: s.lineRaw === null ? null : s.lineRaw / 1000,
  });
}

type ResolvedPlayer = { ok: true; id: string; confidence: number; method: string } | { ok: false; reason: string };

async function resolvePlayer(
  db: Db,
  provider: SportsDataProvider,
  sport: Sport,
  s: Selection,
  snap: EventSnapshot,
  report: CycleReport,
): Promise<ResolvedPlayer> {
  if (!s.externalParticipantId || !s.participantName) return { ok: false, reason: 'NO_PARTICIPANT' };

  const saved = await db.externalParticipantMapping.findUnique({
    where: { sportsbookParticipantId_provider: { sportsbookParticipantId: s.externalParticipantId, provider: provider.id } },
  });
  if (saved) {
    if ((saved.status === 'AUTO' || saved.status === 'CONFIRMED') && saved.providerParticipantId) {
      return { ok: true, id: saved.providerParticipantId, confidence: saved.confidence, method: saved.method ?? saved.status };
    }
    return { ok: false, reason: saved.status === 'REJECTED' ? 'PLAYER_REJECTED' : 'PLAYER_NEEDS_REVIEW' };
  }

  // Match against everyone in this game: box score players plus both full rosters.
  // A soccer summary already lists both match-day squads.
  const pool = [...snap.players.map((p) => p.player)];
  for (const team of SPORT_KIND[sport] === 'soccer' ? [] : [snap.home, snap.away]) {
    try {
      pool.push(...(await roster(provider, sport, team.id, report)));
    } catch (err) {
      report.errors.push(`roster ${team.abbreviation}: ${message(err)}`);
      return { ok: false, reason: 'PROVIDER_ERROR' };
    }
  }

  const m = matchPlayer(s.participantName, pool);
  if (!m.ok && m.reason === 'NO_CANDIDATE') return { ok: false, reason: 'PLAYER_NOT_FOUND' }; // not saved; retried later
  await db.externalParticipantMapping.create({
    data: {
      sportsbookParticipantId: s.externalParticipantId,
      participantName: s.participantName,
      provider: provider.id,
      providerParticipantId: m.ok ? m.player.id : null,
      providerTeamId: m.ok ? m.player.teamId : null,
      confidence: m.ok ? m.confidence : 0,
      method: m.ok ? m.method : m.reason,
      status: m.ok && m.autoLink ? 'AUTO' : 'NEEDS_REVIEW',
      candidates: m.ok ? [{ id: m.player.id, name: m.player.displayName }] : m.candidates.map((c) => ({ id: c.id, name: c.displayName })),
    },
  });
  return m.ok && m.autoLink
    ? { ok: true, id: m.player.id, confidence: m.confidence, method: m.method }
    : { ok: false, reason: 'PLAYER_NEEDS_REVIEW' };
}

async function roster(provider: SportsDataProvider, sport: Sport, teamId: string, report: CycleReport): Promise<ProviderPlayer[]> {
  const key = `${provider.id}:${sport}:${teamId}`;
  const hit = rosterCache.get(key);
  if (hit && Date.now() - hit.at < ROSTER_TTL_MS) return hit.players;
  report.requests.roster++;
  const players = await provider.getRoster(sport, teamId);
  rosterCache.set(key, { at: Date.now(), players });
  return players;
}

/** Test hook: rosters are cached per process. */
export function clearRosterCache() {
  rosterCache.clear();
}

async function saveEventState(db: Db, provider: string, e: ProviderEvent) {
  const data = {
    sport: e.sport,
    startAt: new Date(e.startAt),
    homeTeam: e.home as unknown as Prisma.InputJsonValue,
    awayTeam: e.away as unknown as Prisma.InputJsonValue,
    state: e.state.state,
    period: e.state.period,
    clock: e.state.clock,
    detail: e.state.detail,
    homeScore: e.state.homeScore,
    awayScore: e.state.awayScore,
    situation: e.state.situation ? (e.state.situation as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
    result: e.state.fight ? (e.state.fight as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
  };
  return db.providerEventState.upsert({
    where: { provider_providerEventId: { provider, providerEventId: e.id } },
    create: { ...data, provider, providerEventId: e.id },
    update: data,
  });
}

function progressWriter(db: Db, provider: string, report: CycleReport) {
  const upsert = async (s: Selection, data: Omit<Prisma.BetLegProgressUncheckedCreateInput, 'legSelectionId' | 'provider'>) => {
    await db.betLegProgress.upsert({
      where: { legSelectionId: s.id },
      create: { ...data, legSelectionId: s.id, provider },
      update: data,
    });
    report.progressWritten++;
  };
  return {
    async unavailable(s: Selection, reason: string) {
      if (s.progress?.status === 'UNAVAILABLE' && s.progress.unavailableReason === reason) return;
      await upsert(s, { status: 'UNAVAILABLE', unavailableReason: reason, currentValue: null });
    },
    async progress(
      s: Selection,
      cls: Extract<Classification, { supported: true }>,
      p: NonNullable<ReturnType<typeof evaluateProgress>>,
      e: ProviderEvent,
      player: Extract<ResolvedPlayer, { ok: true }> | null,
    ) {
      await upsert(s, {
        externalEventId: e.id,
        externalPlayerId: player?.id ?? null,
        metric: cls.metric,
        operator: cls.operator,
        target: cls.target,
        currentValue: p.status === 'NOT_STARTED' ? null : p.current,
        status: p.status,
        unavailableReason: null,
        period: e.state.period,
        clock: e.state.clock,
        gameStatus: e.state.state,
        matchConfidence: player?.confidence ?? null,
        matchMethod: player?.method ?? null,
      });
    },
  };
}

/** ESPN scoreboards are keyed by US Eastern calendar day. */
function easternDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}

/** A leg naming the teams the most bettors (not tickets) name for one event; on a tie, one that `preferred` accepts. */
function mostNamedTeams(legs: Leg[], preferred: (l: Leg) => boolean): Leg {
  const claims = new Map<string, { leg: Leg; bettors: Set<string> }>();
  for (const l of legs) {
    const key = `${l.homeName}|${l.awayName}`;
    const claim = claims.get(key) ?? { leg: l, bettors: new Set<string>() };
    claim.bettors.add(l.coupon.sportsbookAccount.userId);
    claims.set(key, claim);
  }
  return [...claims.values()].sort((a, b) => b.bettors.size - a.bettors.size || Number(preferred(b.leg)) - Number(preferred(a.leg)))[0]!.leg;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
