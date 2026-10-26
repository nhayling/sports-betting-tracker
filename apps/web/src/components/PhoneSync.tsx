import { useState } from 'react';
import { createPhoneSyncLink } from '../api';

/** Setup steps for syncing from a phone browser, with a personal install link for the userscript. */
export function PhoneSync({ onCreated }: { onCreated?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      setUrl((await createPhoneSyncLink()).url);
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel phone-sync">
      <h2>Sync from your phone</h2>
      <p className="muted small">Do this once, on the phone you use for Island Luck. No computer needed afterwards.</p>
      <ol>
        <li>
          Install a userscript manager. <strong>iPhone:</strong> the free “Userscripts” app from the App Store, then turn it on for Safari and allow it on
          islandluck.com. <strong>Android:</strong> Firefox with the Violentmonkey add-on.
        </li>
        <li>Open this page in that browser, create your install link below and tap it. The manager offers to install the script.</li>
        <li>Open My Bets on Island Luck. A green message confirms each sync; scroll to load older bets.</li>
      </ol>
      {error && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}
      {url ? (
        <p>
          <a className="install-link" href={url}>
            Install the sync script
          </a>
          <span className="muted small"> This link signs in as you. Don’t share it.</span>
        </p>
      ) : (
        <button className="primary" disabled={busy} onClick={create}>
          {busy ? 'Creating…' : 'Create my install link'}
        </button>
      )}
    </section>
  );
}
