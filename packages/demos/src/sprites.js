// Demo 008 - Sprites: how to draw images (sprites) on screen using BLIT386.
//
// Prerequisites: 001-Basics (https://demos.blit386.dev/001-basics),
// 002-Primitives (https://demos.blit386.dev/002-primitives),
// 003-Colors (https://demos.blit386.dev/003-colors).
// Live article: https://vancura.dev/articles/blit386-sprites
//
// A "sprite" is a 2D image used in a game - like a character, a coin, or an enemy.
// In BLIT386, sprites are stored in a "sprite sheet": one big image that
// contains many small sprites arranged in a grid. You draw individual sprites by
// telling the engine which rectangular region (a Rect2i "source rect") to copy.
//
// This demo builds a six-shape sheet on an offscreen canvas, then shows:
//   1. BT.drawSprite() with different source regions (one shape per cell).
//   2. Palette offsets - shifting every pixel index to a different color block.
//   3. Opacity pulsing - rewriting palette alpha slots in update().
//
// Captions and the code panel are drawn with the shared UI kit (src/shared/ui.js), which
// installs its own twelve UI colors high in the palette (slots 240-251) via applyTheme().
//
// In a real project you would load PNGs from disk instead:
//   await SpriteSheet.load('/sprites/hero.png')
//   await SpriteSheet.loadIndexed('/sprites/hero.png', palette, startSlot)
//
// HOW PALETTE OFFSETS WORK FOR SPRITES:
//
// After calling sheet.indexize(palette), each pixel in the sprite is stored
// as a palette index number. When you draw the sprite:
//
//   BT.drawSprite(sheet, src, pos, 0)           - uses original colors
//   BT.drawSprite(sheet, src, pos, colorCount)  - shifts ALL pixel indices up by colorCount
//
// If the original colors are at palette[10..14], offset=5 shifts every pixel
// to use palette[15..19] - a completely different color theme!
// This is how retro games did "team colors" and environmental lighting.
//
// Demo 015 explores the palette system in depth:
// https://demos.blit386.dev/015-palette-presets

import { bootstrap, BT, Color32, Rect2i, SpriteSheet, Vector2i } from 'blit386';

import { canvasToImage, registerCanvasColors } from './shared/canvas-sprites.js';
import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').SpriteSheet} SpriteSheet */
/** @typedef {import('blit386').Rect2i} Rect2i */

// Where in the palette the sprite's original colors start. The sprite uses two colors
// (fill + stroke), and the recolored theme blocks below stack up to about slot 19, so
// everything above that stays free for the shared UI theme (slots 240-251).
const COLOR_BASE = 10;

// Each shape cell in the programmatic sheet is 20x20 pixels.
const SHAPE_CELL = 20;
const SHAPE_COLS = 3;
const SHAPE_ROWS = 2;

// One name per shape cell, in the same order drawShapeInCell() paints them.
// This single list drives both the sheet builder (how many cells to draw) and the
// captions under each shape in render(). The captions sit 50 pixels apart, so the
// longer names are shortened ('Tri', 'Gem') to keep each label inside its column.
const SHAPE_NAMES = ['Square', 'Circle', 'Tri', 'Star', 'Heart', 'Gem'];

// Palette slots of the shared UI theme. applyTheme() in init() writes the twelve UI kit
// colors into slots 240-251 (its default start slot). configure() runs BEFORE init(), so
// the overlay styles below cannot read this.theme yet - these constants spell out where
// each theme color will land once init() runs.
const UI_BG = 240; // 'ui_bg' - deep navy screen background
const UI_TEXT = 244; // 'ui_text' - off-white primary text
const UI_DIM = 245; // 'ui_text_dim' - secondary gray text
const UI_INFO = 249; // 'ui_info' - code blue

// The exact two colors drawShapeInCell() paints with (see fill/stroke below).
// The canvas smooths shape edges automatically (anti-aliasing), which blends these two
// colors - and the transparent background - together one pixel at a time. Read back from
// the canvas, that blending produces dozens of barely-different colors along every curve,
// which would each want their own palette slot. Since our palette can only hold 256 colors
// total, and this demo needs room for several recolored copies of the same shape, we snap
// every blended edge pixel back to whichever of these two colors it is closer to. This
// keeps the palette usage small and predictable no matter how smooth the edges look.
// drawShapeInCell() reads these same two Color32 values (via toHex()) for its canvas
// fillStyle/strokeStyle, so the paint colors and the quantization targets can never drift apart.
const FILL_COLOR = new Color32(0x55, 0x99, 0xee);
const STROKE_COLOR = new Color32(0xff, 0xff, 0xff);

/**
 * Finds whichever of FILL_COLOR/STROKE_COLOR is closer to a given pixel color.
 * "Closer" here means smaller distance in RGB space - treating red, green, and blue like
 * three coordinates and measuring the straight-line distance between two colors, the same
 * way you would measure distance between two points on a map.
 *
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {Color32}
 */
function nearestShapeColor(r, g, b) {
    const distanceToFill = (r - FILL_COLOR.r) ** 2 + (g - FILL_COLOR.g) ** 2 + (b - FILL_COLOR.b) ** 2;
    const distanceToStroke = (r - STROKE_COLOR.r) ** 2 + (g - STROKE_COLOR.g) ** 2 + (b - STROKE_COLOR.b) ** 2;

    return distanceToFill <= distanceToStroke ? FILL_COLOR : STROKE_COLOR;
}

// Below this alpha, an anti-aliased edge pixel is mostly background - treat it as fully
// transparent instead of a faint smudge of shape color.
const ALPHA_OPAQUE_THRESHOLD = 128;

/**
 * Rewrites every pixel of the canvas so it is either fully transparent or one of the exact
 * design colors (see FILL_COLOR/STROKE_COLOR above). sheet.indexize() later requires each
 * pixel to match a palette entry exactly, so the smooth, blended edges anti-aliasing draws
 * must be snapped to flat colors here - otherwise indexize() would reject every blended
 * edge pixel as "not in the palette".
 *
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function quantizeCanvasToShapeColors(ctx, w, h) {
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < ALPHA_OPAQUE_THRESHOLD) {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
            data[i + 3] = 0;
            continue;
        }

        const { r, g, b } = nearestShapeColor(data[i], data[i + 1], data[i + 2]);
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
}

/**
 * Draws one filled shape centered inside a square cell.
 *
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {number} cellX - Left edge of the cell in sheet pixels.
 * @param {number} cellY - Top edge of the cell in sheet pixels.
 * @param {number} kind - 0 square, 1 circle, 2 triangle, 3 star, 4 heart, 5 diamond.
 */
function drawShapeInCell(ctx, cellX, cellY, kind) {
    const cx = cellX + SHAPE_CELL / 2;
    const cy = cellY + SHAPE_CELL / 2;

    ctx.fillStyle = FILL_COLOR.toHex();
    ctx.strokeStyle = STROKE_COLOR.toHex();
    ctx.lineWidth = 1;

    if (kind === 0) {
        // Square
        ctx.fillRect(cellX + 4, cellY + 4, SHAPE_CELL - 8, SHAPE_CELL - 8);
        ctx.strokeRect(cellX + 4, cellY + 4, SHAPE_CELL - 8, SHAPE_CELL - 8);
    } else if (kind === 1) {
        // Circle
        ctx.beginPath();
        ctx.arc(cx, cy, SHAPE_CELL / 2 - 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    } else if (kind === 2) {
        // Triangle
        ctx.beginPath();
        ctx.moveTo(cx, cellY + 3);
        ctx.lineTo(cellX + SHAPE_CELL - 3, cellY + SHAPE_CELL - 3);
        ctx.lineTo(cellX + 3, cellY + SHAPE_CELL - 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else if (kind === 3) {
        // Five-point star
        ctx.beginPath();

        for (let i = 0; i < 5; i++) {
            const outerAngle = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const innerAngle = outerAngle + Math.PI / 5;
            const outerR = SHAPE_CELL / 2 - 2;
            const innerR = outerR * 0.45;

            ctx.lineTo(cx + Math.cos(outerAngle) * outerR, cy + Math.sin(outerAngle) * outerR);
            ctx.lineTo(cx + Math.cos(innerAngle) * innerR, cy + Math.sin(innerAngle) * innerR);
        }

        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else if (kind === 4) {
        // Heart (two circles plus a triangle wedge)
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 2, 5, 0, Math.PI * 2);
        ctx.arc(cx + 4, cy - 2, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cellX + 3, cy);
        ctx.lineTo(cx, cellY + SHAPE_CELL - 3);
        ctx.lineTo(cellX + SHAPE_CELL - 3, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else {
        // Diamond
        ctx.beginPath();
        ctx.moveTo(cx, cellY + 3);
        ctx.lineTo(cellX + SHAPE_CELL - 3, cy);
        ctx.lineTo(cx, cellY + SHAPE_CELL - 3);
        ctx.lineTo(cellX + 3, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
}

/**
 * Builds a 3x2 sprite sheet with six shapes on an offscreen canvas.
 *
 * @returns {{ canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D, rects: Rect2i[] }}
 */
function buildShapeSheet() {
    const sheetW = SHAPE_COLS * SHAPE_CELL;
    const sheetH = SHAPE_ROWS * SHAPE_CELL;
    const canvas = new OffscreenCanvas(sheetW, sheetH);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Could not create 2D context for shape sheet');
    }

    // Clear to transparent so unused pixels stay invisible.
    ctx.clearRect(0, 0, sheetW, sheetH);

    const rects = [];

    // One cell per entry in the shared SHAPE_NAMES list (the same list captions use).
    for (let i = 0; i < SHAPE_NAMES.length; i++) {
        const col = i % SHAPE_COLS;
        const row = Math.floor(i / SHAPE_COLS);
        const cellX = col * SHAPE_CELL;
        const cellY = row * SHAPE_CELL;

        drawShapeInCell(ctx, cellX, cellY, i);
        rects.push(new Rect2i(cellX, cellY, SHAPE_CELL, SHAPE_CELL));
    }

    // Flatten the smooth, anti-aliased edges into flat colors so every pixel matches a
    // palette entry exactly (see quantizeCanvasToShapeColors() for why this is required).
    quantizeCanvasToShapeColors(ctx, sheetW, sheetH);

    return { canvas, ctx, rects };
}

/**
 * Demonstrates sprite sheets, source rectangles, palette offsets, and opacity pulsing.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;
    /** @type {SpriteSheet | null} */
    sheet = null;

    // Slot map for the shared UI kit theme, filled in init() by applyTheme().
    // theme.bg, theme.text, and friends are palette indices for our own drawing.
    theme = null;

    // One Rect2i per shape cell in the programmatic sheet.
    shapeRects = [];

    // Star cell - reused for the palette-offset row below the shape grid.
    /** @type {Rect2i | null} */
    themeRect = null;

    colorCount = 0;
    baseColors = [];
    animTime = 0;

    /**
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            isOverlayTimingChartEnabled: true,
            overlayStyle: {
                barPaletteIndex: UI_BG,
                textPaletteIndex: UI_DIM,
                gapPaletteIndex: UI_BG,
            },
            overlayTimingChartStyle: {
                updateBarPaletteIndex: UI_DIM,
                renderBarPaletteIndex: UI_INFO,
                warningPaletteIndex: UI_INFO,
                errorPaletteIndex: UI_TEXT,
                tagPaletteIndex: UI_DIM,
            },
        };
    }

    /**
     * Builds the shape sheet on a canvas, registers colors, and calls sheet.indexize().
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        console.log('[SpriteDemo] Initializing...');

        this.palette = BT.paletteCreate(256);

        // Install the shared UI theme: applyTheme() writes the twelve UI kit colors into
        // high palette slots (240-251), far above this demo's sprite colors (slots 10-19),
        // and returns a map of friendly names to those slots (this.theme.bg, .text, ...).
        // Every caption and the code panel below draw with these shared colors.
        this.theme = applyTheme(this.palette);

        try {
            const { canvas, ctx, rects } = buildShapeSheet();
            this.shapeRects = rects;
            this.themeRect = rects[3]; // Star - used for palette-offset demos.

            this.baseColors = registerCanvasColors(this.palette, ctx, canvas.width, canvas.height, COLOR_BASE);
            this.colorCount = this.baseColors.length;

            const colorCount = this.colorCount;

            // Build theme blocks: Fire, Ice, Void, and a Pulse block updated in update().
            for (let i = 0; i < colorCount; i++) {
                const base = this.baseColors[i];

                this.palette.set(
                    COLOR_BASE + colorCount + i,
                    new Color32(Math.min(255, base.r + 80), base.g, Math.max(0, base.b - 80)),
                );
                this.palette.set(
                    COLOR_BASE + colorCount * 2 + i,
                    new Color32(Math.max(0, base.r - 60), base.g, Math.min(255, base.b + 80)),
                );
                this.palette.set(
                    COLOR_BASE + colorCount * 3 + i,
                    new Color32(Math.floor(base.r * 0.25), Math.floor(base.g * 0.25), Math.floor(base.b * 0.25)),
                );
                this.palette.set(COLOR_BASE + colorCount * 4 + i, new Color32(base.r, base.g, base.b, 255));
            }

            const image = await canvasToImage(canvas);
            this.sheet = new SpriteSheet(image);
            this.sheet.indexize(this.palette);
            BT.paletteSet(this.palette);

            console.log(
                `[SpriteDemo] Built shape sheet: ${canvas.width}x${canvas.height}px, ${colorCount} unique colors`,
            );
        } catch (error) {
            console.error('[SpriteDemo] Failed to build shape sheet:', error);
            return false;
        }

        console.log('[SpriteDemo] Initialization complete!');
        return true;
    }

    update() {
        this.animTime += BT.deltaSeconds;

        if (!this.colorCount) {
            return;
        }

        const pulse = Math.sin(this.animTime * 3) * 0.5 + 0.5;
        const alpha = Math.floor(60 + pulse * 195);

        for (let i = 0; i < this.colorCount; i++) {
            const base = this.baseColors[i];
            this.palette.set(COLOR_BASE + this.colorCount * 4 + i, new Color32(base.r, base.g, base.b, alpha));
        }
    }

    render() {
        // Clear the whole screen with the shared UI theme's background color.
        BT.clear(this.theme.bg);

        // Row 1: six shapes - each draw call uses a different source Rect2i.
        const shapeY = 14;
        const shapeSpacing = 50;

        for (let i = 0; i < this.shapeRects.length; i++) {
            const destX = 6 + i * shapeSpacing;
            BT.drawSprite(this.sheet, this.shapeRects[i], new Vector2i(destX, shapeY), 0);
            ui.caption(destX, shapeY + 22, SHAPE_NAMES[i], { color: 'dim' });
        }

        ui.caption(6, 58, 'Source rects - one region per shape', { color: 'dim' });

        // Row 2: palette offsets on the star shape (offset shifts every pixel index).
        const n = this.colorCount;
        const themeY = 78;
        const themeSpacing = 72;

        BT.drawSprite(this.sheet, this.themeRect, new Vector2i(8, themeY), 0);
        ui.caption(6, themeY + 22, 'Original', { color: 'dim' });

        BT.drawSprite(this.sheet, this.themeRect, new Vector2i(8 + themeSpacing, themeY), n);
        ui.caption(6 + themeSpacing, themeY + 22, 'Fire', { color: 'dim' });

        BT.drawSprite(this.sheet, this.themeRect, new Vector2i(8 + themeSpacing * 2, themeY), n * 2);
        ui.caption(6 + themeSpacing * 2, themeY + 22, 'Ice', { color: 'dim' });

        BT.drawSprite(this.sheet, this.themeRect, new Vector2i(8 + themeSpacing * 3, themeY), n * 3);
        ui.caption(6 + themeSpacing * 3, themeY + 22, 'Void', { color: 'dim' });

        // Row 3: opacity pulsing via palette alpha slots rewritten in update().
        BT.drawSprite(this.sheet, this.themeRect, new Vector2i(8, 148), n * 4);
        ui.caption(6, 170, 'Alpha pulse', { color: 'dim' });

        // A two-line footnote about the pulsing star. A borderless group anchored to the
        // bottom-left corner: the kit stacks its labels vertically and places the whole
        // block just above the bottom screen edge.
        ui.begin('bottomLeft');
        ui.label('Opacity via palette,', { color: 'dim' });
        ui.label('not a drawSprite flag.', { color: 'dim' });
        ui.end();

        this.renderCodeSnippet();
    }

    /**
     * The "how you would load a real PNG" cheat sheet, as a bordered kit panel anchored
     * to the bottom-right corner of the screen.
     */
    renderCodeSnippet() {
        ui.begin('bottomRight');
        ui.panel('Production PNG load');
        ui.label('const indexed =', { color: 'info' });
        ui.label('  await SpriteSheet', { color: 'info' });
        ui.label('  .loadIndexed(', { color: 'info' });
        ui.label("   '/sprites/test.png',", { color: 'info' });
        ui.label('   palette, 10);', { color: 'info' });
        ui.end();
    }
}

bootstrap(Demo);
