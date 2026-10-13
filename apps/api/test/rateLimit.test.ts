import { ProviderError } from '@sports-better/sports-data';
import { describe, expect, it } from 'vitest';
import { RateLimitedFetch } from '../src/live/rateLimit';

function setup(max: number, behaviour: () => unknown = () => ({ ok: true })) {
  let now = 0;
  let calls = 0;
  const limiter = new RateLimitedFetch(
    async () => {
      calls++;
      return behaviour();
    },
    { maxPerMinute: max, now: () => now },
  );
  return { limiter, advance: (ms: number) => (now += ms), calls: () => calls };
}

describe('RateLimitedFetch', () => {
  it('enforces the per-minute budget without calling the provider', async () => {
    const t = setup(3);
    for (let i = 0; i < 3; i++) await t.limiter.fetchJson('u');
    await expect(t.limiter.fetchJson('u')).rejects.toMatchObject({ kind: 'RATE_LIMITED' });
    expect(t.calls()).toBe(3);
    t.advance(60_001);
    await t.limiter.fetchJson('u');
    expect(t.calls()).toBe(4);
  });

  it('pauses after a 429, doubling on repeats and honouring Retry-After', async () => {
    let fail = true;
    const t = setup(100, () => {
      if (fail) throw new ProviderError('RATE_LIMITED', '429', 30);
      return {};
    });
    await expect(t.limiter.fetchJson('u')).rejects.toThrow('429');
    // Paused for max(60 s backoff, 30 s Retry-After) = 60 s.
    t.advance(59_000);
    await expect(t.limiter.fetchJson('u')).rejects.toThrow('paused');
    expect(t.calls()).toBe(1);
    t.advance(2_000);
    await expect(t.limiter.fetchJson('u')).rejects.toThrow('429');
    // Second consecutive 429: 120 s.
    t.advance(119_000);
    await expect(t.limiter.fetchJson('u')).rejects.toThrow('paused');
    t.advance(2_000);
    fail = false;
    await t.limiter.fetchJson('u');
    expect(t.limiter.stats().pausedUntil).toBeNull();
  });

  it('uses a longer Retry-After when ESPN sends one', async () => {
    const t = setup(100, () => {
      throw new ProviderError('RATE_LIMITED', '429', 300);
    });
    await expect(t.limiter.fetchJson('u')).rejects.toThrow('429');
    t.advance(299_000);
    await expect(t.limiter.fetchJson('u')).rejects.toThrow('paused');
  });

  it('pauses for 2 minutes after 3 network failures in a row', async () => {
    const t = setup(100, () => {
      throw new ProviderError('NETWORK', 'down');
    });
    for (let i = 0; i < 3; i++) await expect(t.limiter.fetchJson('u')).rejects.toThrow('down');
    await expect(t.limiter.fetchJson('u')).rejects.toThrow('paused');
    expect(t.calls()).toBe(3);
    t.advance(120_001);
    await expect(t.limiter.fetchJson('u')).rejects.toThrow('down');
  });

  it('does not pause on 404s', async () => {
    const t = setup(100, () => {
      throw new ProviderError('NOT_FOUND', 'missing');
    });
    for (let i = 0; i < 5; i++) await expect(t.limiter.fetchJson('u')).rejects.toThrow('missing');
    expect(t.calls()).toBe(5);
  });
});
