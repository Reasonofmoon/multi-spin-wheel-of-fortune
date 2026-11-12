import type { Locator } from '@playwright/test';
import { expect } from './fixtures';

type SegmentGeometry = {
  id: string;
  label: string;
  weight: number;
  color: string;
};

/** Independent angular interval oracle plus a real Canvas pixel, not domain imports. */
export async function assertPointerMatches(
  canvas: Locator,
  expectedId: string,
  announcement: string,
  isReflowing: boolean,
): Promise<number> {
  const sample = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const context = target.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    const previous = JSON.parse(
      target.dataset.previousSegments || '[]',
    ) as SegmentGeometry[];
    const current = JSON.parse(target.dataset.wheelSegments || '[]') as SegmentGeometry[];
    // Read the real rendered pixel through a readback-optimized probe, rather than
    // forcing the display canvas into CPU mode or causing Chromium readback warnings.
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const reader = probe.getContext('2d', { willReadFrequently: true });
    if (!reader) throw new Error('Canvas pixel readback is unavailable.');
    reader.drawImage(
      target,
      Math.floor(target.width / 2),
      Math.floor(target.height * 0.34),
      1,
      1,
      0,
      0,
      1,
      1,
    );
    const pixel = reader.getImageData(0, 0, 1, 1).data;
    return {
      previous,
      current,
      rotation: Number(target.dataset.rotationDeg),
      progress: Number(target.dataset.transitionProgress),
      pixel: [pixel[0], pixel[1], pixel[2]],
    };
  });
  if (isReflowing) expect(sample.progress).toBeLessThan(0.12);
  const segments = sample.previous.length > 0 ? sample.previous : sample.current;
  const total = segments.reduce((sum, segment) => sum + segment.weight, 0);
  const local = (((270 - (sample.rotation % 360)) % 360) + 360) % 360;
  let prefix = 0;
  const underPointer = segments.find((segment) => {
    prefix += segment.weight;
    return local < (360 * prefix) / total;
  });
  expect(underPointer?.id, announcement).toBe(expectedId);
  const channels = underPointer?.color
    .match(/[0-9a-f]{2}/gi)
    ?.map((value) => Number.parseInt(value, 16));
  expect(channels).toHaveLength(3);
  for (let channel = 0; channel < 3; channel += 1) {
    expect(
      Math.abs(sample.pixel[channel]! - channels![channel]!),
      announcement,
    ).toBeLessThanOrEqual(30);
  }
  return sample.rotation;
}
