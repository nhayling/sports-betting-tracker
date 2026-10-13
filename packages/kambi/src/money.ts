/**
 * Kambi reports money in thousandths of the currency unit, the same ×1000
 * scale as odds: stake 5000 → $5.00, potentialPayout 64330 → $64.33.
 * (Confirmed against real $5 bets: every amount is a multiple of 10, i.e.
 * Kambi rounds to the cent, e.g. $5 × 267.205 = 1336.025 → 1336030.)
 *
 * The tracker stores integer minor units (cents). kambiMoneyToMinor is the
 * only place that converts from Kambi's scale; formatMoney/minorToMajor are
 * the only places that convert minor units for display.
 */

export const KAMBI_MONEY_SCALE = 1000;

/** ISO 4217 currencies whose minor unit is not 2 decimal places. */
const MINOR_UNIT_EXPONENT: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  BHD: 3,
  KWD: 3,
};

export function minorUnitExponent(currency: string): number {
  return MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2;
}

/** Converts a raw Kambi amount (thousandths) to integer minor units of `currency`. */
export function kambiMoneyToMinor(raw: unknown, currency = 'USD'): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.round((n * 10 ** minorUnitExponent(currency)) / KAMBI_MONEY_SCALE);
}

export function minorToMajor(minor: number, currency = 'USD'): number {
  return minor / 10 ** minorUnitExponent(currency);
}

export function formatMoney(minor: number, currency = 'USD', locale = 'en-US'): string {
  const digits = minorUnitExponent(currency);
  // BSD isn't reliably known to Intl; it trades 1:1 with USD, show a plain "$".
  const display = currency.toUpperCase() === 'BSD' ? 'USD' : currency;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: display,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minorToMajor(minor, currency));
}
