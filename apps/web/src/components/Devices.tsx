import { useCallback, useEffect, useState } from 'react';
import { createPhoneSyncLink, fetchDevices, removeDevice, signOutOthers, signOutSession, SignedOutError, type Device, type WebSession } from '../api';
import { dateTime, relativeTime } from '../format';
import { LoadError } from './LoadError';

/** "Chrome on Mac" from a User-Agent; never the raw string. */
export function browserName(ua: string | null): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os;
}

const deviceName = (d: Device) => (d.kind === 'phone' ? 'Phone (sync script)' : `${browserName(d.label) ?? 'Browser'} extension`);

/** lastUsedAt moves about once an hour, so anything newer reads as "within the last hour". */
function lastUsed(at: string | null): string {
  if (!at) return 'Never used';
  return Date.now() - Date.parse(at) < 60 * 60_000 ? 'Used within the last hour' : `Last used ${relativeTime(at)}`;
}

type Arm = { kind: 'device' | 'session' | 'replace'; id: string } | { kind: 'others' };

/**
 * Everything that can sync to your account, and where you're signed in on the
 * web, each with a way to cut it off. `version` changes when phone setup made
 * a new device, so the list reloads.
 */
export function Devices({ version, onSignedOut }: { version: number; onSignedOut: () => void }) {
  const [data, setData] = useState<{ devices: Device[]; sessions: WebSession[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState<Arm | null>(null);
  const [busy, setBusy] = useState(false);
  // A replaced phone key's new install link, shown until the panel reloads.
  const [replaced, setReplaced] = useState<string | null>(null);

  const fail = useCallback((err: unknown) => (err instanceof SignedOutError ? onSignedOut() : setError(err instanceof Error ? err.message : String(err))), [onSignedOut]);
  const load = useCallback(
    () =>
      fetchDevices().then((d) => {
        setData(d);
        setError(null);
      }, fail),
    [fail],
  );
  useEffect(() => void load(), [load, version]);
  // An armed confirm stands down after a few seconds, so a later stray tap can't remove anything.
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(id);
  }, [armed]);

  const isArmed = (a: Arm) => armed?.kind === a.kind && (a.kind === 'others' || (armed as { id: string }).id === (a as { id: string }).id);
  const run = async (a: Arm) => {
    if (!isArmed(a)) return setArmed(a);
    setArmed(null);
    setBusy(true);
    try {
      if (a.kind === 'replace') {
        // A new key first, then the old one goes: the phone is never left with nothing to install.
        const { url } = await createPhoneSyncLink();
        await removeDevice(a.id);
        setReplaced(url);
      } else await (a.kind === 'device' ? removeDevice(a.id) : a.kind === 'session' ? signOutSession(a.id) : signOutOthers());
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const others = data?.sessions.filter((s) => !s.current) ?? [];
  return (
    <section className="panel devices">
      <h2>Connected devices</h2>
      {error && !data && <LoadError onRetry={() => void load()}>Can’t load your devices right now.</LoadError>}
      {error && data && <p className="banner error" role="alert">{error}</p>}
      {!data && !error && <p className="muted small">Loading…</p>}
      {data && (
        <>
          <h3>Syncing bets</h3>
          {data.devices.length === 0 ? (
            <p className="muted small">No phone or extension is connected. Set up phone sync above.</p>
          ) : (
            <ul className="device-list">
              {data.devices.map((d) => {
                const a: Arm = { kind: 'device', id: d.id };
                return (
                  <li key={d.id} className="device">
                    <span>
                      <span className="device-name">{deviceName(d)}</span>
                      <span className="muted small block">
                        Added {dateTime(d.createdAt)} · {lastUsed(d.lastUsedAt)}
                      </span>
                    </span>
                    <span className="actions">
                      {d.kind === 'phone' && (
                        <button className={isArmed({ kind: 'replace', id: d.id }) ? 'btn danger' : 'btn'} disabled={busy} onClick={() => void run({ kind: 'replace', id: d.id })}>
                          {isArmed({ kind: 'replace', id: d.id }) ? 'Tap again to replace' : 'Replace'}
                        </button>
                      )}
                      <button className={isArmed(a) ? 'btn danger' : 'btn'} disabled={busy} onClick={() => void run(a)}>
                        {isArmed(a) ? 'Tap again to remove' : 'Remove'}
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {replaced && (
            <p className="replaced" role="status">
              New key made and the old one retired.{' '}
              <a className="install-link" href={replaced}>
                Install the new sync script
              </a>{' '}
              on your phone. This link signs in as you; don’t share it.
            </p>
          )}
          <p className="muted small">
            Replace makes a new phone key and retires the old one, for a lost phone or an install link you shared by mistake. Remove cuts a device off until you set it
            up again. The extension gets a new key when you sign in to it again.
          </p>

          <h3>Signed in on the web</h3>
          <ul className="device-list">
            {data.sessions.map((s) => {
              const a: Arm = { kind: 'session', id: s.id };
              return (
                <li key={s.id} className="device">
                  <span>
                    <span className="device-name">
                      {browserName(s.userAgent) ?? 'A browser'}
                      {s.current && <span className="chip">This browser</span>}
                    </span>
                    <span className="muted small block">
                      Signed in {dateTime(s.createdAt)} · active {relativeTime(s.lastSeenAt)}
                    </span>
                  </span>
                  {!s.current && (
                    <button className={isArmed(a) ? 'btn danger' : 'btn'} disabled={busy} onClick={() => void run(a)}>
                      {isArmed(a) ? 'Tap again to sign out' : 'Sign out'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {others.length > 0 && (
            <button className={isArmed({ kind: 'others' }) ? 'btn danger' : 'btn'} disabled={busy} onClick={() => void run({ kind: 'others' })}>
              {isArmed({ kind: 'others' }) ? `Tap again to sign out ${others.length}` : 'Sign out everywhere else'}
            </button>
          )}
          <span className="sr-only" aria-live="polite">
            {armed ? 'Tap again to confirm' : ''}
          </span>
        </>
      )}
    </section>
  );
}
