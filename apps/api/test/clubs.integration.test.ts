import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createApiKey } from '../src/auth/apiKeys';
import { createSession } from '../src/auth/sessions';
import type { ClubFeedItem, ClubInvite, ClubSummary, ClubView, ProfileView } from '../src/social/types';
import { createTestUser, hasTestDb, setupTestDb } from './testDb';

/**
 * ann starts a club and invites ben. ben has one open $100 bet; cleo is never
 * in the club.
 */
describe.skipIf(!hasTestDb)('clubs and devices against Postgres', () => {
  let db: PrismaClient;
  let base: string;
  let close: () => void;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    db = await setupTestDb();
    for (const name of ['ann', 'ben', 'cleo']) {
      const user = await createTestUser(db, name);
      ids[name] = user.id;
      cookies[name] = `sb_session=${(await createSession(db, user.id, 'test')).token}`;
    }
    const account = await db.sportsbookAccount.create({ data: { userId: ids.ben!, provider: 'ISLAND_LUCK_KAMBI', label: 'Island Luck' } });
    const now = new Date();
    await db.coupon.create({
      data: {
        sportsbookAccountId: account.id,
        externalCouponRef: 'ben-open',
        placedAt: now,
        currency: 'BSD',
        status: 'OPEN',
        totalStakeMinor: 10_000,
        potentialPayoutMinor: 40_000,
        rawPayload: {},
        rawPayloadHash: 'ben-open',
        parserVersion: 1,
        capturedAt: now,
        lastSyncedAt: now,
        bets: { create: [{ externalBetRef: 'ben-open', kind: 'SINGLE', oddsRaw: 4000, stakeMinor: 10_000, potentialPayoutMinor: 40_000, potentialPayoutDerived: false, status: 'OPEN' }] },
      },
    });
    const server = createApp(db).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  }, 60_000);
  afterAll(async () => {
    close?.();
    await db?.$disconnect();
  });

  const call = (as: string, method: string, path: string, body?: unknown, auth?: string) =>
    fetch(`${base}/api${path}`, {
      method,
      headers: { ...(auth ? { Authorization: auth } : { cookie: cookies[as]! }), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const json = async <T>(as: string, method: string, path: string, body?: unknown, status = 200) => {
    const res = await call(as, method, path, body);
    expect(res.status, `${method} ${path} as ${as}`).toBe(status);
    return (await res.json()) as T;
  };

  let clubId = '';
  let code = '';

  it('starts a club with you as its owner and gives you its invite link', async () => {
    expect((await call('ann', 'POST', '/clubs', { name: '   ' })).status).toBe(400);
    clubId = (await json<{ id: string }>('ann', 'POST', '/clubs', { name: '  Sunday   League ' }, 201)).id;
    const club = await json<ClubView>('ann', 'GET', `/clubs/${clubId}`);
    expect(club).toMatchObject({ name: 'Sunday League', role: 'OWNER', members: [{ username: 'ann', role: 'OWNER' }] });
    code = club.inviteCode;
    expect(code).toMatch(/^[\w-]{16}$/);
  });

  it('hides a club from people who are not in it', async () => {
    expect((await call('ben', 'GET', `/clubs/${clubId}`)).status).toBe(404);
    expect((await call('ben', 'GET', `/clubs/${clubId}/bets`)).status).toBe(404);
  });

  it('joins by invite link, once', async () => {
    expect(await json<ClubInvite>('ben', 'GET', `/clubs/invites/${code}`)).toEqual({ id: clubId, name: 'Sunday League', memberCount: 1, isMember: false });
    await json('ben', 'POST', `/clubs/invites/${code}`);
    await json('ben', 'POST', `/clubs/invites/${code}`);
    const [summary] = (await json<{ clubs: ClubSummary[] }>('ben', 'GET', '/clubs')).clubs;
    expect(summary).toMatchObject({ id: clubId, role: 'MEMBER', memberCount: 2, you: { username: 'ben', isYou: true } });
  });

  it('shows clubmates each other’s picks at the minimum stake, and the profile agrees', async () => {
    const feed = await json<{ items: ClubFeedItem[]; hidden: number }>('ann', 'GET', `/clubs/${clubId}/bets?view=open`);
    expect(feed.hidden).toBe(0);
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({ username: 'ben', isYou: false, minBetMinor: 500, coupon: { stakeMinor: 500, potentialPayoutMinor: 2000 } });
    expect(await json<ProfileView>('ann', 'GET', '/social/profiles/ben')).toMatchObject({ canSeeBets: true, canSeeAmounts: false });
    // Not in the club, not a friend or follower: nothing.
    expect((await call('cleo', 'GET', '/social/profiles/ben/bets?view=open')).status).toBe(403);
  });

  it('shows real amounts only in a club where the member switched them on', async () => {
    expect((await json<ClubView>('ben', 'GET', `/clubs/${clubId}`)).youShareAmounts).toBe(false);
    expect((await call('ben', 'PATCH', `/clubs/${clubId}/membership`, { shareAmounts: 'yes' })).status).toBe(400);
    await json('ben', 'PATCH', `/clubs/${clubId}/membership`, { shareAmounts: true });
    const feed = await json<{ items: ClubFeedItem[] }>('ann', 'GET', `/clubs/${clubId}/bets?view=open`);
    expect(feed.items[0]).toMatchObject({ username: 'ben', coupon: { stakeMinor: 10_000 } });
    expect(feed.items[0]!.minBetMinor).toBeUndefined();
    expect(await json<ProfileView>('ann', 'GET', '/social/profiles/ben')).toMatchObject({ canSeeAmounts: true });
    expect((await json<ClubView>('ann', 'GET', `/clubs/${clubId}`)).members.find((m) => m.username === 'ben')).toMatchObject({ sharesAmounts: true });
    // Someone outside the club can't switch it on for themselves.
    expect((await call('cleo', 'PATCH', `/clubs/${clubId}/membership`, { shareAmounts: true })).status).toBe(404);
    await json('ben', 'PATCH', `/clubs/${clubId}/membership`, { shareAmounts: false });
    expect((await json<ProfileView>('ann', 'GET', '/social/profiles/ben')).canSeeAmounts).toBe(false);
  });

  it('keeps someone’s picks out of the feed when they switch club sharing off', async () => {
    await json('ben', 'PATCH', '/social/settings', { sharePicksClubs: false });
    const feed = await json<{ items: ClubFeedItem[]; hidden: number }>('ann', 'GET', `/clubs/${clubId}/bets?view=open`);
    expect(feed).toEqual({ items: [], hidden: 1 });
    expect((await call('ann', 'GET', '/social/profiles/ben/bets?view=open')).status).toBe(403);
    await json('ben', 'PATCH', '/social/settings', { sharePicksClubs: true });
  });

  it('lets only the owner rename, reset the link and remove members', async () => {
    expect((await call('ben', 'PATCH', `/clubs/${clubId}`, { name: 'Mine now' })).status).toBe(403);
    expect((await call('ben', 'POST', `/clubs/${clubId}/invite`)).status).toBe(403);
    expect((await call('ben', 'DELETE', `/clubs/${clubId}/members/ann`)).status).toBe(403);
    const { inviteCode } = await json<{ inviteCode: string }>('ann', 'POST', `/clubs/${clubId}/invite`);
    expect(inviteCode).not.toBe(code);
    expect((await call('cleo', 'POST', `/clubs/invites/${code}`)).status).toBe(404);
    code = inviteCode;
  });

  it('hands the club to the longest-standing member when the owner leaves, and deletes it with the last one', async () => {
    await json('ann', 'DELETE', `/clubs/${clubId}/membership`);
    expect((await json<ClubView>('ben', 'GET', `/clubs/${clubId}`)).role).toBe('OWNER');
    await json('ben', 'DELETE', `/clubs/${clubId}/membership`);
    expect(await db.club.count({ where: { id: clubId } })).toBe(0);
  });

  describe('devices', () => {
    it('lists only your own devices and sign-ins, with no tokens', async () => {
      await createApiKey(db, ids.ann!, 'Phone userscript');
      await createApiKey(db, ids.ben!, 'Mozilla/5.0 (Macintosh) Chrome/130');
      const body = await json<{ devices: Array<{ kind: string }>; sessions: Array<{ current: boolean }> }>('ann', 'GET', '/devices');
      expect(body.devices).toMatchObject([{ kind: 'phone' }]);
      expect(body.sessions).toMatchObject([{ current: true }]);
      expect(JSON.stringify(body)).not.toMatch(/token|hash/i);
    });

    it('removes a device so its key stops syncing, and never someone else’s', async () => {
      const token = await createApiKey(db, ids.ann!, 'Mozilla/5.0 (Windows) Firefox/131');
      const key = await db.apiKey.findFirstOrThrow({ where: { userId: ids.ann!, label: { contains: 'Firefox' } } });
      const bens = await db.apiKey.findFirstOrThrow({ where: { userId: ids.ben! } });
      expect((await call('ann', 'DELETE', `/devices/${bens.id}`)).status).toBe(404);
      // A key can't list or remove keys.
      expect((await call('ann', 'GET', '/devices', undefined, `Bearer ${token}`)).status).toBe(403);
      await json('ann', 'DELETE', `/devices/${key.id}`);
      expect((await call('ann', 'POST', '/integrations/island-luck/sync', { coupons: [] }, `Bearer ${token}`)).status).toBe(401);
    });

    it('signs out everywhere else but keeps this browser', async () => {
      const other = `sb_session=${(await createSession(db, ids.ann!, 'phone')).token}`;
      await json('ann', 'POST', '/devices/sessions/revoke-others');
      expect((await fetch(`${base}/api/devices`, { headers: { cookie: other } })).status).toBe(401);
      expect((await call('ann', 'GET', '/devices')).status).toBe(200);
    });
  });
});
