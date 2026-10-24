import { extractCoupons, isHistoryUrl, markAllPending, markSynced, mergeCoupons, pendingCoupons, summarize } from './lib.js';

const SYNC_PATH = '/api/integrations/island-luck/sync';
const TOKEN_PATH = '/api/auth/extension-token';
// apiKey is the token the tracker issues when you sign in; the password is never stored.
const DEFAULT_SETTINGS = { trackerUrl: 'https://slipclub.app', apiKey: '', username: '', accountLabel: 'Island Luck', autoSync: true };
// The page often loads several history pages in a row; wait for them to settle before auto-syncing.
const AUTO_SYNC_DELAY_MS = 3000;

// Captures arrive in bursts; serialize all store writes.
let queue = Promise.resolve();
const serialized = (fn) => (queue = queue.then(fn, fn));

async function getState() {
  const { coupons = {}, meta = {}, settings = {} } = await chrome.storage.local.get(['coupons', 'meta', 'settings']);
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  // A key saved before trackers had per-user sign-in no longer works; treat it as signed out.
  if (!merged.username) merged.apiKey = '';
  return { coupons, meta, settings: merged };
}

async function onCapture({ url, body, capturedAt = new Date().toISOString() }) {
  if (!isHistoryUrl(url)) return;
  const { coupons: store, meta } = await getState();
  const coupons = extractCoupons(body);

  if (!coupons) {
    // Unknown response shape: keep it so it can be downloaded and inspected.
    await chrome.storage.local.set({
      meta: { ...meta, lastCaptureAt: capturedAt, lastCaptureError: 'Unrecognized history response shape', unrecognized: body, unrecognizedAt: capturedAt },
    });
    return;
  }

  const { store: next, added, changed } = mergeCoupons(store, coupons, capturedAt);
  // Top-level fields besides coupons (e.g. range) are kept for fixture downloads.
  const { coupons: _c, historyCoupons: _h, ...pageMeta } = body;
  await chrome.storage.local.set({
    coupons: next,
    meta: {
      ...meta,
      lastCaptureAt: capturedAt,
      lastCaptureError: null,
      unrecognized: null,
      unrecognizedAt: null,
      lastCapture: { url, count: coupons.length, added, changed },
      pageMeta,
    },
  });
  // Sync even when nothing changed, so "Last synced" in the tracker reflects this visit.
  scheduleAutoSync();
}

let autoSyncTimer = null;
async function scheduleAutoSync() {
  const { settings } = await getState();
  if (!settings.autoSync || !settings.apiKey) return;
  clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => serialized(() => runSync('auto')), AUTO_SYNC_DELAY_MS);
}

/** Runs a sync and records the outcome so the popup can show it (auto-syncs have no popup open). */
async function runSync(trigger) {
  const res = await sync();
  const { meta } = await getState();
  await chrome.storage.local.set({
    meta: { ...meta, lastSyncTrigger: trigger, lastSyncError: res.ok ? null : res.error, lastSyncAttemptAt: new Date().toISOString() },
  });
  return res;
}

/**
 * A response the extension couldn't read is kept in meta.unrecognized. After an
 * update teaches it the shape, recover those bets on startup instead of waiting
 * for the next visit to My Bets.
 */
async function reprocessUnrecognized() {
  const { meta } = await getState();
  if (!meta.unrecognized) return;
  // Only recover it if it was the latest capture (a readable capture since
  // then clears the error), and keep its original time so older data can't
  // overwrite newer data in the tracker.
  const capturedAt = meta.unrecognizedAt ?? (meta.lastCaptureError ? meta.lastCaptureAt : null);
  if (!capturedAt || !extractCoupons(meta.unrecognized)) {
    if (!meta.lastCaptureError) await chrome.storage.local.set({ meta: { ...meta, unrecognized: null, unrecognizedAt: null } });
    return;
  }
  const url = meta.lastCapture?.url ?? 'https://recovered/player/api/v2019/islandluck/coupon/history.json';
  await onCapture({ url, body: meta.unrecognized, capturedAt });
}
serialized(reprocessUnrecognized);

/** Trades the tracker username and password for a token, then re-sends everything captured to that user. */
async function connect({ trackerUrl, username, password }) {
  let res;
  try {
    res = await fetch(new URL(TOKEN_PATH, trackerUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    return { ok: false, error: `Tracker unavailable at ${trackerUrl}.` };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) return { ok: false, error: body.error ?? `Tracker returned ${res.status}.` };

  const { coupons, meta, settings } = await getState();
  await chrome.storage.local.set({
    settings: { ...settings, trackerUrl, apiKey: body.token, username: body.username },
    coupons: markAllPending(coupons),
    meta: { ...meta, lastSyncAt: null, lastSyncResult: null, lastSyncError: null, lastConnectError: null },
  });
  scheduleAutoSync();
  return { ok: true, username: body.username };
}

/**
 * The first sign-in to a tracker needs the browser's site-access prompt, and
 * that prompt closes the popup. So the popup hands the sign-in over before
 * asking, and it is finished here once access is granted. The password is
 * only held in memory, for at most two minutes.
 */
const PENDING_CONNECT_MS = 2 * 60_000;
let pendingConnect = null;
let connecting = null;

function finishPendingConnect() {
  if (!pendingConnect) return connecting;
  const { creds, at } = pendingConnect;
  pendingConnect = null;
  if (Date.now() - at > PENDING_CONNECT_MS) return connecting;
  connecting = serialized(async () => {
    const res = await connect(creds);
    if (!res.ok) {
      // The popup may be closed; keep the error for when it is opened again.
      const { meta } = await getState();
      await chrome.storage.local.set({ meta: { ...meta, lastConnectError: res.error } });
    }
    return res;
  });
  return connecting;
}

chrome.permissions.onAdded.addListener(() => void finishPendingConnect());

async function disconnect() {
  const { settings } = await getState();
  if (settings.apiKey) {
    // Best effort: revoke the token on the tracker too.
    await fetch(new URL(TOKEN_PATH, settings.trackerUrl), { method: 'DELETE', headers: { Authorization: `Bearer ${settings.apiKey}` } }).catch(() => {});
  }
  await chrome.storage.local.set({ settings: { ...settings, apiKey: '', username: '' } });
  return { ok: true };
}

async function sync() {
  const { coupons: store, meta, settings } = await getState();
  if (!settings.apiKey) return { ok: false, error: 'Sign in to your tracker in Settings first.' };
  const pending = pendingCoupons(store);

  // One request per capture time, so the tracker can ignore captures older than what it has.
  const batches = new Map();
  for (const e of pending) batches.set(e.capturedAt, [...(batches.get(e.capturedAt) ?? []), e]);
  // Always report the latest capture, even with no changes, so the tracker
  // knows its data is current as of then ("Last synced").
  if (meta.lastCaptureAt && !batches.has(meta.lastCaptureAt)) batches.set(meta.lastCaptureAt, []);
  if (batches.size === 0) return { ok: true, result: { created: 0, updated: 0, unchanged: 0, sent: 0, nothingCaptured: true } };

  const totals = { created: 0, updated: 0, unchanged: 0, stale: 0, failed: 0 };
  let synced = store;
  for (const [capturedAt, entries] of [...batches].sort(([a], [b]) => a.localeCompare(b))) {
    let res;
    try {
      res = await fetch(new URL(SYNC_PATH, settings.trackerUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
        },
        body: JSON.stringify({
          provider: 'ISLAND_LUCK_KAMBI',
          accountLabel: settings.accountLabel,
          capturedAt,
          coupons: entries.map((e) => e.raw),
        }),
      });
    } catch {
      await chrome.storage.local.set({ coupons: synced });
      return { ok: false, error: `Tracker unavailable at ${settings.trackerUrl}. Unsynced bets are kept for next time.` };
    }
    if (!res.ok) {
      await chrome.storage.local.set({ coupons: synced });
      const hint = res.status === 401 || res.status === 403 ? ' Sign in again in Settings.' : '';
      return { ok: false, error: `Tracker returned ${res.status}.${hint}` };
    }
    const result = await res.json().catch(() => ({}));
    for (const k of Object.keys(totals)) totals[k] += result[k] ?? 0;
    const failedRefs = new Set((result.errors ?? []).map((e) => String(e.couponRef)));
    synced = markSynced(synced, entries.map((e) => String(e.raw.couponRef)).filter((ref) => !failedRefs.has(ref)));
  }

  const syncedAt = new Date().toISOString();
  await chrome.storage.local.set({
    coupons: synced,
    meta: { ...meta, lastSyncAt: syncedAt, lastSyncResult: totals },
  });
  return { ok: true, result: { ...totals, sent: pending.length } };
}

async function status() {
  const { coupons, meta, settings } = await getState();
  return { summary: summarize(coupons), meta: { ...meta, unrecognized: meta.unrecognized ? true : undefined }, settings };
}

/** Everything captured, in the same shape as history.json, for fixtures/debugging. */
async function exportCaptured() {
  const { coupons, meta } = await getState();
  return {
    ...(meta.pageMeta ?? {}),
    coupons: Object.values(coupons).map((e) => e.raw),
    ...(meta.unrecognized ? { _unrecognizedLastResponse: meta.unrecognized } : {}),
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Captures may only come from our content scripts; popup actions only from extension pages.
  const fromContentScript = sender.tab !== undefined;
  // Sign-in handover (see finishPendingConnect). Not serialized: finishing waits on the queue itself.
  if (!fromContentScript && msg?.type === 'connect-when-permitted') {
    pendingConnect = { creds: { trackerUrl: msg.trackerUrl, username: msg.username, password: msg.password }, at: Date.now() };
    connecting = null;
    sendResponse({ ok: true });
    return false;
  }
  if (!fromContentScript && msg?.type === 'cancel-connect') {
    pendingConnect = null;
    sendResponse({ ok: true });
    return false;
  }
  if (!fromContentScript && msg?.type === 'finish-connect') {
    (finishPendingConnect() ?? Promise.resolve({ ok: false, error: 'Sign-in did not finish. Try again.' })).then(sendResponse);
    return true;
  }
  const handlers = fromContentScript
    ? { 'history-captured': () => onCapture(msg) }
    : {
        sync: () => runSync('manual'),
        status: () => status(),
        export: () => exportCaptured(),
        connect: () => connect(msg),
        disconnect: () => disconnect(),
        'save-settings': async () => chrome.storage.local.set({ settings: { ...(await getState()).settings, ...msg.settings } }),
        clear: () => chrome.storage.local.remove(['coupons', 'meta']),
      };
  const handler = handlers[msg?.type];
  if (!handler) return false;
  serialized(handler).then(sendResponse, (err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
  return true;
});
