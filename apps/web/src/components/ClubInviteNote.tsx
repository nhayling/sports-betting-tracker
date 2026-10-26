import { pendingClubInvite } from '../clubInvite';

/** On the signed-out screens: a club invite is waiting, and what happens to it. */
export function ClubInviteNote({ children }: { children: string }) {
  if (!pendingClubInvite()) return null;
  return <p className="banner note club-invite-note">{children}</p>;
}
