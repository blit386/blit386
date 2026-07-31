---
name: move-and-time
description:
  Move things smoothly and schedule actions using the engine frame clock, the Timer helper, and easing. Use for
  movement, timers, cooldowns, spawn intervals, animation frames, or anything that should happen 'every N frames' or
  'over N seconds'.
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

```js
import { applyEasing } from 'blit386';

const t = (BT.ticks % 60) / 60; // 0..1
const eased = applyEasing(t, 'ease-in-out');
this.y = Math.floor(100 + eased * 50); // round before drawing
```

## Notes

- Do timing in `update()`, not `render()`.
- Round to whole numbers before drawing (`Math.floor`) – rendering is integer-only.
- `Timer.fireIfElapsed()` advances its own state, so call it once per frame.

See `docs/basics.md`.
