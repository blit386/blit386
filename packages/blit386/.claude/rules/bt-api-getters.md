---
paths: [src/**/*.ts, docs/api-*.md]
---

# BT API: getters vs methods

This file is the full policy for BT API getters vs methods and Boolean naming; [CLAUDE.md](../../CLAUDE.md) carries only
a short summary and points here. See also `docs/api-core.md`.

When editing `src/BLIT386.ts`, demos, or API docs:

## Prefer getters (no parentheses)

Zero-argument read-only values on `BT`:

- Configure-time (use same names as `HardwareSettings`): `displaySize`, `drawingBufferSize`, `targetFPS`
- Derived: `outputSize` (`drawingBufferSize ?? displaySize`; no `HardwareSettings` field)
- Configure-time (backend): `requestedBackend` mirrors resolved `HardwareSettings.backend` (includes
  `?backend=software`); `null` before `BT.init()`
- Loop: `deltaSeconds`, `timeSeconds`, `ticks`, `renderAlpha`
- Runtime: `activeBackend`, `camera`, `palette`, `random`, `isAudioUnlocked`, `isMusicPlaying`, `screenOrientation`,
  `loadingAssetsCount`, `isDevMode`, `splashState`, `isSplashVisible` – `activeBackend` is `null` before init or on
  failure; `isAudioUnlocked` is `false` until the first user gesture resumes the audio context; `isMusicPlaying` is
  `true` while the music player has a live current track; `screenOrientation` is the current `screen.orientation.type`
  string, or `null` when the API is unavailable; `loadingAssetsCount` is the combined count of in-flight `AssetLoader` +
  `AudioClip` loads (poll for a loading screen); `random` is a live, time-seeded `Random` (always present; reseed with
  `randomSeed`); `isDevMode` resolves an explicit override, then the `blit386/vite` plugin's build-time flag, then live
  hot-reload activity – it is Tier A below, not Tier B, because no `HardwareSettings` field mirrors it, so it reads as a
  runtime environment query rather than a configure flag; `splashState` is the five-state splash machine's current state
  (`'disabled'` when gated off); `isSplashVisible` is the one-term derived query game code should prefer over
  `splashState`
- Per-frame input: `pointerScrollDelta`, `inputString`, `gamepadCount`

Good: `BT.displaySize.y`, `BT.targetFPS`, `BT.ticks % 180`

Bad: `BT.displaySize()`, `BT.fps()`, `BT.getActiveBackend()` (removed; use property forms)

`Vector2i` getters return a clone per read. `activeBackend` is what actually started after fallback, not
`configure().backend`. `palette` and `random` are live references – mutating palette slots affects rendering on the next
frame; calling methods on `BT.random` advances the shared stream.

## Keep as methods

- Lifecycle / mutations: `init`, `ticksReset`, `cameraSet`, `cameraReset`, `paletteSet`, `paletteCreate`, `randomSeed`,
  `showCursor`, `hideCursor`, `spritesRefresh`, `assignTag`, `inputMap`, `inputMapReset`
- Palette effects: `paletteCycle`, `paletteFade`, `paletteFadeRange`, `paletteFadeExposure`, `paletteFlash`,
  `paletteSwap`, `paletteClearEffects`
- Post-process: `effectAdd`, `effectRemove`, `effectClear`; preset namespace `BT.preset` (`crtPipBoy`, `amber`, `green`)
- Audio: `audioVolumeSet(bus, value, options?)`, `audioVolumeGet(bus)`, `audioMuteSet(bus, muted)`, `isAudioMuted(bus)`,
  `soundPlay(clip, options?)`, `soundStop(ref, options?)`, `isSoundPlaying(ref)`,
  `soundVolumeSet(ref, value, options?)`, `soundVolumeGet(ref)`, `soundPitchSet(ref, value, options?)`,
  `soundPitchGet(ref)`, `soundPanSet(ref, value, options?)`, `soundPanGet(ref)`, `musicPlay(clip, options?)`,
  `musicStop(options?)`, `musicVolumeSet(value, options?)`, `musicVolumeGet()`
- Drawing / clearing: `clear`, `clearRect`, `drawPixel`, `drawLine`, `drawRect`, `drawRectFill`, `drawSprite`,
  `systemPrint`, `systemPrintMeasure`, `printFont` (4th arg is optional `paletteOffset`, not `Color32`)
- Any parameter: `pointerPos(0)`, `pointerDelta(0)`, `isDown(BT.BTN_A)`, `getAxis(...)`, `cameraClamp(...)`
- Boolean queries with parameters (Tier A; always methods on `BT`): `isPointerActive(0)`, `isDown(...)`,
  `isPressed(...)`, `isReleased(...)`, `isGamepadConnected(...)`, `isKeyDown(...)`, `isKeyPressed(...)`,
  `isKeyReleased(...)`
- Side-effect booleans (Tier C): `Timer.fireIfElapsed()` – not `is*` because the call advances state
- Async: `captureFrame`, `downloadFrame`

Deprecated aliases still on `BT` (do not use in new code): see `docs/reference-deprecations.md` (`pointerPosValid`,
`buttonDown`, `keyDown`, …).

## Boolean naming (three tiers)

| Tier | Use | Examples |
| --- | --- | --- |
| **A** Runtime queries | `is*` / `has*` | `isPointerActive`, `isIndexed`, `hasGlyph`, `Palette.isDirty`, `isDevMode` |
| **B** Configure flags | grammatical `is*` | `isOverlayEnabled`, `isSplashEnabled`, `isDetectingDroppedFrames`, `isOverlayPaletteEnabled`, `isOverlayVisibleAtStart`, `isWaitingForDOMReady`, `isCapturingPointerScroll`, `isWakeLockEnabled` |
| **C** Side effects / results | imperative verbs | `fireIfElapsed()`, `remove(): boolean`, `init(): Promise<boolean>` |

- Use `-ing` for configure flags that enable ongoing behavior (`isDetectingDroppedFrames`).
- Hold vs edge on `BT`: `isDown` / `isKeyDown`; `isPressed` / `isReleased`; `isKeyPressed` / `isKeyReleased`. Public
  `BT` uses `isDown`; internal input classes use `isButtonDown` / `isKeyDown` and related names. No embedded second `Is`
  – audit with `\bis[A-Za-z]+Is[A-Z]`.
- Identifier acronyms: `canvasID`, `containerID` (not `canvasId`).

## Naming when adding getters

- Match `HardwareSettings` spelling: `targetFPS` (not `fps`, not `targetFps`)
- `requestedBackend` = resolved request (`configure()` merge + URL override); `activeBackend` = backend that started
  (after fallback)
- Runtime feature gates (post-process, etc.) use `activeBackend`, not `requestedBackend`
- Use a derived getter when the value is computed from configure fields (`outputSize`); do not add a matching field
- Use a runtime-descriptive name when no configure field exists (`activeBackend`, not `renderer`)

## New API checklist

1. Zero args + read-only snapshot → getter on `BT`
2. Takes args or mutates → method
3. Mirrors configure? → same field name as `HardwareSettings` (exception: derived getters like `outputSize` have no
   field)
4. Update `docs/api-*.md`, demos if public; overlay behavior also updates `docs/guide-overlay.md`; structural `src/`
   changes update `.claude/rules/architecture.md` and the Where to Find table in `CLAUDE.md`
5. New per-frame hot-path API (called every `update()`/`render()`, not just at init) – add or extend a `*.bench.ts`
   alongside it, and if it lands in a directory `.claude/rules/bench-coverage.md` does not already cover, add that
   directory there – see `.claude/rules/architecture.md`'s "Adding a new subsystem" section

## `@since` discipline and API history

Adding a public export, a new `BT` member, or a `HardwareSettings`/config type; changing an existing public symbol's
signature or behavior; or deprecating a public symbol: follow `docs/documentation-and-versioning-guide.md`.

1. Add `@since <version>` / `@changed <version> <note>` / `@deprecated Deprecated since <version> (<date>). ...` JSDoc
   tags at the symbol's original declaration (not the re-export line).
2. Run `pnpm run api:history` to regenerate `docs/_api-history.json` – never hand-edit it, commit the regenerated file.
3. Add or update the `<Since symbol="...">`, `<ApiAvailability page="...">`, and `<PageChangelog page="...">` MDX
   components on the symbol's one documentation home (the page with real explanatory prose – see the guide's Step 3 for
   how to pick it).

`pnpm run preflight` already runs `api:since:check` and `api:history:check`, so a missing or malformed tag fails
preflight before docs work even starts.
