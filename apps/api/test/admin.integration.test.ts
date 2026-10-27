import { request } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { findUsableInvite } from '../src/auth/invites';
import { LoginLimiter } from '../src/auth/loginLimiter';
import { recordingMailer } from '../src/email/mailer';
import { hashPassword } from '../src/auth/password';
import { hasTestDb, setupTestDb } from './testDb';

const ADMIN_HOST = 'admin.slipclub.test';
const APP_HOST = 'slipclub.test';

describe.skipIf(!hasTestDb)('admin site', () => {
  let db: PrismaClient;
  let port: number;
  let close: () => void;
  const { mailer, sent } = recordingMailer();

  beforeAll(async () => {
    db = await setupTestDb();
    await db.user.create({ data: { username: 'noah', passwordHash: await hashPassword('a-long-password'), admin: true, email: 'noah@example.com' } });
    await db.user.create({ data: { username: 'buddy', passwordHash: await hashPassword('another-password') } });
    await db.user.create({ data: { username: 'tbone', email: 'tbone@example.com', passwordHash: '!', status: 'PENDING', accessNote: 'Noah’s cousin' } });
    await db.user.create({ data: { username: 'stranger', email: 'who@example.com', passwordHash: '!', status: 'PENDING' } });

    const webDist = mkdtempSync(join(tmpdir(), 'web-'));
    mkdirSync(join(webDist, 'assets'));
    writeFileSync(join(webDist, 'index.html'), '<title>Slip Club</title>');
    writeFileSync(join(webDist, 'admin.html'), '<title>Slip Club admin</title>');

    const server = createApp(db, { webDist, mailer, publicUrl: 'https://slipclub.test', loginLimiter: new LoginLimiter(), signupLimiter: new LoginLimiter() }).listen(0);
    await new Promise((r) => server.once('listening', r));
    port = (server.address() as AddressInfo).port;
    close = () => server.close();
  }, 60_000);
  afterAll(async () => {
    close?.();
    await db?.$disconnect();
  });

  // fetch won't set Host, and the host is what picks the site.
  function call(host: string, method: string, path: string, opts: { cookie?: string; body?: unknown } = {}) {
    return new Promise<{ status: number; body: any; text: string; cookie?: string }>((resolve, reject) => {
      const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
      const req = request(
        { port, method, path, headers: { host, ...(payload ? { 'content-type': 'application/json' } : {}), ...(opts.cookie ? { cookie: opts.cookie } : {}) } },
        (res) => {
          let text = '';
          res.on('data', (c) => (text += c));
          res.on('end', () => {
            let body: unknown = null;
            try {
              body = JSON.parse(text);
            } catch {}
            resolve({ status: res.statusCode!, body, text, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] });
          });
        },
      );
      req.on('error', reject);
      req.end(payload);
    });
  }
  const signIn = async (host: string, username: string, password: string) => (await call(host, 'POST', '/api/auth/login', { body: { username, password } })).cookie!;

  it('serves the admin page on the admin host only', async () => {
    expect((await call(ADMIN_HOST, 'GET', '/')).text).toContain('admin');
    expect((await call(ADMIN_HOST, 'GET', '/requests')).text).toContain('admin');
    expect((await call(APP_HOST, 'GET', '/')).text).not.toContain('admin');
    expect((await call(APP_HOST, 'GET', '/admin.html')).text).not.toContain('admin');
  });

  it('answers only an admin, and only on the admin host', async () => {
    const admin = await signIn(ADMIN_HOST, 'noah', 'a-long-password');
    expect((await call(ADMIN_HOST, 'GET', '/api/admin/me', { cookie: admin })).body).toEqual({ username: 'noah' });
    // The same sign-in, sent to the app's host.
    expect((await call(APP_HOST, 'GET', '/api/admin/me', { cookie: admin })).status).toBe(404);

    const buddy = await signIn(ADMIN_HOST, 'buddy', 'another-password');
    const refused = await call(ADMIN_HOST, 'GET', '/api/admin/requests', { cookie: buddy });
    expect(refused.status).toBe(403);
    expect(refused.body.notAdmin).toBe(true);
    expect((await call(ADMIN_HOST, 'GET', '/api/admin/requests')).status).toBe(401);
  });

  it('lists, approves and declines requests to join', async () => {
    const admin = await signIn(ADMIN_HOST, 'noah', 'a-long-password');
    const list = await call(ADMIN_HOST, 'GET', '/api/admin/requests', { cookie: admin });
    expect(list.body.requests.map((r: { username: string }) => r.username)).toEqual(['tbone', 'stranger']);
    expect(list.body.requests[0]).toMatchObject({ email: 'tbone@example.com', note: 'Noah’s cousin' });

    sent.length = 0;
    const approved = await call(ADMIN_HOST, 'POST', '/api/admin/requests/tbone/approve', { cookie: admin });
    expect(approved.body).toEqual({ ok: true, emailed: true });
    expect((await db.user.findUniqueOrThrow({ where: { username: 'tbone' } })).status).toBe('ACTIVE');
    expect((await call(ADMIN_HOST, 'POST', '/api/admin/requests/stranger/decline', { cookie: admin })).status).toBe(200);
    expect(await db.user.findUnique({ where: { username: 'stranger' } })).toBeNull();
    expect(sent).toEqual([
      { to: 'tbone@example.com', template: 'access-approved', model: { username: 'tbone' } },
      { to: 'who@example.com', template: 'access-declined', model: {} },
    ]);

    // Neither touches an account that isn't waiting.
    expect((await call(ADMIN_HOST, 'POST', '/api/admin/requests/buddy/decline', { cookie: admin })).status).toBe(409);
    expect(await db.user.findUnique({ where: { username: 'buddy' } })).not.toBeNull();
    expect((await call(ADMIN_HOST, 'GET', '/api/admin/requests', { cookie: admin })).body.requests).toEqual([]);
  });

  it('emails each admin a new request', async () => {
    sent.length = 0;
    const asked = await call(APP_HOST, 'POST', '/api/auth/signup', { body: { username: 'newbie', email: 'newbie@example.com', password: 'long-enough-pw', note: '<b>hi</b>' } });
    expect(asked.status).toBe(201);
    expect(sent.map((s) => [s.to, s.template])).toEqual([
      ['newbie@example.com', 'access-received'],
      ['noah@example.com', 'access-requested'],
    ]);
    // Postmark escapes it in the template; the model carries what they typed.
    expect(sent[1]!.model).toMatchObject({ username: 'newbie', access_note: '<b>hi</b>', requested_at: expect.stringMatching(/\d{4}, \d{1,2}:\d{2}\s[AP]M$/) });
    await db.user.delete({ where: { username: 'newbie' } });
  });

  it('lists members', async () => {
    const admin = await signIn(ADMIN_HOST, 'noah', 'a-long-password');
    const { members } = (await call(ADMIN_HOST, 'GET', '/api/admin/members', { cookie: admin })).body;
    expect(members.map((m: { username: string }) => m.username)).toEqual(['noah', 'buddy', 'tbone']);
    expect(members[0]).toMatchObject({ admin: true, email: 'noah@example.com', lastSyncAt: null });
    expect(members[0].lastSeenAt).not.toBeNull();
  });

  it('makes invite links that open the app', async () => {
    const admin = await signIn(ADMIN_HOST, 'noah', 'a-long-password');
    expect((await call(ADMIN_HOST, 'POST', '/api/admin/invites', { cookie: admin, body: { days: 0 } })).status).toBe(400);
    const made = await call(ADMIN_HOST, 'POST', '/api/admin/invites', { cookie: admin, body: { days: 3 } });
    expect(made.status).toBe(201);
    expect(made.body.url).toMatch(/^https:\/\/slipclub\.test\/#invite=[\w-]+$/);
    expect(await findUsableInvite(db, made.body.url.split('=')[1])).not.toBeNull();
    const { invites } = (await call(ADMIN_HOST, 'GET', '/api/admin/invites', { cookie: admin })).body;
    expect(invites).toHaveLength(1);
    expect(invites[0].usedAt).toBeNull();
  });
});
