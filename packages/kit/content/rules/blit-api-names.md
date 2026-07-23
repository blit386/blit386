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

```js
const w = BT.displaySize.x; // correct
const t = BT.ticks; // correct
```

## Methods (call with parentheses)

Mutations, actions, and parameterized queries always use parentheses.

```js
BT.clear(COLOR_BG); // clear the screen
BT.paletteSet(palette); // activate a palette
BT.isDown(BT.BTN_LEFT, 0); // check held button (player 0)
BT.isPressed(BT.BTN_A, 0); // check just-pressed edge
BT.isKeyDown('ArrowLeft'); // keyboard hold
BT.isPointerActive(0); // mouse or touch slot 0 is active
BT.pointerPos(0); // pointer position (Vector2i)
```

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
        preferredOrientation: 'landscape', // ask the browser to lock after start (Android)
    };
}
```

Wheel capture defaults to off so the host page can scroll over the canvas. Set `isCapturingPointerScroll: true` when
your game reads `BT.pointerScrollDelta`. The same flag gates touch scrolling past the canvas: `pan-y` when off (phones
can tap-hold-scroll the page), `none` when on (the game owns the gesture).

Keyboard scroll capture defaults to off so arrow keys and Space still scroll the host page while the canvas is focused.
Set `isCapturingKeyboardScroll: true` when your game maps those keys (for example ArrowUp/Down or Space as a face
button).

Screen wake lock defaults to off. Set `isWakeLockEnabled: true` so phones and tablets do not dim or lock the screen
during active play; the engine requests it after a successful start and silently does nothing on browsers that do not
support it.

Screen orientation: `BT.screenOrientation` is the current browser type string (for example `'landscape-primary'`), or
`null` when unavailable. Set `preferredOrientation` to `'landscape'` or `'portrait'` to ask for a lock after start
(`'any'` is the default and skips the lock). Optional `onOrientationChange(type)` on your game class runs when the
player rotates the device. Locking works on Android Chrome; iOS Safari silently ignores it. A "please rotate" prompt is
your job – the engine only reports the orientation.

## Demo class hooks (optional methods)

Optional methods on your game class (the one you pass to `bootstrap()`):

- `onOrientationChange(type)` – device orientation changed (see above).
- `onHotReload(context)` – after a hot-reload swap (engine 1.4.0+). `context.reason` is `'methods'` or `'reinit'`;
  `'reinit'` also provides `context.snapshot` (previous instance fields) so you can restore score and similar. Never
  fires for a `configure()` hardware change (that reloads the page). See `docs/hot-reload.md`.

Do not call `registerHotReload` yourself – it is tooling-only. The `blit386()` Vite plugin injects it. Hand-calling it
from game code is unsupported.

## Do not use removed names

`BT.isButtonDown` (use `BT.isDown`), `overlayEnabled` (use `isOverlayEnabled`), `canvasId` (use `canvasID`).

Full reference: `AGENTS.md` and `docs/` in this project.
