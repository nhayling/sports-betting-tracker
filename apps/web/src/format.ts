import { money } from '@sports-better/display';

export * from '@sports-better/display';

/** A sport's name mid-sentence: "basketball", but "MMA". */
export const inSentence = (name: string) => (name === name.toUpperCase() ? name : name.toLowerCase());

/** Money with its sign: "+$4.25", "−$5.00". */
export const signed = (minor: number) => `${minor > 0 ? '+' : minor < 0 ? '−' : ''}${money(Math.abs(minor))}`;
