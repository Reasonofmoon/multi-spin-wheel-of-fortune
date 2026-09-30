export type Segment = Readonly<{
  id: string;
  label: string;
  weight: number;
}>;

export const MAX_SEGMENTS = 500;
export const MAX_SEGMENT_WEIGHT = 1_000;

export function validateSegments(segments: readonly Segment[]): number {
  if (!Array.isArray(segments) || segments.length < 1 || segments.length > MAX_SEGMENTS) {
    throw new RangeError(`A wheel must contain between 1 and ${MAX_SEGMENTS} segments.`);
  }

  const ids = new Set<string>();
  let totalWeight = 0;
  for (const segment of segments) {
    if (!segment.id.trim() || ids.has(segment.id)) {
      throw new RangeError('Segment ids must be non-empty and unique.');
    }
    if (
      !Number.isInteger(segment.weight) ||
      segment.weight < 1 ||
      segment.weight > MAX_SEGMENT_WEIGHT
    ) {
      throw new RangeError(
        `Segment weights must be integers from 1 to ${MAX_SEGMENT_WEIGHT}.`,
      );
    }
    ids.add(segment.id);
    totalWeight += segment.weight;
  }
  return totalWeight;
}

export function normalizeDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) {
    throw new RangeError('Angles must be finite real numbers.');
  }
  const remainder = degrees % 360;
  if (remainder === 0) return 0;
  if (remainder > 0) return remainder;

  const normalized = remainder + 360;
  // A negative subnormal can round to 360 when added; keep it just below the wrap.
  return normalized === 360 ? 360 - Number.EPSILON * 256 : normalized;
}

/**
 * Returns the id under the pointer. Angles use SVG coordinates: zero points right,
 * positive values turn clockwise. Segment intervals are start-inclusive/end-exclusive,
 * so an exact boundary belongs to the segment that begins at that boundary.
 */
export function segmentAtAngle(
  segments: readonly Segment[],
  restAngleDeg: number,
  pointerAngleDeg: number,
): string {
  const totalWeight = validateSegments(segments);
  const localAngle = normalizeDegrees(pointerAngleDeg - restAngleDeg);
  const weightPosition = (localAngle * totalWeight) / 360;
  // Account only for floating-point roundoff at a mathematically exact boundary.
  const boundaryTolerance = Number.EPSILON * Math.max(1, totalWeight, weightPosition) * 8;
  let cumulativeWeight = 0;

  for (const segment of segments) {
    cumulativeWeight += segment.weight;
    if (weightPosition < cumulativeWeight - boundaryTolerance) {
      return segment.id;
    }
  }

  // Rounding can make an angle just below 360° equal W in weight coordinates.
  return segments[segments.length - 1]!.id;
}

export function segmentForWeightValue(
  segments: readonly Segment[],
  value: number,
): Segment {
  const totalWeight = validateSegments(segments);
  if (!Number.isInteger(value) || value < 0 || value >= totalWeight) {
    throw new RangeError(`Draw value must be an integer in [0, ${totalWeight}).`);
  }

  let cumulativeWeight = 0;
  for (const segment of segments) {
    cumulativeWeight += segment.weight;
    if (value < cumulativeWeight) return segment;
  }

  // The range check above and positive weights make this unreachable.
  throw new RangeError('Draw value did not map to a segment.');
}
