export * from './money';
export * from './odds';
export * from './status';
export * from './types';
export { parseCoupon, parseHistoryResponse } from './parse';
export { couponsOf } from './raw';
export type { RawHistoryResponse, RawCoupon } from './raw';

/**
 * Bump when parser output changes for the same input, so the tracker
 * re-normalizes stored coupons on the next sync instead of treating them as unchanged.
 */
export const PARSER_VERSION = 2;
