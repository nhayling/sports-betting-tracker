import { describe, expect, it } from 'vitest';
import { parseHistoryResponse, type RawHistoryResponse } from '@sports-better/kambi';
import captured from '../../../packages/kambi/fixtures/captured/history-2026-09-27.json';
import { hashPayload, stableStringify } from '../src/sync/hash';
import { betFields, couponFields, legFields, selectionFields } from '../src/sync/records';

const coupon = parseHistoryResponse(captured as unknown as RawHistoryResponse).find(
  (c) => c.externalCouponRef === '13164001585',
)!;

describe('hash', () => {
  it('ignores key order', () => {
    expect(stableStringify({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(stableStringify({ a: [{ c: 2, d: 1 }], b: 1 }));
    expect(hashPayload({ a: 1, b: 2 })).toBe(hashPayload({ b: 2, a: 1 }));
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
  });
});

describe('record mapping', () => {
  it('maps coupon money in cents and keeps the raw payload', () => {
    const capturedAt = new Date('2026-09-27T17:00:00Z');
    const f = couponFields(coupon, { hash: 'h', parserVersion: 1, capturedAt });
    expect(f).toMatchObject({
      placedAt: new Date('2026-09-27T16:38:17.617Z'),
      currency: 'USD',
      rewardType: 'INSURANCE',
      status: 'OPEN',
      totalStakeMinor: 500,
      potentialPayoutMinor: 6433,
      rawPayloadHash: 'h',
      capturedAt,
    });
    expect(f.rawPayload).toBe(coupon.raw);
  });

  it('maps bets, legs and selections', () => {
    const bet = coupon.bets[0]!;
    expect(betFields(bet)).toMatchObject({ kind: 'COMBINATION', oddsRaw: 12866, stakeMinor: 500, status: 'OPEN' });
    expect(legFields(bet.legs[0]!)).toMatchObject({
      selectionType: 'BET_BUILDER',
      eventStartAt: new Date('2026-09-27T17:00:00Z'),
      league: 'NFL',
    });
    expect(selectionFields(bet.legs[0]!.selections[0]!)).toMatchObject({
      participantName: 'Kenneth Walker III',
      selectionSide: 'YES',
      lineRaw: 100000,
      settledResult: [],
    });
  });
});
