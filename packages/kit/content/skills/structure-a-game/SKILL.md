---
name: structure-a-game
description:
  Show the shape of a BLIT386 game (configure, init, update, render) and set the expectation that the engine draws,
  reads input, and plays sound while you write physics, collision, enemies, and scenes yourself. Use when starting a new
  game or when the user asks how to add a player, collision, or enemies and might expect built-in systems.
---

# Structure a game

BLIT386 draws pixels, reads input, and plays sound. It does NOT include physics, collision, enemies, or a scene system –
you write that game logic yourself. This skill shows the shape to put it in.

## When to use

Use when starting a new game, or when the user asks "how do I add a player / collision / enemies" and might expect
built-in systems. Set the expectation early: the engine draws, reads input, and plays sound; you build the game logic.

## The shape of a game

```js
import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

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

## The engine does provide these

- Drawing: shapes, sprites, text, and the palette.
- Input: keyboard, pointer, and gamepad.
- Sound: a bus mixer, loadable clips, looping music, and a synth that builds retro sounds from nothing (see the
  play-a-sound skill).

## Notes

- `update()` decides; `render()` draws. Keep them apart (see `docs/basics.md`).
- The engine runs on WebGPU and falls back to plain Canvas 2D, so a game always renders. Only fullscreen post-process
  effects need WebGPU (see the add-crt-effect skill); sound works on both.
- Optional `onHotReload(context)` can restore fields after an `init()` edit while the Vite plugin keeps the session
  alive – see the use-hot-reload skill and `docs/hot-reload.md`.

See `docs/basics.md`.
