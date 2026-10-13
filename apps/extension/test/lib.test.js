import { describe, expect, it } from 'vitest';
import {
  extractCoupons,
  isHistoryUrl,
  markAllPending,
  markSynced,
  mergeCoupons,
  pendingCoupons,
  stableStringify,
  summarize,
} from '../src/lib.js';

const HISTORY =
  'https://cf-al-auth-api.kambicdn.com/player/api/v2019/islandluck/coupon/history.json?lang=en_US&market=BS&client_id=200&channel_id=1&range_size=25&range_start=0&toDate=2026-09-28T03:59:59.999Z';

const open = { couponRef: 1, bets: [{ betStatus: 'OPEN' }] };
const lost = { couponRef: 2, bets: [{ betStatus: 'LOST' }] };

describe('isHistoryUrl', () => {
  it('matches only coupon history', () => {
    expect(isHistoryUrl(HISTORY)).toBe(true);
    expect(isHistoryUrl(HISTORY.replace('coupon/history', 'cashout'))).toBe(false);
    expect(isHistoryUrl('https://islandluck.com/sports')).toBe(false);
  });
});

describe('extractCoupons', () => {
  it('finds coupons under either key Kambi uses', () => {
    expect(extractCoupons({ coupons: [open] })).toEqual([open]);
    expect(extractCoupons({ historyCoupons: [lost], range: { more: false } })).toEqual([lost]);
    
  });

  it('returns null for an unrecognized shape instead of guessing', () => {
    expect(extractCoupons({ data: [] })).toBeNull();
    expect(extractCoupons(null)).toBeNull();
  });
});

describe('store', () => {
  it('treats key order as irrelevant', () => {
    expect(stableStringify({ a: 1, b: [{ d: 1, c: 2 }] })).toBe(stableStringify({ b: [{ c: 2, d: 1 }], a: 1 }));
  });

  it('adds new coupons as pending and ignores identical re-captures', () => {
    const first = mergeCoupons({}, [open, lost], 't1');
    expect(first).toMatchObject({ added: 2, changed: 0 });
    expect(pendingCoupons(first.store)).toHaveLength(2);

    const synced = markSynced(first.store, ['1', '2']);
    expect(pendingCoupons(synced)).toHaveLength(0);

    const again = mergeCoupons(synced, [{ bets: [{ betStatus: 'OPEN' }], couponRef: 1 }], 't2');
    expect(again).toMatchObject({ added: 0, changed: 0 });
    expect(pendingCoupons(again.store)).toHaveLength(0);
  });

  it('marks a settled coupon as pending again, without duplicating it', () => {
    const synced = markSynced(mergeCoupons({}, [open], 't1').store, ['1']);
    const settled = mergeCoupons(synced, [{ couponRef: 1, bets: [{ betStatus: 'WON' }] }], 't2');
    expect(settled).toMatchObject({ added: 0, changed: 1 });
    expect(Object.keys(settled.store)).toEqual(['1']);
    expect(pendingCoupons(settled.store).map((e) => e.raw.bets[0].betStatus)).toEqual(['WON']);
  });

  it('summarizes open, settled and pending counts', () => {
    const { store } = mergeCoupons({}, [open, lost], 't1');
    expect(summarize(markSynced(store, ['2']))).toEqual({ total: 2, open: 1, settled: 1, pending: 1 });
  });
});

describe('markAllPending', () => {
  it('re-sends everything after signing in somewhere else', () => {
    const { store } = mergeCoupons({}, [open, lost], '2026-09-27T17:00:00Z');
    const synced = markSynced(store, ['1', '2']);
    expect(pendingCoupons(synced)).toHaveLength(0);
    const reset = markAllPending(synced);
    expect(pendingCoupons(reset).map((e) => e.raw.couponRef)).toEqual([1, 2]);
    expect(reset['1'].capturedAt).toBe('2026-09-27T17:00:00Z');
  });
});
