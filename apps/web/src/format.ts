export * from '@sports-better/display';

/** A sport's name mid-sentence: "basketball", but "MMA". */
export const inSentence = (name: string) => (name === name.toUpperCase() ? name : name.toLowerCase());
