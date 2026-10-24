// ==UserScript==
// @name         Sports Better: Island Luck sync
// @namespace    sports-better
// @version      1.2.0
// @description  Keeps your Slip Club tracker up to date with your bets.
// @match        https://islandluck.com/*
// @match        https://*.islandluck.com/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// @updateURL    __SCRIPT_URL__
// @downloadURL  __SCRIPT_URL__
// ==/UserScript==

/**
 * The phone version of the browser extension (apps/extension), for userscript
 * managers. Same passive capture: it wraps fetch and XMLHttpRequest so that
 * when the page's Kambi client loads coupon/history.json, a copy of the
 * response body is sent to the tracker. Nothing about the request (headers,
 * cookies, tokens) is read, and the page's own request is left untouched.
 *
 * This copy is personal: it carries a sign-in token for one tracker account.
 */
(() => {
  const TRACKER_URL = __TRACKER_URL__;
  const TOKEN = __TOKEN__;
  const TAG = 'sports-better/userscript';
  const HISTORY_PATH = /\/player\/api\/v\d+\/[^/]+\/coupon\/history\.json/;
  // The page often loads several history pages in a row; wait for them to settle before syncing.
  const SYNC_DELAY_MS = 3000;
  const MAX_PER_REQUEST = 500;

  if (window[TAG]) return;
  window[TAG] = true;

  const origFetch = window.fetch;

  /** Captured coupons not yet accepted by the tracker, newest copy per couponRef. */
  const pending = new Map();
  let capturedAt = null;
  let timer = null;
  let syncing = false;

  function toast(text, isError) {
    try {
      if (!document.body) return;
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText =
        'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:90vw;' +
        'padding:10px 14px;border-radius:10px;font:13px/1.35 system-ui,sans-serif;color:#fff;' +
        'box-shadow:0 4px 16px rgba(0,0,0,.35);background:' + (isError ? '#b3261e' : '#15803d');
      document.body.appendChild(el);
      setTimeout(() => el.remove(), isError ? 8000 : 4000);
    } catch {
      // Never let feedback break the page.
    }
  }

  async function sync() {
    if (syncing) return;
    syncing = true;
    try {
      const totals = { sent: 0, created: 0, updated: 0 };
      do {
        const batch = [...pending.entries()].slice(0, MAX_PER_REQUEST);
        const res = await origFetch.call(window, TRACKER_URL + '/api/integrations/island-luck/sync', {
          method: 'POST',
          // No cookies: the token is the only credential sent to the tracker.
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
          body: JSON.stringify({
            provider: 'ISLAND_LUCK_KAMBI',
            accountLabel: 'Island Luck',
            capturedAt,
            coupons: batch.map(([, raw]) => raw),
          }),
        });
        if (res.status === 401 || res.status === 403) {
          toast('Slip Club: sign-in expired. Install phone sync again from your tracker.', true);
          return;
        }
        if (!res.ok) {
          toast('Slip Club: the tracker returned ' + res.status + '. Bets will be sent again next time My Bets loads.', true);
          return;
        }
        const result = await res.json().catch(() => ({}));
        const failed = new Set((result.errors || []).map((e) => String(e.couponRef)));
        // Only forget what the tracker took, and only if it wasn't re-captured meanwhile.
        for (const [ref, raw] of batch) if (!failed.has(ref) && pending.get(ref) === raw) pending.delete(ref);
        totals.sent += batch.length - failed.size;
        totals.created += result.created || 0;
        totals.updated += result.updated || 0;
        if (failed.size) break;
      } while (pending.size > 0);
      if (totals.sent > 0) {
        const changes = [totals.created && totals.created + ' new', totals.updated && totals.updated + ' updated'].filter(Boolean).join(', ');
        toast('Slip Club: ' + totals.sent + ' bet' + (totals.sent === 1 ? '' : 's') + ' synced' + (changes ? ' (' + changes + ')' : ''));
      }
    } catch {
      toast('Slip Club: could not reach the tracker. Bets will be sent again next time My Bets loads.', true);
    } finally {
      syncing = false;
    }
  }

  function onHistory(text) {
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return;
    }
    // Kambi uses both `coupons` and `historyCoupons` for the same coupon shape.
    const coupons = body && (body.coupons || body.historyCoupons);
    if (!Array.isArray(coupons)) return;
    for (const c of coupons) if (c && c.couponRef !== undefined) pending.set(String(c.couponRef), c);
    capturedAt = new Date().toISOString();
    // Sync even with no coupons, so "Last synced" in the tracker reflects this visit.
    clearTimeout(timer);
    timer = setTimeout(sync, SYNC_DELAY_MS);
  }

  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = res.url || (args[0] instanceof Request ? args[0].url : String(args[0]));
      if (HISTORY_PATH.test(url) && res.ok) {
        res.clone().text().then(onHistory, () => {});
      }
    } catch {
      // Never let capture break the page.
    }
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      if (HISTORY_PATH.test(String(url))) {
        this.addEventListener('load', () => {
          try {
            if (this.status < 200 || this.status >= 300) return;
            const text =
              this.responseType === '' || this.responseType === 'text'
                ? this.responseText
                : this.responseType === 'json'
                  ? JSON.stringify(this.response)
                  : null;
            if (text) onHistory(text);
          } catch {
            // ignore
          }
        });
      }
    } catch {
      // ignore
    }
    return origOpen.call(this, method, url, ...rest);
  };
})();
