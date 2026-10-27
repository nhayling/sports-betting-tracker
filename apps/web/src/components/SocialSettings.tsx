import { useState, type FormEvent } from 'react';
import { saveSocialSettings, SignedOutError, type SocialMe, type SocialSettings } from '../api';
import { Icon } from './Icon';

type Switches = Exclude<keyof SocialSettings, 'displayName'>;

/** Profile name, open or locked account, and privacy switches. Each choice saves as soon as it's made. */
export function SocialSettingsPanel({ me, onBack, onChanged, onSignedOut }: { me: SocialMe; onBack: () => void; onChanged: () => void; onSignedOut: () => void }) {
  const [settings, setSettings] = useState(me.settings);
  const [name, setName] = useState(me.settings.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (changes: Partial<SocialSettings>) => {
    const before = settings;
    setSaving(true);
    setError(null);
    setSettings({ ...settings, ...changes });
    try {
      const next = await saveSocialSettings(changes);
      setSettings(next);
      setName(next.displayName ?? '');
      onChanged();
    } catch (err) {
      setSettings(before);
      if (err instanceof SignedOutError) onSignedOut();
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };
  const saveName = (e: FormEvent) => {
    e.preventDefault();
    void save({ displayName: name.trim() || null });
  };
  const flip = (key: Switches, label: string, hint?: string) => (
    <label className="switch-row">
      <input type="checkbox" checked={settings[key]} disabled={saving} onChange={(e) => void save({ [key]: e.target.checked })} />
      <span>
        {label}
        {hint && <span className="muted small block">{hint}</span>}
      </span>
    </label>
  );

  return (
    <div className="panels">
      <button className="link back" onClick={onBack}>
        <Icon name="back" />
        Hub
      </button>
      {error && <p className="banner error" role="alert">{error}</p>}

      <section className="panel">
        <h2>Your name</h2>
        <form className="name-form" onSubmit={saveName}>
          <label htmlFor="display-name" className="muted small">
            Display name
          </label>
          <div className="name-row">
            <input id="display-name" value={name} maxLength={40} placeholder={me.username} autoComplete="off" onChange={(e) => setName(e.target.value)} />
            <button className="btn primary" disabled={saving || name.trim() === (settings.displayName ?? '')}>
              Save
            </button>
          </div>
          <p className="muted small">Shown instead of @{me.username} on your profile and the leaderboard.</p>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Privacy</h2>
          <div className="segmented" role="group" aria-label="Who can follow you">
            <button className={settings.locked ? '' : 'on'} aria-pressed={!settings.locked} disabled={saving} onClick={() => settings.locked && void save({ locked: false })}>
              Open
            </button>
            <button className={settings.locked ? 'on' : ''} aria-pressed={settings.locked} disabled={saving} onClick={() => !settings.locked && void save({ locked: true })}>
              Locked
            </button>
          </div>
        </div>
        {settings.locked ? (
          <>
            <p className="lede">Only friends and followers you approve can see your picks, odds and results.</p>
            <p className="muted small">
              People already following you keep their access; remove anyone from their profile. Switching back to Open approves every follow request still
              waiting.
            </p>
          </>
        ) : (
          <>
            <p className="lede">Anyone on this tracker can follow you and see your picks, odds and results.</p>
            <p className="muted small">Friends still need your approval. Lock your account to approve followers too.</p>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Bet amounts</h2>
        <p className="lede">
          Friends and followers see what each bet pays on Island Luck’s minimum bet, not your real stakes, payouts and winnings, unless you switch their group
          on here.
        </p>
        {flip('shareAmountsFriends', 'Share real amounts with friends')}
        {flip(
          'shareAmountsFollowers',
          'Share real amounts with followers',
          settings.locked ? 'Only followers you’ve approved.' : 'Your account is open, so this includes anyone on the tracker who follows you.',
        )}
        {flip('shareAmountsLeaderboard', 'Show my net winnings on the leaderboard', 'Adds a dollar figure next to your units. The ranking never uses dollars, but the two together let people work out roughly what you stake.')}
      </section>

      <section className="panel">
        <h2>Clubs</h2>
        {flip(
          'sharePicksClubs',
          'Share my picks with my clubs',
          'Members of your clubs see your picks, odds and results in the club’s feed and on your profile. Your record in units stays on each club’s board either way.',
        )}
        <p className="muted small">Real amounts are off in every club until you switch them on for that club, under Your sharing here on the club’s Members tab.</p>
      </section>

      <section className="panel">
        <h2>Leaderboard</h2>
        {flip('showOnLeaderboard', 'Show me on the leaderboard', 'Off also hides your record from people who aren’t your friends or followers.')}
      </section>
    </div>
  );
}
