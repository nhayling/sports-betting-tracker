import type { ReactNode } from 'react';

/** The app's small icon set: one 16px grid and stroke weight, drawn in the current text colour. */
const PATHS = {
  bell: <path d="M4 6.5a4 4 0 0 1 8 0c0 3 1.25 4 1.25 4H2.75S4 9.5 4 6.5ZM6.5 13a1.6 1.6 0 0 0 3 0" />,
  chevron: <path d="m4 6 4 4 4-4" />,
  check: <path d="m3.5 8.5 3 3 6-7" />,
  cross: <path d="m4.5 4.5 7 7m0-7-7 7" />,
  circle: <circle cx="8" cy="8" r="4.75" />,
  back: <path d="M13 8H3.5m4-4.5L3 8l4.5 4.5" />,
  external: <path d="M9.5 3H13v3.5M13 3 7.5 8.5M11.5 9.5V13H3V4.5h3.5" />,
  user: (
    <>
      <circle cx="8" cy="5.5" r="2.75" />
      <path d="M2.75 13.5a5.25 5.25 0 0 1 10.5 0" />
    </>
  ),
  lock: (
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
      <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" />
    </>
  ),
  football: (
    <>
      <ellipse cx="8" cy="8" rx="6.25" ry="3.75" transform="rotate(-35 8 8)" />
      <path d="m6.6 9.4 2.8-2.8" />
    </>
  ),
} satisfies Record<string, ReactNode>;

/** Decorative unless `label` is given, in which case screen readers announce it. */
export function Icon({ name, label }: { name: keyof typeof PATHS; label?: string }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {PATHS[name]}
    </svg>
  );
}
