import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createInvite } from '../src/auth/invites';
import { LoginLimiter } from '../src/auth/loginLimiter';
import { hashPassword, verifyPassword } from '../src/auth/password';
import type { RawHistoryResponse } from '@sports-better/kambi';
import captured from '../../../packages/kambi/fixtures/captured/history-2026-09-27.json';
import { hasTestDb, setupTestDb } from './testDb';

const coupons = (captured as unknown as RawHistoryResponse).coupons!;

describe('password hashing', () => {
  it('verifies the right password only', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong password!!', hash)).toBe(false);
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });
});

describe.skipIf(!hasTestDb)('login and sessions', () => {
  let db: PrismaClient;
  let base: string;
  let close: () => void;
  let now = Date.now();

  beforeAll(async () => {
    db = await setupTestDb();
    await db.user.deleteMany();
    await db.user.create({ data: { username: 'noah', passwordHash: await hashPassword('a-long-password') } });
    await db.user.create({ data: { username: 'buddy', passwordHash: await hashPassword('another-password') } });

    const webDist = mkdtempSync(join(tmpdir(), 'web-'));
    mkdirSync(join(webDist, 'assets'));
    writeFileSync(join(webDist, 'index.html'), '<!doctype html><title>Slip Club</title>');
    writeFileSync(join(webDist, 'assets', 'app.js'), 'console.log(1)');

    const server = createApp(db, { webDist, loginLimiter: new LoginLimiter(() => now), signupLimiter: new LoginLimiter(() => now) }).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  }, 60_000);
  afterAll(async () => {
    close?.();
    await db?.$disconnect();
  });

  const login = (username: string, password: string) =>
    fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const cookieOf = (res: Response) => res.headers.get('set-cookie')!.split(';')[0]!;

  it('signs in and returns an HttpOnly session cookie', async () => {
    const res = await login('Noah', 'a-long-password');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: 'noah' });
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^sb_session=[\w-]{40,};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(await db.session.count()).toBe(1);
    // Only a hash of the token is stored.
    expect((await db.session.findFirstOrThrow()).tokenHash).not.toBe(cookieOf(res).split('=')[1]);
  });

  it('lets a session read bets but not sync', async () => {
    const cookie = cookieOf(await login('noah', 'a-long-password'));
    expect((await fetch(`${base}/api/bets`, { headers: { cookie } })).status).toBe(200);
    expect((await fetch(`${base}/api/auth/me`, { headers: { cookie } }).then((r) => r.json()))).toEqual({ username: 'noah', email: null, emailVerified: false });
    const sync = await fetch(`${base}/api/integrations/island-luck/sync`, {
      method: 'POST',
      headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'ISLAND_LUCK_KAMBI', capturedAt: new Date().toISOString(), coupons: [] }),
    });
    expect(sync.status).toBe(403);
  });

  const extensionToken = async (username: string, password: string) => {
    const res = await fetch(`${base}/api/auth/extension-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return { status: res.status, body: (await res.json()) as { username?: string; token?: string } };
  };
  const sync = (token: string, coupons: unknown[]) =>
    fetch(`${base}/api/integrations/island-luck/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'ISLAND_LUCK_KAMBI', capturedAt: '2026-09-27T17:00:00Z', coupons }),
    });

  it('gives the extension a token for the right password only', async () => {
    expect((await extensionToken('noah', 'wrong-password')).status).toBe(401);
    const { status, body } = await extensionToken('Noah', 'a-long-password');
    expect(status).toBe(200);
    expect(body.username).toBe('noah');
    expect(body.token).toMatch(/^sbk_[\w-]{40,}$/);
    // Only a hash of the token is stored.
    expect(await db.apiKey.count({ where: { tokenHash: body.token } })).toBe(0);
    expect((await sync(body.token!, [])).status).toBe(200);
    expect((await sync('sbk_not-a-real-token', [])).status).toBe(401);
  });

  it('shows each user only the bets synced with their own token', async () => {
    const noah = (await extensionToken('noah', 'a-long-password')).body.token!;
    const buddy = (await extensionToken('buddy', 'another-password')).body.token!;
    expect(await (await sync(noah, coupons.slice(0, 3))).json()).toMatchObject({ created: 3 });
    expect(await (await sync(buddy, coupons.slice(3, 5))).json()).toMatchObject({ created: 2 });

    const bets = async (cookie: string) =>
      ((await (await fetch(`${base}/api/bets?view=all`, { headers: { cookie } })).json()) as { coupons: { id: string }[] }).coupons;
    const cookie = cookieOf(await login('buddy', 'another-password'));
    const [mine, theirs] = [await bets(cookieOf(await login('noah', 'a-long-password'))), await bets(cookie)];
    expect([mine.length, theirs.length]).toEqual([3, 2]);

    // Nobody can open someone else's bet by id.
    expect((await fetch(`${base}/api/coupons/${theirs[0]!.id}`, { headers: { cookie } })).status).toBe(200);
    expect((await fetch(`${base}/api/coupons/${mine[0]!.id}`, { headers: { cookie } })).status).toBe(404);
    const list = (await (await fetch(`${base}/api/coupons`, { headers: { cookie } })).json()) as { coupons: unknown[] };
    expect(list.coupons).toHaveLength(2);
    const analysis = await fetch(`${base}/api/analysis`, { headers: { cookie } });
    expect(analysis.status).toBe(200);
  });

  it('keeps notifications private', async () => {
    const [noah, buddy] = await Promise.all(['noah', 'buddy'].map((username) => db.user.findUniqueOrThrow({ where: { username } })));
    await db.notification.create({ data: { userId: noah!.id, kind: 'PICK_HIT', dedupeKey: 'test:noah', title: 'mine', body: '' } });
    const cookie = cookieOf(await login('buddy', 'another-password'));
    const feed = (await (await fetch(`${base}/api/notifications`, { headers: { cookie } })).json()) as { unread: number; items: unknown[] };
    expect(feed).toEqual({ unread: 0, items: [] });
    const read = await fetch(`${base}/api/notifications/read`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: '{}' });
    expect(await read.json()).toEqual({ marked: 0 });
    expect(await db.notification.count({ where: { userId: noah!.id, readAt: null } })).toBe(1);
    expect(buddy).toBeTruthy();
  });

  it('limits extension and phone keys to syncing', async () => {
    const { token } = (await extensionToken('noah', 'a-long-password')).body;
    const headers = { Authorization: `Bearer ${token}` };
    expect((await sync(token!, [])).status).toBe(200);
    for (const path of ['/api/bets', '/api/coupons', '/api/analysis', '/api/notifications', '/api/social/me', '/api/live/status']) {
      expect((await fetch(`${base}${path}`, { headers })).status, path).toBe(403);
    }
    // A key can't make more keys: a leaked one stops working once it's revoked.
    const keys = await db.apiKey.count();
    expect((await fetch(`${base}/api/phone-sync`, { method: 'POST', headers })).status).toBe(403);
    expect(await db.apiKey.count()).toBe(keys);
  });

  it('disconnecting the extension revokes its token', async () => {
    const { token } = (await extensionToken('noah', 'a-long-password')).body;
    await fetch(`${base}/api/auth/extension-token`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    expect((await sync(token!, [])).status).toBe(401);
  });

  describe('phone sync', () => {
    const SYNC = '/api/integrations/island-luck/sync';

    it('gives a signed-in user a personal userscript that can sync', async () => {
      const cookie = cookieOf(await login('buddy', 'another-password'));
      expect((await fetch(`${base}/api/phone-sync`, { method: 'POST' })).status).toBe(401);
      const { url } = (await (await fetch(`${base}/api/phone-sync`, { method: 'POST', headers: { cookie } })).json()) as { url: string };
      expect(url).toMatch(new RegExp(`^${base}/userscript/sbk_[\\w-]+/island-luck-sync\\.user\\.js$`));

      // Fetched without the cookie, the way a userscript manager does.
      const res = await fetch(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('javascript');
      const script = await res.text();
      const token = url.split('/')[4]!;
      expect(script).toContain('// ==UserScript==');
      expect(script).toContain(`// @updateURL    ${url}`);
      expect(script).toContain(`const TRACKER_URL = "${base}";`);
      expect(script).toContain(`const TOKEN = "${token}";`);
      expect(script).not.toContain('__');

      const before = await db.coupon.count({ where: { sportsbookAccount: { user: { username: 'buddy' } } } });
      expect(await (await sync(token, coupons.slice(6, 7))).json()).toMatchObject({ created: 1 });
      expect(await db.coupon.count({ where: { sportsbookAccount: { user: { username: 'buddy' } } } })).toBe(before + 1);
    });

    it('serves nothing for unknown tokens', async () => {
      expect((await fetch(`${base}/userscript/sbk_${'x'.repeat(43)}/island-luck-sync.user.js`)).status).toBe(404);
      expect((await fetch(`${base}/userscript/nope/island-luck-sync.user.js`)).status).toBe(404);
    });

    it('allows cross-origin sync from Island Luck pages only', async () => {
      const preflight = (origin: string) =>
        fetch(`${base}${SYNC}`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
      const ok = await preflight('https://www.islandluck.com');
      expect(ok.status).toBe(204);
      expect(ok.headers.get('access-control-allow-origin')).toBe('https://www.islandluck.com');
      expect(ok.headers.get('access-control-allow-headers')).toContain('Authorization');
      expect(ok.headers.get('access-control-allow-credentials')).toBeNull();

      for (const origin of ['https://evil.example', 'https://islandluck.com.evil.example', 'http://www.islandluck.com']) {
        const res = await preflight(origin);
        expect(res.headers.get('access-control-allow-origin')).toBeNull();
        expect(res.status).toBe(401);
      }
      // Other endpoints stay closed to every origin.
      const bets = await fetch(`${base}/api/bets`, { method: 'OPTIONS', headers: { Origin: 'https://www.islandluck.com' } });
      expect(bets.headers.get('access-control-allow-origin')).toBeNull();

      const { token } = (await extensionToken('noah', 'a-long-password')).body;
      const posted = await fetch(`${base}${SYNC}`, {
        method: 'POST',
        headers: { Origin: 'https://www.islandluck.com', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'ISLAND_LUCK_KAMBI', capturedAt: '2026-09-27T17:00:00Z', coupons: [] }),
      });
      expect(posted.status).toBe(200);
      expect(posted.headers.get('access-control-allow-origin')).toBe('https://www.islandluck.com');
    });
  });

  describe('invite links', () => {
    const register = (body: Record<string, unknown>) =>
      fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const check = (token: string) => fetch(`${base}/api/auth/invite/${token}`).then((r) => r.status);

    it('lets the invited person pick a login, once', async () => {
      const { token } = await createInvite(db);
      expect(await db.invite.count({ where: { tokenHash: token } })).toBe(0);
      expect(await check(token)).toBe(200);

      expect((await register({ token, username: 'x', password: 'long-enough-pw' })).status).toBe(400);
      expect((await register({ token, username: 'friend', password: 'short' })).status).toBe(400);
      expect((await register({ token, username: 'Noah', password: 'long-enough-pw' })).status).toBe(409);
      // Failed attempts don't use up the link.
      expect(await check(token)).toBe(200);

      const res = await register({ token, username: ' Friend ', password: 'long-enough-pw' });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ username: 'friend' });
      // Signed in straight away, with an empty account of their own.
      const cookie = cookieOf(res);
      const bets = (await (await fetch(`${base}/api/bets?view=all`, { headers: { cookie } })).json()) as { coupons: unknown[] };
      expect(bets.coupons).toEqual([]);
      expect((await login('friend', 'long-enough-pw')).status).toBe(200);

      expect(await check(token)).toBe(404);
      expect((await register({ token, username: 'second', password: 'long-enough-pw' })).status).toBe(404);
      expect(await db.user.count({ where: { username: 'second' } })).toBe(0);
    });

    it('rejects expired, unknown and missing invites', async () => {
      const { token } = await createInvite(db, -1000);
      expect(await check(token)).toBe(404);
      expect((await register({ token, username: 'late', password: 'long-enough-pw' })).status).toBe(404);
      expect((await register({ token: 'made-up', username: 'late', password: 'long-enough-pw' })).status).toBe(404);
      expect((await register({ username: 'late', password: 'long-enough-pw' })).status).toBe(400);
      expect(await db.user.count({ where: { username: 'late' } })).toBe(0);
    });
  });

  describe('emails and asking for access', () => {
    const post = (path: string, body: Record<string, unknown>, cookie?: string) =>
      fetch(`${base}/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    const setEmail = (cookie: string, email: unknown) =>
      fetch(`${base}/api/auth/email`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ email }) });

    it('lets an existing account add an email later, and sign in with it', async () => {
      const cookie = cookieOf(await login('buddy', 'another-password'));
      expect((await setEmail(cookie, 'not an email')).status).toBe(400);
      const res = await setEmail(cookie, ' Buddy@Example.COM ');
      expect(await res.json()).toEqual({ email: 'buddy@example.com', emailVerified: false });
      expect(await fetch(`${base}/api/auth/me`, { headers: { cookie } }).then((r) => r.json())).toMatchObject({ email: 'buddy@example.com' });
      expect((await login('BUDDY@example.com', 'another-password')).status).toBe(200);
      expect((await login('buddy@example.com', 'wrong-password')).status).toBe(401);
      // An email is one account's.
      const noah = cookieOf(await login('noah', 'a-long-password'));
      expect((await setEmail(noah, 'buddy@example.com')).status).toBe(409);
      expect((await fetch(`${base}/api/auth/email`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(401);
    });

    it('takes a request to join, which waits for approval before it can sign in', async () => {
      expect((await post('signup', { username: 'newbie', password: 'long-enough-pw' })).status).toBe(400);
      expect((await post('signup', { username: 'buddy', email: 'new@example.com', password: 'long-enough-pw' })).status).toBe(409);
      expect((await post('signup', { username: 'newbie', email: 'buddy@example.com', password: 'long-enough-pw' })).status).toBe(409);
      const res = await post('signup', { username: 'Newbie', email: 'New@Example.com', password: 'long-enough-pw', note: 'Buddy’s cousin' });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ status: 'PENDING' });
      expect(res.headers.get('set-cookie')).toBeNull();
      expect(await db.user.findUniqueOrThrow({ where: { username: 'newbie' } })).toMatchObject({ email: 'new@example.com', status: 'PENDING', accessNote: 'Buddy’s cousin' });

      // The right password learns it's waiting; a wrong one learns nothing.
      const waiting = await login('newbie', 'long-enough-pw');
      expect(waiting.status).toBe(403);
      expect(await waiting.json()).toMatchObject({ pending: true });
      expect((await login('newbie', 'wrong-password')).status).toBe(401);
      expect((await post('extension-token', { username: 'newbie', password: 'long-enough-pw' })).status).toBe(403);

      // Not findable while waiting.
      const noah = cookieOf(await login('noah', 'a-long-password'));
      const people = await fetch(`${base}/api/social/people?q=newbie`, { headers: { cookie: noah } }).then((r) => r.json());
      expect(people).toEqual({ people: [] });
      expect((await fetch(`${base}/api/social/profiles/newbie`, { headers: { cookie: noah } })).status).toBe(404);

      await db.user.update({ where: { username: 'newbie' }, data: { status: 'ACTIVE' } });
      expect((await login('new@example.com', 'long-enough-pw')).status).toBe(200);
    });

    it('throttles requests to join', async () => {
      // Four requests above, refused or not; a fifth is allowed and a sixth isn't, for 15 minutes.
      expect((await post('signup', { username: 'spam1', email: 'spam1@example.com', password: 'long-enough-pw' })).status).toBe(201);
      expect((await post('signup', { username: 'spam3', email: 'spam3@example.com', password: 'long-enough-pw' })).status).toBe(429);
      now += 16 * 60_000;
      expect((await post('signup', { username: 'spam2', email: 'spam2@example.com', password: 'long-enough-pw' })).status).toBe(201);
    });

    it('keeps terminal escapes and hidden characters out of a request to join', async () => {
      // `npm run access` prints these for whoever approves requests.
      expect((await post('signup', { username: 'esc', email: 'a\u001b[2J@example.com', password: 'long-enough-pw' })).status).toBe(400);
      const res = await post('signup', { username: 'rtl', email: 'rtl@example.com', password: 'long-enough-pw', note: 'hi\u001b[2J\nthere‮evil' });
      expect(res.status).toBe(201);
      expect((await db.user.findUniqueOrThrow({ where: { username: 'rtl' } })).accessNote).toBe('hi [2J there evil');
    });
  });

  it('signs out', async () => {
    const cookie = cookieOf(await login('noah', 'a-long-password'));
    await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { cookie } });
    expect((await fetch(`${base}/api/bets`, { headers: { cookie } })).status).toBe(401);
  });

  it('rejects wrong passwords and unknown users the same way', async () => {
    const a = await login('noah', 'wrong-password');
    const b = await login('nobody', 'wrong-password');
    expect([a.status, b.status]).toEqual([401, 401]);
    expect(await a.json()).toEqual(await b.json());
  });

  it("doesn't let signing in to one account clear failures against another", async () => {
    now += 16 * 60_000;
    // Anyone can make an account like this by asking to join.
    await db.user.create({ data: { username: 'waiting', passwordHash: await hashPassword('long-enough-pw'), status: 'PENDING' } });
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 4; i++) await login('noah', `guess-${round}-${i}`);
      await login('waiting', 'long-enough-pw');
    }
    expect((await login('noah', 'one-more-guess')).status).toBe(429);
  });

  it('counts guesses sent all at once', async () => {
    now += 16 * 60_000;
    const statuses = await Promise.all(Array.from({ length: 10 }, (_, i) => login('noah', `burst-${i}`).then((r) => r.status)));
    expect(statuses.filter((s) => s === 401)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(5);
  });

  it('locks out after 5 failures for 15 minutes', async () => {
    now += 16 * 60_000; // clear earlier failures
    for (let i = 0; i < 5; i++) expect((await login('noah', `nope-${i}`)).status).toBe(401);
    const locked = await login('noah', 'a-long-password');
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
    now += 15 * 60_000 + 1000;
    expect((await login('noah', 'a-long-password')).status).toBe(200);
  });

  it('requires JSON for login', async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=noah&password=a-long-password',
    });
    expect(res.status).toBe(415);
  });

  it('expires sessions', async () => {
    const cookie = cookieOf(await login('noah', 'a-long-password'));
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await fetch(`${base}/api/bets`, { headers: { cookie } })).status).toBe(401);
  });

  it('serves the web app, with JSON 404s under /api', async () => {
    const page = await fetch(`${base}/settled/anything`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>Slip Club</title>');
    expect(page.headers.get('cache-control')).toBe('no-cache');
    const asset = await fetch(`${base}/assets/app.js`);
    expect(asset.headers.get('cache-control')).toContain('immutable');
    const cookie = cookieOf(await login('noah', 'a-long-password'));
    const missing = await fetch(`${base}/api/nope`, { headers: { cookie } });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Not found' });
  });
});
