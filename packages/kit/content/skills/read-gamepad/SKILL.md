---
name: read-gamepad
description:
  Read gamepad face buttons, shoulders, analog sticks, and triggers from up to four controllers. Use for controller
  support, analog movement, or multiplayer input.
---

# Read a gamepad

Read face buttons, shoulders, sticks, and triggers from up to four controllers.

## When to use

Use for controller support, analog movement, or multiple players.

## How to do it

```js
update() {
    // Buttons use the same calls as the keyboard face buttons.
    if (BT.isDown(BT.BTN_A, 0)) this.boost();
    if (BT.isPressed(BT.BTN_START, 0)) this.pause();

    // Sticks and triggers are analog: getAxis returns -1..1 (sticks) or 0..1 (triggers).
    const x = BT.getAxis(BT.AXIS_LEFT_X, 0);
    const y = BT.getAxis(BT.AXIS_LEFT_Y, 0);
    this.player.x += Math.round(x * 3);
    this.player.y += Math.round(y * 3);

    if (!BT.isGamepadConnected(0)) this.showConnectHint();
}
```

## Any button (engine 1.8.0+)

```js
update() {
    if (BT.isAnyButtonPressed(0)) this.startGame(); // any button on player 0's pad went down
    if (BT.isAnyButtonReleased(0)) this.padIdle = true; // the LAST held button came up
}
```

`isAnyButtonPressed(player?, repeat?)` fires on every new button, even with another held. `isAnyButtonReleased` means
everything is up now, or the pad disconnected while buttons were held. These cover `BTN_UP` to `BTN_SELECT` only: no
sticks, no analog triggers, no keyboard (use `BT.isAnyKeyPressed()` for that). `player` defaults to `0`.

## Key calls

- `BT.isDown(button, player)` / `BT.isPressed(...)` / `BT.isReleased(...)` - methods. Buttons: `BTN_UP/DOWN/LEFT/RIGHT`,
  `BTN_A/B/X/Y`, `BTN_L/R` (shoulders), `BTN_L2/R2` (triggers as buttons, gamepad only, down at 50% pull), `BTN_START`,
  `BTN_SELECT`; masks `BTN_ABXY`, `BTN_SHOULDER`, `BTN_TRIGGER`.
- `BT.isAnyButtonDown(player?)` / `BT.isAnyButtonPressed(player?, repeat?)` / `BT.isAnyButtonReleased(player?)` -
  methods, engine 1.8.0+. They cover `BTN_UP` to `BTN_SELECT` only, not the trigger buttons.
- `BT.getAxis(axis, player?)` - method. Axes: `AXIS_LEFT_X/Y`, `AXIS_RIGHT_X/Y`, `AXIS_TRIGGER_L/R`.
- `BT.isGamepadConnected(player?)` - method.
- `BT.gamepadCount` - getter; number of connected pads (0-4).
- Players: `BT.PLAYER_ONE` ... `BT.PLAYER_FOUR` (or just `0`-`3`).

## Notes

- Players 0 and 1 merge keyboard and gamepad; players 2 and 3 are gamepad-only for face buttons.
- Sticks have a dead zone, so small drift reads as 0.
- Multiply an axis by your speed and `Math.round` before moving (drawing is integer-only).

See `docs/input.md`.
