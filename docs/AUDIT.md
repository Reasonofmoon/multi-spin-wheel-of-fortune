# Phase 0 audit — before this session's implementation

Date: 2026-09-30 (UTC). Starting tree: `65784806f3b1cf4e1b3f88c4702abee556ad0c3e`.

## Scope, provenance, and method

The supplied task describes the CRA application, but the actual checkout already contains PR #1's Vite/TypeScript/Canvas implementation (`7a857e3`, merged by `6578480`). This audit **does not pretend that implementation is CRA**. Section A audits the original CRA tree at `bfee83999544ef2ea9e3e07ca65e4180690c70fe`; section B audits remaining defects in the actual starting tree. A fixed ancestral defect is not a current defect.

Before editing any implementation, I read all source, styles, tests, HTML, configuration, assets, and docs; ran the starting build/typecheck/lint/format/unit coverage/dependency audit; and recovered history with `git fetch --unshallow origin`. I used `git archive bfee839` in `/home/user/audit-original` (not a branch switch) and installed its unchanged lockfile to run its real test and build. No production/test/config file was changed before this audit. Source-derived reproductions are explicitly distinguished from executed tests. Browser installation failed in the sandbox; the initial E2E failures are **environment failures, not evidence of app failures**.

Severity: **Critical** = directly exploitable catastrophic/security loss; **High** = wrong outcome, lost data, fairness break, or unusable primary flow; **Medium** = material accessibility, visual, reliability, or tooling defect; **Low** = metadata/documentation/minor lifecycle defect. Dependency advisories alone are not proof of a remotely exploitable browser vulnerability.

**Count: 36 distinct findings: 0 Critical, 16 High, 17 Medium, 3 Low.** There are 23 ancestral findings (10 H / 11 M / 2 L) and 13 starting-tree findings (6 H / 6 M / 1 L). Missing requested new features are listed separately and are not inflated into the defect count.

## A. Original CRA implementation (`bfee839`)

All paths in this section refer to that historical tree. Source reproductions use the actual function bodies, not proposed replacements.

| ID / severity  | File, function                                                                      | Precise defect                                                                                                                                                                                                                                                 | Minimal reproduction: input → observed vs expected                                                                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 **High**   | `src/App.js`, `getSelectedIndex`, SVG render                                        | Result formula assumes the wrong pointer direction and adds half a slice. SVG starts at the right and runs clockwise; the pointer is at the top.                                                                                                               | `[A,B,C,D]`, rest 0° → function returns A, top pointer is at D's start. Rest 90° → function returns D, pointer is at C's start. Expected mapping is proven below.                                                                                               |
| A02 **High**   | `src/App.js`, `spinWheel`                                                           | `floor(Math.random()*360)` is non-cryptographic and restricts outcomes to integer angles. Unequal integer buckets bias equal segments when N does not divide 360; above 360 segments some entries cannot be selected. No precommitment/replay evidence exists. | Enumerate all 360 angles for N=7 → counts `[51,52,51,51,52,51,52]` using the **actual** formula (not a different angle convention). Expected identical probabilities; N=500 → at most 360 entries reachable.                                                    |
| A03 **High**   | `src/App.js`, `spinWheel` completion                                                | Elimination uses `filter(p => p !== selectedParticipant)`, so identity is label. `removeParticipant` itself removes by index; the bug is specifically in draw completion.                                                                                      | `['민지','민지','수아']`, draw either 민지 → both are eliminated. Expected exactly one entry.                                                                                                                                                                   |
| A04 **High**   | `src/App.js`, `spinWheel` completion                                                | `penalties[selectedIndex % penalties.length]` ties penalty to participant position, not an independent draw.                                                                                                                                                   | `[A,B,C]`, penalties `[P,Q,R]` → A can only receive P, B only Q, C only R. Expected all pairings to be possible independently.                                                                                                                                  |
| A05 **High**   | `src/App.js`, participant persistence effect                                        | Every roster edit replaces the remaining list with the entire roster, restoring previously eliminated participants without clearing or voiding results.                                                                                                        | `[A,B,C]`, eliminate A, add D → remaining becomes `[A,B,C,D]` while A's result remains. Expected the edit not to silently restart the round.                                                                                                                    |
| A06 **High**   | `src/App.js`, `resetGame`, `spinWheel` timers                                       | Reset clears the spinning flag/angle but does not cancel the 5-second callback. A stale result is appended after reset, and resetting rotation to 0 can animate backwards.                                                                                     | Spin, reset at 1 s → angle resets, then original callback adds a pre-reset result at 5 s. A second spin after reset can leave two active callbacks. Expected one explicit reset/void protocol and no backwards spin.                                            |
| A07 **High**   | `src/App.js`, roster controls, `spinWheel` closures                                 | Roster/penalty controls remain active during animation. The callback uses the old roster/penalties, while the participant effect has already rebuilt the current wheel.                                                                                        | Spin `[A,B]`/`[P]`, remove P before 5 s → old P is still assigned despite being absent. Add C while spinning → the wheel reflows while the callback selects against the old 2-entry wheel. Expected locked edits or an explicit queued/snapshotted edit policy. |
| A08 **Medium** | `src/App.js`, completion + SVG `remainingParticipants.map`                          | Elimination immediately changes slice widths, labels and index-derived colors at the same rotation. The winning slice disappears with no intentional transition.                                                                                               | Stop a 4-entry wheel, eliminate one → all 90° sectors become 120° sectors in one render. Expected a hold/reflow transition, not a visual jump.                                                                                                                  |
| A09 **Medium** | `src/App.js`, SVG sector path                                                       | The full-circle case is emitted as one small SVG arc (`large-arc-flag=0`). Its endpoints are effectively coincident, so it is not a full disk.                                                                                                                 | N=1 → start `(98,50)`, end `(98,49.999999999999986)` from floating point. The short-arc flag yields a near-zero-area wedge (an exactly coincident arc is omitted). Expected a full circle, or two half arcs.                                                    |
| A10 **Medium** | `src/App.js`, spin button / `spinWheel` guard                                       | The button excludes zero participants but not zero penalties, whereas the handler requires both.                                                                                                                                                               | One participant and no penalties → enabled “돌리기!” does nothing and gives no reason. Expected disabled button plus explanation or a participant-only mode.                                                                                                    |
| A11 **High**   | `src/App.js`, storage initializers                                                  | Unguarded JSON parse and no shape validation crash on corrupt/wrong-type values.                                                                                                                                                                               | `participants='{'` → initializer SyntaxError. `participants='null'` → `.map`/spread fails. Expected recoverable error without crash or destroying the original bytes.                                                                                           |
| A12 **Medium** | `src/App.js`, storage reads/effects                                                 | Security/quota exceptions escape; persistence failure has no usable recovery/status.                                                                                                                                                                           | Browser storage throws `SecurityError` on get or `QuotaExceededError` on set → uncaught render/effect exception. Expected a usable in-memory state and notice.                                                                                                  |
| A13 **High**   | `src/index.js`, `index.css`, `App.css`, `tailwind.output.css`, `tailwind.config.js` | JSX utility classes have no loaded rules. Only `index.css` is imported; no Tailwind directives, empty `content`, unimported generated/App CSS.                                                                                                                 | Actual production CSS contains only body/code defaults (263 B gzip). `p-4`, `flex`, `w-64`, etc. have no declarations. Build warns about empty Tailwind content. Expected styled, responsive layout.                                                            |
| A14 **Medium** | `src/App.js`, `calculateTextProps`                                                  | `text.length` and `slice(0,8)` operate on UTF-16, not graphemes; font size ignores available arc width, and narrow labels are never hidden.                                                                                                                    | Label `aaaaaaa😀xx` → `slice(0,8)` ends with an unpaired high surrogate. With 100 entries all labels are still emitted into 3.6° sectors. Expected intact emoji/graphemes and arc-aware layout/fallback.                                                        |
| A15 **Medium** | `src/App.js`, `getColor`, SVG text                                                  | Fixed white text fails normal-text contrast on light sectors.                                                                                                                                                                                                  | N=3, index 1 → HSL(120,70%,50%), approximately RGB(38,217,38); white contrast ≈1.90:1. Expected ≥4.5:1 via per-sector text color.                                                                                                                               |
| A16 **Medium** | `src/App.js`, inputs/icon buttons/results/SVG                                       | No Enter-add form/handler, accessible labels for plus/remove buttons, live result announcement, or wheel text alternative.                                                                                                                                     | Type a name, Enter → no addition. Inspect plus/X controls → only SVG, no accessible name. New result → no live region. Expected keyboard/AT-equivalent flow.                                                                                                    |
| A17 **Medium** | `public/index.html`, audio declarations; `src/sounds/*.mp3`                         | Audio URLs request `public/sounds` files, but the assets are only in src and never bundled/imported or played.                                                                                                                                                 | Built `/sounds/spin.mp3` URL → file absent; source search finds no `play()`/Web Audio call. Expected imported existing audio and user-gesture playback.                                                                                                         |
| A18 **Medium** | `public/index.html`, confetti script; `package.json`, `App.js` fireworks            | A jsDelivr script adds a third-party runtime request, while installed `canvas-confetti` is never imported/called. Firework divs use an undefined animation class.                                                                                              | Block jsDelivr/offline → remote script fails; `animate-firework` has no loaded rule/keyframes in the app even online. Expected bundled dependency used, or removed.                                                                                             |
| A19 **Low**    | `public/index.html`, `manifest.json`                                                | Wrong document language and starter install metadata; OG URL is a placeholder and image is absent.                                                                                                                                                             | Korean UI with `lang=en`, manifest “Create React App Sample”, OG `your-game-url.com`/missing `og-image.jpg`. Expected actual app language/assets/metadata.                                                                                                      |
| A20 **Medium** | `src/App.test.js`, `renders learn react link`                                       | The sole test asserts a removed CRA link, not the roulette.                                                                                                                                                                                                    | Actual isolated run after `npm ci`: `Unable to find an element with the text: /learn react/i`; `1 failed, 1 total`. Expected test of rendered app.                                                                                                              |
| A21 **Low**    | `README.md`, Git history                                                            | README is the English CRA template despite commit `bfee839` claiming “README 한글화”. Its diff did not touch README.                                                                                                                                           | `git show --stat bfee839` → only package.json/App.js; `git log -- README.md` → only CRA initialization. Expected Korean roulette usage and truthful history/docs.                                                                                               |
| A22 **High**   | `package.json` / lockfile, dependency graph                                         | CRA build/test dependencies are classified as production deps and include high/critical published advisories. This is a maintenance/supply-chain risk, not proof that those vulnerabilities execute in the static bundle.                                      | `npm audit --omit=dev` on original unchanged install → 67 vulnerabilities, 35 high / 3 critical. Expected no high/critical production dependency findings.                                                                                                      |
| A23 **Medium** | `src/App.js`, inline transition/timers                                              | No reduced-motion behavior; completion is a fixed timeout coupled to a CSS transition rather than actual frame time.                                                                                                                                           | Enable `prefers-reduced-motion: reduce` → still schedules 5 s and five turns; source has no media query/cancel/RAF. Expected same outcome within 300 ms with no spin, and deterministic elapsed-time rendering.                                                 |

### Asset/dependency/style checks that are not extra defects

- `lucide-react` **is** used (Plus, X, User, Award, RefreshCw); do not call it unused.
- `web-vitals` is imported through `reportWebVitals`; the default call has no reporting callback. This is inert boilerplate, not an outcome bug.
- Tailwind/PostCSS/autoprefixer are present but the actual imported stylesheet has no generated utilities; the build succeeds nonetheless.
- Both MP3s exist and are binary MPEG audio, about 323 KB each. Their URLs/usage, not their existence, are the defect.
- Original homepage correctly specifies the project base path. It is not a missing-base-path defect.

## B. Actual starting Vite tree (`6578480`)

The rebuild already fixes most A findings and passes its local unit/toolchain checks. The following remaining defects are grounded in the starting source; they are not assumptions that the CRA code is still running.

| ID / severity  | File, function                                                       | Precise defect                                                                                                                                                                                                                                           | Minimal reproduction: input → observed vs expected                                                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B01 **High**   | `src/App.tsx`, `toSegments`                                          | IDs are derived from array position, not stable UUID identity.                                                                                                                                                                                           | `[A,B,C]` → IDs participant-0/1/2; remove B → C becomes participant-1, reusing B's identity. Expected C to retain its UUID.                                                                                                                                   |
| B02 **High**   | `src/App.tsx`, `spinWheel` + participant persistence effect          | Eliminations mutate and persist the base roster itself. There is no separate roster vs round state.                                                                                                                                                      | Legacy `[A,B]`, complete one draw → storage participants is now a one-entry list. Reload → original roster and result are lost, with no reset restoring them. Expected preserved config plus logged elimination.                                              |
| B03 **High**   | `src/App.tsx`, `readLegacyList` / `persistLegacyList`                | Invalid JSON/shape is converted to `[]`, then mount persistence overwrites the original key; quota failures are silently swallowed.                                                                                                                      | `participants='{'`, load → UI avoids a crash but effect writes `'[]'`, losing the recoverable bytes. Expected backup/non-destructive recovery and visible write-failure status.                                                                               |
| B04 **High**   | `src/App.tsx`, client-seed input / `spinWheel`; `FairnessSessionLog` | Client seed remains editable after the first draw, but the log schema holds only one session seed. A sequence with seed edits cannot be reproduced using one seed.                                                                                       | Draw nonce 0 with seed X, edit to Y, draw nonce 2 → no single clientSeed can verify both. Expected frozen session seed after the first draw, or per-draw seed evidence with an explicit protocol.                                                             |
| B05 **High**   | `src/App.tsx`, local session/results; `docs/FAIRNESS.md`             | Draw records returned by domain code are discarded; only display labels are retained. No session export exists, reload abandons the unrevealed seed/nonces, and “new session” retains unrelated old results. Docs say the app records/exports the proof. | Complete a draw, reload/end session → cannot obtain nonce/HMAC/segment snapshot JSON for `/verify/`. Start a new ended session → old results remain without identifying their session. Expected durable append-only proof/session boundaries and honest docs. |
| B06 **Medium** | `src/domain/segments.ts`, `segmentAtAngle`                           | Subtracting finite inputs before normalization can overflow to infinity.                                                                                                                                                                                 | Rest `-Number.MAX_VALUE`, pointer `Number.MAX_VALUE` → executed RangeError “Angles must be finite real numbers.” Both inputs are finite; normalized difference is 256°, selecting B for `[1,1]`. Expected supported finite-angle mapping.                     |
| B07 **Medium** | `src/domain/segments.ts`, tolerance in `segmentAtAngle`              | The wide epsilon tolerance assigns representable points just before a boundary to the following segment. This contradicts the documented half-open intervals.                                                                                            | `[1,1]`, rest 0°, pointer `179.9999999999999` → executed B; interval oracle says A. Expected only the exact represented boundary to tie forward.                                                                                                              |
| B08 **High**   | `src/App.tsx`, `addItem`; `ui/WheelCanvas.tsx`, `prepareLayout`      | Editors/storage loading do not cap a wheel at 500; the renderer throws for a palette of 501 during render.                                                                                                                                               | Load 501 legacy names, or add a 501st → `wheelPalette(501)` throws and removes the UI. Expected retain all legacy data, explain limits, and prevent illegal active-wheel configuration without a crash.                                                       |
| B09 **Medium** | `src/App.tsx`, `completeImmediately` reduced-motion branch           | It removes the winning segment before rendering the rest angle, with no previous-wheel hold. The announced winner is absent from the displayed wheel.                                                                                                    | Two entries, reduced motion, complete draw → announcement names removed entry, canvas contains only survivor at rest. Expected a visible resolved winning snapshot before intentional reflow (without spinning).                                              |
| B10 **Medium** | `src/sounds/*.mp3`, application entry                                | The sound files remain unused, despite being retained. No mute, audio activation, or boundary tick path exists.                                                                                                                                          | Search all src imports/Web Audio calls → neither MP3 is imported or decoded; spin is silent. Expected actual user-gesture Web Audio use or explicitly reported incomplete audio.                                                                              |
| B11 **Medium** | `verify/index.html`, `src/verify.css`, file picker focus rule        | File input is visually clipped. The focus rule targets `#session-file:focus-visible + .file-picker`, but the label occurs **before** the input, so keyboard focus on the picker is invisible.                                                            | Tab from textarea to file input → clipped control focused, preceding label cannot match adjacent-following selector. Expected an obvious focus indicator and keyboard file selection.                                                                         |
| B12 **Medium** | `README.md`, `docs/AUDIT.md` provenance                              | README still prescribes absent `npm start`/`eject` and CRA build directory; inherited audit claims unavailable history even though it is fetchable, and gives different N=7 counts than the actual CRA formula.                                          | `npm start` → missing script; `git fetch --unshallow` recovers history; actual enumeration shown below differs from inherited audit. Expected docs for actual toolchain and evidence-qualified history.                                                       |
| B13 **Low**    | `e2e/spin.spec.ts`, “20 fixed-client-seed draws”                     | Only clientSeed is fixed; serverSeed is still generated afresh. This is a landing test, but not a reproducible **seeded** outcome sequence, as required by the gate.                                                                                     | Repeat suite → commitment/outcome order changes each run. Expected fixed test-only crypto entropy supplied before startup, while testing real HMAC/renderer (not mocks of those units).                                                                       |

Additional scope gaps (not counted as defects): only participant wheel is animated; no mode/weights UI, versioned migration/event reducer/undo/void/share/import/export/CSV, English locale, PWA/SW, host-viewer sync, CI workflow, changelog or fourth ADR. `/verify/` is independent of app state and locally computes HMAC, but reliable first-load/offline caching is not installed. Palette contrast and 500-entry seam spacing have real tests; target-hardware 60 fps is not proven by source inspection.

### Fairness boundary to document accurately

The HMAC commits to seed/clientSeed/nonce/wheelId, **not labels or a cryptographic roster commitment**. Editing a label in a supplied log does not change its HMAC and can still PASS. Removing a trailing draw also cannot be distinguished from a shorter session by this version-1 verifier. Recomputing every supplied draw establishes internal consistency, not authenticated completeness or that this was the roster displayed beforehand. This is a threat-model limitation, not a claim that client-side commit–reveal can defeat a malicious single-device host. A later event-log verifier should check internal config chronology, while retaining this external-witness limitation.

## Coordinate-system proof and exact mapping

### Convention and pointer

SVG and Canvas use x to the right, y down. Sector endpoint formula:

```text
x = cx + R cos(θ)
y = cy + R sin(θ)
```

Thus 0° is right, 90° down, 180° left, 270° up; positive rotation is **clockwise**. In the CRA wheel the fixed pointer is `M50 5 ...`, above center `(50,50)`, hence `p=270°`. Both the sectors and a rotated wheel group use this convention. The Vite canvas also puts the pointer at the top.

Let `norm(x)` be x modulo 360 in `[0,360)`. For finite IEEE-754 inputs, normalize each separately **before** subtracting, to avoid overflow:

```text
local = norm(norm(pointerAngleDeg) - norm(restAngleDeg))
```

For ordered weights `w[i]`, sum `W`, prefix sum `C[i]`, segment i covers:

```text
start[i] = 360 * C[i] / W
end[i]   = 360 * (C[i] + w[i]) / W
start[i] <= local < end[i]
```

Find the first end greater than `local`; return that segment's stable ID. Equal weights reduce to `floor(local*N/360)` away from floating-point rounding. **Tie rule:** represented start boundaries belong to the clockwise-following segment; 360° wraps to the first segment. Compare angular boundaries directly, rather than subtracting an epsilon-sized strip from every interval. A value immediately below a boundary belongs to the preceding segment. Very tiny negative values which cannot be represented after wrapping should be clamped to the greatest representable angle below 360°, not wrap spuriously to zero.

### Worked examples

Four equal segments A/B/C/D cover `[0,90)`, `[90,180)`, `[180,270)`, `[270,360)`.

1. `r=0`, `p=270` → local 270°, D (boundary start). Original formula `floor(((360-0+45)%360)/90)=0` → A, wrong.
2. `r=90`, `p=270` → local 180°, C. Original `floor(315/90)=3` → D, wrong.
3. `r=-90`, `p=270` → normalized r 270°, local 0°, A. Same geometry as `r=270` and `r=630`. Original at normalized r=270 returns index 1, B.
4. Weights `[1,3]`: boundary is 90°. `r=180`, `p=270` → local 90°, second segment. `p=269.999` → local 89.999°, first segment. This proves the start-inclusive/end-exclusive tie rule without inventing a tolerance interval.
5. Weights `[1,2,3]`: starts 0°,60°,180°. `r=810`, `p=-90` → norm r 90°, norm p 270°, local 180°, third segment. Negative pointer and multiple turns do not change the answer.

Animation inverse: target local point `q=start + margin + u*(width-2*margin)`, where `margin=min(2°,0.2*width)` and `u∈[0,1]`; rest `norm(p-q)`. Add whole turns until the unwrapped target is ≥ current angle plus the desired full rotations. Then `norm(p-rest)=q` by construction. Outcome selection must precede this visual placement, not be inferred from discretized random degrees.

## Raw command evidence recorded before code changes

### Original archive

`git archive bfee839 | tar -x -C /home/user/audit-original` followed by `npm ci --prefix /home/user/audit-original --no-fund --no-audit`:

```text
added 1558 packages in 13s
```

`CI=true npm test -- --watchAll=false --runInBand` in that archive:

```text
Unable to find an element with the text: /learn react/i
at Object.<anonymous> (src/App.test.js:6:30)
Test Suites: 1 failed, 1 total
Tests:       1 failed, 1 total
Snapshots:   0 total
exit=1
```

`CI=true npm run build` in that archive:

```text
warn - The `content` option in your Tailwind CSS configuration is missing or empty.
Compiled successfully.
49.35 kB  build/static/js/main.8418d1a4.js
1.79 kB   build/static/js/453.e36eb0b7.chunk.js
263 B     build/static/css/main.e6c13ad2.css
The project was built assuming it is hosted at /multi-spin-wheel-of-fortune/.
exit=0
```

`npm audit --omit=dev` in that archive:

```text
67 vulnerabilities (17 low, 12 moderate, 35 high, 3 critical)
```

Actual original-formula Node enumeration and starting domain transpilation (TypeScript `transpileModule`, no modified source):

```text
original seven integer bins [51,52,51,51,52,51,52]
p=179.9999999999999 expected A observed B
finite extremes observed RangeError: Angles must be finite real numbers.
original SVG end y 49.999999999999986
```

### Starting Vite tree

`npm ci --no-fund --no-audit` → `added 444 packages in 6s`.

```text
npm run typecheck: > tsc --noEmit                         exit=0
npm run lint:      > eslint . --max-warnings 0            exit=0
npm run build:     ✓ 42 modules transformed; ✓ built in 1.23s  exit=0
npm run format:check: All matched files use Prettier code style! exit=0
npm audit --omit=dev: found 0 vulnerabilities             exit=0
```

`npm run test:coverage`:

```text
Test Files  6 passed (6)
Tests       29 passed (29)
All files   98.9% lines / 96.42% branches
fairness.ts 100% lines / 97.4% branches
segments.ts 97.1% lines / 97.14% branches
spin.ts     97.14% lines / 92.85% branches
200000 draws each:
weighted counts [4873,9529,14344,23539,33336,52380,61999], chiSquare=6.049867979020977, p=0.41762710277130605
sevenEqual counts [28808,28477,28527,28390,28821,28287,28690], chiSquare=8.995619999999999, p=0.17382454891294857
```

Initial `npm run test:e2e -- --project=chromium-desktop --workers=1`:

```text
Looks like Playwright was just installed or updated.
Please run ... npx playwright install
3 failed
```

`npx playwright install --with-deps chromium webkit` exited 1 (Debian mirror inaccessible); browser-only install failed with `ECONNRESET` to `cdn.playwright.dev`. **No E2E pass or browser-measured performance is claimed at audit time.**

History inspection:

```text
git log --oneline --all:
6578480 Merge pull request #1 ...
7a857e3 feat: rebuild roulette with fair Canvas spins
5968f1e docs: audit original roulette implementation
bfee839 README 한글화 및 휠 텍스트 크기 최적화
...
git show --stat bfee839: package.json, src/App.js only
git log --oneline -- README.md: 77b5cc8 Initialize project using Create React App
```

The audit commit must contain this file alone. Subsequent milestone evidence belongs in a separate evidence document, so this audit remains a statement about the untouched inputs.
