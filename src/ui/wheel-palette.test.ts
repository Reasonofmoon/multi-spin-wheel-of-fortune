import { describe, expect, it } from 'vitest';
import { perceptualDistance, wheelPalette } from './wheel-palette';

function relativeLuminance(hex: string): number {
  const channels = hex
    .match(/[0-9a-f]{2}/gi)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error('Invalid RGB hex color.');
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

describe('wheel palette', () => {
  it('keeps every neighbor, including the wrap seam, perceptually spaced at 500 segments', () => {
    const colors = wheelPalette(500);
    let minimumDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < colors.length; index += 1) {
      const next = colors[(index + 1) % colors.length]!;
      minimumDistance = Math.min(
        minimumDistance,
        perceptualDistance(colors[index]!, next),
      );
    }
    expect(minimumDistance).toBeGreaterThanOrEqual(0.19);
  });

  it('chooses black or white labels meeting WCAG 4.5:1 on every color', () => {
    for (const count of [1, 2, 3, 7, 500]) {
      for (const color of wheelPalette(count)) {
        const luminance = relativeLuminance(color.fill);
        const textLuminance = color.text === '#ffffff' ? 1 : 0;
        const ratio =
          (Math.max(luminance, textLuminance) + 0.05) /
          (Math.min(luminance, textLuminance) + 0.05);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the seam and every adjacent pair distinct at every supported wheel size', () => {
    for (let count = 2; count <= 500; count += 1) {
      const colors = wheelPalette(count);
      for (let i = 0; i < count; i += 1) {
        expect(
          perceptualDistance(colors[i]!, colors[(i + 1) % count]!),
          `N=${count}, seam=${i === count - 1}`,
        ).toBeGreaterThanOrEqual(0.19);
      }
    }
  });

  it('rejects palette sizes outside the supported wheel range', () => {
    expect(() => wheelPalette(0)).toThrow(RangeError);
    expect(() => wheelPalette(501)).toThrow(RangeError);
    expect(() => wheelPalette(2.5)).toThrow(RangeError);
  });
});
