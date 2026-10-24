/**
 * Name normalization shared by team and player matching.
 */

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

/** Lowercase, strip accents and punctuation, collapse spaces. "Amon-Ra St. Brown" → "amon ra st brown". */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface NormalizedName {
  /** Full normalized name including suffix: "kenneth walker iii". */
  full: string;
  /** Without generational suffix: "kenneth walker". */
  base: string;
  suffix: string | null;
  first: string;
  last: string;
}

export function normalizePersonName(name: string): NormalizedName {
  const tokens = normalizeText(name).split(' ').filter(Boolean);
  const suffix = tokens.length > 2 && SUFFIXES.has(tokens.at(-1)!) ? tokens.at(-1)! : null;
  const core = suffix ? tokens.slice(0, -1) : tokens;
  return {
    full: tokens.join(' '),
    base: core.join(' '),
    suffix,
    first: core[0] ?? '',
    last: core.slice(1).join(' '),
  };
}

/** Removes a leading or trailing ranking: "(1) Texas" → "Texas", and a UFC champion's "(C) Petr Yan" → "Petr Yan". */
export function stripRanking(teamName: string): string {
  return teamName.replace(/^\s*\((?:\d+|C)\)\s*/i, '').replace(/\s*\((?:\d+|C)\)\s*$/i, '').trim();
}
