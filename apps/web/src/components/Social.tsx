import { useCallback, useEffect, useState } from 'react';
import type { SocialMe } from '../api';
import { ClubPage, JoinClub } from './Clubs';
import { Hub } from './Hub';
import { Leaderboard } from './Leaderboard';
import { People } from './People';
import { Profile } from './Profile';
import { SocialSettingsPanel } from './SocialSettings';

type Section = 'hub' | 'leaderboard' | 'people';
type Route =
  | { page: Section | 'settings' }
  | { page: 'user'; username: string; from: Section | 'club' }
  | { page: 'club'; id: string }
  | { page: 'join'; code: string };

const SECTIONS: Array<[Section, string]> = [
  ['hub', 'Hub'],
  ['leaderboard', 'Leaderboard'],
  ['people', 'People'],
];

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
};

/** #social, #social/leaderboard, #social/people, #social/settings, #social/u/<username>, #social/c/<club id>, #social/join/<invite code> */
function readRoute(): Route {
  const [, sub, arg] = location.hash.split('/');
  const value = arg ? decode(arg) : null;
  if (sub === 'u' && value) return { page: 'user', username: value, from: 'hub' };
  if (sub === 'c' && value) return { page: 'club', id: value };
  if (sub === 'join' && value) return { page: 'join', code: value };
  return { page: sub === 'leaderboard' || sub === 'people' || sub === 'settings' ? sub : 'hub' };
}

function hashOf(r: Route): string {
  switch (r.page) {
    case 'hub':
      return '#social';
    case 'user':
      return `#social/u/${encodeURIComponent(r.username)}`;
    case 'club':
      return `#social/c/${encodeURIComponent(r.id)}`;
    case 'join':
      return `#social/join/${encodeURIComponent(r.code)}`;
    default:
      return `#social/${r.page}`;
  }
}

/**
 * The Social tab: your hub (player card and clubs), the leaderboard, people,
 * and privacy settings. `me` is null until it has loaded.
 */
export function Social({ me, onChanged, onSignedOut }: { me: SocialMe | null; onChanged: () => void; onSignedOut: () => void }) {
  const [route, setRouteState] = useState(readRoute);
  // Where to go back to from a person opened inside a club.
  const [lastClub, setLastClub] = useState<string | null>(null);
  const setRoute = useCallback((r: Route) => {
    setRouteState(r);
    if (r.page === 'club') setLastClub(r.id);
    history.replaceState(null, '', hashOf(r));
    window.scrollTo(0, 0);
  }, []);
  // A link opened while the app is already showing (an invite tapped in another tab, the back button).
  useEffect(() => {
    const onHash = () => location.hash.startsWith('#social') && setRouteState(readRoute());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const open = (username: string) => {
    if (username === me?.username) return setRoute({ page: 'hub' });
    const from = route.page === 'leaderboard' || route.page === 'people' ? route.page : route.page === 'club' ? 'club' : 'hub';
    setRoute({ page: 'user', username, from });
  };
  const openClub = useCallback((id: string) => setRoute({ page: 'club', id }), [setRoute]);
  const settings = () => setRoute({ page: 'settings' });
  const hub = useCallback(() => setRoute({ page: 'hub' }), [setRoute]);
  const active: Section =
    route.page === 'user' ? (route.from === 'club' ? 'hub' : route.from) : route.page === 'leaderboard' || route.page === 'people' ? route.page : 'hub';
  const youLocked = me?.settings.locked ?? false;

  return (
    <div className="social">
      <div className="segmented subnav thirds" role="group" aria-label="Social">
        {SECTIONS.map(([s, label]) => (
          <button key={s} className={active === s ? 'on' : ''} aria-pressed={active === s} onClick={() => setRoute({ page: s })}>
            {label}
            {s === 'people' && !!me?.pendingRequests && <span className="count">{me.pendingRequests}</span>}
          </button>
        ))}
      </div>

      {(route.page === 'hub' || route.page === 'settings') && !me && <p className="muted center">Loading…</p>}
      {route.page === 'hub' && me && <Hub me={me} onOpenClub={openClub} onSettings={settings} onPeople={() => setRoute({ page: 'people' })} onSignedOut={onSignedOut} />}
      {route.page === 'leaderboard' && <Leaderboard hidden={me ? !me.settings.showOnLeaderboard : false} onOpen={open} onSettings={settings} onSignedOut={onSignedOut} />}
      {route.page === 'people' && <People onOpen={open} onChanged={onChanged} onSignedOut={onSignedOut} />}
      {route.page === 'settings' && me && <SocialSettingsPanel me={me} onBack={hub} onChanged={onChanged} onSignedOut={onSignedOut} />}
      {route.page === 'user' && (
        <Profile
          key={route.username}
          username={route.username}
          youLocked={youLocked}
          backLabel={route.from === 'club' ? 'Club' : route.from === 'hub' ? 'Hub' : route.from === 'leaderboard' ? 'Leaderboard' : 'People'}
          onBack={() => (route.from === 'club' && lastClub ? setRoute({ page: 'club', id: lastClub }) : setRoute({ page: route.from === 'club' ? 'hub' : route.from }))}
          onChanged={onChanged}
          onSignedOut={onSignedOut}
        />
      )}
      {route.page === 'club' && <ClubPage key={route.id} id={route.id} onBack={hub} onOpenPerson={open} onSettings={settings} onChanged={hub} onSignedOut={onSignedOut} />}
      {route.page === 'join' && <JoinClub code={route.code} onJoined={openClub} onCancel={hub} onSignedOut={onSignedOut} />}
    </div>
  );
}
