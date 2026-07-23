---
name: read-pointer
description:
  Read mouse, touch, and pen input through BLIT386's unified pointer API with up to four slots. Use for clicking,
  dragging, painting, aiming, scrolling, or touch controls.
---

# Read the mouse, touch, and pen

Mouse, touch, and pen share one "pointer" API with up to four slots. Slot 0 is the mouse or first touch.

## When to use

Use for clicking, dragging, painting, aiming, scrolling, or touch controls.

## How to do it

```js
configure() {
    return {
        // Needed so BT.pointerScrollDelta works and the page does not scroll over the canvas.
        isCapturingPointerScroll: true,
    };
}

update() {
    if (BT.isPointerActive(0)) {
        const p = BT.pointerPos(0); // a Vector2i in screen pixels
        const move = BT.pointerDelta(0); // how far it moved this frame

        if (BT.isDown(BT.BTN_POINTER_A, 0)) this.paintAt(p); // primary button held
        if (BT.isPressed(BT.BTN_POINTER_A, 0)) this.startDrag(p);
        if (BT.isReleased(BT.BTN_POINTER_A, 0)) this.endDrag(p, move); // move as flick velocity
    }

    const wheel = BT.pointerScrollDelta; // a getter; vertical wheel movement this frame (pixels)
    this.zoom += wheel;
}
```

## Key calls

- `BT.pointerPos(slot?)` / `BT.pointerDelta(slot?)` – methods, return `Vector2i`.
- `BT.isPointerActive(slot?)` – method; is a pointer present in that slot.
- `BT.pointerScrollDelta` – getter; vertical wheel delta this frame (requires `isCapturingPointerScroll: true`).
- Buttons: `BT.BTN_POINTER_A` (primary), `BTN_POINTER_B/C/D`, `BTN_POINTER_ANY`, used with
  `BT.isDown/isPressed/isReleased`.
- `BT.hideCursor()` / `BT.showCursor()` – methods; hide or restore the OS cursor over the canvas.

## Notes

- Slots: 0 = mouse or first touch; 1–3 = extra touches or pens (multi-touch).
- Read in `update()`. Positions are already in your screen's pixel coordinates.
- `pointerDelta` makes a good drag velocity – release while moving to "flick".
- Wheel capture is opt-in: set `isCapturingPointerScroll: true` in `configure()` when you map the mouse wheel. Without
  it the host page scrolls normally and `BT.pointerScrollDelta` stays `0`.
- The same flag gates touch scrolling past the canvas: off means `touch-action: pan-y` (phones can tap-hold-scroll the
  page); on means `touch-action: none` so the game owns the gesture.

See `docs/input.md`.
