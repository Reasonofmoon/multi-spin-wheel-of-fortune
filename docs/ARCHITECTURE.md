# Architecture and data flow

## Module diagram

```text
Static Vite multi-page build
├── / (Korean roulette UI: src/App.tsx)
│   ├── src/domain/segments.ts  — weighted segment validation and angle mapping
│   ├── src/domain/fairness.ts  — Web Crypto commitment, HMAC draws, rejection sampling
│   ├── src/domain/spin.ts      — solved rest angles and frame-time spin curve
│   └── src/ui/WheelCanvas.tsx — Canvas 2D renderer, labels, colors, resize/DPR handling
├── /verify/ (verify/index.html + src/verify-entry.ts)
│   └── src/domain/fairness.ts — verifies imported JSON without app state/localStorage
└── /perf/ (perf/index.html + src/PerfHarness.tsx)
    └── src/ui/WheelCanvas.tsx — records 500-segment frame intervals in the browser
```

The `src/domain` modules have no React or DOM imports. The two utility modules under `src/ui` provide visual-only palette and grapheme layout behavior; game outcomes and angle math remain in `src/domain`.

## Draw and animation flow

1. On app startup, Web Crypto creates a 32-byte server seed and client seed; the app displays only the SHA-256 server-seed commitment. The host can edit the client seed and reveal the server seed only after ending the session.
2. At Spin, the app snapshots participant and penalty segments, imports the server seed as an HMAC key, and independently signs distinct nonce/wheel-id messages for participant and penalty draws. The current screen animates the participant draw on one Canvas; the second visual wheel is a later game-mode integration. The participant outcome is fixed before animation begins.
3. `solveRestAngle` places the pointer inside the preselected participant segment with a secure visual offset away from the boundaries. `targetRotationAtRest` selects a non-decreasing unwrapped angle with at least five turns.
4. `requestAnimationFrame` evaluates the same constant-deceleration position curve from absolute elapsed time. The wheel is drawn directly into Canvas 2D each frame; it does not rerender the roster UI at frame rate.
5. Once the selected participant is removed, the previous wheel is held briefly so the announced result can be seen at the pointer. The old and new wheel layouts then cross-fade through animation frames rather than changing sectors in one abrupt redraw. Reduced-motion users receive the same decided outcome with no spin animation.

## Current state boundaries and known follow-up

The current screen still reads/writes the legacy string arrays directly, and its in-memory segment ids are derived from list position. The core engine supports stable IDs and weights, but lossless versioned migration, event-sourced draw history, voids/undo, and durable export are M4 work. Until that milestone, reloads do not preserve a complete verifiable draw log; do not treat the UI as a durable audit ledger.

The verifier accepts a version-1 exported fairness log and never consults the roulette screen's state. Both routes are static files under the GitHub Pages project base path. No backend or third-party runtime API is used.
