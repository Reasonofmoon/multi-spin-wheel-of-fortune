# ADR 0003: Canvas 2D renderer and solved deterministic spin

- **Status:** Accepted
- **Date:** 2026-09-29

## Context

The original SVG creates one path and text node per segment and applies a time-based CSS transition. The rebuild must support up to 500 segments, HiDPI displays, exact pre-decided outcomes, grapheme-safe labels, and reduced motion without coupling result timing to CSS.

## Decision

Use a resize-aware Canvas 2D renderer. Precompute label metrics and colors when the segment layout changes, then draw the wheel imperatively on `requestAnimationFrame` without triggering React tree updates on each frame. Use `Intl.Segmenter` for grapheme truncation, derive label sizing from measured arc length, and choose text color through WCAG contrast calculations. Colors are generated in OKLCH-derived coordinates with a golden-angle hue sequence, alternating lightness, and an explicit first/last seam adjustment.

The draw is selected first. A visual-only HMAC fraction selects a point at least `min(2°, 20% of segment width)` from both boundaries; a pure solver computes the required rest angle. An unwrapped target adds whole turns without decreasing the accumulated angle. The animation uses an absolute-time quadratic ease-out (constant angular deceleration), so frame rate does not alter the destination. Elimination briefly holds the winning wheel, then cross-fades the remaining segments. Reduced-motion mode updates directly to the same solved angle and result.

## Consequences

- Canvas reduces DOM size and allows 500 slices to be rendered without per-slice React elements. The `/perf/` harness records actual frame intervals; performance must be measured on target devices rather than assumed from the renderer choice.
- Canvas itself is not a sufficient text alternative; the renderer exposes a textual segment/weight list and the app keeps its roster/results in the DOM.
- A cross-fade is an intentional reflow, not preservation of every old segment boundary. The resolved winner remains visible at the pointer briefly before that reflow begins.
- The animation is deterministic given the decided segment, current angle, and visual entropy; the visual offset does not affect the selected outcome.
