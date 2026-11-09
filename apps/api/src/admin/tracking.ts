import { Prisma } from '@prisma/client';
import { classifyMarket, gameMarket, marketPattern, marketRuleKey, ruleStats, type MarketRule } from '@sports-better/markets';
import type { Sport, SportsDataProvider } from '@sports-better/sports-data';
import type { Db } from '../db';
import { loadMarketRules } from '../live/marketRules';
import { playersIn } from '../live/pollCycle';
import type { GamePlayer, MarketIssue, PlayerDecision, PlayerIssue, Tracking } from './types';

/** Picks in these states wait on someone's decision. Anything else clears up on its own or has nothing to decide. */
const PLAYER_REASONS = ['PLAYER_NEEDS_REVIEW', 'PLAYER_NOT_FOUND'];

/** Whether classifyMarket has never heard of the name: its side or line can't be the problem with neither given. */
const isUnknown = (sport: string, marketName: string, rules: Awaited<ReturnType<typeof loadMarketRules>>) => {
  const cls = classifyMarket({ sport, marketName, selectionSide: null, line: null }, rules);
  return !cls.supported && cls.reason === 'UNSUPPORTED_MARKET' && !gameMarket(marketName);
};

export async function loadTracking(db: Db, provider: string, refresh: Tracking['refresh']): Promise<Tracking> {
  const [players, decisions, { markets, ignored }, rules] = await Promise.all([
    playerIssues(db, provider),
    playerDecisions(db, provider),
    marketIssues(db),
    db.marketRule.findMany({ orderBy: { createdAt: 'desc' } }),
  ]);
  const statLabel = (r: (typeof rules)[number]) => ruleStats(r.sport, r.scope as MarketRule['scope'], r.marketName)?.find(([key]) => key === r.metric)?.[1] ?? r.metric;
  const tracked = rules.map((r) => ({ sport: r.sport, marketName: r.marketName, stat: statLabel(r), addedBy: r.createdBy, addedAt: r.createdAt.toISOString() }));
  return { players, markets, tracked, ignored, decisions, refresh };
}

async function playerIssues(db: Db, provider: string): Promise<PlayerIssue[]> {
  const stuck = await db.betLegProgress.findMany({
    where: { status: 'UNAVAILABLE', unavailableReason: { in: PLAYER_REASONS }, legSelection: { externalParticipantId: { not: null } } },
    select: { legSelection: { select: { status: true, externalParticipantId: true, participantName: true, betLeg: { select: { eventName: true, eventStartAt: true } } } } },
  });
  const issues = new Map<string, PlayerIssue>();
  for (const { legSelection: s } of stuck) {
    const id = s.externalParticipantId!;
    const issue = issues.get(id) ?? { participantId: id, name: s.participantName ?? id, picks: 0, openPicks: 0, game: null, startAt: null, candidates: [] };
    issue.picks++;
    if (s.status === 'OPEN') issue.openPicks++;
    const start = s.betLeg.eventStartAt?.toISOString() ?? null;
    if (start && (!issue.startAt || start > issue.startAt)) {
      issue.startAt = start;
      issue.game = s.betLeg.eventName;
    }
    issues.set(id, issue);
  }
  const saved = await db.externalParticipantMapping.findMany({ where: { provider, sportsbookParticipantId: { in: [...issues.keys()] } } });
  for (const m of saved) issues.get(m.sportsbookParticipantId)!.candidates = (m.candidates as PlayerIssue['candidates'] | null) ?? [];
  // A pick still in play can use the fix right away.
  return [...issues.values()].sort((a, b) => b.openPicks - a.openPicks || b.picks - a.picks);
}

async function playerDecisions(db: Db, provider: string): Promise<PlayerDecision[]> {
  const rows = await db.externalParticipantMapping.findMany({ where: { provider, status: { in: ['CONFIRMED', 'REJECTED'] } }, orderBy: { updatedAt: 'desc' }, take: 20 });
  return rows.map((m) => ({
    participantId: m.sportsbookParticipantId,
    name: m.participantName,
    linkedTo: m.status === 'CONFIRMED' ? ((m.candidates as PlayerIssue['candidates'] | null)?.[0]?.name ?? m.providerParticipantId) : null,
    decidedAt: m.updatedAt.toISOString(),
  }));
}

async function marketIssues(db: Db): Promise<Pick<Tracking, 'markets' | 'ignored'>> {
  const rules = await loadMarketRules(db);
  const flagged = (await db.untrackedMarket.findMany({ orderBy: { lastSeenAt: 'desc' } })).filter((f) => ruleStats(f.sport, 'PLAYER') && isUnknown(f.sport, f.marketName, rules));
  const names = flagged.map((f) => f.marketName);
  const counts = await db.$queryRaw<Array<{ sport: string; marketName: string; picks: bigint; open: bigint; named: bigint }>>`
    SELECT COALESCE(l."sport", '') AS sport, s."marketName", COUNT(*) AS picks, COUNT(*) FILTER (WHERE s."status" = 'OPEN') AS open, COUNT(s."externalParticipantId") AS named
    FROM "LegSelection" s JOIN "BetLeg" l ON l."id" = s."betLegId"
    WHERE s."marketName" = ANY(${names})
    GROUP BY l."sport", s."marketName"`;

  const issues = new Map<string, MarketIssue>();
  for (const f of flagged.filter((m) => !m.ignoredAt)) {
    const key = marketRuleKey(f.sport, f.marketName);
    const issue = issues.get(key) ?? { sport: f.sport, marketName: f.marketName, example: f.example, picks: 0, openPicks: 0, scope: 'GAME', stats: [] };
    const c = counts.find((r) => r.sport === f.sport && r.marketName === f.marketName);
    issue.picks += Number(c?.picks ?? 0);
    issue.openPicks += Number(c?.open ?? 0);
    if (c && c.named > 0) issue.scope = 'PLAYER';
    issues.set(key, issue);
  }
  const markets = [...issues.values()]
    .filter((m) => m.picks > 0)
    .map((m) => ({ ...m, stats: ruleStats(m.sport, m.scope, m.marketName)!.map(([key, label]) => ({ key, label })) }))
    .sort((a, b) => b.openPicks - a.openPicks || b.picks - a.picks);
  const ignored = new Map(flagged.filter((m) => m.ignoredAt).map((m) => [marketRuleKey(m.sport, m.marketName), { sport: m.sport, marketName: m.marketName }]));
  return { markets, ignored: [...ignored.values()] };
}

/** Every name a market goes by on synced picks: "40+ X" brings "60+ X". */
async function namesLike(db: Db, sport: string, marketName: string): Promise<string[]> {
  const rows = await db.legSelection.findMany({ where: { betLeg: { sport }, marketName: { not: null } }, distinct: ['marketName'], select: { marketName: true } });
  const pattern = marketPattern(marketName);
  return rows.map((r) => r.marketName!).filter((n) => marketPattern(n) === pattern);
}

export async function addMarketRule(db: Db, sport: string, marketName: string, metric: unknown, by: string): Promise<{ ok: true; metric: string } | { ok: false; error: string }> {
  if (!ruleStats(sport, 'PLAYER')) return { ok: false, error: 'ESPN has no stats for this sport.' };
  if (!isUnknown(sport, marketName, await loadMarketRules(db))) return { ok: false, error: 'This market is already tracked.' };
  const names = await namesLike(db, sport, marketName);
  const named = await db.legSelection.findFirst({ where: { betLeg: { sport }, marketName: { in: names }, externalParticipantId: { not: null } }, select: { id: true } });
  const scope: MarketRule['scope'] = named ? 'PLAYER' : 'GAME';
  const stat = ruleStats(sport, scope, marketName)!.find(([key]) => key === metric);
  if (!stat) return { ok: false, error: 'Choose one of the stats listed.' };
  await db.marketRule.create({ data: { sport, pattern: marketPattern(marketName), marketName, metric: stat[0], scope, createdBy: by } });
  return { ok: true, metric: stat[0] };
}

export const removeMarketRule = (db: Db, sport: string, marketName: string) => db.marketRule.deleteMany({ where: { sport, pattern: marketPattern(marketName) } });

export async function setMarketIgnored(db: Db, sport: string, marketName: string, ignored: boolean) {
  const flagged = await db.untrackedMarket.findMany({ where: { sport }, select: { id: true, marketName: true } });
  const pattern = marketPattern(marketName);
  const ids = flagged.filter((f) => marketPattern(f.marketName) === pattern).map((f) => f.id);
  await db.untrackedMarket.updateMany({ where: { id: { in: ids } }, data: { ignoredAt: ignored ? new Date() : null } });
}

/** The Kambi games with picks on a market, for re-reading after a change. */
export async function marketEvents(db: Db, sport: string, marketName: string): Promise<string[]> {
  const names = await namesLike(db, sport, marketName);
  const legs = await db.betLeg.findMany({ where: { sport, eventId: { not: null }, selections: { some: { marketName: { in: names } } } }, distinct: ['eventId'], select: { eventId: true } });
  return legs.map((l) => l.eventId!);
}

export async function playerEvents(db: Db, participantId: string): Promise<string[]> {
  const legs = await db.betLeg.findMany({ where: { eventId: { not: null }, selections: { some: { externalParticipantId: participantId } } }, distinct: ['eventId'], select: { eventId: true } });
  return legs.map((l) => l.eventId!);
}

/**
 * Settles a player for every game they turn up in. "reset" forgets the
 * decision, so the matcher looks at them afresh. False when no pick names them.
 */
export async function decidePlayer(db: Db, provider: string, participantId: string, decision: { playerId: string; playerName: string } | 'noMatch' | 'reset'): Promise<boolean> {
  const key = { sportsbookParticipantId_provider: { sportsbookParticipantId: participantId, provider } };
  if (decision === 'reset') {
    await db.externalParticipantMapping.deleteMany({ where: { sportsbookParticipantId: participantId, provider } });
    return true;
  }
  const pick = await db.legSelection.findFirst({ where: { externalParticipantId: participantId, participantName: { not: null } }, select: { participantName: true } });
  if (!pick) return false;
  const data =
    decision === 'noMatch'
      ? { status: 'REJECTED' as const, providerParticipantId: null, providerTeamId: null, confidence: 0, method: 'ADMIN' }
      : // The poller reads this link by id; the name is for the admin site's list.
        { status: 'CONFIRMED' as const, providerParticipantId: decision.playerId, providerTeamId: null, confidence: 1, method: 'ADMIN', candidates: [{ id: decision.playerId, name: decision.playerName }] as Prisma.InputJsonValue };
  await db.externalParticipantMapping.upsert({ where: key, create: { sportsbookParticipantId: participantId, participantName: pick.participantName!, provider, ...data }, update: data });
  return true;
}

/** Everyone in a player's newest game that ESPN knows, for picking by hand. Null when the game isn't linked. */
export async function gamePlayerOptions(db: Db, provider: SportsDataProvider, participantId: string): Promise<GamePlayer[] | null> {
  const legs = await db.betLeg.findMany({
    where: { eventId: { not: null }, selections: { some: { externalParticipantId: participantId } } },
    orderBy: { eventStartAt: 'desc' },
    take: 20,
    select: { eventId: true },
  });
  const links = await db.externalEventMapping.findMany({ where: { provider: provider.id, sportsbookEventId: { in: legs.map((l) => l.eventId!) }, status: { in: ['AUTO', 'CONFIRMED'] } } });
  const link = legs.map((l) => links.find((m) => m.sportsbookEventId === l.eventId)).find(Boolean);
  if (!link) return null;
  const sport = link.sport as Sport;
  const snap = await provider.getEventSnapshot(sport, link.providerEventId);
  const players = new Map((await playersIn(provider, sport, snap)).map((p) => [p.id, p]));
  return [...players.values()].map((p) => ({ id: p.id, name: p.displayName, position: p.position })).sort((a, b) => a.name.localeCompare(b.name));
}
