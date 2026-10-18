/*

Pixel Art: tiny pictures from number grids and from math patterns.
@description Draw tiny pictures from number grids and from math patterns, one pixel at a time, the way old games did.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives
  - Colors: https://demos.blit386.dev/colors

Live version: https://demos.blit386.dev/pixel-art

Guides:
  - Palette: https://blit386.dev/docs/guides/palette#draw-using-absolute-palette-indices
  - Overlay: https://blit386.dev/docs/guides/overlay#colors-and-hud-palette-slots

Reference:
  - Rendering: https://blit386.dev/docs/api/rendering#primitives
  - Core Types: https://blit386.dev/docs/api/core-types#color32

---

WHAT YOU WILL SEE
-----------------

A deep gray-blue screen with two small pieces of artwork on the left, each under an amber
caption drawn by the shared UI kit:

- "Heart 8x8": a heart built from an 8 by 8 grid of numbers, drawn at 4 screen pixels per
  grid cell, so it is 32 pixels wide. Its body is dark red with two bright red highlight
  pixels in the second row.
- "Checkerboard": an 8 by 8 board of 10-pixel squares. The two square colors slide back
  and forth - one between red and yellow, the other between cyan and blue - so the board
  never stops changing.

The engine overlay is open from the start with its palette grid at 16 swatches per row, so
the demo's 32-slot palette shows as two rows and you can watch slots 10 and 11 change.

WHAT YOU WILL LEARN
-------------------

- A 2D array (a grid) of small numbers that stand for colors, like paint-by-number on
  graph paper.
- Nested loops: an outer loop for each row and an inner loop for each column, like
  reading a book line by line and word by word.
- How a grid's row and column turn into x and y positions on the screen.
- Why many BT.drawPixel() calls in a small block make one "big" chunky pixel.
- A pattern drawn only with loops and math (no picture array), with colors that move over
  time thanks to Color32.lerp() and palette.set() in update().
- A small palette (32 slots) with the shared UI theme moved to slots 20-31 by passing a
  start slot to applyTheme().

TRY THIS
--------

- Watch slots 10 and 11 in the overlay's palette grid: they are the checkerboard colors
  and they move with the squares below.
- Press the backquote key (`) to hide the overlay and see the artwork alone.

*/

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// Every color used for drawing gets a numbered slot in the palette, like a numbered paint
// jar. Slot 0 is always transparent, so our own colors start at 1.
const C_WHITE = 1; // pure white, kept in the palette but not drawn with
const C_BG = 2; // deep gray-blue: fills the screen background
const C_TAG = 3; // pale blue-white: overlay bar and timing-chart accents

// Heart colors, picked by the codes in HEART_PALETTE_MAP below.
const C_HEART_OUTLINE = 5; // dark red: the heart's body (grid code 1)
const C_HEART_FILL = 6; // bright red: the two highlight pixels (grid code 2)

// Checker colors. update() repaints these every tick so the board keeps moving.
const C_CHECKER_A = 10; // dynamic: slides between red and yellow
const C_CHECKER_B = 11; // dynamic: slides between cyan and blue

// HEART_GRID is an 8 by 8 table of small whole numbers. Think of graph paper: each cell
// is one tiny part of the picture. 0 means "leave empty" (we skip drawing there so the
// background shows through); 1 and 2 pick palette slots from HEART_PALETTE_MAP below.
const HEART_GRID = [
    [0, 1, 1, 0, 0, 1, 1, 0],
    [1, 2, 1, 1, 1, 2, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 0, 0, 0],
];

// HEART_PALETTE_MAP lines up with the numbers in the grid: paletteMap[1] is the palette
// slot for code 1, paletteMap[2] for code 2. Index 0 is null because 0 means "no paint".
// These are palette slot numbers, not Color32 objects; the palette knows the real colors.
const HEART_PALETTE_MAP = [null, C_HEART_OUTLINE, C_HEART_FILL];

// Looks up the palette slot for a paint code. The grid only holds small numbers we wrote
// ourselves, not user input, but this is still the one place that checks them: 0 (empty)
// and anything outside the map both come back as null, so callers need just one check.
function indexFromPaletteMap(paletteMap, code) {
    if (code < 1 || code >= paletteMap.length) {
        return null;
    }

    return paletteMap[code];
}

// Teaches pixel grids, nested loops, mapping grid cells to the screen, and a tiny
// procedural pattern.
class Demo {
    // A clock that counts up in seconds. It only changes inside update(), so the
    // animation stays steady even when render() runs at an odd rate.
    animTime = 0;

    // The palette holds every color this demo uses.
    /** @type {Palette | null} */
    palette = null;

    // Where the shared UI theme colors landed in the palette, filled by applyTheme() in
    // init(). The UI kit draws the section captions with these slots.
    theme = null;

    // Optional engine settings. We keep the default 320x240 screen, open the overlay from
    // the start, and show its palette grid at 16 swatches per row so our 32-slot palette
    // appears as two neat rows.
    configure() {
        return {
            isOverlayPaletteEnabled: true,
            overlayPaletteColumns: 16,
            isOverlayVisibleAtStart: true,

            // Overlay bar: pale blue-white with dark text.
            overlayStyle: {
                barPaletteIndex: C_TAG,
                textPaletteIndex: C_BG,
                gapPaletteIndex: C_BG,
            },

            // Timing chart colors. The chart itself is not enabled in this demo, so these
            // only matter if you add isOverlayTimingChartEnabled: true above.
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_BG,
                renderBarPaletteIndex: C_TAG,
                warningPaletteIndex: C_TAG,
                errorPaletteIndex: 4, // slot 4 has no named constant and is never set
                tagPaletteIndex: C_BG,
            },
        };
    }

    // Sets up the palette. Returns true when ready.
    async init() {
        // Lay out the colors first, like putting paint on an artist's tray before
        // starting a painting. Every color gets a number, all chosen before drawing
        // begins. 32 slots are enough: the artwork uses 1 through 11 and the shared UI
        // theme takes 12 more (slots 20-31, installed below).
        this.palette = BT.paletteCreate(32);

        this.palette.set(C_WHITE, new Color32(255, 255, 255)); // pure white
        this.palette.set(C_BG, new Color32(28, 32, 48)); // deep gray-blue background
        this.palette.set(C_TAG, new Color32(200, 210, 230)); // pale blue-white

        // Heart colors.
        this.palette.set(C_HEART_OUTLINE, new Color32(110, 10, 30)); // dark red body
        this.palette.set(C_HEART_FILL, new Color32(230, 55, 75)); // bright red highlights

        // Starting values for the checker colors. update() overwrites them on the very
        // first tick.
        this.palette.set(C_CHECKER_A, new Color32(255, 0, 0)); // starts red
        this.palette.set(C_CHECKER_B, new Color32(0, 0, 255)); // starts blue

        // Install the shared UI theme the captions draw with. It writes 12 colors
        // starting at the slot we pass - 20 through 31 here, which stays clear of the
        // artwork colors (1-11) and fills the top of our 32-slot palette exactly. Must
        // happen before BT.paletteSet().
        this.theme = applyTheme(this.palette, 20);

        // Tell the engine to use this palette for all drawing.
        BT.paletteSet(this.palette);

        return true;
    }

    // Runs at a fixed rate (60 times per second by default). Advances animTime and
    // repaints the checker colors in the palette. See the Basics demo for why update()
    // and render() are separate steps: https://demos.blit386.dev/basics
    update() {
        // Add one tick's worth of time. At the default 60 ticks per second that is about
        // 1/60 of a second.
        this.animTime += BT.deltaSeconds;

        // The checker squares use "lerp" (linear interpolation: a smooth blend between
        // two colors). wave swings from 0 to 1 and back using Math.sin(): sin returns
        // -1..1, so adding 1 and halving moves it to 0..1. At wave 0, color A is red and
        // color B is cyan; at wave 1, A is yellow and B is blue. B uses 1 - wave, so the
        // two colors slide in opposite directions and always contrast.
        const wave = (Math.sin(this.animTime * 2) + 1) * 0.5;

        this.palette.set(C_CHECKER_A, Color32.red.lerp(Color32.yellow, wave));
        this.palette.set(C_CHECKER_B, Color32.blue.lerp(Color32.cyan, 1 - wave));
    }

    // Draws the whole frame: the captions, the number-grid heart, and the checkerboard.
    // FPS and tick stats live in the engine overlay, not on the canvas.
    render() {
        // Clear to the deep gray-blue background so the artwork pops.
        BT.clear(C_BG);

        // Heart on top.
        this.renderHeartSection();

        // Checkerboard below, with colors that shift with animTime.
        this.renderCheckerPatternSection();
    }

    // Turns a 2D number grid into chunky pixels on screen. `grid` holds rows of paint
    // codes (grid[row][col], like graph paper), `paletteMap` says which palette slot each
    // code means (null to skip), `originX` and `originY` are where column 0 and row 0
    // land on screen, and `scale` is how many screen pixels wide and tall each grid cell
    // becomes.
    //
    // Nested loops: the outer `for` walks row = 0, 1, 2... (which strip of the grid), the
    // inner `for` walks col = 0, 1, 2... inside that row (left to right). Finish one
    // whole row before moving down, like reading a page.
    //
    // BT.drawPixel() paints exactly one screen pixel. To make each grid cell bigger we
    // use two more small loops (dx and dy) that stamp a scale-by-scale block of pixels.
    // Another valid way is BT.drawRectFill() with width and height equal to scale: same
    // math, one call per cell.
    drawGridWithScaledPixels(grid, paletteMap, originX, originY, scale) {
        // Outer loop: which row of the design (the top row is row 0).
        for (let row = 0; row < grid.length; row++) {
            // One row of the picture as a normal JavaScript array.
            const rowCodes = grid[row];

            // Inner loop: move across that row from left to right.
            for (let col = 0; col < rowCodes.length; col++) {
                // Read this cell's paint code, like finding a square on graph paper.
                const code = rowCodes[col];

                // Ask the helper which palette slot this code means. It answers
                // null for code 0 ("no ink here") and for any code outside the
                // map, so this one check is all the guarding we need: skip, and
                // the background stays visible.
                const paletteIndex = indexFromPaletteMap(paletteMap, code);

                if (paletteIndex === null) {
                    continue;
                }

                // Map grid (col, row) to the top-left corner of this cell on screen. The
                // column moves x (sideways), the row moves y (down the screen).
                const baseX = originX + col * scale;
                const baseY = originY + row * scale;

                // Two tiny loops fill a scale-by-scale square, one drawPixel at a time.
                for (let dy = 0; dy < scale; dy++) {
                    for (let dx = 0; dx < scale; dx++) {
                        BT.drawPixel(new Vector2i(baseX + dx, baseY + dy), paletteIndex);
                    }
                }
            }
        }
    }

    // Captions and draws the 8x8 heart.
    renderHeartSection() {
        // The caption comes from ui.caption() in the shared UI kit, the same widget every
        // demo in the series uses, so all captions look identical everywhere.
        ui.caption(12, 52, 'Heart 8x8 (number grid, no external bitmap used)');

        // scale 4 makes the 8-cell-wide picture 32 screen pixels wide.
        const scale = 4;
        const originX = 12;
        const originY = 62;

        this.drawGridWithScaledPixels(HEART_GRID, HEART_PALETTE_MAP, originX, originY, scale);
    }

    // Draws a checkerboard using only math inside nested loops - no picture array. The
    // colors slide around with animTime (advanced in update()) so you can see the clock
    // moving.
    renderCheckerPatternSection() {
        ui.caption(12, 102, 'Checkerboard (loops + math, no grid array)');

        // How many squares along each side.
        const cells = 8;

        // Pixel size of one square on the 320x240 screen.
        const cellSize = 10;

        // Top-left corner of the whole board.
        const startX = 12;
        const startY = 112;

        // Outer loop picks the row of squares, inner loop the column: the same nested
        // idea as the heart.
        for (let row = 0; row < cells; row++) {
            for (let col = 0; col < cells; col++) {
                // Checker rule: neighbors must look different, like a chessboard.
                // % is "remainder after division": (row + col) % 2 is 0 for even
                // sums and 1 for odd sums. Each step right or down changes
                // row + col by one, which flips the remainder, so no two touching
                // squares share a color. update() already refreshed C_CHECKER_A
                // and C_CHECKER_B this tick.
                const fill = (row + col) % 2 === 0 ? C_CHECKER_A : C_CHECKER_B;

                // Rect2i(x, y, width, height) describes a solid rectangle in pixels.
                const x = startX + col * cellSize;
                const y = startY + row * cellSize;

                BT.drawRectFill(new Rect2i(x, y, cellSize, cellSize), fill);
            }
        }
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
