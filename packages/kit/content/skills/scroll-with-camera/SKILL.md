---
name: scroll-with-camera
description:
  Scroll a world larger than the screen using the global camera offset and keep it clamped inside the world bounds. Use
  for side-scrollers, top-down maps, or any level bigger than the screen that should follow the player.
---

# Scroll with a camera

Move a single global offset so a world larger than the screen scrolls, then keep it inside the world's edges.

## When to use

Use for side-scrollers, top-down maps, or any level bigger than the 320x240 screen that should follow the player.

## How to do it

```js
update() {
    // Center the camera on the player, then clamp so it never shows past the world edge.
    const worldSize = new Vector2i(1280, 960);
    const half = new Vector2i(BT.displaySize.x / 2, BT.displaySize.y / 2);
    const wanted = new Vector2i(this.player.x - half.x, this.player.y - half.y);

    BT.cameraSet(BT.cameraClamp(wanted, worldSize)); // clamp to world, then set
}

render() {
    BT.clear(2);
    // Draw in WORLD coordinates - the camera offset is applied for you.
    BT.drawRectFill(new Rect2i(this.player.x, this.player.y, 16, 16), 1);
}
```

## Key calls

- `BT.cameraSet(offset)` (method) – set the global scroll offset (`Vector2i`).
- `BT.camera` (getter) – the current offset.
- `BT.cameraReset()` (method) – back to `(0, 0)`.
- `BT.cameraClamp(camera, worldSize, viewSize?)` (method) – return an offset kept inside the world bounds.

## Notes

- Draw everything in world coordinates; the camera shifts the whole frame.
- For a fixed HUD or mini-map, call `BT.cameraReset()` (or draw before setting the camera) so it does not scroll.
- Offsets are whole numbers.

See `docs/input.md` for moving the player.
