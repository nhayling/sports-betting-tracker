/**
 * Sportsbook settlement status. Kambi is authoritative for these values; the
 * live-stats layer must never write them. The raw Kambi string is always kept
 * next to the normalized one.
 */
export type SettlementStatus =
  | 'OPEN'
  | 'WON'
  | 'LOST'
  | 'VOID'
  | 'CASHED_OUT'
  /** Coupon-level only: bets on one coupon settled differently (e.g. system bets). */
  | 'MIXED'
  | 'UNKNOWN';

const KAMBI_STATUS_MAP: Record<string, SettlementStatus> = {
  OPEN: 'OPEN',
  PLACED: 'OPEN',
  PENDING: 'OPEN',
  UNSETTLED: 'OPEN',
  WON: 'WON',
  WIN: 'WON',
  LOST: 'LOST',
  LOSS: 'LOST',
  LOSE: 'LOST',
  VOID: 'VOID',
  VOIDED: 'VOID',
  CANCELLED: 'VOID',
  CANCELED: 'VOID',
  PUSH: 'VOID',
  CASHED_OUT: 'CASHED_OUT',
  CASHOUT: 'CASHED_OUT',
  CASH_OUT: 'CASHED_OUT',
};

export function normalizeKambiStatus(raw: unknown): SettlementStatus {
  if (typeof raw !== 'string' || raw === '') return 'UNKNOWN';
  return KAMBI_STATUS_MAP[raw.trim().toUpperCase()] ?? 'UNKNOWN';
}

/** Derives a coupon status from its bets when Kambi doesn't give one directly. */
export function deriveCouponStatus(betStatuses: SettlementStatus[]): SettlementStatus {
  if (betStatuses.length === 0) return 'UNKNOWN';
  if (betStatuses.includes('OPEN')) return 'OPEN';
  if (betStatuses.includes('UNKNOWN')) return 'UNKNOWN';
  const first = betStatuses[0]!;
  return betStatuses.every((s) => s === first) ? first : 'MIXED';
}
