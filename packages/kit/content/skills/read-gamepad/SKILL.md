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

## Key calls

- `BT.isDown(button, player)` / `BT.isPressed(...)` / `BT.isReleased(...)` – methods. Buttons: `BTN_UP/DOWN/LEFT/RIGHT`,
  `BTN_A/B/X/Y`, `BTN_L/R` (shoulders), `BTN_START`, `BTN_SELECT`; masks `BTN_ABXY`, `BTN_SHOULDER`.
- `BT.getAxis(axis, player?)` – method. Axes: `AXIS_LEFT_X/Y`, `AXIS_RIGHT_X/Y`, `AXIS_TRIGGER_L/R`.
- `BT.isGamepadConnected(player?)` – method.
- `BT.gamepadCount` – getter; number of connected pads (0–4).
- Players: `BT.PLAYER_ONE` ... `BT.PLAYER_FOUR` (or just `0`-`3`).

## Notes

- Players 0 and 1 merge keyboard and gamepad; players 2 and 3 are gamepad-only for face buttons.
- Sticks have a dead zone, so small drift reads as 0.
- Multiply an axis by your speed and `Math.round` before moving (drawing is integer-only).

See `docs/input.md`.
