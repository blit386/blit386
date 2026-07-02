---
name: add-sprite
description:
  Load a PNG sprite sheet into the palette and draw it, whole image or single frames. Use whenever the user wants an
  image, character, tile, or animated sprite on screen instead of plain shapes.
---

# Add a sprite

Load a PNG sprite sheet, put its colors into the palette, and draw pieces of it.

## When to use

Use when the user wants an image, character, or tile on screen instead of plain shapes.

## How to do it

Load in `init()` (it is async, so `await` it). `loadIndexed` does the whole setup in one call:

```js
async init() {
    this.palette = BT.paletteCreate(64);

    // Loads the PNG, registers its colors into the palette starting at slot 1,
    // and links the sheet to those slots. Returns the sheet plus a full-frame srcRect.
    const result = await SpriteSheet.loadIndexed('/sprites/hero.png', this.palette, 1);
    this.hero = result.sheet;
    this.heroRect = result.srcRect; // the whole image

    BT.paletteSet(this.palette);
    return true;
}

render() {
    BT.clear(0);
    // sheet, source rectangle (which part of the sheet), destination top-left
    BT.drawSprite(this.hero, this.heroRect, new Vector2i(120, 90));
}
```

Draw one frame from a sheet by passing a smaller source rectangle:

```js
const frame = new Rect2i(this.frameIndex * 16, 0, 16, 16); // 16x16 frames in a row
BT.drawSprite(this.hero, frame, new Vector2i(120, 90));
```

## Key calls

- `SpriteSheet.loadIndexed(url, palette, startSlot, options?)` (static, async) – returns `{ sheet, srcRect, colors }`.
- `BT.drawSprite(sheet, srcRect, destPos, paletteOffset?)` (method) – draw a region. `paletteOffset` shifts every
  pixel's slot, so you can recolor the same sprite (team colors, day/night).
- `sheet.fullRect()` (method) – the whole-sheet `Rect2i`.

## Notes

- Slot 0 is transparent, so sprite colors start at slot 1. `loadIndexed` handles that.
- Sprites draw at whole-number positions only.
- There is no built-in flip or rotate at draw time yet – the `FLIP_*` / `ROT_*` constants are not accepted by
  `drawSprite` today. To face the other way, author a flipped frame in the PNG.

See `docs/drawing.md`.
