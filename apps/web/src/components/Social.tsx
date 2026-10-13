import { useState } from 'react';
import type { SocialMe } from '../api';
import { Leaderboard } from './Leaderboard';
import { People } from './People';
import { Profile } from './Profile';
import { SocialSettingsPanel } from './SocialSettings';

type Section = 'leaderboard' | 'people' | 'me' | 'settings';
type Route = { page: Section } | { page: 'user'; username: string; from: 'leaderboard' | 'people' };

const SECTIONS: Array<[Section, string]> = [
  ['leaderboard', 'Leaderboard'],
  ['people', 'People'],
  ['me', 'Profile'],
  ['settings', 'Settings'],
];

/** #social, #social/people, #social/me, #social/settings, #social/u/<username> */
function readRoute(): Route {
  const [, sub, arg] = location.hash.split('/');
  if (sub === 'u' && arg) {
    try {
      return { page: 'user', username: decodeURIComponent(arg), from: 'people' };
    } catch {
      // a mangled link falls through to the leaderboard
    }
  }
  return { page: sub === 'people' || sub === 'me' || sub === 'settings' ? sub : 'leaderboard' };
}

const hashOf = (r: Route) => (r.page === 'leaderboard' ? '#social' : r.page === 'user' ? `#social/u/${encodeURIComponent(r.username)}` : `#social/${r.page}`);

/**
 * The Social tab: leaderboard, people (friends, followers, requests), your
 * profile and privacy settings. `me` is null until it has loaded.
 */
export function Social({ me, onChanged, onSignedOut }: { me: SocialMe | null; onChanged: () => void; onSignedOut: () => void }) {
  const [route, setRouteState] = useState(readRoute);
  const setRoute = (r: Route) => {
    setRouteState(r);
    history.replaceState(null, '', hashOf(r));
  };
  const open = (username: string) =>
    setRoute(username === me?.username ? { page: 'me' } : { page: 'user', username, from: route.page === 'people' ? 'people' : 'leaderboard' });
  const settings = () => setRoute({ page: 'settings' });
  const active = route.page === 'user' ? route.from : route.page;
  const youLocked = me?.settings.locked ?? false;

  return (
    <div className="social">
      <div className="segmented subnav" role="group" aria-label="Social">
        {SECTIONS.map(([s, label]) => (
          <button key={s} className={active === s ? 'on' : ''} aria-pressed={active === s} onClick={() => setRoute({ page: s })}>
            {label}
            {s === 'people' && !!me?.pendingRequests && <span className="count">{me.pendingRequests}</span>}
          </button>
        ))}
      </div>

      {route.page === 'leaderboard' && <Leaderboard hidden={me ? !me.settings.showOnLeaderboard : false} onOpen={open} onSettings={settings} onSignedOut={onSignedOut} />}
      {route.page === 'people' && <People onOpen={open} onChanged={onChanged} onSignedOut={onSignedOut} />}
      {route.page === 'user' && (
        <Profile
          key={route.username}
          username={route.username}
          youLocked={youLocked}
          onBack={() => setRoute({ page: route.from })}
          onSettings={settings}
          onChanged={onChanged}
          onSignedOut={onSignedOut}
        />
      )}
      {(route.page === 'me' || route.page === 'settings') && !me && <p className="muted center">Loading…</p>}
      {route.page === 'me' && me && <Profile username={me.username} youLocked={youLocked} onSettings={settings} onChanged={onChanged} onSignedOut={onSignedOut} />}
      {route.page === 'settings' && me && <SocialSettingsPanel me={me} onChanged={onChanged} onSignedOut={onSignedOut} />}
    </div>
  );
}
