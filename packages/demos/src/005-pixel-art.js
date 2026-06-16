// Pixel Art Demo - draw tiny pictures from number grids and from math patterns.
//
// Demo 005 in the Blit-Tech demo series for young learners (around 12).
//
// We learned about the demo lifecycle, coordinates, and clearing the screen in the Basics demo:
// https://blit-tech-demos.vancura.dev/001-basics
//
// Prerequisites: 001-Basics, 002-Primitives, 003-Colors
// Live version: https://vancura.dev/articles/blit-tech-pixel-art
//
// This demo shows:
//   - A 2D array (grid) of small numbers that stand for colors, like a paint-by-number on graph paper
//   - Nested loops: an outer loop for each row and an inner loop for each column, like reading a book
//     line by line and word by word
//   - How grid row/column indices turn into x/y positions on the screen
//   - Why we sometimes draw many BT.drawPixel calls in a small block to make one "big" chunky pixel
//   - A pattern drawn only with loops and math (no picture array), with colors that move over time

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */


// Every color used for drawing gets a numbered slot in the palette (like a numbered paint jar).
// Index 0 is always transparent. Custom colors start at 1.
const C_WHITE = 1; // Pure white: font base color
const C_BG = 2; // Deep gray-blue: fills the screen background
const C_LABEL = 3; // Pale blue-white: section headings
const C_DIM = 4; // Dim gray: FPS counter

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
 * @implements {IBlitTechDemo}
 */
class Demo {
    // animTime counts seconds of game time if every update tick is exactly 1/60 of a second.
    // We only change it inside update(), so it stays smooth even when render() runs at odd rates.
    animTime = 0;

    // palette holds all the colors this demo uses.
    palette = null;

    /**
     * Optional engine settings. We keep the default 320x240 screen and ask for 16
     * palette swatches per row so the overlay grid lines up with the 8-cell-wide heart art
     * (two grid columns per art cell gives comfortable visual alignment).
     *
     * @returns {{
     *   isOverlayPaletteEnabled: boolean,
     *   overlayPaletteColumns: number,
     *   overlayStyle: { barPaletteIndex: number, textPaletteIndex: number, gapPaletteIndex: number },
     *   isOverlayTimingChartEnabled: boolean,
     *   overlayTimingChartStyle: {
     *     updateBarPaletteIndex: number, renderBarPaletteIndex: number,
     *     warningPaletteIndex: number, errorPaletteIndex: number, tagPaletteIndex: number
     *   }
     * }}
     */
    configure() {
        return {
            isOverlayPaletteEnabled: true,
            overlayPaletteColumns: 16,
            overlayStyle: {
                barPaletteIndex: 3,
                textPaletteIndex: 2,
                gapPaletteIndex: 2,
            },
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: 2,
                renderBarPaletteIndex: 3,
                warningPaletteIndex: 3,
                errorPaletteIndex: 4,
                tagPaletteIndex: 2,
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
        // Sixteen slots are enough for this demo (we only use indices 1 through 11) and keep
        // the stats palette grid to two short rows when configure() asks for eight per row.
        this.palette = BT.paletteCreate(16);

        this.palette.set(C_WHITE, new Color32(255, 255, 255)); // pure white
        this.palette.set(C_BG, new Color32(28, 32, 48)); // deep gray-blue background
        this.palette.set(C_LABEL, new Color32(200, 210, 230)); // pale blue-white section labels
        this.palette.set(C_DIM, new Color32(150, 150, 150)); // dim gray fps counter

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

        // Overlay colors (must match configure().overlayStyle above).
        // Bar fill uses slot 7 (C_TREE_DARK); text uses C_LABEL. Both are set above.

        // Tell the engine to use this palette for all drawing.
        BT.paletteSet(this.palette);
        return true;
    }

    /**
     * Fixed-step clock. Advances animTime and updates the animated checker colors in the palette.
     * See the Basics article for why update() and render() are separate steps:
     * https://blit-tech-demos.vancura.dev/001-basics
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
     * Draws the whole frame: titles, two number-grid pictures, one math pattern, and FPS text.
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

                // Zero means "no ink here" - skip so the background stays visible.
                if (code === 0) {
                    continue;
                }

                // paletteMap[code] gives us the palette index for this paint code (bounds-checked helper).
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
        BT.systemPrint(new Vector2i(10, 28), C_LABEL, 'Heart 8x8 (number grid)');

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
        BT.systemPrint(new Vector2i(168, 28), C_LABEL, 'Tree 12x16 (number grid)');

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
        BT.systemPrint(new Vector2i(10, 100), C_LABEL, 'Checkerboard (loops + math, no grid array)');

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
                // Checker rule: neighbors differ. (row + col) % 2 is 0 or 1, flipping like a chessboard.
                // Even cells get C_CHECKER_A, odd cells get C_CHECKER_B.
                // The colors were updated by update() this frame, so they're already the right shade.
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
