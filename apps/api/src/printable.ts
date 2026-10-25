/**
 * Text someone else wrote (a sign-up note, a synced market name), safe to print to a terminal or
 * log: control and invisible formatting characters (escape codes, newlines, right-to-left
 * overrides) become spaces, so it can't rewrite the screen or disguise one name as another.
 */
export const printable = (s: string) => s.replace(/[\p{Cc}\p{Cf}]/gu, ' ');
