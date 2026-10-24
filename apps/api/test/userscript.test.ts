import vm from 'node:vm';
import type { RawHistoryResponse } from '@sports-better/kambi';
import { describe, expect, it } from 'vitest';
import captured from '../../../packages/kambi/fixtures/captured/history-2026-09-27.json';
import { renderUserscript } from '../src/routes/phoneSync';

const coupons = (captured as unknown as RawHistoryResponse).coupons!;
const HISTORY = 'https://cf-al-auth-api.kambicdn.com/player/api/v2019/islandluck/coupon/history.json?range_size=25&range_start=0';
const SYNC = 'https://bets.example.com/api/integrations/island-luck/sync';
const tick = () => new Promise((r) => setTimeout(r, 0));

interface Call {
  url: string;
  init?: { method?: string; credentials?: string; headers?: Record<string, string>; body?: string };
}

interface FakeElement {
  style: Record<string, string>;
  textContent: string;
  children: FakeElement[];
  appendChild(child: FakeElement): void;
  setAttribute(name: string, value: string): void;
  remove(): void;
}
const fakeElement = (): FakeElement => ({
  style: {},
  textContent: '',
  children: [],
  appendChild(child) {
    this.children.push(child);
  },
  setAttribute() {},
  remove() {},
});

/** Runs the userscript in a fake page whose own fetch answers Kambi and the tracker. */
function page(tracker: (body: { coupons: { couponRef: number }[] }) => { status: number; json?: unknown }) {
  const calls: Call[] = [];
  const timers: Array<() => void> = [];
  const toasts: string[] = [];
  const pageFetch = async (input: unknown, init?: Call['init']) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === SYNC) {
      const r = tracker(JSON.parse(init!.body!));
      return { ok: r.status >= 200 && r.status < 300, status: r.status, url, json: async () => r.json ?? {} };
    }
    const text = JSON.stringify(url.includes('history.json') ? { coupons } : { events: [] });
    return { ok: true, status: 200, url, clone: () => ({ text: async () => text }) };
  };
  class XMLHttpRequest {
    open() {}
    addEventListener() {}
  }
  const ctx: Record<string, unknown> = {
    fetch: pageFetch,
    XMLHttpRequest,
    Request: class {},
    document: {
      // A toast is icon | message: what it says is its children's text.
      body: { appendChild: (el: FakeElement) => toasts.push(el.children.map((c) => c.textContent).join('')) },
      createElement: fakeElement,
      createElementNS: fakeElement,
    },
    // Timers are run by hand; toast removal timers are harmless no-ops.
    setTimeout: (fn: () => void) => timers.push(fn),
    clearTimeout: (id: number) => void (timers[id - 1] = () => {}),
  };
  ctx.window = ctx;
  vm.runInNewContext(renderUserscript({ trackerUrl: 'https://bets.example.com/', token: 'sbk_test-token' }), ctx);
  const runTimers = async () => {
    for (const fn of timers.splice(0)) fn();
    for (let i = 0; i < 10; i++) await tick();
  };
  return { ctx: ctx as { fetch: typeof pageFetch }, calls, toasts, runTimers, syncCalls: () => calls.filter((c) => c.url === SYNC) };
}

describe('phone userscript', () => {
  it('is a valid userscript for Island Luck pages', () => {
    const script = renderUserscript({ trackerUrl: 'https://bets.example.com', token: 'sbk_test-token' });
    expect(script.startsWith('// ==UserScript==')).toBe(true);
    expect(script).toContain('// @match        https://*.islandluck.com/*');
    expect(script).toContain('// @run-at       document-start');
    expect(script).toContain('// @updateURL    https://bets.example.com/userscript/sbk_test-token/island-luck-sync.user.js');
  });

  it('copies bet history the page loads to the tracker, once the page settles', async () => {
    const p = page(() => ({ status: 200, json: { created: 15, updated: 0, errors: [] } }));
    // The page still gets its own response back, untouched.
    const res = await p.ctx.fetch(HISTORY);
    expect(res.ok).toBe(true);
    await tick();
    expect(p.syncCalls()).toHaveLength(0);

    await p.runTimers();
    const [call] = p.syncCalls();
    expect(call!.init).toMatchObject({ method: 'POST', credentials: 'omit', headers: { Authorization: 'Bearer sbk_test-token' } });
    const body = JSON.parse(call!.init!.body!);
    expect(body).toMatchObject({ provider: 'ISLAND_LUCK_KAMBI', accountLabel: 'Island Luck' });
    expect(body.coupons).toHaveLength(15);
    expect(Number.isNaN(Date.parse(body.capturedAt))).toBe(false);
    expect(p.toasts).toEqual(['15 bets synced (15 new)']);
  });

  it('ignores other requests', async () => {
    const p = page(() => ({ status: 200 }));
    await p.ctx.fetch('https://eu.offering-api.kambicdn.com/offering/v2018/islandluck/event/live/open.json');
    await p.runTimers();
    expect(p.syncCalls()).toHaveLength(0);
  });

  it('keeps bets the tracker did not take and sends them with the next capture', async () => {
    let up = false;
    const p = page(() => (up ? { status: 200, json: { created: 15 } } : { status: 503 }));
    await p.ctx.fetch(HISTORY);
    await p.runTimers();
    expect(p.toasts[0]).toContain('returned 503');

    up = true;
    await p.ctx.fetch(HISTORY);
    await p.runTimers();
    expect(JSON.parse(p.syncCalls()[1]!.init!.body!).coupons).toHaveLength(15);
  });

  it('says so when the sign-in no longer works', async () => {
    const p = page(() => ({ status: 401 }));
    await p.ctx.fetch(HISTORY);
    await p.runTimers();
    expect(p.toasts).toEqual(['Sign-in expired. Install phone sync again from your tracker.']);
  });
});
