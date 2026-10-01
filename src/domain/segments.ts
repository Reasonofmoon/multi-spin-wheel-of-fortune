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
    if (typeof segment.id !== 'string' || !segment.id.trim() || ids.has(segment.id)) {
      throw new RangeError('Segment ids must be non-empty and unique.');
    }
    if (typeof segment.label !== 'string') {
      throw new RangeError('Segment labels must be strings.');
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
  // Normalize separately: subtracting two finite extremes can overflow to Infinity.
  const localAngle = normalizeDegrees(
    normalizeDegrees(pointerAngleDeg) - normalizeDegrees(restAngleDeg),
  );
  let cumulativeWeight = 0;

  for (const segment of segments) {
    cumulativeWeight += segment.weight;
    // Compare angles, not a rounded weight coordinate or an epsilon-wide tie strip.
    // Exactly represented ends are excluded; their following start is included.
    if (localAngle < (360 * cumulativeWeight) / totalWeight) {
      return segment.id;
    }
  }

  // The final end is exactly 360, and normalizeDegrees always returns less than 360.
  throw new RangeError('Normalized angle did not map to a segment.');
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
