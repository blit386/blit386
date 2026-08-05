---
name: move-and-time
description:
  Move things smoothly and schedule actions using the engine frame clock, the Timer helper, and the easing curve library
  (`applyEasing`, `interpolate`). Use for movement, timers, cooldowns, spawn intervals, animation frames, tweening a
  position or color between two values, or anything that should happen 'every N frames' or 'over N seconds'.
---

# Move and time things

Use the engine's frame clock to move things smoothly, repeat actions on a schedule, and ease motion.

## When to use

Use for movement, timers, cooldowns, spawn intervals, animation frames, or anything that should happen "every N frames"
or "over N seconds".

## Read-only clock (properties, no parentheses)

```js
update() {
    // BT.ticks: whole number of update steps since start. Schedule with modulo:
    if (BT.ticks % 30 === 0) {
        this.spawnEnemy(); // twice a second at 60 FPS
    }

    // BT.deltaSeconds: seconds per step. Use for speed-per-second motion:
    this.x += this.speedPerSecond * BT.deltaSeconds;
}
```

- `BT.ticks`, `BT.timeSeconds`, `BT.deltaSeconds`, `BT.targetFPS` – all getters.
- `BT.ticksReset()` (method) – zero the tick counter, e.g. on restart.

## Timer helper

```js
import { Timer } from 'blit386';

// in init():
this.fireTimer = new Timer(20); // fires every 20 ticks

// in update():
if (this.fireTimer.fireIfElapsed(BT.ticks)) {
  this.fire();
}
```

## Easing for smooth motion

Easing bends a straight 0..1 progress value into something that accelerates, overshoots, or bounces.

```js
import { applyEasing } from 'blit386';

const t = (BT.ticks % 60) / 60; // 0..1
const eased = applyEasing(t, 'ease-in-out');
this.y = Math.floor(100 + eased * 50); // round before drawing
```

### Which curve

Every family below comes in three versions: `-in` (slow start), `-out` (slow finish), and `-in-out` (both). So
`'sine-in'`, `'sine-out'`, and `'sine-in-out'` all exist, and the same for the rest.

| Name | Feels like |
| --- | --- |
| `'linear'` | No easing – constant speed |
| `'ease-in'` / `'ease-out'` / `'ease-in-out'` | The gentle default (quadratic) |
| `'sine-*'` | Very soft, barely noticeable |
| `'cubic-*'`, `'quartic-*'`, `'quintic-*'` | Progressively sharper acceleration |
| `'expo-*'` | Extreme – near-still, then a rush |
| `'circ-*'` | Slow, then a sudden hard pull |
| `'back-*'` | Overshoots slightly and settles – good for menus popping in |
| `'elastic-*'` | Springs past the target and wobbles |
| `'bounce-*'` | Bounces like a dropped ball |

`'back-*'` and `'elastic-*'` deliberately leave the 0..1 range mid-animation, so leave room around whatever you are
moving.

### Interpolating between two values

`interpolate` applies a curve and blends two values in one call, so you do not do the arithmetic yourself. It works on
plain numbers and on `Vector2i`, `Color32`, and `Rect2i`, rounding integer types for you:

```js
import { interpolate, Vector2i } from 'blit386';

const t = (BT.ticks % 90) / 90; // 0..1
this.pos = interpolate('bounce-out', new Vector2i(20, 20), new Vector2i(200, 180), t);
```

Watch the argument order – it is the reverse of `applyEasing`: `interpolate(easing, start, end, t)` but
`applyEasing(t, easing)`.

## Notes

- Do timing in `update()`, not `render()`.
- Round to whole numbers before drawing (`Math.floor`) – rendering is integer-only.
- `Timer.fireIfElapsed()` advances its own state, so call it once per frame.

See `docs/basics.md`.
