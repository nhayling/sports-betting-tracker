import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import type { RawHistoryResponse } from '@sports-better/kambi';
import { EspnProvider, ProviderError } from '@sports-better/sports-data';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import captured from '../../../packages/kambi/fixtures/captured/history-2026-09-27.json';
import { createApp } from '../src/app';
import { hashPassword } from '../src/auth/password';
import { LoginLimiter } from '../src/auth/loginLimiter';
import { recordingMailer } from '../src/email/mailer';
import { clearRosterCache, runPollCycle } from '../src/live/pollCycle';
import { syncCoupons } from '../src/sync/syncCoupons';
import { loadBetsView } from '../src/views/betsView';
import { hasTestDb, setupTestDb } from './testDb';

const ADMIN_HOST = 'admin.slipclub.test';
const NOW = new Date('2026-09-27T19:55:00Z');
const WALKER = 'Kenneth Walker III';
const WALKER_ESPN_ID = '4567048';
const RUSH_MARKET = '9+ Rush Attempts By The Player';

const fixture = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../packages/sports-data/fixtures/espn/${name}.json`, import.meta.url)), 'utf8'));
const espn = new EspnProvider(async (url) => {
  const routes: Array<[RegExp, string]> = [
    [/nfl\/scoreboard/, 'nfl-scoreboard-situation'],
    [/summary\?event=401872952$/, 'nfl-summary-kc-mia-live'],
    [/summary\?event=401872954$/, 'nfl-summary-nyj-det-live'],
    [/core\.api\.espn\.com.*plays/, 'nfl-core-plays-bal-buf-final'],
    [/teams\/12\/roster/, 'nfl-roster-kc'],
    [/teams\/15\/roster/, 'nfl-roster-mia'],
    [/teams\/8\/roster/, 'nfl-roster-det'],
    [/teams\/20\/roster/, 'nfl-roster-nyj'],
  ];
  const hit = routes.find(([re]) => re.test(url));
  if (!hit) throw new ProviderError('NOT_FOUND', `no fixture for ${url}`);
  return fixture(hit[1]);
});

describe.skipIf(!hasTestDb)('fixing tracking from the admin site', () => {
  let db: PrismaClient;
  let port: number;
  let close: () => void;
  let cookie: string;
  let userId: string;
  let walkerId: string;

  function call(method: string, path: string, opts: { cookie?: string; body?: unknown } = {}) {
    return new Promise<{ status: number; body: any; cookie?: string }>((resolve, reject) => {
      const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
      const req = request({ port, method, path, headers: { host: ADMIN_HOST, ...(payload ? { 'content-type': 'application/json' } : {}), ...(opts.cookie ? { cookie: opts.cookie } : {}) } }, (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode!, body: text ? JSON.parse(text) : null, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] }));
      });
      req.on('error', reject);
      req.end(payload);
    });
  }
  const tracking = async () => (await call('GET', '/api/admin/tracking', { cookie })).body;
  const settle = () => vi.waitFor(async () => expect((await tracking()).refresh.games).toBe(0), { timeout: 10_000, interval: 50 });
  const walkerPick = () => db.legSelection.findFirstOrThrow({ where: { id: walkerId }, include: { progress: true } });

  beforeAll(async () => {
    db = await setupTestDb();
    clearRosterCache();
    userId = (await db.user.create({ data: { username: 'noah', passwordHash: await hashPassword('a-long-password'), admin: true } })).id;
    await db.user.create({ data: { username: 'buddy', passwordHash: await hashPassword('another-password') } });
    await syncCoupons(db, { userId, accountLabel: 'Island Luck', capturedAt: new Date('2026-09-27T16:40:00Z'), coupons: (captured as unknown as RawHistoryResponse).coupons! });
    await runPollCycle(db, espn, NOW);
    walkerId = (await db.legSelection.findFirstOrThrow({ where: { participantName: WALKER, marketName: '100+ Rushing Yards By The Player - Including Overtime' } })).id;

    const { mailer } = recordingMailer();
    const server = createApp(db, { mailer, sportsData: espn, refreshGapMs: 0, loginLimiter: new LoginLimiter(), signupLimiter: new LoginLimiter() }).listen(0);
    await new Promise((r) => server.once('listening', r));
    port = (server.address() as AddressInfo).port;
    close = () => server.close();
    cookie = (await call('POST', '/api/auth/login', { body: { username: 'noah', password: 'a-long-password' } })).cookie!;
  }, 60_000);
  afterAll(async () => {
    close?.();
    await db?.$disconnect();
  });

  it('is for admins only', async () => {
    const buddy = (await call('POST', '/api/auth/login', { body: { username: 'buddy', password: 'another-password' } })).cookie!;
    expect((await call('GET', '/api/admin/tracking', { cookie: buddy })).status).toBe(403);
    expect((await call('POST', '/api/admin/tracking/markets', { cookie: buddy, body: { sport: 'AMERICAN_FOOTBALL', marketName: RUSH_MARKET, metric: 'SACKS' } })).status).toBe(403);
    expect((await call('GET', '/api/admin/tracking')).status).toBe(401);
  });

  it('links a player the matcher wasn’t sure of, then re-reads the game, even a finished one', async () => {
    const pick = await walkerPick();
    await db.externalParticipantMapping.update({
      where: { sportsbookParticipantId_provider: { sportsbookParticipantId: pick.externalParticipantId!, provider: 'ESPN' } },
      data: { status: 'NEEDS_REVIEW', providerParticipantId: null, candidates: [{ id: WALKER_ESPN_ID, name: 'Kenneth Walker III' }] },
    });
    await db.betLegProgress.update({ where: { legSelectionId: pick.id }, data: { status: 'UNAVAILABLE', unavailableReason: 'PLAYER_NEEDS_REVIEW', currentValue: null } });
    // The poller is done with a finished game; only the fix can bring it back.
    await db.providerEventState.updateMany({ data: { finalizedAt: NOW } });

    const before = await tracking();
    expect(before.players).toHaveLength(1);
    expect(before.players[0]).toMatchObject({ name: WALKER, candidates: [{ id: WALKER_ESPN_ID }] });

    const linked = await call('POST', `/api/admin/tracking/players/${pick.externalParticipantId}`, { cookie, body: { playerId: WALKER_ESPN_ID, playerName: 'Kenneth Walker III' } });
    expect(linked.status).toBe(200);
    await settle();

    expect((await walkerPick()).progress).toMatchObject({ externalPlayerId: WALKER_ESPN_ID, unavailableReason: null });
    const after = await tracking();
    expect(after.players).toEqual([]);
    expect(after.decisions).toEqual([expect.objectContaining({ name: WALKER, linkedTo: 'Kenneth Walker III' })]);
    expect(after.refresh.errors).toEqual([]);
  });

  it('offers everyone in the game for a pick by hand, and undoes a decision', async () => {
    const pick = await walkerPick();
    const options = await call('GET', `/api/admin/tracking/players/${pick.externalParticipantId}/options`, { cookie });
    expect(options.body.players.map((p: { id: string }) => p.id)).toContain(WALKER_ESPN_ID);

    await call('POST', `/api/admin/tracking/players/${pick.externalParticipantId}`, { cookie, body: { noMatch: true } });
    await settle();
    expect((await walkerPick()).progress).toMatchObject({ status: 'UNAVAILABLE', unavailableReason: 'PLAYER_REJECTED' });
    expect((await tracking()).players).toEqual([]);

    // Forgotten, so the matcher decides again: an exact name links itself.
    await call('POST', `/api/admin/tracking/players/${pick.externalParticipantId}`, { cookie, body: { reset: true } });
    await settle();
    expect((await walkerPick()).progress).toMatchObject({ externalPlayerId: WALKER_ESPN_ID });
    expect((await tracking()).decisions).toEqual([]);
  });

  it('tracks a market as a stat, across its ladder, and can stop', async () => {
    const pick = await walkerPick();
    const body = { sport: 'AMERICAN_FOOTBALL', marketName: RUSH_MARKET, metric: 'RUSHING_ATTEMPTS' };
    await db.legSelection.update({ where: { id: pick.id }, data: { marketName: RUSH_MARKET, selectionSide: 'YES', lineRaw: 9000 } });
    await db.betLegProgress.update({ where: { legSelectionId: pick.id }, data: { status: 'UNAVAILABLE', unavailableReason: 'UNSUPPORTED_MARKET', currentValue: null, metric: null } });
    await db.untrackedMarket.createMany({
      data: [
        { sport: 'AMERICAN_FOOTBALL', marketName: RUSH_MARKET, reason: 'UNSUPPORTED_MARKET', example: `${WALKER} · Yes` },
        { sport: 'AMERICAN_FOOTBALL', marketName: '20+ Rush Attempts By The Player', reason: 'UNSUPPORTED_MARKET' },
        { sport: 'MARTIAL_ARTS', marketName: 'Fighter to do a backflip', reason: 'UNSUPPORTED_MARKET' },
      ],
    });

    const { markets } = await tracking();
    expect(markets).toHaveLength(1);
    expect(markets[0]).toMatchObject({ marketName: RUSH_MARKET, picks: 1, scope: 'PLAYER' });
    expect(markets[0].stats.map((s: { key: string }) => s.key)).toContain('RUSHING_ATTEMPTS');

    expect((await call('POST', '/api/admin/tracking/markets', { cookie, body: { ...body, metric: 'CORNERS' } })).status).toBe(409);
    expect((await call('POST', '/api/admin/tracking/markets', { cookie, body })).status).toBe(200);
    await settle();
    expect((await walkerPick()).progress).toMatchObject({ metric: 'RUSHING_ATTEMPTS', operator: 'GTE', target: 9 });
    const after = await tracking();
    expect(after.markets).toEqual([]);
    expect(after.tracked).toEqual([expect.objectContaining({ marketName: RUSH_MARKET, stat: 'Rushing attempts', addedBy: 'noah' })]);
    const view = await loadBetsView(db, { userId, view: 'all', limit: 100 });
    expect(view.coupons.flatMap((c) => c.games).flatMap((g) => g.picks).find((p) => p.id === pick.id)).toMatchObject({ type: 'STAT' });
    expect((await call('POST', '/api/admin/tracking/markets', { cookie, body })).status).toBe(409);

    await call('POST', '/api/admin/tracking/markets/remove', { cookie, body });
    await settle();
    expect((await walkerPick()).progress).toMatchObject({ status: 'UNAVAILABLE', unavailableReason: 'UNSUPPORTED_MARKET' });
    expect((await tracking()).markets).toHaveLength(1);
  });

  it('grades a part-of-a-game pick from plays, and a period’s total from the linescore', async () => {
    const pick = await walkerPick();
    const market = 'To score a Touchdown - Quarter 1';
    await db.legSelection.update({ where: { id: pick.id }, data: { marketName: market, selectionSide: 'YES', lineRaw: null } });
    await db.untrackedMarket.create({ data: { sport: 'AMERICAN_FOOTBALL', marketName: market, reason: 'UNSUPPORTED_MARKET' } });
    const { markets } = await tracking();
    const stats = markets.find((m: { marketName: string }) => m.marketName === market).stats.map((s: { key: string }) => s.key);
    expect(stats).toEqual(['PASSING_TDS', 'RUSHING_TDS', 'RECEIVING_TDS', 'TOUCHDOWNS']);

    expect((await call('POST', '/api/admin/tracking/markets', { cookie, body: { sport: 'AMERICAN_FOOTBALL', marketName: market, metric: 'PASSING_YARDS' } })).status).toBe(409);
    expect((await call('POST', '/api/admin/tracking/markets', { cookie, body: { sport: 'AMERICAN_FOOTBALL', marketName: market, metric: 'TOUCHDOWNS' } })).status).toBe(200);
    await settle();
    // The plays fixture is another game, so he has none of its touchdowns; what counts is that plays were read.
    expect((await walkerPick()).progress).toMatchObject({ metric: 'TOUCHDOWNS', currentValue: 0, target: 1, unavailableReason: null });
    await db.legSelection.update({ where: { id: pick.id }, data: { marketName: RUSH_MARKET, selectionSide: 'YES', lineRaw: 9000 } });
    await call('POST', '/api/admin/tracking/markets/remove', { cookie, body: { sport: 'AMERICAN_FOOTBALL', marketName: market } });
    await db.untrackedMarket.delete({ where: { sport_marketName: { sport: 'AMERICAN_FOOTBALL', marketName: market } } });
    await settle();
  });

  it('sets aside a market that can’t be tracked', async () => {
    const market = { sport: 'AMERICAN_FOOTBALL', marketName: RUSH_MARKET };
    await call('POST', '/api/admin/tracking/markets/ignore', { cookie, body: { ...market, ignored: true } });
    const ignored = await tracking();
    expect(ignored.markets).toEqual([]);
    expect(ignored.ignored).toHaveLength(1);
    await call('POST', '/api/admin/tracking/markets/ignore', { cookie, body: { ...market, ignored: false } });
    expect((await tracking()).markets).toHaveLength(1);
  });
});
