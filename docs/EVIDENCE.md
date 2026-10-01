# Verification ledger

This records executed gates, not inferred completion. Audit evidence is frozen in [AUDIT.md](AUDIT.md). Commands run on the session branch; generated browser reports/build outputs are ignored, not committed.

## M0 — audit-only commit

```text
$ git show --stat --oneline b3b364a
b3b364a docs: audit original and inherited roulette defects
 docs/AUDIT.md | 269 ++++++++++++++++++++++++++++++++++------------------------
 1 file changed, 157 insertions(+), 112 deletions(-)
```

## M1 — retain and verify the inherited Vite/React 18 toolchain

The starting commit already migrated CRA. This milestone verifies it, removes the unused React-refresh ESLint dependency, explicitly permits the preview host in both dev/production preview, and tests the **production build** at the project base path. CSS Modules remain the deliberate styling choice: [ADR 0001](adr/0001-css-modules.md).

```text
$ npm run build
> tsc -b && vite build
vite v6.4.3 building for production...
✓ 42 modules transformed.
dist/index.html                  1.10 kB │ gzip: 0.48 kB
...
✓ built in 801ms

$ npm run typecheck
> tsc --noEmit
(exit 0, no diagnostics; tsconfig strict=true)

$ npm run lint
> eslint . --max-warnings 0
(exit 0, no diagnostics)

$ npm test
Test Files  6 passed (6)
Tests       29 passed (29)
Duration    30.23s

$ LD_LIBRARY_PATH=/home/user/browser-support/libs/lib PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium npm run test:e2e -- e2e/app.spec.ts --project=chromium-desktop --project=chromium-390x844
Running 2 tests using 2 workers
✓ [chromium-desktop] GitHub Pages base path serves the Korean app shell (421ms)
✓ [chromium-390x844] GitHub Pages base path serves the Korean app shell (450ms)
2 passed (6.0s)
```

Browser provenance: direct Playwright CDN and Debian mirror access was blocked. For the local Chromium run only, `@sparticuz/chromium@153.0.0` was installed **outside the repository**, its shipped NSS libraries extracted outside the repository, and its real Chromium executable supplied through an optional environment variable. No browser mock, disabled assertion, skipped project, or executable is committed. The launch uses ordinary Playwright defaults (no disabled web security). The config retains all four required projects. WebKit has **not** passed at this milestone; no such claim is made.

The base-path test uses `vite preview` on the built multi-page output and asserts no browser errors/warnings. This demonstrates the static `/multi-spin-wheel-of-fortune/` build locally, not a new remote Pages deployment.

## M2 — framework-free weighted geometry and cryptographic core

All three core properties run at least 1,000 cases each, with the fast-check replay seed `20260930`: interval-oracle agreement on arbitrary finite IEEE-754 angles; solved rest angle selects the intended identity; rejection sampler output is in range. There is an additional 1,000-case represented-boundary property, explicit 1/500-entry and extreme-weight examples, and real SHA-256 retry evidence for rejection. No original assertions were deleted or thresholds lowered.

```text
$ npm run build
✓ 42 modules transformed.
✓ built in 816ms

$ npm run typecheck
> tsc --noEmit
(exit 0, no diagnostics)

$ npm run lint
> eslint . --max-warnings 0
(exit 0, no diagnostics)

$ npm run test:coverage
Test Files  7 passed (7)
Tests       35 passed (35)
All files   98.45% lines / 96.59% branches / 100% functions
fairness.ts 100% lines / 98.76% branches
segments.ts 94.44% lines / 94.59% branches
spin.ts     97.14% lines / 93.1% branches
```

Coverage thresholds are enforced on the `src/domain/` aggregate: ≥95% lines and ≥90% branches. The individual geometry file has two defensive unreachable throws; its individual line coverage is reported, not hidden.

```text
Test: passes deterministic chi-square tests for weighted and seven-equal-slice wheels
200000 draws per distribution, real HMAC + drawSegment + rejection sampler:
weighted counts [4873,9529,14344,23539,33336,52380,61999]
chiSquare=6.049867979020977, p=0.41762710277130605 > 0.001
sevenEqual counts [28808,28477,28527,28390,28821,28287,28690]
chiSquare=8.995619999999999, p=0.17382454891294857 > 0.001

Test: keeps participant and penalty streams statistically independent
20000 pairs, distinct nonce/wheel-id streams
chiSquare=47.539197738180626, df=36, p=0.09447999982391506 > 0.001
All 49 participant/penalty pair cells are nonempty.

Test: domain architecture boundary > has no React, DOM, UI, or third-party runtime imports
passed
```

This gates the engine, not event-sourced persistence or a new remote deployment. Migration, undo/redo, share properties and UI proof export are later gates. The fairness threat model now explicitly explains uncommitted roster labels and missing suffixes rather than claiming the seed commitment authenticates them.
