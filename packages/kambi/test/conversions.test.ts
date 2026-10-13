import { describe, expect, it } from 'vitest';
import {
  decimalToAmerican,
  expectedPayoutMinor,
  formatMoney,
  kambiLineToNumber,
  kambiMoneyToMinor,
  kambiOdds,
  minorToMajor,
} from '../src';
import { deriveCouponStatus, normalizeKambiStatus } from '../src/status';

describe('money', () => {
  it('converts Kambi thousandths to cents', () => {
    expect(kambiMoneyToMinor(5000)).toBe(500);
    expect(kambiMoneyToMinor('64330')).toBe(6433);
    expect(kambiMoneyToMinor(1336030)).toBe(133603);
    expect(kambiMoneyToMinor(4750)).toBe(475);
    expect(kambiMoneyToMinor(5000, 'JPY')).toBe(5);
    expect(kambiMoneyToMinor(undefined)).toBeNull();
    expect(kambiMoneyToMinor('abc')).toBeNull();
  });

  it('converts minor units for display only', () => {
    expect(minorToMajor(500)).toBe(5);
    expect(minorToMajor(6433)).toBe(64.33);
    expect(formatMoney(500)).toBe('$5.00');
    expect(formatMoney(500, 'BSD')).toBe('$5.00');
    expect(formatMoney(6433)).toBe('$64.33');
  });
});

describe('odds', () => {
  it('converts raw ×1000 odds and keeps the raw value', () => {
    expect(kambiOdds(1410)).toEqual({ raw: 1410, decimal: 1.41 });
    expect(kambiOdds(3650)).toEqual({ raw: 3650, decimal: 3.65 });
    expect(kambiOdds(12866)).toEqual({ raw: 12866, decimal: 12.866 });
    expect(kambiOdds(0)).toBeNull();
    expect(kambiOdds(null)).toBeNull();
  });

  it('converts lines', () => {
    expect(kambiLineToNumber(-3500)).toBe(-3.5);
    expect(kambiLineToNumber(47500)).toBe(47.5);
    expect(kambiLineToNumber(undefined)).toBeNull();
  });

  it('agrees with the observed stake/odds/payout relationship', () => {
    // $5.00 at 12.866 → $64.33, as observed on Island Luck.
    expect(expectedPayoutMinor(500, 12866)).toBe(6433);
  });

  it('converts to American odds', () => {
    expect(decimalToAmerican(2.5)).toBe(150);
    expect(decimalToAmerican(1.41)).toBe(-244);
    expect(decimalToAmerican(2)).toBe(100);
  });
});

describe('status', () => {
  it('normalizes known statuses and flags unknown ones', () => {
    expect(normalizeKambiStatus('OPEN')).toBe('OPEN');
    expect(normalizeKambiStatus('won')).toBe('WON');
    expect(normalizeKambiStatus('CASHED_OUT')).toBe('CASHED_OUT');
    expect(normalizeKambiStatus('SOMETHING_NEW')).toBe('UNKNOWN');
    expect(normalizeKambiStatus(undefined)).toBe('UNKNOWN');
  });

  it('derives coupon status from bets', () => {
    expect(deriveCouponStatus(['OPEN', 'WON'])).toBe('OPEN');
    expect(deriveCouponStatus(['LOST', 'LOST'])).toBe('LOST');
    expect(deriveCouponStatus(['WON', 'LOST'])).toBe('MIXED');
    expect(deriveCouponStatus(['WON', 'UNKNOWN'])).toBe('UNKNOWN');
    expect(deriveCouponStatus([])).toBe('UNKNOWN');
  });
});
