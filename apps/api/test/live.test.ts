import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PollerStatus } from '../src/live/poller';
import { liveRouter } from '../src/routes/live';

// One cycle's report covers every user's bets, so most of it is for the server log, not the people using it.
const status: PollerStatus = {
  running: true,
  intervalMs: 30_000,
  lastReport: {
    at: '2026-10-24T20:00:00.000Z',
    legsInWindow: 7,
    requests: { scoreboard: 2, summary: 3, roster: 1 },
    eventsMapped: 2,
    eventsUnmatched: ['Someone Else FC - Their Pick United (2026-10-24T19:00:00.000Z)'],
    liveEvents: 2,
    progressWritten: 4,
    errors: ['MIA @ KC box score: HTTP 500 https://site.api.espn.com/...'],
  },
  lastError: 'cycle failed: something internal',
  provider: { sentLastMinute: 6, pausedUntil: null, total: 120, rejectedLocally: 0, lastError: 'HTTP 429' },
};

let base: string;
let close: () => void;
beforeAll(async () => {
  const server = express().use('/api/live', liveRouter(() => status)).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());

describe('live status', () => {
  it('says whether live stats are on, and nothing about other people’s bets', async () => {
    const body = await (await fetch(`${base}/api/live/status`)).json();
    expect(body).toEqual({ running: true, lastReport: { at: '2026-10-24T20:00:00.000Z', liveEvents: 2 }, provider: { pausedUntil: null } });
  });
});
