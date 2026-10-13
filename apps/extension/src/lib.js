/**
 * Pure helpers shared by the service worker and popup. No chrome.* here so
 * they can be unit tested.
 *
 * The extension deliberately does not normalize coupons; the tracker does
 * that server-side with @sports-better/kambi. These helpers only find coupons
 * in a captured page and count them for the popup.
 */

export const HISTORY_PATH = /\/player\/api\/v\d+\/[^/]+\/coupon\/history\.json/;

export function isHistoryUrl(url) {
  return HISTORY_PATH.test(url);
}

/**
 * Returns the coupon array of a history response, or null if the shape is
 * unrecognized. Kambi uses both `coupons` and `historyCoupons` for the same
 * coupon shape (both seen from Island Luck on 2026-09-27).
 */
export function extractCoupons(body) {
  const coupons = body?.coupons ?? body?.historyCoupons;
  return Array.isArray(coupons) ? coupons.filter((c) => c && c.couponRef !== undefined) : null;
}

/** Stable JSON so re-captures of an identical coupon compare equal regardless of key order. */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Merges captured coupons into the store. A coupon is marked pending (needs
 * sync) only when it is new or its content changed.
 *
 * store: { [couponRef]: { raw, json, capturedAt, syncedJson } }
 */
export function mergeCoupons(store, coupons, capturedAt) {
  const next = { ...store };
  let added = 0;
  let changed = 0;
  for (const raw of coupons) {
    const ref = String(raw.couponRef);
    const json = stableStringify(raw);
    const prev = next[ref];
    if (!prev) added++;
    else if (prev.json !== json) changed++;
    else continue;
    next[ref] = { raw, json, capturedAt, syncedJson: prev?.syncedJson ?? null };
  }
  return { store: next, added, changed };
}

export function pendingCoupons(store) {
  return Object.values(store).filter((e) => e.json !== e.syncedJson);
}

export function markSynced(store, refs) {
  const next = { ...store };
  for (const ref of refs) {
    const e = next[ref];
    if (e) next[ref] = { ...e, syncedJson: e.json };
  }
  return next;
}

/** Marks every coupon as needing sync, e.g. after signing in to a different tracker or user. */
export function markAllPending(store) {
  return Object.fromEntries(Object.entries(store).map(([ref, e]) => [ref, { ...e, syncedJson: null }]));
}

/** A coupon is open while any of its bets is open. Raw Kambi strings, display only. */
export function isOpenCoupon(raw) {
  return (raw.bets ?? []).some((b) => String(b?.betStatus ?? '').toUpperCase() === 'OPEN');
}

export function summarize(store) {
  const entries = Object.values(store);
  const open = entries.filter((e) => isOpenCoupon(e.raw)).length;
  return {
    total: entries.length,
    open,
    settled: entries.length - open,
    pending: pendingCoupons(store).length,
  };
}
