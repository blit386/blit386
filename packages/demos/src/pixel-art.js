// Pixel Art Demo - draw tiny pictures from number grids and from math patterns.
//
// Demo 005 in the BLIT386 demo series for young learners (around 12).
//
// We learned about the demo lifecycle, coordinates, and clearing the screen in the Basics demo:
// https://demos.blit386.dev/001-basics
//
// Prerequisites: 001-Basics, 002-Primitives, 003-Colors
// Live version: https://demos.blit386.dev/005-pixel-art
//
// This demo shows:
//   - A 2D array (grid) of small numbers that stand for colors, like a paint-by-number on graph paper
//   - Nested loops: an outer loop for each row and an inner loop for each column, like reading a book
//     line by line and word by word
//   - How grid row/column indices turn into x/y positions on the screen
//   - Why we sometimes draw many BT.drawPixel calls in a small block to make one "big" chunky pixel
//   - A pattern drawn only with loops and math (no picture array), with colors that move over time
//
// The section captions above each artwork are drawn with ui.caption() from the shared UI kit
// (src/shared/ui.js), in the same amber header color every other demo in the series uses.
// The artwork itself is the lesson and is still drawn pixel by pixel below.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// Every color used for drawing gets a numbered slot in the palette (like a numbered paint jar).
// Index 0 is always transparent. Custom colors start at 1.
const C_WHITE = 1; // Pure white: font base color
const C_BG = 2; // Deep gray-blue: fills the screen background
const C_TAG = 3; // Pale blue-white: only colors the overlay bar and timing-chart marks (see configure())

// Heart sprite colors (used by HEART_PALETTE_MAP below).
const C_HEART_OUTLINE = 5; // Dark red: the heart's outline pixels
const C_HEART_FILL = 6; // Bright red: the heart's interior pixels

// Tree sprite colors.
const C_TREE_DARK = 7; // Very dark green: outer leaf pixels
const C_TREE_LIGHT = 8; // Lighter green: inner leaf pixels
const C_TRUNK = 9; // Brown: tree trunk pixels

// Checker pattern colors: these are updated every frame in update() so the colors move.
const C_CHECKER_A = 10; // Dynamic: lerp between red and yellow
const C_CHECKER_B = 11; // Dynamic: lerp between blue and cyan

// HEART_GRID is an 8 by 8 table of small integers.
// Think of graph paper: each cell is one tiny part of the picture.
// 0 means "leave empty" (we skip drawing there so the background shows through).
// 1 and 2 pick palette entries from HEART_PALETTE_MAP below (outline and fill).
const HEART_GRID = [
    [0, 1, 1, 0, 0, 1, 1, 0],
    [1, 2, 2, 1, 1, 2, 2, 1],
    [1, 2, 2, 2, 2, 2, 2, 1],
    [0, 1, 2, 2, 2, 2, 1, 0],
    [0, 0, 1, 2, 2, 1, 0, 0],
    [0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
];

// TREE_GRID is a bit taller and wider: 12 columns and 16 rows.
// Same idea: 0 is empty, 1 and 2 are two greens for leaves, 3 is brown for the trunk.
const TREE_GRID = [
    [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
    [0, 0, 0, 1, 1, 2, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 2, 2, 2, 2, 1, 1, 0, 0],
    [0, 0, 1, 2, 2, 2, 2, 2, 2, 1, 0, 0],
    [0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0],
    [0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0],
    [0, 0, 1, 2, 2, 2, 2, 2, 2, 1, 0, 0],
    [0, 0, 0, 1, 1, 2, 2, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 3, 3, 3, 3, 0, 0, 0, 0],
    [0, 0, 0, 0, 3, 3, 3, 3, 0, 0, 0, 0],
    [0, 0, 0, 3, 3, 3, 3, 3, 3, 0, 0, 0],
    [0, 0, 0, 3, 3, 3, 3, 3, 3, 0, 0, 0],
];

// HEART_PALETTE_MAP lines up with the numbers in the grid.
// paletteMap[1] is the palette index for code 1, paletteMap[2] for code 2.
// Index 0 is null because 0 means "no paint" in the grid (we skip those cells).
// These are PALETTE INDEX NUMBERS, not Color32 objects. The palette already knows the actual colors.
const HEART_PALETTE_MAP = [null, C_HEART_OUTLINE, C_HEART_FILL];

const TREE_PALETTE_MAP = [null, C_TREE_DARK, C_TREE_LIGHT, C_TRUNK];

/**
 * Looks up the palette index for a paint code.
 * The grid only uses small integers we authored, not user input.
 * This is the one place that validates grid codes: 0 (empty) and anything
 * outside the map both come back as null, so callers only need one check.
 *
 * @param {(number | null)[]} paletteMap - Array of palette indices (null = transparent).
 * @param {number} code - The paint code from the grid.
 * @returns {number | null} A palette index, or null if the code means "empty."
 */
function indexFromPaletteMap(paletteMap, code) {
    if (code < 1 || code >= paletteMap.length) {
        return null;
    }
    return paletteMap[code];
}

/**
 * Teaches pixel grids, nested loops, screen mapping, and a tiny procedural pattern.
 *
 * @implements {IBTDemo}
 */
class Demo {
    // animTime counts seconds of game time if every update tick is exactly 1/60 of a second.
    // We only change it inside update(), so it stays smooth even when render() runs at odd rates.
    animTime = 0;

    // palette holds all the colors this demo uses.
    /** @type {Palette | null} */
    palette = null;

    // Where the shared UI theme colors landed in the palette, filled by applyTheme() in
    // init(). The UI kit draws the section captions with these slots.
    theme = null;

    /**
     * Optional engine settings. We keep the default 320x240 screen and ask for 16
     * palette swatches per row so the overlay grid lines up with the 8-cell-wide heart art
     * (two grid columns per art cell gives comfortable visual alignment).
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            isOverlayPaletteEnabled: true,

            overlayPaletteColumns: 16,
            overlayTimingChartHeight: 64,

            overlayStyle: {
                barPaletteIndex: C_TAG,
                textPaletteIndex: C_BG,
                gapPaletteIndex: C_BG,
            },

            isOverlayTimingChartEnabled: true,

            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_BG,
                renderBarPaletteIndex: C_TAG,
                warningPaletteIndex: C_TAG,
                errorPaletteIndex: 4, // Slot 4 has no named constant - this demo leaves it unassigned.
                tagPaletteIndex: C_BG,
            },
        };
    }

    /**
     * Sets up the palette.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        // Set up the color palette
        // Think of this as laying out paint on an artist's palette tray before starting a painting.
        // Every color we might use gets a number. We set them all up before drawing begins.
        // Thirty-two slots: the artwork only uses indices 1 through 11, and the shared UI
        // theme takes 12 more (slots 20-31, installed below), so 32 fits everything.
        // configure() sets overlayPaletteColumns: 16 so the overlay swatch grid matches the
        // 8-column-wide heart grid (two art cells per overlay column).
        this.palette = BT.paletteCreate(32);

        this.palette.set(C_WHITE, new Color32(255, 255, 255)); // pure white
        this.palette.set(C_BG, new Color32(28, 32, 48)); // deep gray-blue background
        this.palette.set(C_TAG, new Color32(200, 210, 230)); // pale blue-white overlay bar / chart accent

        // Heart sprite colors.
        this.palette.set(C_HEART_OUTLINE, new Color32(110, 10, 30)); // dark red outline
        this.palette.set(C_HEART_FILL, new Color32(230, 55, 75)); // bright red fill

        // Tree sprite colors.
        this.palette.set(C_TREE_DARK, new Color32(18, 85, 32)); // very dark green outer leaf
        this.palette.set(C_TREE_LIGHT, new Color32(70, 175, 72)); // lighter green inner leaf
        this.palette.set(C_TRUNK, new Color32(105, 62, 28)); // brown tree trunk

        // Pre-fill dynamic checker colors with a starting value.
        // update() will overwrite these on the very first tick.
        this.palette.set(C_CHECKER_A, new Color32(255, 0, 0)); // start as red
        this.palette.set(C_CHECKER_B, new Color32(0, 0, 255)); // start as blue

        // The overlay styles in configure() reuse C_TAG and C_BG, both set above.

        // Install the shared UI theme the kit draws the section captions with.
        // It writes 12 colors starting at the slot we pass - slots 20..31 here, which
        // stay clear of the artwork colors (1-11) and fill the top of our 32-slot
        // palette exactly. Must happen before BT.paletteSet() below.
        this.theme = applyTheme(this.palette, 20);

        // Tell the engine to use this palette for all drawing.
        BT.paletteSet(this.palette);
        return true;
    }

    /**
     * Fixed-step clock. Advances animTime and updates the animated checker colors in the palette.
     * See the Basics article for why update() and render() are separate steps:
     * https://demos.blit386.dev/001-basics
     */
    update() {
        // Add one tick's worth of time. If targetFPS is 60, each tick is about 1/60 second.
        this.animTime += BT.deltaSeconds;

        // Update the checker pattern colors
        // The checker squares use "lerp" (short for linear interpolation - smoothly blending
        // between two colors). wave goes from 0 to 1 and back using Math.sin.
        // At wave=0 colorA is red; at wave=1 it is yellow. At wave=0 colorB is blue; at 1 it is cyan.
        // Both colors shift at the same time but in opposite directions, so they always contrast.
        const wave = (Math.sin(this.animTime * 2) + 1) * 0.5;
        this.palette.set(C_CHECKER_A, Color32.red.lerp(Color32.yellow, wave));
        this.palette.set(C_CHECKER_B, Color32.blue.lerp(Color32.cyan, 1 - wave));
    }

    /**
     * Draws the whole frame: section labels, two number-grid sprites, and the checker pattern.
     * FPS and tick stats live in the engine overlay (toggle with Backquote), not on the canvas.
     */
    render() {
        // Clear to the deep gray-blue background so light pixel art pops.
        BT.clear(C_BG);

        // Left and right art pieces share the same vertical starting line so they look side by side.
        this.renderHeartSection();
        this.renderTreeSection();

        // Checkerboard below, with colors that shift using animTime.
        this.renderCheckerPatternSection();
    }

    /**
     * Turns a 2D number grid into chunky pixels on screen.
     *
     * Nested loops: the outer `for` walks row = 0, 1, 2... (which horizontal strip of the grid).
     * The inner `for` walks col = 0, 1, 2... inside that row (like reading left to right).
     * That is the usual "loop inside a loop" mental model: finish one full row before moving down.
     *
     * BT.drawPixel() paints exactly one screen cell. To make each design cell bigger, we use two
     * more small loops (dx and dy) that stamp a scale-by-scale block of pixels. Another valid way
     * is BT.drawRectFill() with width and height equal to scale - same math, one call per cell.
     *
     * @param {number[][]} grid - Rows of paint codes; grid[row][col] matches graph-paper rows/columns.
     * @param {(number | null)[]} paletteMap - paletteMap[code] is the palette index, or null to skip.
     * @param {number} originX - Left edge where column 0 should appear on screen.
     * @param {number} originY - Top edge where row 0 should appear on screen.
     * @param {number} scale - How many screen pixels wide/tall each grid cell becomes.
     */
    drawGridWithScaledPixels(grid, paletteMap, originX, originY, scale) {
        // Outer loop: which row of the design (top row is row 0).
        for (let row = 0; row < grid.length; row++) {
            // One row of the picture as a normal JavaScript array.
            const rowCodes = grid[row];

            // Inner loop: move across that row from left to right.
            for (let col = 0; col < rowCodes.length; col++) {
                // Read the paint code for this cell, like looking up a coordinate on graph paper.
                const code = rowCodes[col];

                // Ask the helper which palette index this code means. It answers null for
                // code 0 ("no ink here") and for any code outside the map, so this single
                // check is all the guarding we need - skip and the background stays visible.
                const paletteIndex = indexFromPaletteMap(paletteMap, code);
                if (paletteIndex === null) {
                    continue;
                }

                // Map grid (col, row) to the top-left corner of this cell on the virtual screen.
                // Column affects x (sideways), row affects y (down the screen).
                const baseX = originX + col * scale;
                const baseY = originY + row * scale;

                // Tiny inner loops fill a scale-by-scale square with individual drawPixel calls.
                for (let dy = 0; dy < scale; dy++) {
                    for (let dx = 0; dx < scale; dx++) {
                        BT.drawPixel(new Vector2i(baseX + dx, baseY + dy), paletteIndex);
                    }
                }
            }
        }
    }

    /**
     * Labels and draws the 8x8 heart on the left.
     */
    renderHeartSection() {
        // Print the section caption with ui.caption() from the shared UI kit - the same
        // widget every demo in the series uses, so all captions look identical everywhere.
        ui.caption(10, 28, 'Heart 8x8 (number grid)');

        // scale = 4 makes the 8-cell-wide picture use 32 virtual pixels of width.
        const scale = 4;
        const originX = 16;
        const originY = 46;

        this.drawGridWithScaledPixels(HEART_GRID, HEART_PALETTE_MAP, originX, originY, scale);
    }

    /**
     * Labels and draws the 12x16 tree on the right.
     */
    renderTreeSection() {
        ui.caption(168, 28, 'Tree 12x16 (number grid)');

        // Slightly smaller scale so the taller tree still fits comfortably.
        const scale = 3;
        const originX = 188;
        const originY = 46;

        this.drawGridWithScaledPixels(TREE_GRID, TREE_PALETTE_MAP, originX, originY, scale);
    }

    /**
     * Draws a checkerboard using only math inside nested loops - no picture array.
     * Colors slide around based on animTime (updated in update()) so you can see the clock moving.
     */
    renderCheckerPatternSection() {
        ui.caption(10, 100, 'Checkerboard (loops + math, no grid array)');

        // How many squares along each side.
        const cells = 8;
        // Pixel size of one checker square on the virtual 320x240 surface.
        const cellSize = 10;
        // Top-left corner of the whole checker region.
        const startX = 12;
        const startY = 118;

        // Outer loop picks the row of squares; inner loop picks the column - same nested idea as the art.
        for (let row = 0; row < cells; row++) {
            for (let col = 0; col < cells; col++) {
                // Checker rule: neighbors must look different, like a chessboard.
                // % is "remainder after division": (row + col) % 2 is 0 for even sums, 1 for odd sums.
                // Adding row and col flips the remainder on every step to the right or down, so no two
                // touching squares share the same color. update() already refreshed C_CHECKER_A/B.
                const fill = (row + col) % 2 === 0 ? C_CHECKER_A : C_CHECKER_B;

                // Rect2i(x, y, width, height) describes a solid rectangle in pixel space.
                const x = startX + col * cellSize;
                const y = startY + row * cellSize;
                BT.drawRectFill(new Rect2i(x, y, cellSize, cellSize), fill);
            }
        }
    }
}

bootstrap(Demo);
