/*

Pattern Fill: cover the whole screen with one small repeating picture.
@description Tile one small PNG across the screen edge to edge, cropping the last row of tiles to fit.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Sprites: https://demos.blit386.dev/sprites

Live version: https://demos.blit386.dev/pattern-fill

Guides:
  - Palette: https://blit386.dev/docs/guides/palette#index-sprites-preferred-and-manual-flows

Reference:
  - Assets: https://blit386.dev/docs/api/assets#loading-assets
  - Rendering: https://blit386.dev/docs/api/rendering#drawing

---

WHAT YOU WILL SEE
-----------------

A 960x600 screen covered edge to edge by one 16x16 picture, repeated like bathroom tiles.
Nothing moves and there is no panel. The engine overlay is switched off, so the pattern is
the whole demo.

960 divides by 16 exactly (60 tiles across), but 600 does not (37.5 tiles down). So the
bottom row of tiles is only half a tile tall: the demo copies just the top 8 pixels of the
picture there. The picture is never squashed or stretched, so every pixel stays crisp and
lines up with the screen's pixel grid.

WHAT YOU WILL LEARN
-------------------

- SpriteSheet.loadIndexed(url, palette, startSlot, options) loads a PNG, writes its colors
  into the palette from startSlot upward, and turns every pixel into a palette slot
  number.
- BT.drawSprite(sheet, srcRect, pos) copies one rectangle of the sheet to the screen. A
  smaller srcRect copies only part of the picture, which is how the bottom row of tiles is
  cropped.
- Math.min() picks the smaller of two numbers, which is all it takes to cut a tile short
  at the screen edge.
- Building the full list of tile positions once in init() so render() allocates nothing.

*/

import { bootstrap, BT, Rect2i, SpriteSheet, Vector2i } from 'blit386';

/** @typedef {import('blit386').Palette} Palette */

const DISPLAY_W = 960;
const DISPLAY_H = 600;

// The PNG file and the size of one tile in it. The file is a single 16x16 picture.
const PATTERN_URL = '/sprites/pattern-16-2.png';
const TILE_SIZE = 16;

class Demo {
    /** @type {Palette | null} */
    palette = null;

    /** @type {SpriteSheet | null} */
    sheet = null;

    // One entry per tile on screen: where to draw it, and which piece of the picture to
    // copy. Built once in init() so drawing a frame allocates nothing.
    /** @type {Array<{ pos: Vector2i, src: Rect2i }>} */
    tiles = [];

    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            isOverlayEnabled: false,
        };
    }

    // Loads the picture, then works out the full list of tiles that cover the screen.
    async init() {
        this.palette = BT.paletteCreate(256);

        try {
            // loadIndexed() reads the PNG, puts its colors into the palette from slot 1
            // upward (slot 0 is reserved for "see-through"), and converts every pixel
            // into a palette slot number. 'none' keeps the colors in file order.
            const art = await SpriteSheet.loadIndexed(PATTERN_URL, this.palette, 1, { sort: 'none' });
            this.sheet = art.sheet;
        } catch (error) {
            console.error('[PatternFillDemo] Failed to load the pattern:', error);
            return false;
        }

        BT.paletteSet(this.palette);

        // Walk the screen in 16-pixel steps, row by row. Math.min() cuts a tile short
        // when fewer than 16 pixels are left before the screen edge. With a 960x600
        // screen that only happens in the last row, which is 8 pixels tall.
        for (let y = 0; y < DISPLAY_H; y += TILE_SIZE) {
            for (let x = 0; x < DISPLAY_W; x += TILE_SIZE) {
                const w = Math.min(TILE_SIZE, DISPLAY_W - x);
                const h = Math.min(TILE_SIZE, DISPLAY_H - y);

                this.tiles.push({ pos: new Vector2i(x, y), src: new Rect2i(0, 0, w, h) });
            }
        }

        return true;
    }

    update() {
        // Nothing moves: the pattern is the whole demo.
    }

    render() {
        // No clear needed: the tiles cover every pixel of the screen.
        for (const tile of this.tiles) {
            BT.drawSprite(this.sheet, tile.src, tile.pos);
        }
    }
}

bootstrap(Demo);
