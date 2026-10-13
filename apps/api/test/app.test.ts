import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { Db } from '../src/db';

// No database: only the API key lookup is answered; these requests are rejected before any other query runs.
const KEY = 'sbk_test-key-0123456789';
const keyHash = createHash('sha256').update(KEY).digest('hex');
const db = new Proxy(
  {
    apiKey: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        where.tokenHash === keyHash ? { id: 'k1', lastUsedAt: new Date(), user: { id: 'u1', username: 'noah' } } : null,
    },
  } as Record<string, unknown>,
  { get: (target, prop: string) => target[prop] ?? (() => { throw new Error('db should not be touched'); })() },
) as unknown as Db;
let base: string;
let close: () => void;

beforeAll(async () => {
  const server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());

const post = (body: unknown, key: string | null = KEY) =>
  fetch(`${base}/api/integrations/island-luck/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  });

const valid = { provider: 'ISLAND_LUCK_KAMBI', accountLabel: 'Island Luck', capturedAt: '2026-09-27T17:00:00Z', coupons: [] };

describe('api auth', () => {
  it('serves health without a key', async () => {
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it('rejects missing or wrong keys', async () => {
    expect((await post(valid, null)).status).toBe(401);
    expect((await post(valid, 'wrong-key-0123456789')).status).toBe(401);
    expect((await fetch(`${base}/api/coupons`)).status).toBe(401);
  });
});

describe('sync validation', () => {
  it.each([
    ['wrong provider', { ...valid, provider: 'OTHER' }],
    ['coupons not an array', { ...valid, coupons: {} }],
    ['coupon without couponRef', { ...valid, coupons: [{}] }],
    ['bad capturedAt', { ...valid, capturedAt: 'yesterday' }],
    ['too many coupons', { ...valid, coupons: Array.from({ length: 501 }, (_, i) => ({ couponRef: i })) }],
  ])('rejects %s', async (_name, body) => {
    expect((await post(body)).status).toBe(400);
  });

  it('rejects malformed JSON', async () => {
    const res = await fetch(`${base}/api/integrations/island-luck/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: '{nope',
    });
    expect(res.status).toBe(400);
  });
});
