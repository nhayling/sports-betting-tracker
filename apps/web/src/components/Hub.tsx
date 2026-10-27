import { useCallback, useEffect, useState } from 'react';
import { fetchClubs, fetchProfile, SignedOutError, type ClubSummary, type ProfileView, type SocialMe } from '../api';
import { ClubPlate, NewClub } from './Clubs';
import { LoadError } from './LoadError';
import { PlayerCard, WhoSees } from './Profile';

/**
 * Social's front page: your player card with who sees what, then a standings
 * plate for each of your clubs, so one screen says how you're doing with your people.
 */
export function Hub({
  me,
  onOpenClub,
  onSettings,
  onPeople,
  onSignedOut,
}: {
  me: SocialMe;
  onOpenClub: (id: string) => void;
  onSettings: () => void;
  onPeople: () => void;
  onSignedOut: () => void;
}) {
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [clubs, setClubs] = useState<ClubSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const fail = useCallback((err: unknown) => (err instanceof SignedOutError ? onSignedOut() : setError(err instanceof Error ? err.message : String(err))), [onSignedOut]);
  useEffect(() => {
    let stale = false;
    setError(null);
    fetchProfile(me.username).then((p) => !stale && setProfile(p), fail);
    fetchClubs('week').then((r) => !stale && setClubs(r.clubs), fail);
    return () => {
      stale = true;
    };
    // Settings change what the card says (name, who sees what), so it reloads with them.
  }, [me, fail, attempt]);

  return (
    <div className="panels">
      {error && <LoadError onRetry={() => setAttempt((n) => n + 1)}>Can’t load everything right now.</LoadError>}
      {!profile && !error && <p className="muted center">Loading…</p>}
      {profile && (
        <PlayerCard
          profile={profile}
          aside={
            <button className="link" onClick={onSettings}>
              Settings
            </button>
          }
        >
          <WhoSees settings={me.settings} clubAmounts={clubs ? { on: clubs.filter((c) => c.youShareAmounts).length, of: clubs.length } : undefined} onSettings={onSettings} />
        </PlayerCard>
      )}

      <div className="hub-head">
        <h2>
          Your clubs <span className="muted small">this week</span>
        </h2>
        {!creating && clubs && clubs.length > 0 && (
          <button className="btn" onClick={() => setCreating(true)}>
            New club
          </button>
        )}
      </div>
      {creating && <NewClub onCreated={onOpenClub} onCancel={() => setCreating(false)} onSignedOut={onSignedOut} />}
      {clubs && clubs.length === 0 && !creating && (
        <section className="panel club-empty">
          <p className="lede">A club is a private board and bet feed for a league, a friend group or the group chat.</p>
          <p className="muted small">Start one and send its invite link, or open a link someone sent you.</p>
          <button className="btn primary" onClick={() => setCreating(true)}>
            Start a club
          </button>
        </section>
      )}
      {clubs?.map((c) => <ClubPlate key={c.id} club={c} period="week" onOpen={() => onOpenClub(c.id)} />)}
      {me.pendingRequests > 0 && (
        <p className="banner note">
          <span>
            {me.pendingRequests === 1 ? '1 request is' : `${me.pendingRequests} requests are`} waiting on you.
          </span>
          <button className="btn" onClick={onPeople}>
            See {me.pendingRequests === 1 ? 'it' : 'them'}
          </button>
        </p>
      )}
    </div>
  );
}
