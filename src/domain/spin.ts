import { normalizeDegrees, validateSegments, type Segment } from './segments';

export function segmentWidthDegrees(
  segments: readonly Segment[],
  segmentId: string,
): number {
  const totalWeight = validateSegments(segments);
  const segment = segments.find((item) => item.id === segmentId);
  if (!segment) throw new RangeError(`Unknown segment id: ${segmentId}`);
  return (360 * segment.weight) / totalWeight;
}

/**
 * Solves a normalized rest angle so the pointer falls inside the chosen segment.
 * fraction is an independent uniform value in [0,1], used only for visual placement.
 */
export function solveRestAngle(
  segments: readonly Segment[],
  targetSegmentId: string,
  pointerAngleDeg: number,
  fraction: number,
): number {
  const totalWeight = validateSegments(segments);
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new RangeError('Offset fraction must be finite and in [0,1].');
  }
  const pointer = normalizeDegrees(pointerAngleDeg);

  let cumulativeWeight = 0;
  let target: Segment | undefined;
  for (const segment of segments) {
    if (segment.id === targetSegmentId) {
      target = segment;
      break;
    }
    cumulativeWeight += segment.weight;
  }
  if (!target) throw new RangeError(`Unknown segment id: ${targetSegmentId}`);

  const width = (360 * target.weight) / totalWeight;
  const start = (360 * cumulativeWeight) / totalWeight;
  const margin = Math.min(2, width * 0.2);
  const localPointerAngle = start + margin + fraction * (width - 2 * margin);
  return normalizeDegrees(pointer - localPointerAngle);
}

/** Adds enough complete turns that the unwrapped wheel angle never moves backward. */
export function targetRotationAtRest(
  currentRotationDeg: number,
  normalizedRestAngleDeg: number,
  minimumFullTurns = 5,
): number {
  if (!Number.isFinite(currentRotationDeg)) {
    throw new RangeError('Current rotation must be finite.');
  }
  if (!Number.isInteger(minimumFullTurns) || minimumFullTurns < 0) {
    throw new RangeError('Minimum full turns must be a non-negative integer.');
  }
  const restAngle = normalizeDegrees(normalizedRestAngleDeg);
  const minimumTarget = currentRotationDeg + minimumFullTurns * 360;
  const turns = Math.ceil((minimumTarget - restAngle) / 360);
  const target = restAngle + turns * 360;
  return target < minimumTarget ? target + 360 : target;
}

/** Constant-deceleration ease-out, evaluated from absolute elapsed time (not frame deltas). */
export function rotationAtProgress(
  startRotationDeg: number,
  targetRotationDeg: number,
  progress: number,
): number {
  if (!Number.isFinite(startRotationDeg) || !Number.isFinite(targetRotationDeg)) {
    throw new RangeError('Animation angles must be finite.');
  }
  if (targetRotationDeg < startRotationDeg) {
    throw new RangeError('Spin target cannot move the wheel backward.');
  }
  if (!Number.isFinite(progress)) throw new RangeError('Progress must be finite.');
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const eased = 1 - (1 - clampedProgress) ** 2;
  return startRotationDeg + (targetRotationDeg - startRotationDeg) * eased;
}
