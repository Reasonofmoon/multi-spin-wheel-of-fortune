import { describe, expect, it } from 'vitest';
import { splitGraphemes, truncateGraphemes } from './grapheme';

describe('grapheme-safe label handling', () => {
  it('keeps Hangul syllables as graphemes', () => {
    expect(splitGraphemes('가나다')).toEqual(['가', '나', '다']);
    expect(truncateGraphemes('가나다라마바사', 5)).toBe('가나다라…');
  });

  it('keeps emoji ZWJ sequences and skin-tone modifiers intact', () => {
    const family = '👨‍👩‍👧‍👦';
    const wave = '👋🏽';
    expect(splitGraphemes(`${family}${wave}A`)).toEqual([family, wave, 'A']);
    expect(truncateGraphemes(`${family}${wave}A`, 2)).toBe(`${family}…`);
  });

  it('allows zero-length truncation and rejects invalid limits', () => {
    expect(truncateGraphemes('hello', 0)).toBe('');
    expect(() => truncateGraphemes('hello', -1)).toThrow(RangeError);
    expect(() => truncateGraphemes('hello', 1.5)).toThrow(RangeError);
  });
});
