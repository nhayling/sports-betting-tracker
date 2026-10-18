import { PhoneSync } from './PhoneSync';

/** The account screen behind the header's person button: phone sync setup and signing out. */
export function Account({ username, onClose, onSignOut }: { username: string | null; onClose: () => void; onSignOut: () => void }) {
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
        <button className="btn" onClick={onSignOut}>
          Sign out
        </button>
      </section>
      <PhoneSync />
    </div>
  );
}
