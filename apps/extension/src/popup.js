const $ = (id) => document.getElementById(id);
const send = (type, extra = {}) => chrome.runtime.sendMessage({ type, ...extra });

function formatWhen(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date().toDateString() === d.toDateString();
  return today ? `Today ${time}` : `${d.toLocaleDateString()} ${time}`;
}

async function render() {
  const { summary, meta, settings } = await send('status');
  $('last-sync').textContent = formatWhen(meta.lastSyncAt);

  $('stat-total').textContent = summary.total;
  $('stat-open').textContent = summary.open;
  $('stat-settled').textContent = summary.settled;
  $('counts').textContent = summary.pending ? `${summary.pending} not yet synced` : '';

  const hint = $('hint');
  hint.classList.toggle('err', Boolean(meta.lastCaptureError));
  hint.textContent = meta.lastCaptureError
    ? `${meta.lastCaptureError}. The parser may need updating for this response.`
    : meta.lastCaptureAt
      ? `Last seen on Island Luck ${formatWhen(meta.lastCaptureAt)}. Open My Bets there to refresh; scroll to load older bets.`
      : 'Open My Bets on Island Luck while logged in. Bets are picked up as the page loads them.';

  const auto = $('auto-sync');
  auto.classList.toggle('err', Boolean(meta.lastSyncError));
  auto.textContent = meta.lastSyncError
    ? `Last ${meta.lastSyncTrigger ?? ''} sync failed: ${meta.lastSyncError}`
    : settings.autoSync && settings.apiKey
      ? `Auto-sync on${meta.lastSyncTrigger === 'auto' && meta.lastSyncAt ? ` · last auto-sync ${formatWhen(meta.lastSyncAt)}` : ''}`
      : settings.apiKey
        ? 'Auto-sync off'
        : 'Sign in to your tracker in Settings to sync.';
  $('auto-sync-toggle').checked = settings.autoSync !== false;
  const signedIn = Boolean(settings.apiKey);
  $('signed-in').hidden = !signedIn;
  $('signed-out').hidden = signedIn;
  $('who').textContent = settings.username;
  $('where').textContent = settings.trackerUrl;
  if (!signedIn) $('settings').open = true;
  // A sign-in that failed after the permission prompt closed the popup.
  if (!signedIn && meta.lastConnectError && $('result').hidden) showResult({ ok: false, error: meta.lastConnectError });
  $('sync').disabled = summary.total === 0 || !signedIn;
  if (!$('tracker-url').value) $('tracker-url').value = settings.trackerUrl;
  $('account-label').value = settings.accountLabel;
}

function showResult(res) {
  const el = $('result');
  el.hidden = false;
  if (!res.ok) {
    el.className = 'result err';
    el.textContent = res.error;
    return;
  }
  const r = res.result;
  el.className = 'result ok';
  if (r.nothingCaptured) {
    el.textContent = 'Nothing captured yet. Open My Bets on Island Luck.';
    return;
  }
  if (r.sent === 0) {
    el.innerHTML = '<strong>✓ Up to date</strong><br />';
    el.append('No changes since the last sync.');
    return;
  }
  el.innerHTML = '<strong>✓ Synced</strong><br />';
  el.append(`${r.created ?? 0} new · ${r.updated ?? 0} updated · ${r.unchanged ?? 0} unchanged`);
  if (r.stale) el.append(` · ${r.stale} older than tracker`);
  if (r.failed) el.append(` · ${r.failed} failed (will retry)`);
}

$('sync').addEventListener('click', async () => {
  $('sync').disabled = true;
  $('sync').textContent = 'Syncing…';
  showResult(await send('sync'));
  $('sync').textContent = 'Sync now';
  await render();
});

const showMessage = (text) => {
  showResult({ ok: true, result: {} });
  $('result').textContent = text;
};

$('connect').addEventListener('click', async () => {
  const trackerUrl = $('tracker-url').value.trim() || 'https://slipclub.app';
  let origin;
  try {
    origin = new URL(trackerUrl).origin;
  } catch {
    showResult({ ok: false, error: 'Tracker URL is not a valid URL.' });
    return;
  }
  const creds = { trackerUrl: origin, username: $('username').value.trim(), password: $('password').value };
  const access = { origins: [`${origin}/*`] };
  let res;
  if (await chrome.permissions.contains(access)) {
    $('connect').disabled = true;
    res = await send('connect', creds);
  } else {
    // Host access is requested only for the configured tracker origin. The browser's prompt
    // closes this popup, so the service worker finishes the sign-in once access is granted.
    void send('connect-when-permitted', creds);
    const granted = await chrome.permissions.request(access);
    if (!granted) {
      await send('cancel-connect');
      showResult({ ok: false, error: `Permission to reach ${origin} was not granted.` });
      return;
    }
    $('connect').disabled = true;
    res = await send('finish-connect');
  }
  $('connect').disabled = false;
  if (!res.ok) {
    showResult(res);
    return;
  }
  $('password').value = '';
  showMessage(`Signed in as ${res.username}. Captured bets will sync to this account.`);
  await render();
});

$('disconnect').addEventListener('click', async () => {
  await send('disconnect');
  showMessage('Signed out. Captured bets stay in the extension.');
  await render();
});

$('save').addEventListener('click', async () => {
  await send('save-settings', {
    settings: {
      accountLabel: $('account-label').value.trim() || 'Island Luck',
      autoSync: $('auto-sync-toggle').checked,
    },
  });
  showMessage('Settings saved.');
});

$('clear').addEventListener('click', async () => {
  if (!confirm('Remove all captured bets from the extension? Bets already synced to the tracker are not affected.')) return;
  await send('clear');
  $('result').hidden = true;
  await render();
});

render();
