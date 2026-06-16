// Demo 008 - Sprites: how to draw images (sprites) on screen using Blit-Tech.
//
// Prerequisites: 001-Basics (https://blit-tech-demos.vancura.dev/001-basics),
// 002-Primitives (https://blit-tech-demos.vancura.dev/002-primitives),
// 003-Colors (https://blit-tech-demos.vancura.dev/003-colors).
// Live article: https://vancura.dev/articles/blit-tech-sprites
//
// A "sprite" is a 2D image used in a game - like a character, a coin, or an enemy.
// In Blit-Tech, sprites are stored in a "sprite sheet": one big image that
// contains many small sprites arranged in a grid. You draw individual sprites by
// telling the engine which rectangular region (a Rect2i "source rect") to copy.
//
// This demo builds a six-shape sheet on an offscreen canvas, then shows:
//   1. BT.drawSprite() with different source regions (one shape per cell).
//   2. Palette offsets - shifting every pixel index to a different color block.
//   3. Opacity pulsing - rewriting palette alpha slots in update().
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
// We learned about palette setup in Demo 015-Palette-Presets:
// https://blit-tech-demos.vancura.dev/015-palette-presets

import { bootstrap, BT, Color32, Rect2i, SpriteSheet, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

/** @typedef {import('blit-tech').HardwareSettings} HardwareSettings */
/** @typedef {import('blit-tech').Palette} Palette */
/** @typedef {import('blit-tech').SpriteSheet} SpriteSheet */
/** @typedef {import('blit-tech').Rect2i} Rect2i */

// Where in the palette the sprite's original colors start.
// Everything before this (index 1..9) is used for UI colors.
const COLOR_BASE = 10;

// Each shape cell in the programmatic sheet is 20x20 pixels.
const SHAPE_CELL = 20;
const SHAPE_COLS = 3;
const SHAPE_ROWS = 2;

// UI color slot indices written by palette.applyHUD() in init().
const C_WHITE = 1;
const C_BG = 2;
const C_LABEL = 3;
const C_CODE = 6;

/**
 * Turns an offscreen canvas into a loaded HTMLImageElement.
 * The browser needs an Image object before SpriteSheet can upload it to the GPU.
 *
 * @param {OffscreenCanvas} canvas
 * @returns {Promise<HTMLImageElement>}
 */
async function canvasToImage(canvas) {
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const url = URL.createObjectURL(blob);

    try {
        return await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * Scans canvas pixels and registers every unique opaque color into the palette.
 * Transparent pixels (alpha 0) are skipped - they map to slot 0 at draw time.
 *
 * @param {import('blit-tech').Palette} palette
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {number} startSlot
 * @returns {Color32[]}
 */
function registerCanvasColors(palette, ctx, w, h, startSlot) {
    const data = ctx.getImageData(0, 0, w, h).data;
    const seen = new Map();
    const colors = [];

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        if (a === 0) {
            continue;
        }

        const key = `${r},${g},${b}`;

        if (!seen.has(key)) {
            const slot = startSlot + colors.length;
            seen.set(key, slot);
            const color = new Color32(r, g, b, 255);
            palette.set(slot, color);
            colors.push(color);
        }
    }

    return colors;
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
    const fill = '#5599ee';
    const stroke = '#ffffff';

    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
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
 * @returns {Promise<{ canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D, rects: Rect2i[] }>}
 */
async function buildShapeSheet() {
    const sheetW = SHAPE_COLS * SHAPE_CELL;
    const sheetH = SHAPE_ROWS * SHAPE_CELL;
    const canvas = new OffscreenCanvas(sheetW, sheetH);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Could not create 2D context for shape sheet');
    }

    // Clear to transparent so unused pixels stay invisible.
    ctx.clearRect(0, 0, sheetW, sheetH);

    const names = ['Square', 'Circle', 'Triangle', 'Star', 'Heart', 'Diamond'];
    const rects = [];

    for (let i = 0; i < names.length; i++) {
        const col = i % SHAPE_COLS;
        const row = Math.floor(i / SHAPE_COLS);
        const cellX = col * SHAPE_CELL;
        const cellY = row * SHAPE_CELL;

        drawShapeInCell(ctx, cellX, cellY, i);
        rects.push(new Rect2i(cellX, cellY, SHAPE_CELL, SHAPE_CELL));
    }

    return { canvas, ctx, rects };
}

/**
 * Demonstrates sprite sheets, source rectangles, palette offsets, and opacity pulsing.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;
    /** @type {SpriteSheet | null} */
    sheet = null;

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
                barPaletteIndex: C_BG,
                textPaletteIndex: C_LABEL,
                gapPaletteIndex: C_BG,
            },
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_LABEL,
                renderBarPaletteIndex: C_CODE,
                warningPaletteIndex: C_CODE,
                errorPaletteIndex: C_WHITE,
                tagPaletteIndex: C_LABEL,
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
        this.palette.applyHUD(1);

        try {
            const { canvas, ctx, rects } = await buildShapeSheet();
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
        BT.clear(C_BG);

        if (!this.sheet || this.shapeRects.length === 0) {
            BT.systemPrint(new Vector2i(10, 10), C_WHITE, 'Loading...');
            return;
        }

        // Row 1: six shapes - each draw call uses a different source Rect2i.
        const shapeY = 14;
        const shapeSpacing = 50;
        const shapeNames = ['Square', 'Circle', 'Tri', 'Star', 'Heart', 'Gem'];

        for (let i = 0; i < this.shapeRects.length; i++) {
            const destX = 6 + i * shapeSpacing;
            BT.drawSprite(this.sheet, this.shapeRects[i], new Vector2i(destX, shapeY), 0);
            BT.systemPrint(new Vector2i(destX, shapeY + 22), C_LABEL, shapeNames[i]);
        }

        BT.systemPrint(new Vector2i(6, 58), C_LABEL, 'Source rects - one region per shape');

        // Row 2: palette offsets on the star shape (offset shifts every pixel index).
        const N = this.colorCount;
        const themeY = 78;
        const themeSpacing = 72;

        BT.drawSprite(this.sheet, this.themeRect, new Vector2i(8, themeY), 0);
        BT.systemPrint(new Vector2i(6, themeY + 22), C_LABEL, 'Original');

        BT.drawSprite(this.sheet, this.themeRect, new Vector2i(8 + themeSpacing, themeY), N);
        BT.systemPrint(new Vector2i(6 + themeSpacing, themeY + 22), C_LABEL, 'Fire');

        BT.drawSprite(this.sheet, this.themeRect, new Vector2i(8 + themeSpacing * 2, themeY), N * 2);
        BT.systemPrint(new Vector2i(6 + themeSpacing * 2, themeY + 22), C_LABEL, 'Ice');

        BT.drawSprite(this.sheet, this.themeRect, new Vector2i(8 + themeSpacing * 3, themeY), N * 3);
        BT.systemPrint(new Vector2i(6 + themeSpacing * 3, themeY + 22), C_LABEL, 'Void');

        // Row 3: opacity pulsing via palette alpha slots rewritten in update().
        BT.drawSprite(this.sheet, this.themeRect, new Vector2i(8, 148), N * 4);
        BT.systemPrint(new Vector2i(6, 170), C_LABEL, 'Alpha pulse');
        BT.systemPrint(new Vector2i(36, 152), C_LABEL, 'Opacity via palette,');
        BT.systemPrint(new Vector2i(36, 164), C_LABEL, 'not a drawSprite flag.');

        this.renderCodeSnippet();
    }

    renderCodeSnippet() {
        BT.systemPrint(new Vector2i(170, 188), C_LABEL, 'Production PNG load:');
        BT.systemPrint(new Vector2i(170, 200), C_CODE, 'const indexed =');
        BT.systemPrint(new Vector2i(170, 212), C_CODE, '  await SpriteSheet');
        BT.systemPrint(new Vector2i(170, 224), C_CODE, '  .loadIndexed(');
        BT.systemPrint(new Vector2i(170, 236), C_CODE, "   '/sprites/test.png',");
        BT.systemPrint(new Vector2i(170, 248), C_CODE, '   palette, 10);');
    }
}

bootstrap(Demo);
