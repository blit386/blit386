---
name: structure-a-game
description:
  Show the shape of a Blit-Tech game (configure, init, update, render) and set the expectation that the engine renders
  and reads input while you write physics, collision, enemies, scenes, and sound yourself. Use when starting a new game
  or when the user asks how to add a player, collision, or enemies and might expect built-in systems.
---

# Structure a game

Blit-Tech draws pixels and reads input. It does NOT include physics, collision, enemies, scenes, or sound - you write
that game logic yourself. This skill shows the shape to put it in.

## When to use

Use when starting a new game, or when the user asks "how do I add a player / collision / enemies" and might expect
built-in systems. Set the expectation early: the engine renders and reads input; you build the rest.

## The shape of a game

```js
import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

class Game {
  // configure() {}            // optional; omit for a 320x240 screen at 60 FPS
  async init() {
    // load assets and set up colors once; return true on success
    this.player = new Rect2i(150, 110, 16, 16);
    return true;
  }
  update() {
    // YOUR logic: read input, move things, check collisions, change state
  }
  render() {
    // draw the current state; do not change logic here
  }
}

bootstrap(Game);
```

## You build these yourself

- Movement: change your own numbers in `update()`. The engine never moves anything for you.
- Collision: there is no physics. Test overlap yourself with `Rect2i.isIntersecting(other)`.
- Restart: reset your own variables. `BT.ticksReset()` zeroes the frame counter if you time things off `BT.ticks`.

```js
if (this.player.isIntersecting(this.coin)) {
  this.score += 1;
}
```

## Notes

- `update()` decides; `render()` draws. Keep them apart (see `docs/basics.md`).
- The engine runs on WebGPU and falls back to plain Canvas 2D, so a game always renders. Only fullscreen post-process
  effects need WebGPU (see the add-crt-effect skill).

See `docs/basics.md`.
