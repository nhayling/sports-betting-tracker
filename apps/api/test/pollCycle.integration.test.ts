import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import type { RawHistoryResponse } from '@sports-better/kambi';
import { EspnProvider, ProviderError } from '@sports-better/sports-data';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import captured from '../../../packages/kambi/fixtures/captured/history-2026-09-27.json';
import { clearRosterCache, runPollCycle } from '../src/live/pollCycle';
import { syncCoupons } from '../src/sync/syncCoupons';
import { loadBetsView } from '../src/views/betsView';
import { recordNotifications } from '../src/notifications/store';
import { createTestUser, hasTestDb, setupTestDb } from './testDb';

const fixture = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../packages/sports-data/fixtures/espn/${name}.json`, import.meta.url)), 'utf8'));

/** ESPN served from today's fixtures. Games without a saved box score/roster 404, exercising the error path. */
function fakeEspn() {
  const urls: string[] = [];
  const routes: Array<[RegExp, string]> = [
    [/nfl\/scoreboard/, 'nfl-scoreboard-situation'],
    [/summary\?event=401872952$/, 'nfl-summary-kc-mia-live'],
    [/summary\?event=401872954$/, 'nfl-summary-nyj-det-live'],
    [/teams\/12\/roster/, 'nfl-roster-kc'],
    [/teams\/15\/roster/, 'nfl-roster-mia'],
    [/teams\/8\/roster/, 'nfl-roster-det'],
    [/teams\/20\/roster/, 'nfl-roster-nyj'],
  ];
  const provider = new EspnProvider(async (url) => {
    urls.push(url);
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) throw new ProviderError('NOT_FOUND', `no fixture for ${url}`);
    return fixture(hit[1]);
  });
  return { provider, urls };
}

// 3:55 PM EDT: the 1 PM games are live and the 4:05 PM games are inside the 15-minute pre-game window.
const NOW = new Date('2026-09-27T19:55:00Z');

describe.skipIf(!hasTestDb)('runPollCycle against Postgres', () => {
  let db: PrismaClient;
  let userId: string;

  const progressFor = async (participantName: string, marketName: string) =>
    db.betLegProgress.findFirst({ where: { legSelection: { participantName, marketName } } });

  beforeAll(async () => {
    db = await setupTestDb();
    userId = (await createTestUser(db, 'noah')).id;
    await syncCoupons(db, {
      userId,
      accountLabel: 'Island Luck',
      capturedAt: new Date('2026-09-27T16:40:00Z'),
      coupons: (captured as unknown as RawHistoryResponse).coupons!,
    });
  }, 60_000);
  afterAll(() => db?.$disconnect());
  beforeEach(() => clearRosterCache());

  it('makes no requests when no open bet is near game time', async () => {
    const { provider, urls } = fakeEspn();
    const r = await runPollCycle(db, provider, new Date('2026-10-05T12:00:00Z'));
    expect(r.legsInWindow).toBe(0);
    expect(urls).toEqual([]);
  });

  describe('first cycle', () => {
    let urls: string[];
    let report: Awaited<ReturnType<typeof runPollCycle>>;

    beforeAll(async () => {
      const fake = fakeEspn();
      urls = fake.urls;
      report = await runPollCycle(db, fake.provider, NOW);
    });

    it('uses one scoreboard and only box scores for live games with stat picks', () => {
      expect(report.requests.scoreboard).toBe(1);
      expect(urls.filter((u) => u.includes('scoreboard'))).toHaveLength(1);
      // One box score per game even when several bets share it (KC @ MIA is in four).
      const summaries = urls.filter((u) => u.includes('summary'));
      expect(summaries.length).toBe(report.requests.summary);
      expect(new Set(summaries).size).toBe(summaries.length);
      expect(summaries.filter((u) => u.endsWith('401872952'))).toHaveLength(1);
    });

    it('tracks Kenneth Walker III at 52 / 100 rushing yards', async () => {
      expect(await progressFor('Kenneth Walker III', '100+ Rushing Yards By The Player - Including Overtime')).toMatchObject({
        provider: 'ESPN',
        externalEventId: '401872952',
        externalPlayerId: '4567048',
        metric: 'RUSHING_YARDS',
        operator: 'GTE',
        target: 100,
        currentValue: 52,
        status: 'IN_PROGRESS',
        gameStatus: 'LIVE',
        matchConfidence: 1,
        matchMethod: 'EXACT_NAME',
      });
    });

    it('marks touchdown picks without touching Kambi settlement', async () => {
      expect(await progressFor('Jahmyr Gibbs', 'Touchdown Scorer')).toMatchObject({ status: 'TARGET_REACHED', currentValue: 1 });
      expect(await progressFor('Breece Hall', 'Touchdown Scorer')).toMatchObject({ status: 'IN_PROGRESS', currentValue: 0 });
      const gibbsBet = await db.coupon.findFirstOrThrow({ where: { externalCouponRef: '13164001585' } });
      expect(gibbsBet.status).toBe('OPEN');
    });

    it('shows upcoming games as not started without a box score', async () => {
      expect(await progressFor('Christian McCaffrey', '50+ Rushing Yards By The Player - Including Overtime')).toMatchObject({
        status: 'NOT_STARTED',
        target: 50,
        currentValue: null,
      });
      expect(urls.some((u) => u.includes('summary?event=401872958'))).toBe(false);
    });

    it('reports provider failures as unavailable instead of inventing progress', async () => {
      expect(await progressFor('Pat Freiermuth', '30+ Receiving Yards By The Player - Including Overtime')).toMatchObject({
        status: 'UNAVAILABLE',
        unavailableReason: 'PROVIDER_ERROR',
        currentValue: null,
      });
      expect(report.errors.some((e) => e.includes('CIN @ PIT'))).toBe(true);
    });

    it('stores no progress rows for moneylines, but saves the live game state', async () => {
      expect(await db.betLegProgress.count({ where: { legSelection: { marketName: 'Moneyline' } } })).toBe(0);
      const lacBuf = await db.providerEventState.findUniqueOrThrow({
        where: { provider_providerEventId: { provider: 'ESPN', providerEventId: '401872953' } },
      });
      expect(lacBuf).toMatchObject({ state: 'LIVE', period: 3, clock: '9:31', homeScore: 10, awayScore: 10 });
      expect(lacBuf.situation).toMatchObject({ possessionTeamId: '24', downDistance: '1st & Goal at BUF 6', redZone: true });
    });

    it('builds the UI view: picks grouped by game, Kambi status beside live progress', async () => {
      const view = await loadBetsView(db, { userId, view: 'open', limit: 50 });
      expect(view.coupons).toHaveLength(6);
      const parlay = view.coupons.find((c) => c.externalCouponRef === '13164001585')!;
      expect(parlay).toMatchObject({ status: 'OPEN', stakeMinor: 500, potentialPayoutMinor: 6433, oddsRaw: 12866, pickCount: 5 });
      expect(parlay.games.map((g) => [g.name, g.picks.length])).toEqual([
        ['KC Chiefs @ MIA Dolphins', 2],
        ['NY Jets @ DET Lions', 2],
        ['BAL Ravens vs DAL Cowboys', 1],
      ]);
      const [rush, td] = parlay.games[0]!.picks;
      expect(rush).toMatchObject({
        participantName: 'Kenneth Walker III',
        type: 'STAT',
        display: 'PROGRESS',
        status: 'OPEN',
        betBuilderGroup: 0,
        progress: { status: 'IN_PROGRESS', current: 52, target: 100 },
      });
      // Kambi already settled the TD pick; live stats agree but are reported separately.
      expect(td).toMatchObject({ display: 'BINARY', status: 'WON', progress: { status: 'TARGET_REACHED' } });
      expect(parlay.games[0]!.state).toMatchObject({ state: 'LIVE', home: { abbreviation: 'MIA' }, away: { abbreviation: 'KC' } });
      // Walker's TD (settled WON) + Gibbs' TD (live) out of 5 picks.
      expect(parlay.picksHit).toBe(2);
    });

    it('marks which side a moneyline pick is on', async () => {
      const view = await loadBetsView(db, { userId, view: 'open', limit: 50 });
      const mlParlay = view.coupons.find((c) => c.externalCouponRef === '13160476139')!;
      const buf = mlParlay.games.find((g) => g.name === 'LA Chargers @ BUF Bills')!;
      expect(buf.picks[0]).toMatchObject({ type: 'MONEYLINE', participantName: 'BUF Bills', moneylineSide: 'home', progress: null });
      expect(buf.state?.situation).toMatchObject({ downDistance: '1st & Goal at BUF 6' });
      expect(mlParlay.picksHit).toBe(0);
    });

    it('records notifications once per event', async () => {
      const created = await recordNotifications(db);
      expect(created).toBeGreaterThan(0);
      const gibbs = await db.notification.findFirst({ where: { title: '✓ Jahmyr Gibbs scored a TD' } });
      expect(gibbs).toMatchObject({ kind: 'PICK_HIT', readAt: null, userId });
      // Walker's TD was already settled WON by Island Luck, so no live notification.
      expect(await db.notification.count({ where: { title: { contains: 'Kenneth Walker III scored' } } })).toBe(0);
      expect(await recordNotifications(db)).toBe(0);
    });

    it('saves event and player mappings', async () => {
      expect(await db.externalEventMapping.findFirst({ where: { providerEventId: '401872952' } })).toMatchObject({
        status: 'AUTO',
        method: 'NFL_NICKNAME',
        confidence: 1,
      });
      expect(await db.externalParticipantMapping.findFirst({ where: { participantName: 'Kenneth Walker III' } })).toMatchObject({
        sportsbookParticipantId: '1007779124',
        providerParticipantId: '4567048',
        providerTeamId: '12',
        status: 'AUTO',
      });
    });
  });

  it('tracks whole-game totals (field goals) without a player', async () => {
    // A game Over 3.5 field goals on KC @ MIA, shaped like Island Luck's coupon.
    const kcMia = (captured as unknown as RawHistoryResponse).coupons!.find((c) => c.couponRef === 13164001585)!.events!.find(
      (e) => e.eventId === 1028811700,
    )!;
    await syncCoupons(db, {
      userId,
      accountLabel: 'Island Luck',
      capturedAt: new Date('2026-09-27T16:45:00Z'),
      coupons: [
        {
          couponRef: 990000001,
          placedDate: '2026-09-27T16:44:00Z',
          currency: 'USD',
          bets: [{ betRef: 990000002, stake: 5000, playedOdds: 2100, betOdds: 2100, potentialPayout: 10500, betStatus: 'OPEN', couponRowIndexes: [0] }],
          couponRows: [{ index: 0, selectionType: 'SIMPLE', outcomeId: 990000003, playedOdds: 2100, status: 'OPEN' }],
          outcomes: [{ outcomeId: 990000003, betOfferId: 990000004, eventId: 1028811700, label: 'Over 3.5', line: 3500, status: 'OPEN' }],
          betOffers: [{ betOfferId: 990000004, criterion: 'Total Successful Field Goals', boType: 'Over/Under', boTypeId: 6, line: 3500 }],
          events: [kcMia],
        },
      ],
    });
    const { provider } = fakeEspn();
    await runPollCycle(db, provider, NOW);
    // No field goals by halftime in the fixture (Butker 0/0, Patterson 0/0).
    expect(await db.betLegProgress.findFirst({ where: { legSelection: { marketName: 'Total Successful Field Goals' } } })).toMatchObject({
      status: 'IN_PROGRESS',
      metric: 'FIELD_GOALS_MADE',
      operator: 'GT',
      target: 3.5,
      currentValue: 0,
      externalPlayerId: null,
    });
  });

  it('re-parses bets stored by an older parser version', async () => {
    const { reparseOutdated } = await import('../src/sync/reparse');
    await db.coupon.updateMany({ data: { parserVersion: 1 } });
    const r = await reparseOutdated(db);
    expect(r.checked).toBeGreaterThan(0);
    expect(r).toMatchObject({ updated: r.checked, failed: 0 });
    expect(await db.coupon.count({ where: { parserVersion: 1 } })).toBe(0);
    expect((await reparseOutdated(db)).checked).toBe(0);
  });

  it('reuses saved mappings: no rosters and no duplicate mappings on the next cycle', async () => {
    const before = await db.externalEventMapping.count();
    const { provider, urls } = fakeEspn();
    const r = await runPollCycle(db, provider, NOW);
    expect(r.requests.roster).toBe(0);
    expect(urls.some((u) => u.includes('roster'))).toBe(false);
    expect(await db.externalEventMapping.count()).toBe(before);
    expect(await progressFor('Kenneth Walker III', '100+ Rushing Yards By The Player - Including Overtime')).toMatchObject({ currentValue: 52 });
  });

  it('ignores settled bets', async () => {
    await db.coupon.updateMany({ data: { status: 'LOST' } });
    const { provider, urls } = fakeEspn();
    const r = await runPollCycle(db, provider, NOW);
    expect(r.legsInWindow).toBe(0);
    expect(urls).toEqual([]);
  });
});
