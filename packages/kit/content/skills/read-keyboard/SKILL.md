---
name: read-keyboard
description:
  Read keyboard keys and face buttons in update(). Use for keyboard movement, jumping, menus, typed text, or remapping
  keys, including raw key codes like 'KeyW' and the arrow-keys-to-D-pad mapping.
---

# Read the keyboard

Read keys and face buttons in `update()`. Arrow keys and Space already map to the D-pad and `BTN_A`.

## When to use

Use for keyboard movement, jumping, menus, typed text, or remapping keys.

## Face buttons (work on keyboard and gamepad)

```js
update() {
    if (BT.isDown(BT.BTN_RIGHT, 0)) this.x += 2; // held: movement
    if (BT.isPressed(BT.BTN_A, 0)) this.jump(); // one frame: jump/fire/confirm
    if (BT.isReleased(BT.BTN_A, 0)) this.release();
}
```

Player number is `0` for a one-player game. Directions: `BT.BTN_LEFT/RIGHT/UP/DOWN`; actions: `BT.BTN_A/B/X/Y`.

## Raw keys by name

Use the browser key code (`'KeyW'`, `'Space'`, `'ArrowUp'`, `'Enter'`):

```js
if (BT.isKeyDown('KeyW')) this.y -= 2; // held
if (BT.isKeyPressed('Enter')) this.start(); // one frame
if (BT.isKeyPressed('ArrowUp', 10)) this.menuUp(); // repeats every 10 ticks while held
```

## Typed text

```js
this.name += BT.inputString; // characters typed this frame (a getter)
```

## Remap a face button

```js
BT.inputMap(0, BT.BTN_A, 'KeyZ', 'Space'); // player, button, one or more key codes
BT.inputMapReset(); // back to defaults
```

## Key calls

- `BT.isKeyDown(code)` / `BT.isKeyPressed(code, repeat?)` / `BT.isKeyReleased(code)` - methods.
- `BT.isDown(button, player)` / `BT.isPressed(...)` / `BT.isReleased(...)` - methods (face buttons).
- `BT.inputString` - getter (typed characters).
- `BT.inputMap(player, button, ...keys)` / `BT.inputMapReset()` - methods (players 0-1 only).

## Notes

- Read input in `update()`, not `render()` - presses, releases, and typed text are one-frame events that already reset
  by the time `render()` runs, so checking them there can silently drop taps under fast input.
- "Down" means held every frame; "Pressed" / "Released" is the single edge frame.

See `docs/input.md`.
