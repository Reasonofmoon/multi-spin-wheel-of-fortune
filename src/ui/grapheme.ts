export function splitGraphemes(value: string, locale = 'ko'): string[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });
  return Array.from(segmenter.segment(value), (part) => part.segment);
}

export function truncateGraphemes(
  value: string,
  maxGraphemes: number,
  locale = 'ko',
): string {
  if (!Number.isInteger(maxGraphemes) || maxGraphemes < 0) {
    throw new RangeError('Maximum grapheme count must be a non-negative integer.');
  }
  const graphemes = splitGraphemes(value, locale);
  if (graphemes.length <= maxGraphemes) return value;
  if (maxGraphemes === 0) return '';
  return `${graphemes.slice(0, maxGraphemes - 1).join('')}…`;
}
