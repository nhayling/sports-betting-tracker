/**
 * Kambi encodes decimal odds and handicap/total lines as integers × 1000
 * (1410 → 1.41, line 2500 → 2.5). Always keep the raw integer alongside the
 * converted value so nothing is lost to float rounding.
 */

export const KAMBI_SCALE = 1000;

export interface KambiOdds {
  raw: number;
  decimal: number;
}

export function kambiOdds(raw: unknown): KambiOdds | null {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return { raw: Math.round(n), decimal: n / KAMBI_SCALE };
}

export function kambiLineToNumber(raw: unknown): number | null {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return n / KAMBI_SCALE;
}

export function decimalToAmerican(decimal: number): number {
  if (decimal <= 1) throw new RangeError(`Decimal odds must be > 1, got ${decimal}`);
  return decimal >= 2
    ? Math.round((decimal - 1) * 100)
    : Math.round(-100 / (decimal - 1));
}

/**
 * Expected payout in minor units for a stake at raw Kambi odds, e.g.
 * 500 ($5.00) @ 12866 → 6433 ($64.33). Used to sanity-check parsed coupons.
 */
export function expectedPayoutMinor(stakeMinor: number, oddsRaw: number): number {
  return Math.round((stakeMinor * oddsRaw) / KAMBI_SCALE);
}
