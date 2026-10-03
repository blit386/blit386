// Bunnymark - how many bouncing sprites the engine can move before a frame slips.
// @description Spawn bouncing bunnies until the sprite cap, and count quads this demo will not draw.
//
// What you will see:
//   - An original pixel bunny (not the Pixi.js rabbit) in several colors
//   - Click, hold, or a gamepad button adds them in batches
//   - A counter for how many were drawn and how many this demo did not submit
//   - An optional mode that alternates several copies of the picture so batches break
//
// Prerequisites:
//   Basics        https://demos.blit386.dev/basics
//   Sprites       https://demos.blit386.dev/sprites
//
// Guide: https://blit386.dev/docs/api/rendering
// Live version: https://demos.blit386.dev/bunnymark
//
// The engine overlay (press ` or the bottom-left corner) shows Present FPS, update(),
// render(), and Draw Calls. This demo turns that overlay on at startup. Draw Calls
// counts each BT.drawSprite, so it climbs with the bunny count in both sheet modes.
// The Batches row follows the sprite pipeline's rule (a new batch whenever the
// sheet changes), because the engine does not report that count yet (BT-114).
// One sheet stays one batch, and alternating sheets breaks that batch on every bunny.
// The overlay's bottom row (Prim / Spr) is the engine's own vertex count and
// overflow ("ov"). Dropped on this panel is bunnies this demo did not submit.
// ov stays 0 while the letter reserve holds; a rising ov means the panel used
// more quads than that reserve.
//
// Cap on the panel is 8333. The WebGPU sprite pipeline keeps 50,000 vertices for
// one frame. Each sprite is one quad, two triangles, so 6 vertices.
// floor(50000 / 6) is 8333. The next quad does not fit: the pipeline drops it and
// logs a warning. Bunnies stop 512 quads earlier, because the panel letters are
// sprites in that same buffer. That reserve keeps the readout from being the
// thing that gets dropped. The software renderer queues every sprite and has no
// vertex buffer of this size, so with ?backend=software this demo submits every
// bunny. Dropped stays 0 there, and the Cap row is hidden. The lists start
// 16384 long. WebGPU stops there. Software doubles them when a batch does not
// fit, up to 262144.
//
// For repeatable timing runs, two URL switches skip the clicking:
//   ?bunnies=5000   start with that many bunnies instead of one batch
//   ?split          start with Split sheets already on
// A missing ?bunnies starts one batch. A present value must be a whole number from 1
// to the field limit; anything else stops startup. Add &backend=software
// to time the software renderer.

import { bootstrap, BT, Color32, Rect2i, SpriteSheet, Vector2i } from 'blit386';

import { canvasToImage } from './shared/canvas-sprites.js';
import {
    applyTheme,
    THEME_DEFAULT_START_SLOT,
    THEME_PANEL_OFFSET,
    THEME_TEXT_OFFSET,
    ui,
    UI_ANCHORS,
} from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').SpriteSheet} SpriteSheet */

// Paint-by-number for one front-facing bunny. Each character is a palette slot in the
// first color set ('.' is empty air). A second picture is never stored: later colors are
// the same numbers slid up the palette with drawSprite's paletteOffset.
//
// This is original art. It is not the side-view rabbit from the Pixi.js bunnymark.
const BUNNY_ROWS = [
    '....11....11....',
    '...1331..1331...',
    '...1331..1331...',
    '...1333111331...',
    '....12222221....',
    '...1222222221...',
    '..122244224221..',
    '..122222222221..',
    '...1222333221...',
    '...1222222221...',
    '....12222221....',
    '.....122221.....',
    '.....11..11.....',
    '....111..111....',
    '...11......11...',
    '..11........11..',
];

const BUNNY_W = BUNNY_ROWS[0].length;
const BUNNY_H = BUNNY_ROWS.length;

// How many bunnies one click or one held tick adds. A batch is a handful at once,
// the way the classic stress test dumps sprites in instead of one at a time.
const SPAWN_BATCH = 100;

// Hard stop on WebGPU, and the length the lists start at. High enough to walk
// past the sprite cap and show dropped quads. Software copies these lists into
// a longer one when a batch does not fit, up to MAX_SOFTWARE_BUNNIES.
const MAX_WEBGPU_BUNNIES = 16384;

// Furthest the software field may grow. 16384 doubled four times. A held button
// still has to stop somewhere.
const MAX_SOFTWARE_BUNNIES = 262144;

// SpritePipeline keeps MAX_VERTICES vertices and spends 6 of them on each quad
// (two triangles). 50000 / 6 = 8333 sprites, then further quads are dropped.
// Manual-sync hazard: packages/blit386/src/render/SpritePipeline.ts (MAX_VERTICES
// and the `6 * VALUES_PER_VERTEX` quad size). This ticket does not change that cap.
const SPRITE_VERTEX_CAP = 50000;
const VERTICES_PER_QUAD = 6;
const SPRITE_QUAD_CAP = Math.floor(SPRITE_VERTEX_CAP / VERTICES_PER_QUAD);

// The on-screen panel is drawn with the system font, and those letters share the
// same sprite buffer as the bunnies. Leave room so the readout is not the thing
// that gets dropped. 512 quads is a generous budget for this panel's letters.
const HUD_QUAD_RESERVE = 512;
const BUNNY_DRAW_CAP = SPRITE_QUAD_CAP - HUD_QUAD_RESERVE;

// First palette slot of the bunny colors. Slot 0 stays transparent (empty pixels).
// The shared UI theme occupies 240-251, far above these blocks.
const COLOR_BASE = 1;

// How many colors one bunny uses: outline, fur, inner ear / belly, eye.
const COLOR_COUNT = 4;

// Separate copies of the same picture. Alternating them forces a new GPU batch
// on every bunny, because the sprite pipeline flushes when the texture changes.
const SHEET_COUNT = 4;

// The engine has four pointer slots: 0 is the mouse, 1-3 are touches.
const POINTER_SLOT_COUNT = 4;

// Face button A is also Space / KeyB for player 0, so a keyboard can spawn too.
// KeyN is the on-screen Add button's own key, separate from that face button.
const KEY_ADD = 'KeyN';

// Same seed every load so the first hops repeat. BT.randomSeed in init() wins
// over a ?seed= URL on purpose: this demo wants one known stream.
const RANDOM_SEED = 553;

// Pixels added to downward speed each tick. Positive Y points down the screen,
// so a positive gravity pulls bunnies toward the floor.
const GRAVITY = 0.4;

// How much upward speed survives a floor hit. 0.75 means each bounce is a bit
// shorter than the last, like a ball that doesn't quite return to your hand.
const RESTITUTION = 0.75;

// A landing softer than this (upward speed, so negative) gets a fresh hop, or
// the pile would eventually sit still and stop looking like a stress test.
const HOP_LIMIT = -1.5;
const HOP_MIN = 2;
const HOP_MAX = 6;

// Sideways speed and the upward kick (negative Y) given to a new bunny.
const SPAWN_VX_MIN = -4;
const SPAWN_VX_MAX = 4;
const SPAWN_VY_MIN = -8;
const SPAWN_VY_MAX = -2;

// Where bunnies appear when the pointer isn't the thing asking for them.
const FOUNTAIN_Y = 56;

// The panel has a fixed width so the bunnies can be kept out of it: sprites are drawn
// on top of UI panels, so a bunny inside the panel would cover the numbers. 118 pixels
// fits the widest row, the Split sheets checkbox: a 10-pixel box, 16 letters of 6
// pixels, and the padding around them.
const PANEL_W = 118;

// Gap between the screen edge and the panel, and the panel's top edge. The top edge
// sits below the engine overlay so the two never overlap.
const PANEL_MARGIN = 4;
const PANEL_Y = 58;

// The bunnies' left wall: just right of the panel. Everything left of it belongs to the HUD.
const ARENA_LEFT = PANEL_MARGIN + PANEL_W + PANEL_MARGIN;

// URL switches for timing runs (see the header comment). A present ?bunnies must be a
// whole number from 1 to the field limit: MAX_WEBGPU_BUNNIES on WebGPU, MAX_SOFTWARE_BUNNIES
// on software. A missing one means "start with one batch".
const PARAM_BUNNIES = 'bunnies';
const PARAM_SPLIT = 'split';

// Six recolors of the same four slots. Order inside each row is outline, fur,
// inner ear / belly, eye. paletteOffset selects a row at draw time.
const VARIANT_TABLE = [
    [rgb(42, 26, 18), rgb(232, 192, 144), rgb(240, 160, 176), rgb(26, 18, 12)],
    [rgb(90, 90, 96), rgb(244, 244, 248), rgb(245, 190, 200), rgb(40, 40, 48)],
    [rgb(40, 40, 44), rgb(140, 140, 148), rgb(196, 140, 156), rgb(20, 20, 24)],
    [rgb(12, 12, 16), rgb(48, 44, 52), rgb(220, 120, 150), rgb(230, 230, 236)],
    [rgb(90, 42, 16), rgb(230, 140, 48), rgb(245, 196, 170), rgb(40, 20, 12)],
    [rgb(24, 40, 64), rgb(150, 186, 214), rgb(214, 230, 242), rgb(12, 20, 36)],
];

const VARIANT_COUNT = VARIANT_TABLE.length;

// Overlay colors. configure() runs before applyTheme(), so these are the slots
// the theme will fill (start + offset), not this.theme which does not exist yet.
const UI_TEXT = THEME_DEFAULT_START_SLOT + THEME_TEXT_OFFSET;
const UI_PANEL = THEME_DEFAULT_START_SLOT + THEME_PANEL_OFFSET;

/**
 * One opaque color. Alpha 255 so indexize() can match it exactly.
 *
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {Color32}
 */
function rgb(r, g, b) {
    return new Color32(r, g, b, 255);
}

// Which bunny color a grid character stands for. -1 means "skip this pixel" (the '.'
// empty cells). A character missing from this table is a typo in BUNNY_ROWS: indexize()
// would still succeed and ship a shifted picture, so the painter throws instead.
const PIXEL_COLOR_INDEX = {
    '.': -1,
    1: 0,
    2: 1,
    3: 2,
    4: 3,
};

/**
 * Checks that every row of the bunny grid is the same width. A short row would
 * shift the picture and indexize() would still succeed, so fail here instead.
 */
function assertBunnyGrid() {
    for (let y = 1; y < BUNNY_ROWS.length; y++) {
        if (BUNNY_ROWS[y].length !== BUNNY_W) {
            throw new Error(`Bunny row ${y} is ${BUNNY_ROWS[y].length} pixels wide; expected ${BUNNY_W}.`);
        }
    }
}

/**
 * Paints the bunny into an offscreen canvas using only the first color row.
 * Pixels are written one by one (no smooth edges), so each color matches a
 * palette slot exactly when the sheet is indexized.
 *
 * @param {Color32[]} colors - The four base colors, outline through eye.
 * @returns {OffscreenCanvas}
 */
function buildBunnyCanvas(colors) {
    assertBunnyGrid();

    const canvas = new OffscreenCanvas(BUNNY_W, BUNNY_H);
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(BUNNY_W, BUNNY_H);
    const data = image.data;

    for (let y = 0; y < BUNNY_H; y++) {
        const row = BUNNY_ROWS[y];

        for (let x = 0; x < BUNNY_W; x++) {
            const colorIndex = PIXEL_COLOR_INDEX[row[x]];

            if (colorIndex === undefined) {
                throw new Error(`Bunny pixel "${row[x]}" is not "." or "1"-"4".`);
            }

            if (colorIndex < 0) {
                continue;
            }

            // Four numbers per pixel: red, green, blue, then opacity.
            const i = (y * BUNNY_W + x) * 4;
            const color = colors[colorIndex];

            data[i] = color.r;
            data[i + 1] = color.g;
            data[i + 2] = color.b;
            data[i + 3] = 255;
        }
    }

    ctx.putImageData(image, 0, 0);

    return canvas;
}

/**
 * Writes every recolor into the palette. Row 0 lands on COLOR_BASE. Each later
 * row starts COLOR_COUNT slots higher, which is exactly the paletteOffset the
 * draw loop adds for that variant.
 *
 * @param {Palette} palette
 */
function installVariantColors(palette) {
    const baseRow = VARIANT_TABLE[0];

    for (let variant = 0; variant < VARIANT_COUNT; variant++) {
        const row = VARIANT_TABLE[variant];

        // fillBlock walks the base row and writes transform()'s color into the
        // next slot. The transform ignores the base color and picks this row,
        // so all six blocks are the same length.
        palette.fillBlock(COLOR_BASE + variant * COLOR_COUNT, baseRow, (_base, index) => row[index]);
    }
}

/**
 * One picture, uploaded SHEET_COUNT times. Each SpriteSheet owns its own GPU
 * texture, so switching sheets is a real batch break, not a shared upload.
 *
 * @param {Palette} palette
 * @returns {Promise<SpriteSheet[]>}
 */
async function loadBunnySheets(palette) {
    const canvas = buildBunnyCanvas(VARIANT_TABLE[0]);
    const image = await canvasToImage(canvas);
    const sheets = [];

    for (let i = 0; i < SHEET_COUNT; i++) {
        const sheet = new SpriteSheet(image);

        sheet.indexize(palette);
        sheets.push(sheet);
    }

    return sheets;
}

function bunnyCountFromParams(params, fieldMax) {
    const raw = params.get(PARAM_BUNNIES);

    if (raw === null) {
        return SPAWN_BATCH;
    }

    if (!/^[1-9]\d*$/.test(raw)) {
        throw new Error(`?${PARAM_BUNNIES} must be a whole number from 1 to ${fieldMax}, not "${raw}".`);
    }

    const asked = Number(raw);

    if (!Number.isSafeInteger(asked) || asked > fieldMax) {
        throw new Error(`?${PARAM_BUNNIES}=${raw} is above the field limit of ${fieldMax}.`);
    }

    return asked;
}

/**
 * Copies one column into a longer typed array of the same kind.
 * A Float32Array cannot grow in place, so the old numbers are copied across.
 *
 * @param {Float32Array | Uint8Array} src
 * @param {number} next - New length. Must be greater than src.length.
 * @returns {Float32Array | Uint8Array}
 */
function copyField(src, next) {
    const dest = new src.constructor(next);

    dest.set(src);

    return dest;
}

/**
 * Bouncing-sprite stress test.
 *
 * The lesson is the bunny loop: position and speed live in flat typed arrays
 * (one long row of numbers per property). The hop only writes into slots that
 * already exist. On software, a spawn that does not fit replaces those columns
 * with a longer copy first.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    /** @type {ReturnType<typeof applyTheme> | null} */
    theme = null;

    /** @type {SpriteSheet[] | null} */
    sheets = null;

    // Source rectangle for the whole bunny picture. Created once, never replaced.
    srcRect = new Rect2i(0, 0, BUNNY_W, BUNNY_H);

    // Scratch points. drawSprite reads the numbers immediately, and pointerPosTo
    // writes into a vector we already own, so neither call needs a new one.
    drawPos = new Vector2i(0, 0);
    pointerScratch = new Vector2i(0, 0);

    // One column per property, MAX_WEBGPU_BUNNIES long, allocated here at construction.
    // Adding a bunny is "write the next free slot", not "make a new bunny".
    xs = new Float32Array(MAX_WEBGPU_BUNNIES);
    ys = new Float32Array(MAX_WEBGPU_BUNNIES);
    vxs = new Float32Array(MAX_WEBGPU_BUNNIES);
    vys = new Float32Array(MAX_WEBGPU_BUNNIES);
    variants = new Uint8Array(MAX_WEBGPU_BUNNIES);

    count = 0;

    // Right and bottom walls of the bunnies' area. The screen size does not change,
    // so init() stores them once and the hop loop only reads them.
    arenaRight = 0;
    arenaFloor = 0;

    splitSheets = false;

    // True only on the WebGPU backend, which owns the 8333-quad buffer. Software
    // draws every submitted sprite, so the cap must not apply there.
    capsSprites = false;

    // Set from the Add button during render(), consumed on the next update().
    // Update runs before render, so a click cannot spawn in the same pass.
    addPressed = false;

    spawnX = 0;
    spawnY = FOUNTAIN_Y;

    // Middle of the bunnies' area, worked out once in init() from the screen width.
    fountainX = 0;

    drawn = 0;
    dropped = 0;
    spriteBatches = 0;

    /**
     * Show the engine overlay immediately so FPS and Draw Calls are on screen.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            // Logical pixels. Providing displaySize makes the drawing buffer match it,
            // so the playfield is 640 by 400 and the page scales that picture up.
            displaySize: new Vector2i(640, 400),

            isOverlayVisibleAtStart: true,

            // Space spawns bunnies, and the browser scrolls the host page on Space.
            // Opt in so that press stays in the demo.
            isCapturingKeyboardScroll: true,

            // Adds the Prim / Spr row: the engine's own vertex use and overflow count.
            isOverlayRendererDiagnosticsBarEnabled: true,

            overlayStyle: {
                textPaletteIndex: UI_TEXT,
                barPaletteIndex: UI_PANEL,
            },
        };
    }

    /**
     * Builds the bunny picture, the recolor rows, and the sheet copies.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        this.palette = BT.paletteCreate(256);
        installVariantColors(this.palette);
        this.theme = applyTheme(this.palette);
        BT.paletteSet(this.palette);

        // Read once. displaySize clones, and this demo does not resize the grid.
        const display = BT.displaySize;
        const screenW = display.x;
        const screenH = display.y;

        this.arenaRight = screenW - BUNNY_W;
        this.arenaFloor = screenH - BUNNY_H;
        this.capsSprites = BT.activeBackend === 'webgpu';

        BT.randomSeed(RANDOM_SEED);

        // A failed upload throws out of init(). The engine reports that and does not
        // start the loop.
        this.sheets = await loadBunnySheets(this.palette);

        // The fountain sits in the middle of the bunnies' area, right of the panel.
        // `>> 1` halves a whole number, like Math.floor(n / 2).
        this.fountainX = (ARENA_LEFT + screenW - BUNNY_W) >> 1;

        this.applyUrlSwitches();

        return true;
    }

    update() {
        // Latches key presses and touches before we read them.
        ui.tick();

        // The hop writes into slots that already exist. On software, a batch that
        // does not fit copies the columns into a longer list first.
        this.stepBunnies();

        if (this.wantsSpawn()) {
            this.spawnBatch(SPAWN_BATCH);
        }
    }

    render() {
        BT.clear(this.theme.bg);
        this.drawBunnies();
        this.drawHud();
    }

    /**
     * Plain numbers for window.BT.testState() so a browser check can read the
     * counters without scraping the picture.
     *
     * @returns {object} Counts for the frame. The draw cap is always in force.
     */
    testState() {
        return {
            count: this.count,
            drawn: this.drawn,
            dropped: this.dropped,
            batches: this.spriteBatches,
            splitSheets: this.splitSheets,
            capsSprites: this.capsSprites,
        };
    }

    /**
     * Reads the optional ?bunnies=N and ?split URL switches, so a timing run can
     * start with a known crowd instead of a lot of clicking. Without ?bunnies the
     * demo starts with one ordinary batch. A present value must be digits from 1
     * to the active field limit (5000, not 5.5 or 1e3), or init() stops.
     */
    applyUrlSwitches() {
        const params = new URLSearchParams(window.location.search);

        this.splitSheets = params.has(PARAM_SPLIT);
        this.spawnX = this.fountainX;
        this.spawnY = FOUNTAIN_Y;
        this.spawnBatch(bunnyCountFromParams(params, this.fieldLimit()));
    }

    /**
     * Empties the field and restarts the random stream so the next batch matches
     * the one from a fresh load.
     */
    reset() {
        this.count = 0;
        this.drawn = 0;
        this.dropped = 0;
        this.spriteBatches = 0;

        BT.randomSeed(RANDOM_SEED);
    }

    /**
     * Moves every live bunny. Gravity, then bounce off the screen edges.
     * Nothing in this loop creates an object. That is the whole point.
     */
    stepBunnies() {
        const xs = this.xs;
        const ys = this.ys;
        const vxs = this.vxs;
        const vys = this.vys;
        const right = this.arenaRight;
        const floor = this.arenaFloor;
        const n = this.count;
        const random = BT.random;

        for (let i = 0; i < n; i++) {
            let vx = vxs[i];
            let vy = vys[i] + GRAVITY;
            let x = xs[i] + vx;
            let y = ys[i] + vy;

            // Past the side walls: pin to the wall and reverse sideways speed.
            // The left wall is the panel's right edge, not the screen edge.
            if (x < ARENA_LEFT) {
                x = ARENA_LEFT;
                vx = -vx;
            } else if (x > right) {
                x = right;
                vx = -vx;
            }

            // Past the ceiling: pin and head back down (positive Y).
            if (y < 0) {
                y = 0;
                vy = Math.abs(vy);
            } else if (y > floor) {
                y = floor;
                // Floor bounce flips a downward speed into a smaller upward one.
                vy = -Math.abs(vy) * RESTITUTION;

                if (vy > HOP_LIMIT && random.next() > 0.5) {
                    vy -= random.float(HOP_MIN, HOP_MAX);
                }
            }

            xs[i] = x;
            ys[i] = y;
            vxs[i] = vx;
            vys[i] = vy;
        }
    }

    /**
     * True when the pointer, the Add button, gamepad A / Space, or KeyN wants
     * another batch. Also chooses where that batch appears.
     *
     * @returns {boolean}
     */
    wantsSpawn() {
        const fromPointer = this.pointerWantsSpawn();
        const fromButton = this.addPressed;

        this.addPressed = false;

        // Face button A is also Space. KeyN is the on-screen Add button's key.
        // Both are held state, so they keep spawning while held.
        const fromHeld = BT.isDown(BT.BTN_A, 0) || BT.isKeyDown(KEY_ADD);

        if (!fromPointer && !fromButton && !fromHeld) {
            return false;
        }

        if (this.count >= this.fieldLimit()) {
            return false;
        }

        // Pointer spawn already stored a point. Everything else uses the fountain.
        if (!fromPointer) {
            this.spawnX = this.fountainX;
            this.spawnY = FOUNTAIN_Y;
        }

        return true;
    }

    /**
     * Hold on empty screen (not on a button) with the mouse or a finger.
     *
     * @returns {boolean}
     */
    pointerWantsSpawn() {
        for (let slot = 0; slot < POINTER_SLOT_COUNT; slot++) {
            if (!BT.isPointerActive(slot) || !BT.isDown(BT.BTN_POINTER_A, slot)) {
                continue;
            }

            // pointerPos() would clone a vector every call. pointerPosTo writes
            // into pointerScratch instead.
            BT.pointerPosTo(this.pointerScratch, slot);

            if (ui.overWidget(this.pointerScratch.x, this.pointerScratch.y)) {
                continue;
            }

            this.spawnX = this.pointerScratch.x;
            this.spawnY = this.pointerScratch.y;

            return true;
        }

        return false;
    }

    /**
     * Keeps the spawn point inside the bunnies' area, so a click in the corner (or
     * on the panel) still shows a bunny.
     */
    clampSpawn() {
        // Math.max keeps the higher number, Math.min the lower, so a click in the
        // panel or past the edge is pushed back inside the bunnies' area.
        this.spawnX = Math.min(this.arenaRight, Math.max(ARENA_LEFT, this.spawnX));
        this.spawnY = Math.min(this.arenaFloor, Math.max(0, this.spawnY));
    }

    /**
     * How many bunnies the lists may hold. WebGPU stays at the starting length.
     * Software may grow up to MAX_SOFTWARE_BUNNIES.
     *
     * @returns {number}
     */
    fieldLimit() {
        return this.capsSprites ? MAX_WEBGPU_BUNNIES : MAX_SOFTWARE_BUNNIES;
    }

    /**
     * Replaces each column with a longer copy. Doubles until `needed` fits, and
     * never passes MAX_SOFTWARE_BUNNIES. Called from spawn, not from the hop loop.
     *
     * @param {number} needed - Slots the next batch has to reach.
     */
    growField(needed) {
        let next = this.xs.length;

        while (next < needed) {
            next *= 2;
        }

        if (next > MAX_SOFTWARE_BUNNIES) {
            next = MAX_SOFTWARE_BUNNIES;
        }

        if (next <= this.xs.length) {
            return;
        }

        this.xs = copyField(this.xs, next);
        this.ys = copyField(this.ys, next);
        this.vxs = copyField(this.vxs, next);
        this.vys = copyField(this.vys, next);
        this.variants = copyField(this.variants, next);
    }

    /**
     * Writes the next `size` bunnies into the free slots at the end of the arrays.
     * Random velocities come from the seeded BT.random stream.
     *
     * @param {number} size - How many bunnies to add. Stops at the field limit.
     */
    spawnBatch(size) {
        this.clampSpawn();

        const end = Math.min(this.fieldLimit(), this.count + size);

        if (end > this.xs.length) {
            this.growField(end);
        }

        const random = BT.random;
        const xs = this.xs;
        const ys = this.ys;
        const vxs = this.vxs;
        const vys = this.vys;
        const variants = this.variants;
        const x = this.spawnX;
        const y = this.spawnY;
        let n = this.count;

        while (n < end) {
            xs[n] = x;
            ys[n] = y;
            vxs[n] = random.float(SPAWN_VX_MIN, SPAWN_VX_MAX);
            vys[n] = random.float(SPAWN_VY_MIN, SPAWN_VY_MAX);
            variants[n] = random.int(VARIANT_COUNT);

            n += 1;
        }

        this.count = n;
    }

    /**
     * On WebGPU, submits at most BUNNY_DRAW_CAP bunnies and counts the rest as
     * dropped, so the sprite buffer does not warn and the panel letters keep
     * their reserve. Software has no vertex cap, so every live bunny is submitted
     * and Dropped stays 0. render() runs only after init() stored the sheets.
     */
    drawBunnies() {
        const limit = this.capsSprites ? Math.min(this.count, BUNNY_DRAW_CAP) : this.count;

        this.drawn = limit;
        this.dropped = this.count - limit;

        if (limit === 0) {
            this.spriteBatches = 0;

            return;
        }

        const sheets = this.sheets;
        const xs = this.xs;
        const ys = this.ys;
        const variants = this.variants;
        const pos = this.drawPos;
        const src = this.srcRect;

        // One sheet: span is 1, and the remainder of any count divided by 1 is 0,
        // so every bunny stays on texture 0 (one batch). Split mode uses all four
        // copies in turn (0, 1, 2, 3, 0, ...). Each change of sheet is another batch.
        const sheetSpan = this.splitSheets ? SHEET_COUNT : 1;
        let batches = 0;
        let lastSheet = -1;

        for (let i = 0; i < limit; i++) {
            const sheetIndex = i % sheetSpan;

            if (sheetIndex !== lastSheet) {
                batches += 1;
                lastSheet = sheetIndex;
            }

            // `| 0` drops the fraction on a positive number, the way Math.floor
            // would, without a function call. Sprites want whole pixels.
            pos.x = xs[i] | 0;
            pos.y = ys[i] | 0;

            // paletteOffset slides the stored 1-4 colors onto this bunny's row.
            BT.drawSprite(sheets[sheetIndex], src, pos, variants[i] * COLOR_COUNT);
        }

        this.spriteBatches = batches;
    }

    /**
     * Panel: counts and the buttons. update() and render() stay on the engine overlay.
     */
    drawHud() {
        // Fixed width and position, so ARENA_LEFT always matches the panel's right edge.
        ui.begin(UI_ANCHORS.TOP_LEFT, { y: PANEL_Y, width: PANEL_W, margin: PANEL_MARGIN, kvCols: 8 });
        ui.panel('Bunnymark');
        ui.kv('Bunnies', this.count);
        ui.kv('Drawn', this.drawn);
        ui.kv('Dropped', this.dropped);
        ui.kv('Batches', this.spriteBatches);

        if (this.capsSprites) {
            ui.kv('Cap', SPRITE_QUAD_CAP);
        }

        ui.label(this.hudNote(), { color: this.dropped > 0 ? 'warm' : 'dim' });

        // The Batches row above already says which mode is on, so the checkbox needs no
        // extra label. A small gap keeps its box clear of the text and the button.
        ui.spacer(2);
        this.splitSheets = ui.checkbox('Split sheets (S)', this.splitSheets, { key: 'KeyS' });
        ui.spacer(4);

        if (ui.button('Add 100 (N)', { key: KEY_ADD })) {
            this.addPressed = true;
        }

        if (ui.button('Reset (R)', { key: 'KeyR' })) {
            this.reset();
        }

        ui.end();
    }

    /**
     * One short line under the numbers. Warm when bunnies are being skipped.
     *
     * @returns {string}
     */
    hudNote() {
        if (this.count >= this.fieldLimit()) {
            return 'Field is full';
        }

        if (!this.capsSprites) {
            return 'Software: no cap';
        }

        if (this.dropped > 0) {
            return 'Over cap: skipped';
        }

        return 'Hold, Space or A';
    }
}

bootstrap(Demo);
