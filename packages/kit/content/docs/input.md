# Input

Read input inside `update()` – button presses, key presses, and typed text are one-frame events that already reset by
the time `render()` runs, so checking them there can miss a tap. BLIT386 gives every player simple, named buttons that
work the same whether the player uses a keyboard or a gamepad.

## Face buttons and the D-pad

The button names are constants on `BT`:

- Directions: `BT.BTN_LEFT`, `BT.BTN_RIGHT`, `BT.BTN_UP`, `BT.BTN_DOWN`
- Action buttons: `BT.BTN_A`, `BT.BTN_B`, `BT.BTN_X`, `BT.BTN_Y`

For one-player games, the player number is `0`.

### Held vs. just pressed

There are three questions you can ask, and the difference matters:

```js
update() {
    // isDown: true every frame the button is held. Use for movement.
    if (BT.isDown(BT.BTN_RIGHT, 0)) {
        this.x += 2;
    }

    // isPressed: true only on the one frame the button goes down. Use for jumping, firing, menu choices.
    if (BT.isPressed(BT.BTN_A, 0)) {
        this.jump();
    }

    // isReleased: true only on the one frame the button comes back up.
    if (BT.isReleased(BT.BTN_A, 0)) {
        this.stopChargingJump();
    }
}
```

On a keyboard, the arrow keys map to the D-pad and Space maps to `BTN_A` by default, so these work with no extra setup.

Arrow keys and Space also scroll the web page by default. When your game uses them, opt in so the page does not move
while you play:

```js
configure() {
  return {
    isCapturingKeyboardScroll: true,
  };
}
```

## Raw keyboard keys

If you want a specific key by name, use its code (the same names the browser uses, like `'KeyW'`, `'Space'`,
`'ArrowUp'`, `'Enter'`):

```js
if (BT.isKeyDown('KeyW')) {
  this.y -= 2;
}
if (BT.isKeyPressed('Enter')) {
  this.start();
}
```

`isKeyDown` is "held", `isKeyPressed` and `isKeyReleased` are the one-frame edges, exactly like the buttons above.

If you read raw arrow keys or Space (not only face buttons), set `isCapturingKeyboardScroll: true` in `configure()` the
same way.

## Mouse, touch, and pen

These share one set of calls (a "pointer"). Slot `0` is the main one:

```js
if (BT.isPointerActive(0)) {
  const p = BT.pointerPos(0); // a Vector2i in screen pixels
  // ...use p.x and p.y...
}
```

### Mouse wheel

The mouse wheel also scrolls the web page by default. If your game reads `BT.pointerScrollDelta` (for example to zoom
the camera), opt in so the page does not move while you play:

```js
configure() {
  return {
    isCapturingPointerScroll: true,
  };
}
```

```js
update() {
  const wheel = BT.pointerScrollDelta; // a getter; vertical wheel movement this frame, in pixels
  this.zoom += wheel;
}
```

The same flag also controls touch scrolling past the canvas. Left at the default `false`, phones can tap-hold-scroll the
host page (`touch-action: pan-y`). Set it to `true` when your game owns vertical gestures (zoom, camera scroll) so the
page does not compete.

Next: `docs/drawing.md` to draw what the player controls.
