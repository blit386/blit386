// Nine-Slice Panels: one piece of panel art that fills a box of any size.
// @description Draw one nine-slice panel at any size: stretch or tile its edges, crop corners, recolor, build bars.
//
// Prerequisites: Basics (https://demos.blit386.dev/basics),
// Sprites (https://demos.blit386.dev/sprites).
// Guide: https://blit386.dev/docs/api/rendering#nine-slice-panels
//
// Games draw a lot of boxes: dialog windows, buttons, health bars. You could paint a new picture
// for every size, but there is a smarter way. A "nine-slice" cuts ONE small picture into a 3x3 grid:
//
//     +--------+--------+--------+
//     | corner |  edge  | corner |      Corners are copied 1:1, so they never get squashed.
//     +--------+--------+--------+      Edges and the center are stretched (blown up to fit)
//     |  edge  | center |  edge  |      or tiled (repeated like bathroom tiles) to fill the box.
//     +--------+--------+--------+
//     | corner |  edge  | corner |
//     +--------+--------+--------+
//
// You build the nine-slice ONCE, in init(), with NineSlice.fromSheet(). Then you draw it into any
// box you like with BT.drawNineSlice(). Drawing allocates nothing, so this demo also builds every
// NineSlice and every Rect2i it reuses in init() instead of making new ones every frame.
//
// This demo draws its panel art on an offscreen canvas (the same trick as the Sprites demo), then shows:
//   1. One asset, any box - the same panel drawn at five different sizes.
//   2. Stretch vs tile vs mixed - tiled edges with a stretched center, the common UI case.
//   3. Open from 0x0 - a panel growing from nothing, with its corners cropped instead of squashed.
//   4. Palette offsets - the same panel recolored, like an idle, hovered, and alert button.
//   5. A three-slice bar - a bar with only left and right caps, for health bars.
//
// A word of warning: each tile is one quad (one little rectangle the graphics card draws). Tiling a
// 1-pixel strip across a big box costs one quad per pixel and can fill the engine's sprite buffer.
// So tile PATTERNED art that is a few pixels wide (like the 8-pixel strips here), and stretch flat fills.
//
// Recoloring works exactly as it does for sprites: palette offsets shift every pixel's palette index.
// There is no tint. Palette Presets explores the palette system: https://demos.blit386.dev/palette-presets

import { applyEasing, bootstrap, BT, Color32, NineSlice, Rect2i, SpriteSheet, Vector2i } from 'blit386';

import { canvasToImage, registerCanvasColors } from './shared/canvas-sprites.js';
import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').SpriteSheet} SpriteSheet */

// Display size: twice the usual 320x200 each way, which leaves room for two columns of sections.
const DISPLAY_W = 640;
const DISPLAY_H = 400;

// Where in the palette the panel's original colors start. The recolored copies stack right after
// them, and the shared UI theme lives far above at slots 240-251.
const COLOR_BASE = 10;

// The panel art is 18x18 pixels: a 5-pixel border on every side around an 8x8 center.
// The strips are 8 pixels wide on purpose - the patterns repeat every 4 pixels, so an 8-pixel
// strip tiles without a visible seam.
const PANEL_SIZE = 18;
const PANEL_CAP = 5;
const PANEL_INNER = PANEL_SIZE - PANEL_CAP * 2;

// The bar art sits in the same sheet, to the right of the panel: 18 pixels wide, 10 tall,
// with a 5-pixel cap at each end and an 8-pixel middle.
const BAR_X = 20;
const BAR_W = 18;
const BAR_H = 10;

// Total size of the sheet that holds both pieces of art.
const SHEET_W = BAR_X + BAR_W;
const SHEET_H = PANEL_SIZE;

// The seven flat colors of the art. Every pixel uses exactly one of them, so the sheet maps
// onto the palette without any blending (we never use smooth, anti-aliased canvas drawing).
const ART_COLORS = {
    outline: new Color32(0x14, 0x16, 0x3a),
    edgeLight: new Color32(0x9a, 0xa8, 0xff),
    edgeMid: new Color32(0x4a, 0x58, 0xc8),
    dash: new Color32(0xd8, 0xde, 0xff),
    fill: new Color32(0x24, 0x2c, 0x70),
    fillDot: new Color32(0x3a, 0x46, 0xa8),
    stud: new Color32(0xff, 0xd0, 0x60),
};

// How long the "open from 0x0" animation runs, in ticks (one tick is 1/60 of a second):
// grow for 60 ticks, hold the finished panel, then start over after 180 ticks in total.
const TWEEN_OPEN_TICKS = 60;
const TWEEN_CYCLE_TICKS = 180;

// The largest the tweened panel gets.
const TWEEN_MAX_W = 140;
const TWEEN_MAX_H = 90;

// Where the right-hand column of sections starts.
const RIGHT_X = 340;

// Sizes for section 1: the same asset in five different boxes.
const SIZES = [
    { w: 20, h: 20 },
    { w: 36, h: 28 },
    { w: 60, h: 40 },
    { w: 100, h: 52 },
    { w: 40, h: 52 },
];

// The three box modes of section 2, in the order they are drawn and labelled.
const MODE_NAMES = ['Stretch', 'Tile', 'Mixed'];

// The three recolors of section 4. Each name sits under one panel; the offset is a multiple
// of the art's color count, so offset 0 is the original and the others jump to a recolored block.
const RECOLOR_NAMES = ['Idle', 'Hover', 'Alert'];

/**
 * Draws one pixel of the sheet with a flat color.
 *
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {Color32} color
 */
function plot(ctx, x, y, color) {
    ctx.fillStyle = color.toHex();
    ctx.fillRect(x, y, 1, 1);
}

/**
 * Picks the color of one panel corner pixel: a dark outline, a gold stud, and a mid-blue body.
 * dx and dy are the distance from the nearest left/right and top/bottom outer edge.
 *
 * @param {number} dx
 * @param {number} dy
 * @returns {Color32}
 */
function cornerColorAt(dx, dy) {
    if (dx === 0 || dy === 0) {
        return ART_COLORS.outline;
    }

    return dx >= 2 && dx <= 3 && dy >= 2 && dy <= 3 ? ART_COLORS.stud : ART_COLORS.edgeMid;
}

/**
 * Picks the color of one panel edge pixel. `depth` is how far the pixel is from the outer edge
 * and `along` is how far it is along the edge. The dashes repeat every 4 pixels ALONG the edge.
 * Stretching smears them into long bars; tiling repeats them crisply. That is the difference you will see.
 *
 * @param {number} depth
 * @param {number} along
 * @returns {Color32}
 */
function edgeColorAt(depth, along) {
    if (depth === 0) {
        return ART_COLORS.outline;
    }

    if (depth === PANEL_CAP - 1) {
        return ART_COLORS.edgeLight;
    }

    return (along - PANEL_CAP) % 4 < 2 ? ART_COLORS.dash : ART_COLORS.edgeMid;
}

/**
 * Picks the color of one pixel of the 18x18 panel.
 * dx and dy are the distance from the nearest left/right and top/bottom outer edge, which lets the
 * same rules paint all four corners and all four edges.
 *
 * @param {number} x
 * @param {number} y
 * @returns {Color32}
 */
function panelColorAt(x, y) {
    const dx = Math.min(x, PANEL_SIZE - 1 - x);
    const dy = Math.min(y, PANEL_SIZE - 1 - y);
    const isSideColumn = dx < PANEL_CAP;
    const isSideRow = dy < PANEL_CAP;

    if (isSideColumn && isSideRow) {
        return cornerColorAt(dx, dy);
    }

    // Top and bottom edges run along x; left and right edges run along y.
    if (isSideRow) {
        return edgeColorAt(dy, x);
    }

    if (isSideColumn) {
        return edgeColorAt(dx, y);
    }

    // Center: a diagonal dot pattern, so a stretched center shows fat blocks and a tiled one stays fine.
    return (x + y) % 4 === 0 ? ART_COLORS.fillDot : ART_COLORS.fill;
}

/**
 * Picks the color of one pixel of the bar. lx and y are measured inside the bar's own 18x10 box.
 *
 * @param {number} lx
 * @param {number} y
 * @returns {Color32}
 */
function barColorAt(lx, y) {
    const dx = Math.min(lx, BAR_W - 1 - lx);
    const dy = Math.min(y, BAR_H - 1 - y);

    // The two end caps: outline around a mid-blue body, with a gold stud.
    if (dx < PANEL_CAP) {
        if (dx === 0 || dy === 0) {
            return ART_COLORS.outline;
        }

        return dx === 2 && y >= 4 && y <= 5 ? ART_COLORS.stud : ART_COLORS.edgeMid;
    }

    // The middle: outline on top and bottom, a light line under it, then diagonal stripes
    // that repeat every 4 pixels along the bar.
    if (dy === 0) {
        return ART_COLORS.outline;
    }

    if (dy === 1) {
        return ART_COLORS.edgeLight;
    }

    return (lx - PANEL_CAP + y) % 4 < 2 ? ART_COLORS.dash : ART_COLORS.edgeMid;
}

/**
 * Paints the whole sheet - the panel on the left and the bar on the right - on an offscreen canvas.
 *
 * @returns {{ canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D }}
 */
function buildArtSheet() {
    const canvas = new OffscreenCanvas(SHEET_W, SHEET_H);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Could not create 2D context for the panel sheet');
    }

    // Start fully transparent, so the gap between the panel and the bar stays empty.
    ctx.clearRect(0, 0, SHEET_W, SHEET_H);

    for (let y = 0; y < PANEL_SIZE; y++) {
        for (let x = 0; x < PANEL_SIZE; x++) {
            plot(ctx, x, y, panelColorAt(x, y));
        }
    }

    for (let y = 0; y < BAR_H; y++) {
        for (let x = 0; x < BAR_W; x++) {
            plot(ctx, BAR_X + x, y, barColorAt(x, y));
        }
    }

    return { canvas, ctx };
}

/**
 * Demonstrates nine-slice panels: one asset, stretch vs tile, corner crop, recolor, and a three-slice bar.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;
    /** @type {SpriteSheet | null} */
    sheet = null;

    // Slot map for the shared UI kit theme, filled in init() by applyTheme().
    theme = null;

    // How many colors the art uses. Each recolored block is this many slots further along,
    // so this number is also the palette offset step.
    colorCount = 0;

    // The nine-slices. All are built once in init(). They are frozen, finished assets.
    stretchPanel = null;
    tilePanel = null;
    mixedPanel = null;
    bar = null;

    // Every box this demo draws more than once is built in init() too, never inside render().
    sizeRects = [];
    modeRects = [];
    recolorRects = [];
    staticBarRects = [];
    buttonRect = null;

    // The two boxes whose size changes every frame. render() rewrites them with set(), so no
    // new Rect2i is made per frame.
    tweenRect = null;
    liveBarRect = null;

    // Text that never changes, built once so render() does not glue strings together every frame.
    sizeLabels = [];
    recolorLabels = [];

    // Where the pointer (mouse or finger) is, for the hover button. pointerPosTo() writes into it.
    pointerPos = null;

    // The tick the open animation started on. The Replay button sets it to "now".
    tweenStart = 0;

    /**
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
        };
    }

    /**
     * Builds the art, the palette blocks, every NineSlice, and every reused Rect2i.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        this.palette = BT.paletteCreate(256);

        // Install the shared UI colors into slots 240-251, far above the art at slots 10-30.
        this.theme = applyTheme(this.palette);

        try {
            const { canvas, ctx } = buildArtSheet();

            // Give each unique art color its own palette slot, starting at COLOR_BASE.
            const baseColors = registerCanvasColors(this.palette, ctx, SHEET_W, SHEET_H, COLOR_BASE);
            this.colorCount = baseColors.length;

            // Hover block: every color a little lighter, like a button lit up under the mouse.
            this.palette.fillBlock(
                COLOR_BASE + this.colorCount,
                baseColors,
                (c) => new Color32(Math.min(255, c.r + 50), Math.min(255, c.g + 50), Math.min(255, c.b + 50)),
            );

            // Alert block: push red up and pull green and blue down.
            this.palette.fillBlock(
                COLOR_BASE + this.colorCount * 2,
                baseColors,
                (c) => new Color32(Math.min(255, c.r + 110), Math.floor(c.g * 0.5), Math.floor(c.b * 0.4)),
            );

            const image = await canvasToImage(canvas);
            this.sheet = new SpriteSheet(image);
            this.sheet.indexize(this.palette);

            this.buildNineSlices();
            this.buildRects();
            BT.paletteSet(this.palette);
        } catch (error) {
            console.error('[NineSliceDemo] Failed to build the panel art:', error);
            return false;
        }

        return true;
    }

    update() {
        // Always first: this latches the Replay button's R key shortcut.
        ui.tick();
    }

    render() {
        BT.clear(this.theme.bg);

        this.renderSizes();
        this.renderModes();
        this.renderTween();
        this.renderRecolor();
        this.renderBars();
        this.renderCodeSnippet();
    }

    /**
     * Cuts the sheet into nine-slices. fromSheet() takes two rectangles in sheet pixels: `outer` is the
     * whole picture and `inner` is the center. Everything between them is the border - corners and edges.
     */
    buildNineSlices() {
        const outer = new Rect2i(0, 0, PANEL_SIZE, PANEL_SIZE);
        const inner = new Rect2i(PANEL_CAP, PANEL_CAP, PANEL_INNER, PANEL_INNER);

        // The default for edges and center is 'stretch'.
        this.stretchPanel = NineSlice.fromSheet(this.sheet, outer, inner);

        // 'tile' repeats the strip at its real size, starting from the box's top-left corner.
        this.tilePanel = NineSlice.fromSheet(this.sheet, outer, inner, { edges: 'tile', center: 'tile' });

        // The common UI case: a patterned border that tiles around a center that stretches.
        this.mixedPanel = NineSlice.fromSheet(this.sheet, outer, inner, { edges: 'tile', center: 'stretch' });

        // A three-slice bar: `inner` touches the top AND bottom of `outer`, so there are no top or
        // bottom edges - only a left cap, a middle, and a right cap. The middle tiles along the bar.
        const barOuter = new Rect2i(BAR_X, 0, BAR_W, BAR_H);
        const barInner = new Rect2i(BAR_X + PANEL_CAP, 0, BAR_W - PANEL_CAP * 2, BAR_H);
        this.bar = NineSlice.fromSheet(this.sheet, barOuter, barInner, { center: 'tile' });
    }

    /**
     * Makes every destination box once. A Rect2i is just four numbers (x, y, width, height).
     */
    buildRects() {
        // Section 1: five boxes in a row, 12 pixels apart.
        let x = 12;

        for (const size of SIZES) {
            this.sizeRects.push(new Rect2i(x, 24, size.w, size.h));
            this.sizeLabels.push(`${size.w}x${size.h}`);
            x += size.w + 12;
        }

        // Section 2: three boxes of the same size, one per mode.
        for (let i = 0; i < MODE_NAMES.length; i++) {
            this.modeRects.push(new Rect2i(12 + i * 104, 116, 92, 64));
        }

        // Section 3: this box is rewritten every frame, so it only needs to exist.
        this.tweenRect = new Rect2i(0, 0, 0, 0);

        // Section 4: three same-size panels, plus the box for the hover button.
        for (let i = 0; i < RECOLOR_NAMES.length; i++) {
            this.recolorRects.push(new Rect2i(RIGHT_X + i * 88, 160, 72, 36));
            this.recolorLabels.push(`${RECOLOR_NAMES[i]} +${this.colorCount * i}`);
        }

        this.buttonRect = new Rect2i(RIGHT_X, 224, 120, 28);
        this.pointerPos = new Vector2i(0, 0);

        // Section 5: two fixed bars and one whose width changes, all with the art's own height.
        this.staticBarRects.push(new Rect2i(RIGHT_X, 284, 48, BAR_H), new Rect2i(RIGHT_X, 300, 96, BAR_H));
        this.liveBarRect = new Rect2i(RIGHT_X, 316, 20, BAR_H);
    }

    /**
     * Section 1: the same panel, five different boxes. Corners stay the same size; only the middle grows.
     */
    renderSizes() {
        ui.caption(12, 8, 'One asset, any box', { color: 'dim' });

        for (let i = 0; i < this.sizeRects.length; i++) {
            BT.drawNineSlice(this.mixedPanel, this.sizeRects[i]);
            ui.caption(this.sizeRects[i].x, 80, this.sizeLabels[i], { color: 'dim' });
        }
    }

    /**
     * Section 2: three boxes of exactly the same size, filled three ways. Stretch blows each strip up to fit,
     * so the dashes turn into fat bars. Tile repeats the strip at its real size, so the dashes stay crisp - and
     * the last tile is cut off at the box edge. Mixed tiles the border and stretches the center.
     */
    renderModes() {
        ui.caption(12, 100, 'Stretch vs tile vs mixed', { color: 'dim' });

        const panels = [this.stretchPanel, this.tilePanel, this.mixedPanel];

        for (let i = 0; i < panels.length; i++) {
            BT.drawNineSlice(panels[i], this.modeRects[i]);
            ui.caption(this.modeRects[i].x, 184, MODE_NAMES[i], { color: 'dim' });
        }

        ui.caption(12, 198, 'Mixed: tiled edges, stretched center', { color: 'dim' });
    }

    /**
     * Section 3: a panel growing from nothing. While the box is smaller than the two corners together, the
     * corners share it and are cropped from their outer side - so you see a growing outline, not a squashed frame.
     */
    renderTween() {
        ui.caption(RIGHT_X, 8, 'Open from 0x0', { color: 'dim' });

        // How far into the animation are we? Count ticks since the start, and wrap around so it loops.
        const elapsed = (BT.ticks - this.tweenStart) % TWEEN_CYCLE_TICKS;

        // Turn that into a number from 0 (closed) to 1 (fully open), then ease it so it slows
        // down as it arrives, like a drawer closing softly.
        const progress = applyEasing(Math.min(1, elapsed / TWEEN_OPEN_TICKS), 'ease-out');
        const w = Math.round(progress * TWEEN_MAX_W);
        const h = Math.round(progress * TWEEN_MAX_H);

        // Grow from the middle of the stage: shift the top-left back by half the missing size.
        // The `>> 1` is "divide by two and drop the fraction", which keeps every coordinate a whole number.
        this.tweenRect.set(RIGHT_X + ((TWEEN_MAX_W - w) >> 1), 24 + ((TWEEN_MAX_H - h) >> 1), w, h);

        BT.drawNineSlice(this.mixedPanel, this.tweenRect);
        ui.caption(RIGHT_X, 118, `${w}x${h}`, { color: 'dim' });

        // Replay restarts the animation. Pressing R does the same.
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: RIGHT_X + TWEEN_MAX_W + 16, y: 24 });

        if (ui.button('Replay (R)', { key: 'KeyR' })) {
            this.tweenStart = BT.ticks;
        }

        ui.end();
    }

    /**
     * Section 4: no tint exists, only paletteOffset - the same shift sprites use. Offset 0 is the original
     * art; adding colorCount jumps to the next recolored block.
     */
    renderRecolor() {
        ui.caption(RIGHT_X, 140, 'Palette offsets - one panel, three looks', { color: 'dim' });

        for (let i = 0; i < this.recolorRects.length; i++) {
            BT.drawNineSlice(this.mixedPanel, this.recolorRects[i], this.colorCount * i);
            ui.caption(this.recolorRects[i].x, 200, this.recolorLabels[i], { color: 'dim' });
        }

        // A live button: ask where the pointer is, and use the hover colors while it is over the box.
        BT.pointerPosTo(this.pointerPos);
        const isHovered = BT.isPointerActive(0) && this.buttonRect.containsXY(this.pointerPos.x, this.pointerPos.y);

        BT.drawNineSlice(this.mixedPanel, this.buttonRect, isHovered ? this.colorCount : 0);
        ui.caption(this.buttonRect.x + 12, this.buttonRect.y + 10, 'Hover me', { color: 'text' });
    }

    /**
     * Section 5: a three-slice bar. Its height is fixed by the art; only the width is free, so a
     * health bar is one draw call whose width follows the health.
     */
    renderBars() {
        ui.caption(RIGHT_X, 268, 'Three-slice bar - width is free', { color: 'dim' });

        for (const rect of this.staticBarRects) {
            BT.drawNineSlice(this.bar, rect);
        }

        // The live bar swings between 20 and 200 pixels wide. 20 is the smallest that still
        // shows both caps in full (each is 5 pixels wide).
        const swing = (Math.sin(BT.ticks / 40) + 1) / 2;
        this.liveBarRect.width = Math.round(20 + swing * 180);
        BT.drawNineSlice(this.bar, this.liveBarRect);
    }

    /**
     * The two lines that matter, as a bordered kit panel in the bottom-left corner.
     */
    renderCodeSnippet() {
        ui.begin(UI_ANCHORS.BOTTOM_LEFT, { y: DISPLAY_H - 62 });
        ui.panel('In init(), once:');
        ui.label('NineSlice.fromSheet(sheet, outer, inner, { edges: "tile" })', { color: 'info' });
        ui.label('In render(), any box: BT.drawNineSlice(panel, rect, offset)', { color: 'info' });
        ui.end();
    }
}

bootstrap(Demo);
