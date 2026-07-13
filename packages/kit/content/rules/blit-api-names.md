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

- Screen: `BT.displaySize`, `BT.drawingBufferSize`, `BT.outputSize`
- Timing: `BT.ticks`, `BT.deltaSeconds`, `BT.timeSeconds`, `BT.targetFPS`, `BT.renderAlpha`
- Backend: `BT.activeBackend`, `BT.requestedBackend`
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
    };
}
```

## Do not use removed names

`BT.isButtonDown` (use `BT.isDown`), `overlayEnabled` (use `isOverlayEnabled`), `canvasId` (use `canvasID`).

Full reference: `AGENTS.md` and `docs/` in this project.
