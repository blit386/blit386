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

Draw one frame of a sheet laid out as a grid of equal cells. Give the sheet its tile size when you load it, then draw
cells by number - 0 is the top-left cell, counting across each row, then down:

```js
// In init():
const { sheet } = await SpriteSheet.loadIndexed('/sprites/hero.png', palette, 1, { tileSize: 16 });
this.hero = sheet;

// In render():
BT.drawTile(this.hero, this.frameIndex, new Vector2i(120, 90));
```

Cells that are not square take a `Vector2i`: `{ tileSize: new Vector2i(16, 24) }`. You can also say column and row:
`BT.drawTile(this.hero, 2, 1, new Vector2i(120, 90))`.

## Key calls

- `SpriteSheet.loadIndexed(url, palette, startSlot, options?)` (static, async) - returns `{ sheet, srcRect, colors }`.
- `BT.drawSprite(sheet, srcRect, destPos, paletteOffset?)` (method) - draw a region. `paletteOffset` shifts every
  pixel's slot, so you can recolor the same sprite (team colors, day/night).
- `sheet.fullRect()` (method) - the whole-sheet `Rect2i`.
- `sheet.tileRect(index)` / `sheet.tileRect(col, row)` (method) - one grid cell as a new `Rect2i`. It makes a new object
  each call, so build frame lists with it in `init()`; in `render()`, call `BT.drawTile` instead.

## Notes

- Slot 0 is transparent, so sprite colors start at slot 1. `loadIndexed` handles that.
- Sprites draw at whole-number positions only.
- There is no built-in flip or rotate at draw time yet - the `FLIP_*` / `ROT_*` constants are not accepted by
  `drawSprite` today. To face the other way, author a flipped frame in the PNG.
- Editing a PNG under `public/` while `npm run dev` is running hot-replaces the sheet in place (blit386 1.4.0+ with the
  Vite plugin). If the image size changed, recompute any `srcRect` you cached. For a loading UI, see the
  show-a-loading-screen skill (`BT.loadingAssetsCount`, `sheet.status`, `sheet.progress`).

See `docs/drawing.md`.
