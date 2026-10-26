import { useEffect, useState, type FormEvent } from 'react';
import { saveEmail, type Me } from '../api';
import { readTheme, setTheme, type ThemeChoice } from '../theme';
import { Devices } from './Devices';
import { PhoneSync } from './PhoneSync';
import { About } from './Terms';

const THEMES: Array<[ThemeChoice, string]> = [
  ['light', 'Light'],
  ['dark', 'Dark'],
  ['system', 'System'],
];

/**
 * The account screen behind the header's person button: your email, signing
 * out, the theme, phone sync setup, connected devices, and what Slip Club is.
 */
export function Account({
  username,
  me,
  onEmailSaved,
  onClose,
  onSignOut,
  onSignedOut,
}: {
  username: string | null;
  me: Me | null;
  onEmailSaved: (email: string) => void;
  onClose: () => void;
  onSignOut: () => void;
  onSignedOut: () => void;
}) {
  // Bumped when phone setup makes a new device, so the list below shows it.
  const [devicesVersion, setDevicesVersion] = useState(0);
  return (
    <div className="account">
      <section className="panel">
        <div className="panel-head">
          <h2>Account</h2>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        {username && (
          <p className="lede">
            Signed in as <strong>{username}</strong>.
          </p>
        )}
        {me && <EmailField current={me.email} onSaved={onEmailSaved} />}
        <button className="btn" onClick={onSignOut}>
          Sign out
        </button>
      </section>
      <Appearance />
      <PhoneSync onCreated={() => setDevicesVersion((v) => v + 1)} />
      <Devices version={devicesVersion} onSignedOut={onSignedOut} />
      <About />
    </div>
  );
}

/** Light, dark, or the device's setting. Kept on this device only. */
function Appearance() {
  const [theme, setChoice] = useState(readTheme);
  const choose = (t: ThemeChoice) => {
    setTheme(t);
    setChoice(t);
  };
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Appearance</h2>
        <div className="segmented" role="group" aria-label="Theme">
          {THEMES.map(([t, label]) => (
            <button key={t} className={theme === t ? 'on' : ''} aria-pressed={theme === t} onClick={() => choose(t)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">{theme === 'system' ? 'Follows your device: light by day, dark at night if it switches.' : 'Just on this device. The header stays navy either way.'}</p>
    </section>
  );
}

/** Adding or changing your email. Optional for now; nothing is sent to it yet. */
function EmailField({ current, onSaved }: { current: string | null; onSaved: (email: string) => void }) {
  const [email, setEmail] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setEmail(current ?? ''), [current]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await saveEmail(email);
      onSaved(r.email!);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const unchanged = email.trim().toLowerCase() === (current ?? '');
  return (
    <form className="name-form" onSubmit={submit}>
      <label htmlFor="account-email" className="muted small">
        Email
      </label>
      <div className="name-row">
        <input id="account-email" type="email" autoComplete="email" autoCapitalize="none" maxLength={254} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button className="btn primary" disabled={busy || unchanged}>
          {busy ? 'Saving…' : current ? 'Change' : 'Add'}
        </button>
      </div>
      <p className="muted small" role="status">
        {error ?? (saved ? 'Saved. You can sign in with it now.' : 'You can sign in with it, and later reset your password. Nobody else sees it.')}
      </p>
    </form>
  );
}
