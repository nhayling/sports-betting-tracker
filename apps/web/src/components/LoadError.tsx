/** Something failed to load: says so in plain words and offers another try. */
export function LoadError({ children, onRetry, busy = false }: { children: string; onRetry: () => void; busy?: boolean }) {
  return (
    <p className="banner error" role="alert">
      <span>{children}</span>
      <button className="btn" disabled={busy} onClick={onRetry}>
        {busy ? 'Trying…' : 'Retry'}
      </button>
    </p>
  );
}
