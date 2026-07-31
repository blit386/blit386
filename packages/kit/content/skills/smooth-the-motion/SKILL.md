---
name: smooth-the-motion
description:
  Make movement look smooth instead of stepped by drawing between updates with BT.renderAlpha. Use when motion looks
  jerky, jittery, choppy, stuttering, or 'not smooth', when the game feels rough on a fast monitor, or when the user
  asks how to get smooth scrolling or smooth movement.
---

# Smooth the motion

Your game thinks at a fixed speed (60 times a second) but the screen may draw much faster than that – 120 or 144 times a
second on a modern monitor. So some drawn frames land in between two thinking steps, and the engine has to guess where
things are. `BT.renderAlpha` is that guess, and using it is what turns stepped, jerky motion into smooth motion.

## When to use

Use when movement looks jerky, choppy, or stuttering, when the game feels rough on a fast monitor, or when the user asks
for smooth scrolling or smooth movement.

## The idea

Think of a flip-book. `update()` draws the pages, always the same distance apart. `render()` is your thumb, and it can
stop halfway between two pages. `BT.renderAlpha` tells you how far it stopped: `0` means "exactly on the old page", `1`
means "exactly on the new page", `0.5` means "halfway between the two".

To use it you need to remember where a thing was, not just where it is. So you keep two positions.

## How to do it

Three steps. Almost everyone forgets the first one.

```js
import { BT, Rect2i, Vector2i } from 'blit386';

async init() {
    this.pos = new Vector2i(50, 100);
    this.prevPos = this.pos.clone(); // where it was last step
    this.vel = new Vector2i(2, 0);
    return true;
}

update() {
    // 1. Remember where it WAS, before you move it. This must be the first line.
    this.prevPos = this.pos.clone();

    // 2. Move it as usual.
    this.pos = this.pos.add(this.vel);
}

render() {
    // 3. Draw somewhere between the two, using renderAlpha as the "how far" number.
    const drawPos = Vector2i.lerp(this.prevPos, this.pos, BT.renderAlpha);
    BT.drawRectFill(new Rect2i(drawPos.x, drawPos.y, 8, 8), COLOR_PLAYER);
}
```

`Vector2i.lerp(a, b, t)` means "give me the point `t` of the way from `a` to `b`". Feeding it `BT.renderAlpha` gives you
exactly the in-between position the screen wants.

## A smooth camera

A camera scrolls the same way – remember where it was, then draw from the in-between position:

```js
update() {
    this.prevCamera = this.camera.clone();
    this.camera = BT.cameraClamp(this.player.pos, this.worldSize);
}

render() {
    BT.cameraSet(Vector2i.lerp(this.prevCamera, this.camera, BT.renderAlpha));
    this.drawWorld();

    BT.cameraReset(); // back to screen space - the HUD must NOT be smoothed
    BT.systemPrint(new Vector2i(6, 6), COLOR_TEXT, `Score ${this.score}`);
}
```

## Key calls

- `BT.renderAlpha` (getter) – how far this drawn frame sits between the last two updates, from 0 to 1.
- `Vector2i.lerp(a, b, t)` (static) – the point `t` of the way from `a` to `b`.
- `Vector2i.lerpTo(a, b, t, out)` (static) – the same thing, but writes into a vector you already made instead of making
  a new one. Use it if you are smoothing hundreds of things; see the `keep-it-fast` skill.
- `Vector2i.clone()` (method) – a copy you can keep while the original changes.

## Notes

- Only smooth things that move in `update()`. Never smooth the HUD, the score, or anything you draw after
  `BT.cameraReset()` – those should sit still.
- Snapshot before you move, not after. If it still looks stepped, that line is in the wrong place:
  `this.prevPos = this.pos.clone()` must be the **first** line of `update()`, not the last.
- `Vector2i` always holds whole numbers and rounds down for you, so you do not need `Math.floor` after a `lerp`.
- When something teleports (a respawn, a wrap-around at the screen edge), set `prevPos` to the new position too.
  Otherwise the engine smoothly slides it across the whole screen instead of jumping.
- This only changes what you _see_. The game still thinks at a fixed speed, so collisions and scores are unaffected.

See `docs/basics.md`.
