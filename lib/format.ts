/** e.g. plural(1, 'set') → "1 set", plural(3, 'set') → "3 sets". */
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
