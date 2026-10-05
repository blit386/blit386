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
cells by number - 0 is the top-left cell, counting across each row, then down. This is the same load as above with a
`tileSize` added, so replace that load instead of loading the sheet twice:

```js
// In init():
const { sheet } = await SpriteSheet.loadIndexed('/sprites/hero.png', this.palette, 1, { tileSize: 16 });
this.hero = sheet;

// In render():
BT.drawTile(this.hero, this.frameIndex, new Vector2i(120, 90));
```

Cells that are not square take a `Vector2i`: `{ tileSize: new Vector2i(16, 24) }`. You can also say column and row:
`BT.drawTile(this.hero, 2, 1, new Vector2i(120, 90))`.

## Key calls

- `SpriteSheet.loadIndexed(url, palette, startSlot, options?)` (static, async) - returns `{ sheet, srcRect, colors }`.
  Pass `{ tileSize }` in `options` to give the sheet a grid of equal cells.
- `BT.drawSprite(sheet, srcRect, destPos, paletteOffset?)` (method) - draw a region. `paletteOffset` shifts every
  pixel's slot, so you can recolor the same sprite (team colors, day/night).
- `BT.drawSprite(sheet, srcRect, destPosOrRect, { flags, pivot, scale, paletteOffset })` (method) - same, flipped or
  turned by `flags`, placed by a `pivot` point, enlarged by whole-number `scale`, or stretched into a `Rect2i` (engine
  1.8.0+).
- `BT.drawTile(sheet, index, destPos, paletteOffset?)` / `BT.drawTile(sheet, col, row, destPos, paletteOffset?)`
  (method) - draw one grid cell, no `Rect2i` needed (engine 1.8.0+).
- `NineSlice.fromSheet(sheet, outer, inner, { edges, center })` (static) and
  `BT.drawNineSlice(nineSlice, destRect, paletteOffset?)` (method) - draw one piece of panel art into a box of any size
  (engine 1.8.0+).
- `sheet.fullRect()` (method) - the whole-sheet `Rect2i`.
- `sheet.tileRect(index)` / `sheet.tileRect(col, row)` (method) - one grid cell as a new `Rect2i`. It makes a new object
  each call, so build frame lists with it in `init()`; in `render()`, call `BT.drawTile` instead.

## Notes

- Slot 0 is transparent, so sprite colors start at slot 1. `loadIndexed` handles that.
- Sprites draw at whole-number positions only.
- To face the other way, flip at draw time instead of adding a mirrored frame to the PNG (engine 1.8.0+). Pass a params
  object as the 4th argument. Make it once in `init()` with every field present, then change `flags` per draw:

  ```js
  // init()
  this.drawParams = { flags: 0, pivot: undefined, scale: 1, paletteOffset: 0 };

  // render()
  this.drawParams.flags = this.isFacingLeft ? BT.FLIP_H : 0;
  BT.drawSprite(this.hero, this.heroRect, new Vector2i(120, 90), this.drawParams);
  ```

  In TypeScript, annotate the field as `SpriteDrawParams` (a type exported by `blit386`) so `scale` can later hold a
  `Vector2i`:

  ```ts
  drawParams: SpriteDrawParams = { flags: 0, pivot: undefined, scale: 1, paletteOffset: 0 };
  ```

  `flags` takes `BT.FLIP_H`, `BT.FLIP_V`, `BT.ROT_90_CW`, `BT.ROT_180_CW`, `BT.ROT_270_CW`, combined with `|`. A 90 or
  270 degree turn swaps width and height; `destPos` stays the top-left corner. To flip a grid tile, pass
  `sheet.tileRect(...)` (built in `init()`) to `BT.drawSprite` - `BT.drawTile` takes no params.

- To draw a sprite bigger, scale it at draw time instead of drawing a bigger PNG (engine 1.8.0+). Add `scale` to the
  same params object - give it every field up front, `{ flags: 0, pivot: undefined, scale: 1, paletteOffset: 0 }`, and
  change fields between draws:

  ```js
  this.drawParams.scale = 2; // whole numbers only: 2, 3, ... or new Vector2i(3, 1)
  BT.drawSprite(this.hero, this.heroRect, pos, this.drawParams);
  ```

  For a size that is not a whole multiple (a UI bar, a panel), pass a `Rect2i` as the destination instead. Set `scale`
  back to 1 first - a `Rect2i` already fixes the size, so any other scale is an error:

  ```js
  this.drawParams.scale = 1;
  BT.drawSprite(this.hero, this.heroRect, new Rect2i(x, y, w, h), this.drawParams);
  ```

  A `Rect2i` destination always needs the params object - `{}` is enough.

- To place a sprite by its feet or center instead of its top-left, set `pivot` (engine 1.8.0+). It is a point in the
  source frame's own pixels; the engine flips, turns, and scales it with the sprite and puts it on `destPos`, so a
  character stays planted when it flips or grows:

  ```js
  this.drawParams.pivot = new Vector2i(8, 16); // bottom center of a 16x16 frame - make it once in init()
  BT.drawSprite(this.hero, this.heroRect, this.feetPos, this.drawParams);
  ```

  `new Vector2i(0, 0)` is not the same as no pivot: it is the frame's top-left corner, which moves to the right edge
  under `BT.FLIP_H`. Set `this.drawParams.pivot = undefined` to go back to top-left placement - a `Rect2i` destination
  takes no pivot, so reset it before stretching.

- For UI panels, buttons, and dialog boxes, use a nine-slice instead of stretching the whole panel (engine 1.8.0+).
  Corners stay sharp; edges and center stretch or tile. Build it once in `init()`, both rects in sheet pixels - `inner`
  is the center:

  ```js
  // init()
  this.panel = NineSlice.fromSheet(this.ui, new Rect2i(0, 0, 16, 16), new Rect2i(4, 4, 8, 8), { edges: 'tile' });

  // render()
  BT.drawNineSlice(this.panel, new Rect2i(20, 20, 120, 64));
  ```

  `'stretch'` (the default) suits flat colors; `'tile'` keeps patterned borders crisp. A box smaller than the corners
  crops them, so a panel can grow from size 0.

- Editing a PNG under `public/` while `npm run dev` is running hot-replaces the sheet in place (blit386 1.4.0+ with the
  Vite plugin). If the image size changed, recompute any `srcRect` you cached. For a loading UI, see the
  show-a-loading-screen skill (`BT.loadingAssetsCount`, `sheet.status`, `sheet.progress`).

See `docs/drawing.md`.
