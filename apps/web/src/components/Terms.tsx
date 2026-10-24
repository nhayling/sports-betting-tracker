/** The age confirmation every new account ticks. Required, so the form won't send without it. */
export function AgeCheck() {
  return (
    <label className="age-check">
      <input type="checkbox" required />
      I’m 18 or older
    </label>
  );
}

/** One quiet line at the foot of the sign-in screens. */
export function FinePrint() {
  return <p className="fine-print">Slip Club is an independent tracker, not a sportsbook. 18+.</p>;
}

/** What Slip Club is and isn't, at the bottom of the account screen. */
export function About() {
  return (
    <section className="panel about">
      <h2>About Slip Club</h2>
      <p>Slip Club is an independent tracker, not a sportsbook. We don’t take bets and aren’t affiliated with any bookmaker.</p>
      <p>Live scores and pick progress are unofficial and can be late or wrong. Your sportsbook’s settlement is the final word.</p>
      {/* Link a local help line here once there's one to point to. */}
      <p>18+ only. Bet what you can afford to lose. If it stops being fun, take a break.</p>
    </section>
  );
}
