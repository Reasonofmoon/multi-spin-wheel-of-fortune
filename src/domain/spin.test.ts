import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizeDegrees, segmentAtAngle, type Segment } from './segments';
import {
  rotationAtProgress,
  segmentWidthDegrees,
  solveRestAngle,
  targetRotationAtRest,
} from './spin';

function makeSegments(weights: readonly number[]): Segment[] {
  return weights.map((weight, index) => ({
    id: `id-${index}`,
    label: `라벨 ${index}`,
    weight,
  }));
}

describe('deterministic spin geometry', () => {
  it('solves a rest angle inside the selected segment for 1,000 generated cases', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 1_000 }), { minLength: 1, maxLength: 30 }),
        fc.double({
          min: -1_000_000,
          max: 1_000_000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        (weights, pointerAngle, fraction) => {
          const segments = makeSegments(weights);
          const chosenIndex = Math.abs(Math.trunc(pointerAngle)) % segments.length;
          const target = segments[chosenIndex]!;
          const restAngle = solveRestAngle(segments, target.id, pointerAngle, fraction);
          expect(segmentAtAngle(segments, restAngle, pointerAngle)).toBe(target.id);
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it('keeps the solved pointer position at least min(2°, 20% of width) from each boundary', () => {
    const segments = makeSegments([1, 2, 7, 13]);
    for (const fraction of [0, 0.1, 0.35, 0.9, 1]) {
      const targetId = 'id-2';
      const restAngle = solveRestAngle(segments, targetId, -725, fraction);
      const localAngle = normalizeDegrees(-725 - restAngle);
      const start = (360 * (1 + 2)) / 23;
      const width = segmentWidthDegrees(segments, targetId);
      const offset = localAngle - start;
      const minimumMargin = Math.min(2, width * 0.2);
      expect(offset).toBeGreaterThanOrEqual(minimumMargin - 1e-9);
      expect(width - offset).toBeGreaterThanOrEqual(minimumMargin - 1e-9);
    }

    const first = solveRestAngle(segments, 'id-2', 270, 0.1);
    const second = solveRestAngle(segments, 'id-2', 270, 0.9);
    expect(first).not.toBe(second);
  });

  it('supports a one-segment and a 500-segment wheel', () => {
    const single = makeSegments([17]);
    expect(segmentAtAngle(single, solveRestAngle(single, 'id-0', 270, 0.23), 270)).toBe(
      'id-0',
    );

    const maximum = makeSegments(Array.from({ length: 500 }, () => 1_000));
    const rest = solveRestAngle(maximum, 'id-499', 270, 0.75);
    expect(segmentAtAngle(maximum, rest, 270)).toBe('id-499');
  });

  it('rejects missing targets, invalid fractions, and invalid offsets', () => {
    const segments = makeSegments([1, 2]);
    expect(() => solveRestAngle(segments, 'missing', 0, 0.5)).toThrow(RangeError);
    for (const fraction of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => solveRestAngle(segments, 'id-0', 0, fraction)).toThrow(RangeError);
    }
    expect(() => segmentWidthDegrees(segments, 'missing')).toThrow(RangeError);
    expect(() => solveRestAngle(segments, 'id-0', Number.NaN, 0.5)).toThrow(RangeError);
  });

  it('chooses an unwrapped target at or after the current angle plus the minimum turns', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.double({ min: -100_000, max: 100_000, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 12 }),
        (current, rest, turns) => {
          const target = targetRotationAtRest(current, rest, turns);
          expect(target).toBeGreaterThanOrEqual(current + turns * 360);
          const difference = Math.abs(normalizeDegrees(target) - normalizeDegrees(rest));
          expect(Math.min(difference, 360 - difference)).toBeLessThan(1e-8);
        },
      ),
      { numRuns: 1_000 },
    );
    expect(() => targetRotationAtRest(Number.NaN, 0)).toThrow(RangeError);
    expect(() => targetRotationAtRest(0, 0, -1)).toThrow(RangeError);
  });

  it('uses frame-rate independent constant deceleration and never moves backward', () => {
    const start = 12.5;
    const target = 2_500.5;
    const positions = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((progress) =>
      rotationAtProgress(start, target, progress),
    );
    expect(positions[0]).toBe(start);
    expect(positions.at(-1)).toBe(target);
    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index]).toBeGreaterThanOrEqual(positions[index - 1]!);
    }
    expect(() => rotationAtProgress(3, 2, 0.5)).toThrow(RangeError);
    expect(() => rotationAtProgress(0, 1, Number.NaN)).toThrow(RangeError);
  });
});
