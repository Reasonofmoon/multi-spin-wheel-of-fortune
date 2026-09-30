# Phase 0 — Audit of the original repository

**Scope and method.** This audit was written against the untouched tree at `bfee83999544ef2ea9e3e07ca65e4180690c70fe`, before implementation changes. I inspected the app, its CSS, HTML, assets, package metadata, test, README, and available Git history. Findings describe the original snapshot, not proposed future behavior. Reproductions below are source-level unless explicitly marked as command output.

The checkout is shallow (`git rev-parse --is-shallow-repository` returned `true`), so only the snapshot commit is available for history comparison; earlier commits cannot be audited from this clone.

## Findings

### A-01 — The selected participant does not match the pointer (High)

- **Location:** `src/App.js`, `getSelectedIndex`, `spinWheel`; SVG wheel and pointer in the render block.
- **Defect:** The SVG wheel's segment angles start at the positive x-axis and increase clockwise (SVG's y-axis points down). The pointer is at the top, angle 270° in that coordinate convention. For a rest rotation `r`, the pointer's local wheel angle is `normalize(270° - r)`, not `normalize(360° - r + sectionAngle/2)`. The current calculation therefore reports a different slice from the one visibly under the pointer.
- **Minimal reproduction:** Four equal participants in render order `[A,B,C,D]`, with the wheel at rest (`r=0`): the top pointer is over `D` (slice 3), while `getSelectedIndex(0)` returns 0 (`A`). At `r=90°`, the pointer is over slice 2, while the function returns 3. This also means an animated draw can announce a different participant than the wheel indicates.

### A-02 — Outcome generation is not fair or verifiable (High)

- **Location:** `src/App.js`, `spinWheel`.
- **Defect:** The outcome path uses `Math.random()` and rounds down to one of 360 integer degrees. It has no cryptographic commitment, seed, nonce, or verifiable log. Integer degree buckets are not equal for segment counts that do not divide 360.
- **Minimal reproduction:** Seven equally sized slices receive integer-angle bucket counts `52,51,52,51,52,51,51` (verified by enumerating angles 0–359); the probabilities are not identical. A user also cannot independently reproduce or audit any draw from the saved state.

### A-03 — Duplicate participant names are treated as one identity (High)

- **Location:** `src/App.js`, `removeParticipant` and the spin completion callback.
- **Defect:** Participants are plain strings, and removal uses `p !== selectedParticipant`. All entries with the selected label are removed together. React list keys are array indexes, which are also unstable after removal.
- **Minimal reproduction:** Roster `['Minji','Minji','Jisoo']`; draw either `Minji`. `filter(p => p !== 'Minji')` removes both entries, although only one participant was selected. Equal labels cannot be represented as distinct participants.

### A-04 — Penalty assignment is coupled to participant position (High)

- **Location:** `src/App.js`, `spinWheel` completion callback.
- **Defect:** The selected penalty is `penalties[selectedIndex % penalties.length]`. It is determined by the participant's wheel index, not by an independent draw. This is deterministic correlation, not an independent penalty selection; penalties are never consumed or separately spun.
- **Minimal reproduction:** Participants `[A,B,C]`, penalties `[P,Q,R]`: selecting index 0 always assigns `P`, index 1 always `Q`, and index 2 always `R`. Repeatedly arranging the same order cannot produce the other participant/penalty pairs.

### A-05 — Any participant-list edit silently resets the active round (High)

- **Location:** `src/App.js`, first `useEffect` watching `participants`.
- **Defect:** Every participant-list update replaces `remainingParticipants` with a copy of the entire roster. Adding or removing one item during a round silently restores previously eliminated participants, while `gameResults` remains unchanged, so the displayed results and live roster disagree.
- **Minimal reproduction:** Start with `[A,B,C]`, finish one spin so one entry is removed from `remainingParticipants`, then add `D`. The effect sets the remaining list to `[A,B,C,D]`; the eliminated participant is back without undoing or voiding its result.

### A-06 — Reset does not cancel the in-flight spin and can move the wheel backward (High)

- **Location:** `src/App.js`, `spinWheel` and `resetGame`.
- **Defect:** Completion is driven by an uncancelled 5-second `setTimeout`. `resetGame` sets the rotation to zero and clears the spinning flag but has no timer handle or cancellation/token check. The still-pending callback can append an old result after reset; setting the angle to zero during a CSS transition can also visibly reverse the wheel.
- **Minimal reproduction:** Click Spin, then Reset before five seconds elapse. The reset sets rotation to 0 and `isSpinning` false; after the original timeout, a result from the pre-reset roster is appended and fireworks are enabled. The reset animation can travel toward 0 rather than finish monotonically.

### A-07 — A one-entry wheel has no drawable sector (Medium)

- **Location:** `src/App.js`, SVG path generation in the `remainingParticipants.map` callback.
- **Defect:** With one entry, start and end points of the SVG arc are identical. The generated path is effectively `M center L outer-point A outer-point Z`; an SVG arc whose endpoints coincide draws no arc, leaving a zero-area closed line instead of a full pie slice.
- **Minimal reproduction:** Roster `['Only']`; render produces a single sector with both arc endpoints `(98,50)`. The wheel should show a full colored circle, but the path does not describe one.

### A-08 — Spin can appear enabled when a required penalty is missing (Medium)

- **Location:** `src/App.js`, spin button `disabled` condition and `spinWheel` guard.
- **Defect:** The button is disabled only when spinning or no participants remain. The handler additionally requires `penalties.length > 0`; with no penalties, the visible enabled button silently does nothing.
- **Minimal reproduction:** One participant, zero penalties: the button label is “돌리기!” and it is enabled, but clicking it enters no spin and reports no explanation.

### A-09 — Invalid persisted JSON or shape can prevent the app from rendering (High)

- **Location:** `src/App.js`, lazy initializers for `participants` and `penalties`.
- **Defect:** `JSON.parse` is unguarded and its result is not schema-checked. A syntax error throws during render; valid JSON with the wrong shape later fails at `.map`, `.filter`, or spread operations.
- **Minimal reproduction:** Set localStorage `participants` to the string `{` and reload: the initializer throws `SyntaxError`. Set it to `null`: initialization succeeds but the list render attempts `participants.map` and throws.

### A-10 — Storage failures are not handled (Medium)

- **Location:** `src/App.js`, localStorage reads and persistence effects.
- **Defect:** `getItem` and `setItem` are not protected against browser storage exceptions. Writes are attempted on every list update, with no recovery or user-visible status.
- **Minimal reproduction:** In a browser context where storage access is denied, a `getItem`/`setItem` `SecurityError` is uncaught. If a write fails due to quota, the effect throws rather than preserving a usable in-memory session and explaining persistence failure.

### A-11 — The visible utility-class styling is not loaded (High)

- **Location:** `src/index.js`, `src/index.css`, `src/App.js`, `src/App.css`, `src/tailwind.output.css`, `tailwind.config.js`.
- **Defect:** `App.js` uses Tailwind-style utility classes, but `index.js` imports only `index.css`. Neither `App.css` nor `tailwind.output.css` is imported. `index.css` contains only body/code defaults. In addition, Tailwind `content` is empty, and there are no Tailwind directives in the imported CSS. Thus the JSX utility classes have no corresponding CSS in the app.
- **Minimal reproduction:** Render the app: `p-4`, `bg-gradient-to-br`, `flex`, `w-64`, and other class names have no loaded rules, so the intended layout/colors do not apply. `src/App.css`'s `.App` and `.wheel` rules also do not apply because the file is not imported (and those selectors are not used by the JSX anyway).

### A-12 — Label sizing and truncation are not grapheme-safe (Medium)

- **Location:** `src/App.js`, `calculateTextProps`.
- **Defect:** Font size is estimated from JavaScript UTF-16 `text.length`; truncation uses `text.slice(0, 8)`. This can split surrogate pairs and emoji ZWJ sequences, and it does not measure the available segment arc. Long or narrow labels have no hide/reachability fallback.
- **Minimal reproduction:** A label beginning with a multi-code-unit emoji sequence that crosses the eighth UTF-16 code unit can be sliced into an incomplete glyph. With many participants, labels are still rendered even when their sector cannot fit them.

### A-13 — White label text fails contrast on some generated sectors (Medium)

- **Location:** `src/App.js`, `getColor` and SVG `<text fill="white">`.
- **Defect:** All labels are white regardless of the fill color. The palette does not calculate contrast.
- **Minimal reproduction:** With three entries, index 1 gets `hsl(120, 70%, 50%)`, approximately RGB `(38,217,38)`. WCAG relative-luminance calculation gives white-text contrast of about `1.90:1`, below `4.5:1` for normal text.

### A-14 — Basic keyboard and assistive-technology paths are absent (Medium)

- **Location:** `src/App.js`, inputs, icon buttons, wheel, and results.
- **Defect:** Inputs are not in forms and have no Enter-submit handler; icon-only add/remove buttons have no accessible names; the SVG wheel has no text alternative; result changes are not announced through a live region. The SVG/canvas-equivalent visual does not expose segment weights or a textual list alternative.
- **Minimal reproduction:** Focus the participant input and press Enter: no item is added. A screen reader encounters unlabeled plus/remove controls and has no live announcement when a result is appended.

### A-15 — The audio elements point to files that are not served, and no app code plays them (Medium)

- **Location:** `public/index.html`, audio elements; `src/sounds/spin.mp3`, `src/sounds/win.mp3`.
- **Defect:** HTML requests `%PUBLIC_URL%/sounds/spin.mp3` and `.../win.mp3`, but the files are under `src/sounds`, not `public/sounds`; CRA does not expose `src` files at those public URLs unless imported and bundled. No React code references or plays either audio element.
- **Minimal reproduction:** On a built deployment, request `/multi-spin-wheel-of-fortune/sounds/spin.mp3`: no such file is present in `public`; the audio URL cannot resolve. Even if copied, no code calls `play()`.

### A-16 — Confetti is loaded remotely but the dependency is unused (Medium)

- **Location:** `public/index.html`, `package.json`, `src/App.js`.
- **Defect:** HTML loads a jsDelivr confetti script at runtime, while the declared `canvas-confetti` npm dependency is never imported. App fireworks are ordinary `<div>` elements, not a call to confetti; their `animate-firework` class has no definition in the loaded stylesheet. The remote script adds a network dependency without providing the implemented effect.
- **Minimal reproduction:** Load offline or block jsDelivr: the external confetti global is unavailable, while the app has no bundled fallback. The `animate-firework` elements have no keyframes/rules in the CSS that is actually imported.

### A-17 — Page metadata and install metadata are boilerplate or point to nonexistent assets (Low)

- **Location:** `public/index.html`, `public/manifest.json`.
- **Defect:** The document says `lang="en"` although the interface is Korean; title/description are generic English; Open Graph URL is `https://your-game-url.com` and image points to `og-image.jpg`, absent from `public`; manifest name is “Create React App Sample”.
- **Minimal reproduction:** Inspect the document/manifest or follow the OG image path: it advertises the wrong language/name and the declared image does not exist in the checked-in public assets.

### A-18 — The sole test asserts CRA boilerplate that this app does not render (Medium)

- **Location:** `src/App.test.js`.
- **Defect:** Test `renders learn react link` queries `/learn react/i`, but the rendered app contains no “Learn React” link. It does not test this roulette's behavior.
- **Minimal reproduction / verification limitation:** `npm test -- --watchAll=false --runInBand` in this checkout exits 127 before running assertions because `react-scripts` is not installed (`sh: 1: react-scripts: not found`). Independently, comparing the query in the test with the JSX in `App.js` shows that the expected link is absent; after installing dependencies the assertion would be expected to fail rather than validate the app. This is a source-based conclusion, not a reported passing/failing Jest assertion.

### A-19 — The README does not describe the app or match the commit's README claim (Low)

- **Location:** `README.md`; available commit `bfee839`.
- **Defect:** The README remains the English Create React App starter guide, with eject instructions and no roulette usage/deployment explanation. The available commit subject is “README 한글화 및 휠 텍스트 크기 최적화” (“Korean README and wheel text size optimization”), but the README in that commit is still the CRA template. The repository is shallow, so this comparison is limited to that one visible commit.
- **Minimal reproduction:** Open README at the audited commit and follow its content: it documents generic CRA links/scripts, not this app, and is not Korean-first.

### A-20 — The baseline lacks the requested product/tooling capabilities (High, scope gap)

- **Location:** Repository-wide; principally `src/App.js` and `package.json`.
- **Defect / gap:** The baseline is a single unweighted participant SVG wheel with a penalty array lookup. It has no stable IDs/weights, commit–reveal, independent penalty wheel, game modes, event log, undo/redo, import/export, share URL, locale system, verification route, PWA service worker/offline strategy, or host/viewer synchronization. Tooling remains CRA JavaScript; scripts do not provide typecheck, standalone lint, or browser E2E gates. These are missing capabilities, not claims that existing code intended to implement them.
- **Minimal reproduction:** Inspect exports/scripts and routes: `App.js` is the only app screen, has no cryptographic/domain module, and `package.json` scripts are `start`, `build`, `test`, `eject`, `predeploy`, and `deploy` only.

## Coordinate-system analysis and correct mapping

The SVG viewBox uses `x` increasing right and `y` increasing down. A point at angle `θ` is therefore `(cx + R cos θ, cy + R sin θ)`: zero degrees is right, and increasing degrees move clockwise. The wheel's sectors start at zero and proceed clockwise. The pointer path is at the top (`x=50, y=5`), so its angle is 270° in that same convention.

For wheel rest rotation `r` and pointer angle `p`, the local wheel angle under the pointer is:

```text
local = ((p - r) % 360 + 360) % 360
```

For weighted segments with positive weights `w[i]`, total weight `W`, and cumulative weight before segment `i` equal to `C[i]`, segment `i` covers the half-open angular interval:

```text
[360 * C[i] / W, 360 * (C[i] + w[i]) / W)
```

Return the segment whose interval contains `local`. **Boundary rule:** intervals include their start and exclude their end; an exact boundary belongs to the segment that begins there (the clockwise-following segment). Normalize input angles before searching. This handles negative and >360° values without relying on JavaScript's negative remainder behavior.

Three numeric checks for four equal segments (`width=90°`, pointer `p=270°`):

1. `r=0°`: `local=270°`; intervals are `[0,90)`, `[90,180)`, `[180,270)`, `[270,360)`, so segment 3 (`D`) wins. Original function returns index 0.
2. `r=90°`: `local=180°`, so segment 2 wins. Original function returns index 3.
3. `r=-90°`: `local=normalize(360°)=0°`, so segment 0 wins. This is the same as `r=270°` modulo one revolution.

A weighted/boundary check: weights `[1,3]` have a boundary at 90°. At `local=90°`, the half-open rule selects the second segment, not the first. This makes boundary behavior deterministic and testable.

## Phase 0 command evidence (before implementation changes)

- `git status --short --branch` → `## arena/01a0ef91-multi-spin-wheel-of-fortune` (clean before writing this audit).
- `git rev-parse --is-shallow-repository` → `true`.
- `npm test -- --watchAll=false --runInBand` → exit 127; stderr: `sh: 1: react-scripts: not found`.
- `npm run build` → exit 127; stderr: `sh: 1: react-scripts: not found`.
- A Node enumeration of the current and corrected four-slice formulas printed:

```text
N=4 rotation=0: current=0 expected=3
N=4 rotation=90: current=3 expected=2
N=4 rotation=180: current=2 expected=1
N=4 rotation=270: current=1 expected=0
N=7 integer angle bucket counts: 52,51,52,51,52,51,51
HSL(120,70%,50%) RGB(38,217,38) white contrast=1.90:1
```

- CSS import inspection found only `src/index.js: import './index.css';`; neither the app stylesheet nor generated Tailwind CSS is imported.
