import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  normalizeDegrees,
  segmentAtAngle,
  segmentForWeightValue,
  validateSegments,
  type Segment,
} from './segments';

function makeSegments(weights: readonly number[]): Segment[] {
  return weights.map((weight, index) => ({
    id: `segment-${index}`,
    label: `항목 ${index}`,
    weight,
  }));
}

function bruteForceOracle(
  segments: readonly Segment[],
  restAngleDeg: number,
  pointerAngleDeg: number,
): string {
  function wrap(angle: number): number {
    const remainder = angle % 360;
    if (remainder >= 0) return remainder;
    // Greatest representable number below 360, also used for negative subnormals.
    return Math.min(359.99999999999994, remainder + 360);
  }
  const localAngle = wrap(wrap(pointerAngleDeg) - wrap(restAngleDeg));
  const totalWeight = segments.reduce((total, segment) => total + segment.weight, 0);
  let cumulative = 0;
  for (const segment of segments) {
    cumulative += segment.weight;
    const boundary = (360 * cumulative) / totalWeight;
    if (localAngle < boundary) return segment.id;
  }
  return segments[0]!.id;
}

describe('weighted segment geometry', () => {
  it('agrees with an independent interval oracle for arbitrary weights and real angles', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 1_000 }), { minLength: 1, maxLength: 500 }),
        fc.double({
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.double({
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (weights, restAngle, pointerAngle) => {
          const segments = makeSegments(weights);
          expect(segmentAtAngle(segments, restAngle, pointerAngle)).toBe(
            bruteForceOracle(segments, restAngle, pointerAngle),
          );
        },
      ),
      { numRuns: 1_000, seed: 20260930 },
    );
  });

  it('assigns exact weighted boundaries to the clockwise-following segment', () => {
    const segments = makeSegments([1, 2, 3]);
    expect(segmentAtAngle(segments, 0, 60)).toBe('segment-1');
    expect(segmentAtAngle(segments, 0, 180)).toBe('segment-2');
    expect(segmentAtAngle(segments, 0, 360)).toBe('segment-0');
    expect(segmentAtAngle(segments, -60, 0)).toBe('segment-1');
  });

  it('keeps the immediately preceding representable angle on the preceding side', () => {
    const pair = makeSegments([1, 1]);
    expect(segmentAtAngle(pair, 0, 179.9999999999999)).toBe('segment-0');
    expect(segmentAtAngle(pair, 0, 180)).toBe('segment-1');
    expect(segmentAtAngle(pair, 0, 180.00000000000003)).toBe('segment-1');
    expect(segmentAtAngle(pair, -Number.MAX_VALUE, Number.MAX_VALUE)).toBe('segment-1');
    expect(segmentAtAngle(pair, Number.MAX_VALUE, -Number.MAX_VALUE)).toBe('segment-0');
    expect(segmentAtAngle(pair, Number.MAX_VALUE, Number.MAX_VALUE)).toBe('segment-0');
    expect(segmentAtAngle(pair, 0, Number.MIN_VALUE)).toBe('segment-0');
    expect(segmentAtAngle(pair, 0, -Number.MIN_VALUE)).toBe('segment-1');
  });

  it('ties every represented weighted boundary forward for 1,000 full-scale cases', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 1_000 }), { minLength: 1, maxLength: 500 }),
        (weights) => {
          const segments = makeSegments(weights);
          const total = weights.reduce((sum, weight) => sum + weight, 0);
          let prefix = 0;
          for (const [index, segment] of segments.entries()) {
            const start = (360 * prefix) / total;
            expect(segmentAtAngle(segments, 0, start)).toBe(segment.id);
            prefix += segment.weight;
            const end = (360 * prefix) / total;
            expect(segmentAtAngle(segments, 0, end)).toBe(
              segments[(index + 1) % segments.length]!.id,
            );
          }
        },
      ),
      { numRuns: 1_000, seed: 20260930 },
    );
  });

  it('normalizes negative and multi-turn angles', () => {
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(810)).toBe(90);
    expect(normalizeDegrees(359.99999999999994)).toBe(359.99999999999994);
    expect(normalizeDegrees(-Number.MIN_VALUE)).toBe(359.99999999999994);
    expect(segmentAtAngle(makeSegments([1, 1, 1, 1]), 450, 270)).toBe('segment-2');
    expect(() => normalizeDegrees(Number.NaN)).toThrow(RangeError);
    expect(() => normalizeDegrees(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    const maximumWheel = makeSegments(Array.from({ length: 500 }, () => 1_000));
    expect(segmentAtAngle(maximumWheel, 0, 359.99999999999994)).toBe('segment-499');
  });

  it('validates segment count, stable identity, and bounded integer weights', () => {
    expect(() => validateSegments([])).toThrow(RangeError);
    expect(() =>
      validateSegments(makeSegments(Array.from({ length: 501 }, () => 1))),
    ).toThrow(RangeError);
    expect(() =>
      validateSegments([
        { id: 'same', label: 'A', weight: 1 },
        { id: 'same', label: 'B', weight: 1 },
      ]),
    ).toThrow(RangeError);
    expect(() => validateSegments([{ id: ' ', label: 'A', weight: 1 }])).toThrow(
      RangeError,
    );
    expect(() =>
      validateSegments([{ id: 'id', label: 17, weight: 1 }] as unknown as Segment[]),
    ).toThrow(RangeError);
    expect(() =>
      validateSegments([{ id: 17, label: 'A', weight: 1 }] as unknown as Segment[]),
    ).toThrow(RangeError);
    for (const weight of [0, 1.5, 1_001]) {
      expect(() => validateSegments([{ id: 'x', label: 'X', weight }])).toThrow(
        RangeError,
      );
    }
    expect(validateSegments(makeSegments(Array.from({ length: 500 }, () => 1_000)))).toBe(
      500_000,
    );
  });

  it('maps every legal weight value and rejects values outside the half-open range', () => {
    const segments = makeSegments([1, 2, 3]);
    expect(segmentForWeightValue(segments, 0).id).toBe('segment-0');
    expect(segmentForWeightValue(segments, 1).id).toBe('segment-1');
    expect(segmentForWeightValue(segments, 2).id).toBe('segment-1');
    expect(segmentForWeightValue(segments, 3).id).toBe('segment-2');
    expect(segmentForWeightValue(segments, 5).id).toBe('segment-2');
    for (const value of [-1, 6, 1.2]) {
      expect(() => segmentForWeightValue(segments, value)).toThrow(RangeError);
    }
  });
});
