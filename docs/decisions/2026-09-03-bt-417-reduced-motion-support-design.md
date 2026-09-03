# BT-417: Reduced motion support – design

- **Linear issue:** [BT-417](https://linear.app/vancura/issue/BT-417/reduced-motion-support)
- **Milestone:** 1.7.0
- **Branch:** `bt-417-reduced-motion-support`
- **Package:** `packages/blit386` (engine)

## Problem

The engine has no way to read the browser's `prefers-reduced-motion` setting. Games and demos that want to reduce
animation fidelity for players who need it have no signal to act on, and the engine's own built-in motion (the startup
splash's fade/dissolve sequence) never adapts to it either.

## Precedent: `Orientation`

`screen.orientation` is the closest existing analog – an environment signal that can change _while the demo is running_,
not just at boot. Its shape is the template for this feature:

- `BT.screenOrientation` – static-style getter, safe to call before `BT.init()`, no subsystem instance required.
- `IBTDemo.onOrientationChange?(type: string): void` – optional hook, attached in `BTAPI.init()` after the demo's own
  `init()` succeeds, detached in `stop()`.
- `Orientation.setOnChange()` – rebinds the listener to a hot-swapped demo instance's bound method, so a hot reload
  doesn't leave the listener closing over a stale instance.
- `HardwareSettings.preferredOrientation` exists only because orientation has a _lock_ action the engine can request.
  Reduced motion has no equivalent forceable action.

## Non-goals

- No `HardwareSettings` field to let a demo's `configure()` override the platform's reduced-motion preference. A
  developer silently disabling a user's own accessibility setting is the wrong default; the URL flags below are a dev/QA
  escape hatch, not something exposed to `configure()`.
- No third state. `prefers-reduced-motion` has exactly two CSS values (`reduce` / `no-preference`); a boolean is
  sufficient and matches the documented `is*`/`has*` boolean-naming tier.

## Design

### 1. Core API – `ReducedMotion` subsystem + `BT` surface

New file `src/core/ReducedMotion.ts`, structurally parallel to `Orientation.ts` but simpler (no lock, no async race to
guard against):

- `ReducedMotion.isPreferred: boolean` (static getter) – resolves, in order:
  1. `?noreducedmotion` URL flag (beats everything, mirrors `?nosplash` beating `?splash`)
  2. `?reducedmotion` URL flag
  3. `window.matchMedia('(prefers-reduced-motion: reduce)').matches`, feature-detected
     (`typeof globalThis.matchMedia === 'function'`), defaulting to `false` when unavailable (Node, SSR, old browsers) –
     same "safe to call before init" contract as `Orientation.type`.

  The URL-flag resolution follows splash's `gating.ts` shape (pure resolver + thin URL reader, unit-testable without a
  DOM), but lives inside `ReducedMotion.ts` rather than a sibling file – this feature is small enough not to need the
  separate-file split splash uses.

- Instance side: `attach(onChange)`, `detach()`, `setOnChange(onChange)` – installs/removes a `change` listener directly
  on the `MediaQueryList` (a live, event-emitting object, unlike `screen.orientation`), forwarding `event.matches`
  straight to the callback – no re-read needed, unlike orientation's `type`.

New/changed public API:

- `BT.isReducedMotionPreferred: boolean` getter in `BLIT386.ts` (Tier A, `is*`-named per `bt-api-getters.md`),
  delegating to `ReducedMotion.isPreferred`. Works before `BT.init()`.
- `IBTDemo.onReducedMotionChange?(prefersReduced: boolean): void` optional hook in `IBTDemo.ts`, JSDoc'd the same way
  `onOrientationChange` is, `@since 1.7.0`.

### 2. `BTAPI` wiring + hot-reload

Mirrors the existing `Orientation` wiring exactly:

- New private field `reducedMotion: ReducedMotion | null = null`.
- `init()` – after `runDemoInitWithSplash` succeeds, next to the existing `this.orientation.attach(...)`:
  `this.reducedMotion = new ReducedMotion(); this.reducedMotion.attach(demo.onReducedMotionChange?.bind(demo) ?? null);`
- `stop()` – next to `this.orientation?.detach()`: `this.reducedMotion?.detach(); this.reducedMotion = null;`
- `hotReplaceDemo()` – next to `this.orientation?.setOnChange(...)`:
  `this.reducedMotion?.setOnChange(newDemo.onReducedMotionChange?.bind(newDemo) ?? null);` so a hot-swapped demo's new
  hook receives subsequent `change` events, not a stale closure over the previous instance.

Purely an event-driven side channel – no changes to `GameLoop` or the fixed-timestep loop.

### 3. Splash integration

The splash's own motion is in scope (per design discussion): when reduced motion is preferred, it shows a static hold
instead of fading, and the handoff into the game's palette is an instant swap instead of a cross-fade.

**`Splash.start(reducedMotion: boolean)`** – new parameter. When `true`:

- No `ExposureFadeEffect` is added for the fade-in; `live` is assigned the ramp's values directly (instant).
- The internal `isSkipped` flag is set, reusing the existing "collapse the minimum hold" logic in `leaveShown()` rather
  than duplicating it – the hold still waits for `markInitSettled()` (a functional loading gate, not decoration) but
  never pads out to `HOLD_MIN_MS`.
- `leaveShown()` skips adding the fade-out `ExposureFadeEffect` too – `live` is set to blackened values directly, and
  `fadingOut` is entered backdated by `FADE_OUT_MS` (the same "hand off leftover time" idiom already used elsewhere in
  `transition()`), so the state machine collapses straight through to `done` on that same `advance()` call instead of
  animating.

**Dissolve:** `BTAPI.runDemoInitBehindSplash()`'s `splash.enableDissolve()` call becomes conditional on `!reducedMotion`
– the WebGPU dissolve is a simulated glitch effect, exactly the category of motion the preference exists to suppress, so
it's skipped entirely rather than toned down.

**Handoff (`BTAPI.endPaletteCapture()`):** gets the same reduced-motion branch – instead of adding an
`ExposureFadeEffect` (either the "game never set a palette, fade to black" path or the "fade up to the captured target"
path), it assigns the target colors into the installed palette directly, no effect object.

**Single source of truth:** `runDemoInitBehindSplash()` reads `ReducedMotion.isPreferred` once, at splash start, and
reuses that same value for `endPaletteCapture()` later – so a mid-splash OS toggle can't produce a half-animated,
half-instant handoff. `BT.isReducedMotionPreferred` resolves through the identical URL-flag layering, so a game's own
reading of the flag always agrees with what the splash just did.

### 4. URL override

`?reducedmotion` / `?noreducedmotion` valueless flags, mirroring `?splash` / `?nosplash`. `noreducedmotion` beats
`reducedmotion` when both are present (an "off" switch should be unambiguous, same rule `resolveSplashEnabled` already
follows). Lets QA/CI force either state without touching OS settings or devtools media emulation.

## Testing

- `ReducedMotion.test.ts` (new) – URL-flag resolver (pure, no DOM needed), `matchMedia` feature-detection,
  attach/detach/change-forwarding.
- `Splash.test.ts` – reduced-motion-path assertions using the existing fake-clock harness: no fade effects added, state
  collapses immediately.
- `BTAPI.test.ts` – hook wiring coverage mirroring the existing `onOrientationChange` tests: fires on change, detaches
  on `stop()`, rebinds on hot-reload.
- No benchmark needed – event-driven, not a per-frame hot path.

## Docs

- `docs/api-core.md` – new `BT.isReducedMotionPreferred` getter + `IBTDemo.onReducedMotionChange` hook, `@since 1.7.0`,
  plus `<Since>` / `<ApiAvailability>` / `<PageChangelog>` MDX components per `documentation-and-versioning-guide.md`.
- `docs/guide-splash.md` – reduced-motion behavior (static hold, instant handoff, no dissolve).
- `.claude/rules/architecture.md` – add `ReducedMotion.ts` to the `core/` table.
- `docs/_api-history.json` – regenerate via `pnpm run api:history` (restore the `versions` block afterward in a tag-less
  checkout per `environment-gotchas.md`).
