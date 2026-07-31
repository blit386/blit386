---
name: keep-it-fast
description:
  Find and fix slow frames: stop making new objects every frame, batch sprites by sheet, skip what is off screen, and
  stay inside the engine's per-frame drawing budget. Use when the game stutters, drops frames, feels slow, gets slower
  the longer it runs, when sprites mysteriously vanish, or when the user asks how to make the game run faster.
---

# Keep it fast

A BLIT386 game gets 16 milliseconds to think and draw each frame. That is a lot – until you do something wasteful sixty
times a second. Almost every slow BLIT386 game is slow for one of the reasons below.

## When to use

Use when the game stutters or drops frames, when it gets slower the longer it runs, when sprites start disappearing for
no obvious reason, or when the user asks how to make the game run faster.

## First: measure, do not guess

Turn on the overlay before you change any code. It tells you whether you are slow in `update()` (your logic) or
`render()` (your drawing), which are completely different problems.

```js
configure() {
    return {
        displaySize: new Vector2i(320, 240),
        isOverlayEnabled: true,
        isOverlayTimingChartEnabled: true, // the graph of where the time goes
        isOverlayRendererDiagnosticsBarEnabled: true, // how much you are drawing
    };
}
```

You can label moments on the timing chart to see what costs what:

```js
update() {
    BT.assignTag('enemies'); // needs isOverlayTimingChartEnabled
    this.updateEnemies();
}
```

See the `show-debug-overlay` skill for the rest of the overlay.

## Rule 1: do not make new objects every frame

This is the big one. Every `new Vector2i(...)` and `new Rect2i(...)` is a small piece of litter. Make one per frame and
nobody cares. Make one per enemy per frame, and the browser eventually has to stop the game to sweep up – which is felt
as a regular hitch every few seconds.

Make them once, then reuse them:

```js
// Slow: a fresh Rect2i for every tile, every frame.
render() {
    for (const tile of this.tiles) {
        BT.drawRectFill(new Rect2i(tile.x, tile.y, 16, 16), tile.color);
    }
}

// Fast: one Rect2i, reused. Same picture, no litter.
async init() {
    this.tileRect = new Rect2i(0, 0, 16, 16);
    return true;
}

render() {
    for (const tile of this.tiles) {
        this.tileRect.set(tile.x, tile.y, 16, 16);
        BT.drawRectFill(this.tileRect, tile.color);
    }
}
```

The engine also gives you no-litter versions of the calls that would otherwise hand you a new object. They take an `out`
argument – the object to write the answer into:

- `Vector2i.lerpTo(a, b, t, out)` instead of `Vector2i.lerp(a, b, t)`
- `Rect2i.intersectTo(other, out)` instead of making a new rectangle
- `vec.set(x, y)` and `vec.copyFrom(other)` instead of `new Vector2i(...)`

## Rule 2: draw all of one sprite sheet, then the next

The engine groups sprite draws into batches, and it starts a new batch every time you switch sheets. Alternating between
two sheets turns one batch into hundreds:

```js
// Slow: switches sheet on every single enemy.
for (const e of this.enemies) {
  BT.drawSprite(this.bodySheet, e.bodyRect, e.pos);
  BT.drawSprite(this.gunSheet, e.gunRect, e.gunPos);
}

// Fast: two passes, two batches.
for (const e of this.enemies) BT.drawSprite(this.bodySheet, e.bodyRect, e.pos);
for (const e of this.enemies) BT.drawSprite(this.gunSheet, e.gunRect, e.gunPos);
```

If you can fit your art on one sheet, do – then there is nothing to switch.

## Rule 3: do not draw what nobody can see

If your world is bigger than the screen, loop over the part that is on screen, not the whole map. Work out the visible
range first:

```js
render() {
    const cam = this.camera;
    const startCol = Math.max(0, Math.floor(cam.x / TILE_SIZE));
    const endCol = Math.min(MAP_COLS - 1, Math.ceil((cam.x + BT.displaySize.width) / TILE_SIZE));
    // ...same for rows, then only loop over startCol..endCol.
}
```

A 500x500 tile map is 250,000 tiles. The screen holds about 300 of them.

## Rule 4: there is a budget, and going over it drops your sprites silently

Each frame the engine has room for roughly **8,300 sprites**, and separately for roughly **8,300 shapes**. Sprites and
shapes have their own budgets and do not compete for each other's room.

Shapes all cost the same: a rectangle, a line, and even a single pixel are each drawn as two triangles, so each one
costs the same slice of the budget. An outlined rectangle (`BT.drawRect`) is four lines, so it costs four.

Go past it and the extra drawing is **thrown away** – the sprite simply does not appear. It logs a warning to the
browser console and counts the drops on the overlay's renderer diagnostics bar, but your game does not crash and does
not tell you. So: **if things randomly stop appearing when the screen gets busy, you are over budget**, and the fix is
rule 3, not a bigger budget.

## Key calls

- `BT.assignTag(label)` (method) – mark a moment on the overlay timing chart. Needs `isOverlayTimingChartEnabled`.
- `Vector2i.lerpTo(a, b, t, out)` / `Rect2i.intersectTo(other, out)` (methods) – the no-litter versions.
- `rect.set(x, y, w, h)` / `vec.set(x, y)` / `vec.copyFrom(other)` (methods) – reuse an object instead of making one.
- Configure flags: `isOverlayTimingChartEnabled`, `isOverlayRendererDiagnosticsBarEnabled`.

## Notes

- Fix `update()` and `render()` separately. Slow thinking and slow drawing look identical to the player and have nothing
  in common.
- Reach for these rules when you are actually slow. A game drawing forty things does not need any of this, and writing
  it this way from the start makes the code harder to read for no gain.
- The software fallback renderer (used when the player has no WebGPU) is slower than the GPU one at everything. If the
  game only stutters for some players, check `BT.activeBackend` before blaming your code.
