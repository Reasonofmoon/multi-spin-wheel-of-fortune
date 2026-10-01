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
