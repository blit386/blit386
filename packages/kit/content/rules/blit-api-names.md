---
description: BLIT386 public API names for game projects
alwaysApply: true
---

# BLIT386 API names

Use the public `BT` namespace and `configure()` field names from the blit386 engine.

## Namespace

All engine calls go through the `BT` object. Never import or call internal classes directly.

```js
BT.clear(COLOR_BG); // correct
BT.drawRectFill(rect, COLOR); // correct
```

## Getters (no parentheses)

These are read-only values; access them as properties, not function calls.

- Screen: `BT.displaySize`, `BT.drawingBufferSize`, `BT.outputSize`, `BT.screenOrientation`
- Timing: `BT.ticks`, `BT.deltaSeconds`, `BT.timeSeconds`, `BT.targetFPS`, `BT.renderAlpha`
- Backend: `BT.activeBackend`, `BT.requestedBackend`
- Assets: `BT.loadingAssetsCount` (in-flight image + audio loads; poll for a loading screen)
- Audio: `BT.isAudioUnlocked`, `BT.isMusicPlaying`
- Input: `BT.inputString`, `BT.pointerScrollDelta`, `BT.gamepadCount`
- Scene: `BT.camera`, `BT.palette` (throws if no palette has been set yet)
- Random: `BT.random` (engine 1.5.0+) - the shared seedable generator; a live reference, like `BT.palette`. See
  `skills/use-random/`
- Build mode: `BT.isDevMode` (engine 1.5.0+) - gate debug HUDs, cheat keys, and verbose logging; see
  `skills/use-dev-mode/`
- Splash: `BT.isSplashVisible` (engine 1.5.0+) - true while the BLIT386 splash covers the screen; `BT.splashState` for
  the raw lifecycle state
- Readiness: `BT.isReady` (engine 1.8.0+) - true only once `init()` has finished and the game loop exists; poll it
  before `BT.renderAt` / `BT.captureFrame` / `BT.testState` from an external driver
- Accessibility: `BT.isReducedMotionPreferred` (engine 1.7.0+) - true when the player asked their system for less
  motion; pair it with the `onReducedMotionChange` hook below
- Fonts: `BT.systemFont` (engine 1.7.0+) - the built-in 6x14 font as a live `BitmapFont`, so `font.codePoints` and
  `font.hasGlyph(char)` work on it; throws if read before `init()` finishes

```js
const w = BT.displaySize.x; // correct
const t = BT.ticks; // correct
```

## Methods (call with parentheses)

Mutations, actions, and parameterized queries always use parentheses.

```js
BT.clear(COLOR_BG); // clear the screen
BT.paletteSet(palette); // activate a palette
BT.paletteFadeExposure(palette, 1500); // camera-style fade; options bag is 3rd (engine 1.5.0+)
BT.isDown(BT.BTN_LEFT, 0); // check held button (player 0)
BT.isPressed(BT.BTN_A, 0); // check just-pressed edge
BT.isKeyDown('ArrowLeft'); // keyboard hold
BT.isPointerActive(0); // slot 0 is the mouse; slots 1-3 are fingers and pens
BT.pointerPos(0); // pointer position (Vector2i)
BT.pointerPosTo(out, 0); // same, written into an existing Vector2i (engine 1.7.0+)
BT.pointerDeltaTo(out, 0); // same for the movement delta (engine 1.7.0+)
BT.nativeScreenToDisplayPos(e.clientX, e.clientY); // DOM event coords to display pixels, or null (engine 1.8.0+)
BT.randomSeed(1234); // reseed the shared generator (engine 1.5.0+)
BT.drawTile(sheet, 3, pos); // one grid cell of a sheet loaded with { tileSize } (engine 1.8.0+)
BT.drawNineSlice(panel, rect); // a NineSlice into any Rect2i (engine 1.8.0+)
BT.inputMapReset(); // back to the active keyboardLayout's key tables
await BT.renderAt(3.2); // stop the loop on the frame at 3.2 s (engine 1.8.0+); BT.resume() restarts it
```

## Constants (plain values, no parentheses)

- Buttons: `BT.BTN_UP/DOWN/LEFT/RIGHT`, `BT.BTN_A/B/X/Y`, `BT.BTN_L/R`, `BT.BTN_START/SELECT`, pointer
  `BT.BTN_POINTER_A/B/C/D`; gamepad-only triggers `BT.BTN_L2` / `BT.BTN_R2` and their union `BT.BTN_TRIGGER` (engine
  1.8.0+; `BT.inputMap` and `BT.isAnyButton*` ignore them). Axes: `BT.AXIS_LEFT_X/Y`, `BT.AXIS_RIGHT_X/Y`,
  `BT.AXIS_TRIGGER_L/R`.
- Sprite orientation bits for `SpriteDrawParams.flags` (engine 1.8.0+): `BT.FLIP_H`, `BT.FLIP_V`, `BT.ROT_90_CW`,
  `BT.ROT_180_CW`, `BT.ROT_270_CW`, combined with `|`. See `skills/add-sprite/`.
- Keyboard tables: `BT.DEFAULT_KEYBOARD_PLAYER1/2` (`'versus'`), `BT.DEFAULT_KEYBOARD_SINGLE_PLAYER1/2` (`'single'`,
  engine 1.8.0+). Read-only; remap with `BT.inputMap`.

The `*To` pointer calls take the destination `Vector2i` first and the slot second, and return that same vector. They
exist to avoid allocating in a hot loop; `BT.pointerPos` / `BT.pointerDelta` stay the readable default. See
`skills/read-pointer/` and `skills/keep-it-fast/`.

Palette blocks: `palette.fillBlock(start, source, transform)` (engine 1.7.0+) writes `transform(source[i], i)` into slot
`start + i` for every color in `source` and returns the next free slot. It replaces a hand-written `for` loop of
`palette.set()` calls; see `skills/use-palette/`.

`BT.random` is the getter, `BT.randomSeed(n)` is the method - the pair works like `BT.palette` / `BT.paletteSet`. Draws
go through the getter: `BT.random.int(0, 320)`, `BT.random.pick(list)`. Prefer it over `Math.random()`, which cannot be
seeded. Import `Random` from `blit386` for an independent stream, and `hash2` / `PerlinNoise` and friends for
coordinate-based world generation; see `skills/use-random/` and `skills/use-noise/`.

## Configure flags

In `configure()`, boolean flags use grammatical `is*` names.

```js
configure() {
    return {
        isOverlayEnabled: true,
        isOverlayVisibleAtStart: false,
        isCapturingPointerScroll: true, // opt in when mapping BT.pointerScrollDelta
        isCapturingKeyboardScroll: true, // opt in when mapping Arrow/Space for gameplay
        isWakeLockEnabled: true, // opt in to stop mobile screens dimming during play
        isFrameCaptureShortcutEnabled: false, // opt out of the dev-mode F9 / Shift+F9 capture keys (engine 1.7.0+)
        preferredOrientation: 'landscape', // ask the browser to lock after start (Android)
        keyboardLayout: 'single', // WASD and arrows both steer player 0 (engine 1.8.0+)
    };
}
```

The two scroll captures and the wake lock default to off. `BT.pointerScrollDelta` stays `0` without
`isCapturingPointerScroll`, which also sets touch scrolling past the canvas (`pan-y` off, `none` on). `keyboardLayout`
defaults to `'versus'` (WASD for player 0, arrows for player 1); `'single'` also turns keyboard scroll capture on unless
the flag is set. Orientation: `BT.screenOrientation` reports it (or `null`); the lock works on Android Chrome only, and
a "please rotate" prompt is your job. See `docs/input.md` and `docs/basics.md`.

## Demo class hooks (optional methods)

Optional methods on your game class (the one you pass to `bootstrap()`):

- `onOrientationChange(type)` - device orientation changed (see above).
- `overlayRows()` - extra rows for the debug overlay (`{ leftText, rightText? }`), read each frame while it shows. Reuse
  the same array when nothing changed, so it does not allocate every frame.
- `onHotReload(context)` - after a hot-reload swap (engine 1.4.0+). `context.reason` is `'methods'` or `'reinit'`;
  `'reinit'` also provides `context.snapshot` (previous instance fields) so you can restore score and similar. Never
  fires for a `configure()` hardware change (that reloads the page). See `docs/hot-reload.md`.
- `onReducedMotionChange(prefersReduced)` - the player's reduced-motion preference changed (engine 1.7.0+). Read the
  current value any time from `BT.isReducedMotionPreferred`; this hook is for reacting mid-session. The engine tones
  down its own splash for you, but never changes your draw calls - toning down shake, flicker, and long transitions is
  your code.
- `testState()` - return the game's state as plain JSON for play-testing (engine 1.8.0+); `BT.testState()` reads it as
  `{ ticks, backend, state }`. The `use-dev-mode` skill covers what to return and what comes back.

Do not call `registerHotReload` yourself - it is tooling-only. The `blit386()` Vite plugin injects it. Hand-calling it
from game code is unsupported.

## Do not use deprecated names

`BT.buttonDown` (use `BT.isDown`), `overlayEnabled` (use `isOverlayEnabled`), `canvasId` (use `canvasID`).

Full reference: `AGENTS.md` and `docs/` in this project.
