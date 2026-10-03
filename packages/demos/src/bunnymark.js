// Bunnymark - how many bouncing sprites the engine can move before a frame slips.
// @description Spawn bouncing bunnies until the sprite buffer fills, and see which quads the engine drops.
//
// What you will see:
//   - An original pixel bunny (not the Pixi.js rabbit) in several colors
//   - Click, hold, or a gamepad button adds them in batches
//   - A counter for how many were drawn and how many the sprite buffer cannot take
//   - An optional mode that alternates several copies of the picture so batches break
//
// Prerequisites:
//   Basics        https://demos.blit386.dev/basics
//   Sprites       https://demos.blit386.dev/sprites
//
// Guide: https://blit386.dev/docs/api/rendering
// Live version: https://demos.blit386.dev/bunnymark
//
// The engine overlay (press ` or the bottom-left corner) shows Present FPS and Draw Calls.
// This demo turns that overlay on at startup. Draw Calls counts each BT.drawSprite, so it
// climbs with the bunny count either way. The Batches row on the panel is the GPU number,
// worked out here by following the sprite pipeline's rule (a new batch whenever the sheet
// changes), because the engine does not report it yet (BT-114). One sheet stays one batch,
// and alternating sheets breaks that batch on every bunny. The overlay's
// bottom row (Prim / Spr) is the engine's own vertex count and overflow ("ov") for the frame,
// so you can check this panel's Dropped number against the engine itself.
//
// For repeatable timing runs, two URL switches skip the clicking:
//   ?bunnies=5000   start with that many bunnies instead of one batch
//   ?split          start with Split sheets already on
// Add &backend=software to the same URL to time the software renderer instead.

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

// Hard stop so a held button cannot grow the lists forever. High enough to walk
// past the sprite cap and show dropped quads, low enough to stay a fixed allocation.
const MAX_BUNNIES = 16384;

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
// fits the widest row: 18 letters of 6 pixels, plus 5 pixels of padding each side.
const PANEL_W = 118;

// Gap between the screen edge and the panel, and the panel's top edge. The top edge
// sits below the engine overlay so the two never overlap.
const PANEL_MARGIN = 4;
const PANEL_Y = 58;

// The bunnies' left wall: just right of the panel. Everything left of it belongs to the HUD.
const ARENA_LEFT = PANEL_MARGIN + PANEL_W + PANEL_MARGIN;

// URL switches for timing runs (see the header comment). ?bunnies is clamped to MAX_BUNNIES.
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

/**
 * Which of the four bunny colors a grid character stands for.
 * -1 means "skip this pixel" (the '.' empty cells).
 *
 * @param {string} ch
 * @returns {number}
 */
function colorIndexForPixel(ch) {
    if (ch === '.') {
        return -1;
    }

    if (ch === '1') {
        return 0;
    }

    if (ch === '2') {
        return 1;
    }

    if (ch === '3') {
        return 2;
    }

    if (ch === '4') {
        return 3;
    }

    throw new Error(`Bunny pixel "${ch}" is not "." or "1"-"4".`);
}

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
            const colorIndex = colorIndexForPixel(row[x]);

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

/**
 * Milliseconds with two decimals, for the panel. Built in render(), not in the
 * bunny loop: a few HUD strings per frame are fine, a string per bunny is not.
 *
 * @param {number} ms
 * @returns {string}
 */
function formatMs(ms) {
    return `${ms.toFixed(2)} ms`;
}

/**
 * Bouncing-sprite stress test.
 *
 * The lesson is the bunny loop: position and speed live in flat typed arrays
 * (one long row of numbers per property), and update() only writes into slots
 * that already exist. No new bunny object, no new list, no new vector, per frame.
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

    // One column per property, MAX_BUNNIES long, allocated here at construction.
    // Adding a bunny is "write the next free slot", not "make a new bunny".
    xs = new Float32Array(MAX_BUNNIES);
    ys = new Float32Array(MAX_BUNNIES);
    vxs = new Float32Array(MAX_BUNNIES);
    vys = new Float32Array(MAX_BUNNIES);
    variants = new Uint8Array(MAX_BUNNIES);

    count = 0;

    // Screen edges cached from the one BT.displaySize read in init(). That getter
    // clones a vector every call, so the hot loop must not touch it.
    screenW = 0;
    screenH = 0;

    // True on the WebGPU backend, which is the one with the vertex cap. Software
    // draws every submitted sprite and reports no dropped quads.
    limitsSprites = false;

    splitSheets = false;

    // Set from the Add button during render(), consumed on the next update().
    // Update runs before render, so a click cannot spawn in the same pass.
    addPressed = false;

    spawnX = 0;
    spawnY = FOUNTAIN_Y;

    // Middle of the bunnies' area, worked out once in init() from the screen width.
    fountainX = 0;

    // Timers. pending* collects every update() since the last render(); the
    // shown values stay put on a frame that ran no update (common at 120 Hz).
    pendingUpdateMs = 0;
    pendingUpdateSteps = 0;
    updateMs = 0;
    updateSteps = 0;
    renderMs = 0;

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
            isOverlayVisibleAtStart: true,
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

        this.screenW = display.x;
        this.screenH = display.y;
        this.limitsSprites = BT.activeBackend === 'webgpu';

        BT.randomSeed(RANDOM_SEED);

        try {
            this.sheets = await loadBunnySheets(this.palette);
        } catch (error) {
            console.error('[Bunnymark] Failed to build the bunny sheet:', error);

            return false;
        }

        // The fountain sits in the middle of the bunnies' area, right of the panel.
        // `>> 1` halves a whole number, like Math.floor(n / 2).
        this.fountainX = (ARENA_LEFT + this.screenW - BUNNY_W) >> 1;

        this.applyUrlSwitches();

        return true;
    }

    update() {
        // Latches key presses and touches before we read them.
        ui.tick();

        const start = performance.now();

        // Teaching point: this call, and the spawn that may follow, only write
        // numbers into the arrays above. They do not allocate.
        this.stepBunnies();

        if (this.wantsSpawn()) {
            this.spawnBatch(SPAWN_BATCH);
        }

        this.pendingUpdateMs += performance.now() - start;
        this.pendingUpdateSteps += 1;
    }

    render() {
        const drawStart = performance.now();

        BT.clear(this.theme.bg);
        this.rememberUpdateTime();
        this.drawBunnies();
        this.renderMs = performance.now() - drawStart;
        this.drawHud();
    }

    /**
     * Plain numbers for window.BT.testState() so a browser check can read the
     * counters without scraping the picture.
     *
     * @returns {object} Counts, timings, and whether the WebGPU cap is in force.
     */
    testState() {
        return {
            count: this.count,
            drawn: this.drawn,
            dropped: this.dropped,
            batches: this.spriteBatches,
            updateMs: this.updateMs,
            renderMs: this.renderMs,
            splitSheets: this.splitSheets,
            limitsSprites: this.limitsSprites,
        };
    }

    /**
     * Reads the optional ?bunnies=N and ?split URL switches, so a timing run can
     * start with a known crowd instead of a lot of clicking. Without ?bunnies the
     * demo starts with one ordinary batch.
     */
    applyUrlSwitches() {
        const params = new URLSearchParams(window.location.search);

        // The URL is typed by a person, so check it: Number('abc') is NaN, and a
        // negative or huge count must not reach the arrays.
        const asked = Number(params.get(PARAM_BUNNIES));
        const start = Number.isFinite(asked) && asked > 0 ? Math.min(Math.floor(asked), MAX_BUNNIES) : SPAWN_BATCH;

        this.splitSheets = params.has(PARAM_SPLIT);
        this.spawnX = this.fountainX;
        this.spawnY = FOUNTAIN_Y;
        this.spawnBatch(start);
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
        this.pendingUpdateMs = 0;
        this.pendingUpdateSteps = 0;
        this.updateMs = 0;
        this.updateSteps = 0;
        this.renderMs = 0;
        BT.randomSeed(RANDOM_SEED);
    }

    /**
     * Keeps the last update timing when this frame did not run update() at all.
     */
    rememberUpdateTime() {
        if (this.pendingUpdateSteps === 0) {
            return;
        }

        this.updateMs = this.pendingUpdateMs;
        this.updateSteps = this.pendingUpdateSteps;
        this.pendingUpdateMs = 0;
        this.pendingUpdateSteps = 0;
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
        const right = this.screenW - BUNNY_W;
        const floor = this.screenH - BUNNY_H;
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

        const fromPad = BT.isDown(BT.BTN_A, 0) || BT.isKeyDown(KEY_ADD);

        if (!fromPointer && !fromButton && !fromPad) {
            return false;
        }

        if (this.count >= MAX_BUNNIES) {
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
        const right = this.screenW - BUNNY_W;
        const floor = this.screenH - BUNNY_H;

        if (this.spawnX < ARENA_LEFT) {
            this.spawnX = ARENA_LEFT;
        } else if (this.spawnX > right) {
            this.spawnX = right;
        }

        if (this.spawnY < 0) {
            this.spawnY = 0;
        } else if (this.spawnY > floor) {
            this.spawnY = floor;
        }
    }

    /**
     * Writes the next `size` bunnies into the free slots at the end of the arrays.
     * Random velocities come from the seeded BT.random stream.
     *
     * @param {number} size - How many bunnies to add. Stops early at MAX_BUNNIES.
     */
    spawnBatch(size) {
        this.clampSpawn();

        const random = BT.random;
        const xs = this.xs;
        const ys = this.ys;
        const vxs = this.vxs;
        const vys = this.vys;
        const variants = this.variants;
        const x = this.spawnX;
        const y = this.spawnY;
        let n = this.count;
        const end = Math.min(MAX_BUNNIES, n + size);

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
     * Draws as many bunnies as the backend will actually keep. On WebGPU that
     * stops at BUNNY_DRAW_CAP so we never trip the engine's per-quad warning.
     * The leftovers are counted as dropped instead of pretending they appeared.
     */
    drawBunnies() {
        const sheets = this.sheets;
        const limit = this.limitsSprites ? Math.min(this.count, BUNNY_DRAW_CAP) : this.count;

        this.drawn = limit;
        this.dropped = this.count - limit;

        if (!sheets || limit === 0) {
            this.spriteBatches = 0;

            return;
        }

        const xs = this.xs;
        const ys = this.ys;
        const variants = this.variants;
        const pos = this.drawPos;
        const src = this.srcRect;
        const split = this.splitSheets;
        let batches = 0;
        let lastSheet = -1;

        for (let i = 0; i < limit; i++) {
            // One sheet: every bunny stays on texture 0, so the pipeline never
            // flushes mid-loop (one batch). Split mode walks the copies in turn
            // (0, 1, 2, 3, 0, ...). Each switch is another batch.
            const sheetIndex = split ? i % SHEET_COUNT : 0;

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
     * Panel: counts, timings, and the buttons. Drawn after the timer so Render
     * is the bunny draw, not this text. The overlay's own render() line includes
     * both.
     */
    drawHud() {
        const updateLabel =
            this.updateSteps > 1 ? `${formatMs(this.updateMs)} x${this.updateSteps}` : formatMs(this.updateMs);

        // Fixed width and position, so ARENA_LEFT always matches the panel's right edge.
        ui.begin(UI_ANCHORS.TOP_LEFT, { y: PANEL_Y, width: PANEL_W, margin: PANEL_MARGIN, kvCols: 8 });
        ui.panel('Bunnymark');
        ui.kv('Bunnies', this.count);
        ui.kv('Drawn', this.drawn);
        ui.kv('Dropped', this.dropped);
        ui.kv('Update', updateLabel);
        ui.kv('Render', formatMs(this.renderMs));
        ui.kv('Batches', this.spriteBatches);
        ui.kv('Cap', SPRITE_QUAD_CAP);
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
        if (this.count >= MAX_BUNNIES) {
            return 'Field is full';
        }

        if (!this.limitsSprites) {
            return 'Software: no cap';
        }

        if (this.dropped > 0) {
            return 'Over cap: skipped';
        }

        return 'Hold, Space or A';
    }
}

bootstrap(Demo);
