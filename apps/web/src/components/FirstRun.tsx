import { PhoneSync } from './PhoneSync';

/** Shown until the first sync from Island Luck: how to get bets in, from a phone or a computer. */
export function FirstRun() {
  return (
    <div className="first-run">
      <div className="first-run-intro">
        <h2>Bring in your bets</h2>
        <p className="lede">Slip Club copies your bets from Island Luck. Nothing shows here until the first sync. Set it up once, on your phone or on a computer.</p>
      </div>
      <PhoneSync />
      <section className="panel on-computer">
        <h2>On a computer?</h2>
        <p className="lede">
          The Slip Club Sync extension for computers isn’t available to download yet. Set up from your phone instead: open <strong className="address">{location.origin}</strong> on
          the phone you use for Island Luck, sign in, and follow Sync from your phone. Your bets show up here too.
        </p>
        <details className="have-extension">
          {/* The extension is shared directly for now; link the store listing here once it is published. */}
          <summary>Someone gave you the extension?</summary>
          <ol className="steps">
            <li>Add it to your browser.</li>
            <li>
              Open the extension’s Settings. For Tracker URL enter <strong className="address">{location.origin}</strong>, then sign in with this account.
            </li>
            <li>
              Open My Bets on{' '}
              <a href="https://islandluck.com/" target="_blank" rel="noreferrer">
                Island Luck
              </a>
              . The extension copies what the page loads.
            </li>
          </ol>
        </details>
      </section>
      <p className="muted waiting" role="status">
        <span className="live-dot" aria-hidden /> Waiting for your first sync. This page checks every 15 seconds.
      </p>
    </div>
  );
}
