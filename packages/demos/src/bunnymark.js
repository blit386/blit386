/*

Bunnymark: how many bouncing sprites the engine can move before a frame slips.
@description Spawn bouncing bunnies by the hundred and count the ones held back by the WebGPU sprite cap.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Sprites: https://demos.blit386.dev/sprites

Live version: https://demos.blit386.dev/bunnymark

Guides:
  - Overlay: https://blit386.dev/docs/guides/overlay#optional-bands
  - Input: https://blit386.dev/docs/guides/input#pointer-slot-model
  - Random: https://blit386.dev/docs/guides/random#deterministic-by-default

Reference:
  - Rendering: https://blit386.dev/docs/api/rendering#drawing
  - Overlay: https://blit386.dev/docs/api/overlay#renderer-diagnostics-optional
  - Palette: https://blit386.dev/docs/api/palette#fill-a-block-of-slots
  - Core: https://blit386.dev/docs/api/core#test-state-for-agent-play-testing

---

WHAT YOU WILL SEE
-----------------

A 640x400 field of 16x16 pixel bunnies in six color variants, bouncing under gravity. The
art is original (not the side-view rabbit from the Pixi.js bunnymark). One batch of 100
spawns at startup from a fountain point in the middle of the field, just under the engine
overlay. Each bunny falls, bounces off the floor with a little energy lost, and gets a
fresh random hop when it lands too softly, so the pile never settles.

The engine overlay is visible from the first frame with its timing chart and the renderer
diagnostics row (Prim / Spr) switched on. A fixed-width "Bunnymark" panel sits top-left,
directly under the overlay bands, with Bunnies, Drawn, Dropped, Batches, and (on WebGPU)
Cap rows, a one-line status note, a "Split sheets (S)" checkbox, and "Add 100 (N)" and
"Reset (R)" buttons. Bunnies bounce behind the panel too.

WHAT YOU WILL LEARN
-------------------

- Structure-of-arrays storage: position, velocity, and variant live in flat typed arrays
  (Float32Array, Uint8Array), one row of numbers per property, allocated once in init().
  Spawning writes the next free slot, and neither it nor the hop loop allocates.
- BT.drawSprite(sheet, srcRect, pos, paletteOffset) with a reused Rect2i and Vector2i, and
  paletteOffset selecting one of six recolors written with palette.fillBlock().
- Reading the overlay: Draw Calls counts every demo-issued draw call, so each
  BT.drawSprite adds one. The renderer diagnostics row shows the sprite pipeline's vertex
  use and its overflow count ("ov").
- Pointer slots: BT.isPointerActive(slot), BT.isDown(BT.BTN_POINTER_A, slot), and the
  allocation-free BT.pointerPosTo(vec, slot) across all four slots (0 mouse, 1-3 touch).
- Held input as a spawn trigger: BT.isDown(BT.BTN_A, 0) (Space or KeyB on the keyboard, A
  on a gamepad), beside a one-tap button with its own { key } binding.
- BT.randomSeed() for a repeatable spawn stream, and a testState() hook that exposes the
  counters as JSON for scripted runs.

WHAT THE PANEL ROWS MEAN
------------------------

Bunnies is the live count. Drawn is how many BT.drawSprite calls this frame submitted;
Dropped is the rest - bunnies this demo chose not to submit. Batches follows the sprite
pipeline's rule (a new batch whenever the sheet changes), computed here because the engine
does not report that count yet (BT-114): one sheet stays one batch, and Split sheets
alternates four copies of the same picture so every bunny breaks the batch.

Cap is 8333. The WebGPU sprite pipeline keeps 50,000 vertices for one frame, and each
sprite is one quad of two triangles, so 6 vertices: floor(50000 / 6) is 8333. The next
quad does not fit, so the pipeline drops it and counts it in "ov". This demo stops
submitting bunnies 512 quads earlier, because the panel letters are sprites in that same
buffer. That reserve keeps the readout from being the thing that gets dropped; "ov" stays
0 while the reserve holds.

The software renderer queues every sprite and has no vertex buffer of this size, so with
?backend=software this demo submits every bunny: Dropped stays 0 and the Cap row is
hidden.

URL SWITCHES
------------

For repeatable timing runs, two URL switches skip the clicking:

- ?bunnies=5000 starts with that many bunnies instead of one batch. The value must be a
  whole number from 1 to the field limit (16384 on WebGPU, 262144 on software); anything
  else throws out of init() and the demo does not start.
- ?split starts with Split sheets already on.
- Add &backend=software to time the software renderer.

TRY THIS
--------

- Click or touch and hold on empty field (not on the panel) to pour bunnies in at the
  pointer, 100 per tick. All four pointer slots work, so several fingers pour at once.
- Hold Space, KeyB, or gamepad button A to pour from the fountain point at the top middle.
- Tap "Add 100 (N)" or press N for one batch at the fountain.
- Tick "Split sheets (S)" and watch Batches jump from 1 to the drawn count.
- Keep adding until Dropped turns the status note warm ("Over cap: skipped") and "ov" on
  the overlay stays 0.
- Tap "Reset (R)" to empty the field and restart the seeded random stream, so the next
  batch hops exactly like a fresh load.

*/

import { bootstrap, BT, Color32, Rect2i, SpriteSheet, Vector2i } from 'blit386';

import { canvasToImage } from './shared/canvas-sprites.js';
import { applyTheme, defaultThemeSlot, ui, UI_ANCHORS } from './shared/ui.js';

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

// How many bunnies one click or one held tick adds. A batch is a handful at once, the way
// the classic stress test dumps sprites in instead of one at a time.
const SPAWN_BATCH = 100;

// Field limit on WebGPU. High enough to walk past the sprite cap and show dropped quads.
const MAX_WEBGPU_BUNNIES = 16384;

// Field limit on software, which has no sprite cap. 16384 doubled four times. A held
// button still has to stop somewhere.
const MAX_SOFTWARE_BUNNIES = 262144;

// SpritePipeline keeps MAX_VERTICES vertices and spends 6 of them on each quad (two
// triangles). 50000 / 6 = 8333 sprites, then further quads are dropped. Manual-sync
// hazard: packages/blit386/src/render/SpritePipeline.ts (MAX_VERTICES and the `6 *
// VALUES_PER_VERTEX` quad size). Change both together.
const SPRITE_VERTEX_CAP = 50000;
const VERTICES_PER_QUAD = 6;
const SPRITE_QUAD_CAP = Math.floor(SPRITE_VERTEX_CAP / VERTICES_PER_QUAD);

// The on-screen panel is drawn with the system font, and those letters share the same
// sprite buffer as the bunnies. Leave room so the readout is not the thing that gets
// dropped. 512 quads is a generous budget for this panel's letters.
const HUD_QUAD_RESERVE = 512;
const BUNNY_DRAW_CAP = SPRITE_QUAD_CAP - HUD_QUAD_RESERVE;

// First palette slot of the bunny colors. Slot 0 stays transparent (empty pixels). The
// shared UI theme occupies 240-251, far above these blocks.
const COLOR_BASE = 1;

// How many colors one bunny uses: outline, fur, inner ear / belly, eye.
const COLOR_COUNT = 4;

// Separate copies of the same picture. Alternating them forces a new GPU batch on every
// bunny, because the sprite pipeline flushes when the texture changes.
const SHEET_COUNT = 4;

// The engine has four pointer slots: 0 is the mouse, 1-3 are touches.
const POINTER_SLOT_COUNT = 4;

// The on-screen Add button's key. The kit fires the button once per tap, so N adds
// exactly one batch; holding Space / KeyB (face button A) is the pouring input.
const KEY_ADD = 'KeyN';

// Same seed every load so the first hops repeat. BT.randomSeed in init() wins over a
// ?seed= URL on purpose: this demo wants one known stream.
const RANDOM_SEED = 553;

// Pixels added to downward speed each tick. Positive Y points down the screen, so a
// positive gravity pulls bunnies toward the floor.
const GRAVITY = 0.4;

// How much upward speed survives a floor hit. 0.75 means each bounce is a bit shorter
// than the last, like a ball that does not quite return to your hand.
const RESTITUTION = 0.75;

// A landing softer than this (upward speed, so negative) gets a fresh hop, or the pile
// would eventually sit still and stop looking like a stress test.
const HOP_LIMIT = -1.5;
const HOP_MIN = 2;
const HOP_MAX = 6;

// Sideways speed and the upward kick (negative Y) given to a new bunny.
const SPAWN_VX_MIN = -4;
const SPAWN_VX_MAX = 4;
const SPAWN_VY_MIN = -8;
const SPAWN_VY_MAX = -2;

// Overlay bands this demo turns on: title, timing chart, Present row, timing text, and
// the sprite diagnostics row. Heights match the engine (OVERLAY_BAR_HEIGHT,
// OVERLAY_ROW_GAP_PX, DEFAULT_TIMING_CHART_HEIGHT in packages/blit386/src/overlay). Copy
// a change here or the panel slides under the chart.
const OVERLAY_BAR_H = 13;
const OVERLAY_ROW_GAP = 1;
const TIMING_CHART_H = 22;
const OVERLAY_TEXT_ROWS = 4;

// Each text row is a bar plus the gap after it. The chart band has no gap of its own in
// that count: four gaps sit between the five bands, and the stack ends on the diagnostics
// bar.
const OVERLAY_BOTTOM = OVERLAY_TEXT_ROWS * (OVERLAY_BAR_H + OVERLAY_ROW_GAP) + TIMING_CHART_H;

// First pixel under those bars. Bunnies bounce here, and a fountain batch appears here.
const ARENA_TOP = OVERLAY_BOTTOM + 1;

// The panel has a fixed width. 118 pixels fits the widest row, the Split sheets checkbox:
// a 10-pixel box, 16 letters of 6 pixels, and the padding around them. Sprites draw on
// top of panels, so a bunny on the left can cover the numbers.
const PANEL_W = 118;

// Gap between the screen edge and the panel, and the panel's top edge. The top edge sits
// below the engine overlay, including the timing chart, so the two never overlap.
const PANEL_MARGIN = 4;
const PANEL_CLEARANCE = 3;
const PANEL_Y = OVERLAY_BOTTOM + PANEL_CLEARANCE;

// URL switches for timing runs (see the header comment). A present ?bunnies must be a
// whole number from 1 to the field limit: MAX_WEBGPU_BUNNIES on WebGPU,
// MAX_SOFTWARE_BUNNIES on software. A missing one means "start with one batch".
const PARAM_BUNNIES = 'bunnies';
const PARAM_SPLIT = 'split';

// Six recolors of the same four slots. Order inside each row is outline, fur, inner ear /
// belly, eye. paletteOffset selects a row at draw time.
const VARIANT_TABLE = [
    [rgb(42, 26, 18), rgb(232, 192, 144), rgb(240, 160, 176), rgb(26, 18, 12)],
    [rgb(90, 90, 96), rgb(244, 244, 248), rgb(245, 190, 200), rgb(40, 40, 48)],
    [rgb(40, 40, 44), rgb(140, 140, 148), rgb(196, 140, 156), rgb(20, 20, 24)],
    [rgb(12, 12, 16), rgb(48, 44, 52), rgb(220, 120, 150), rgb(230, 230, 236)],
    [rgb(90, 42, 16), rgb(230, 140, 48), rgb(245, 196, 170), rgb(40, 20, 12)],
    [rgb(24, 40, 64), rgb(150, 186, 214), rgb(214, 230, 242), rgb(12, 20, 36)],
];

const VARIANT_COUNT = VARIANT_TABLE.length;

// Overlay colors. configure() runs before applyTheme(), so these are the slots the theme
// will fill, not this.theme, which does not exist yet.
const UI_TEXT = defaultThemeSlot('text');
const UI_PANEL = defaultThemeSlot('panel');

// One opaque color. Alpha 255 so indexize() can match it exactly.
function rgb(r, g, b) {
    return new Color32(r, g, b, 255);
}

// The grid characters in color order. A character's position here, minus one, is its
// color: '.' becomes -1 ("skip this pixel"), '1' becomes color 0, '4' color 3.
const PIXEL_CHARS = '.1234';

// Paints the bunny into an offscreen canvas using only the first color row (`colors` is
// the four base colors, outline through eye). Pixels are written one by one (no smooth
// edges), so each color matches a palette slot exactly when the sheet is indexized.
function buildBunnyCanvas(colors) {
    const canvas = new OffscreenCanvas(BUNNY_W, BUNNY_H);
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(BUNNY_W, BUNNY_H);
    const data = image.data;

    for (let y = 0; y < BUNNY_H; y++) {
        const row = BUNNY_ROWS[y];

        // A short row or a stray character is a typo in BUNNY_ROWS. indexize() would
        // still succeed and ship a shifted picture, so the painter throws instead.
        if (row.length !== BUNNY_W) {
            throw new Error(`Bunny row ${y} is ${row.length} pixels wide; expected ${BUNNY_W}.`);
        }

        for (let x = 0; x < BUNNY_W; x++) {
            const colorIndex = PIXEL_CHARS.indexOf(row[x]) - 1;

            if (colorIndex < -1) {
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

// Writes every recolor into the palette. Row 0 lands on COLOR_BASE. Each later row starts
// COLOR_COUNT slots higher, which is exactly the paletteOffset the draw loop adds for
// that variant.
function installVariantColors(palette) {
    const baseRow = VARIANT_TABLE[0];

    for (let variant = 0; variant < VARIANT_COUNT; variant++) {
        const row = VARIANT_TABLE[variant];

        // fillBlock walks the base row and writes transform()'s color into the next slot.
        // The transform ignores the base color and picks this row, so all six blocks are
        // the same length.
        palette.fillBlock(COLOR_BASE + variant * COLOR_COUNT, baseRow, (_base, index) => row[index]);
    }
}

// One picture, uploaded SHEET_COUNT times. Each SpriteSheet owns its own GPU texture, so
// switching sheets is a real batch break, not a shared upload.
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

// Reads the ?bunnies switch. A missing value means one batch. A present value must be a
// string of digits from 1 to `fieldMax`; anything else throws so init() stops.
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

// Bouncing-sprite stress test.
//
// The lesson is the bunny loop: position and speed live in flat typed arrays (one long
// row of numbers per property). init() sizes them once for the backend's field limit, so
// spawning and the hop only write into slots that already exist.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    /** @type {ReturnType<typeof applyTheme> | null} */
    theme = null;

    /** @type {SpriteSheet[] | null} */
    sheets = null;

    // Source rectangle for the whole bunny picture. Created once, never replaced.
    srcRect = new Rect2i(0, 0, BUNNY_W, BUNNY_H);

    // Scratch points. drawSprite reads the numbers immediately, and pointerPosTo writes
    // into a vector the demo already owns, so neither call needs a new one.
    drawPos = new Vector2i(0, 0);
    pointerScratch = new Vector2i(0, 0);

    // One column per property. init() replaces these empty ones with arrays as long as
    // the field limit, once the backend is known. Adding a bunny is "write the next free
    // slot", not "make a new bunny".
    xs = new Float32Array(0);
    ys = new Float32Array(0);
    vxs = new Float32Array(0);
    vys = new Float32Array(0);
    variants = new Uint8Array(0);

    // How many slots of those arrays hold a live bunny.
    count = 0;

    // Right and bottom walls of the bunnies' area. The screen size does not change, so
    // init() stores them once and the hop loop only reads them.
    arenaRight = 0;
    arenaFloor = 0;

    // Mirrors the Split sheets checkbox; read by drawBunnies() to pick a sheet per bunny.
    splitSheets = false;

    // True only on the WebGPU backend, which owns the 8333-quad buffer. Software draws
    // every submitted sprite, so the cap must not apply there.
    capsSprites = false;

    // Set from the Add button during render(), consumed on the next update(). Update runs
    // before render, so a click cannot spawn in the same pass.
    addPressed = false;

    // Where the next batch appears: the pointer position, or the fountain point.
    spawnX = 0;
    spawnY = ARENA_TOP;

    // Middle of the bunnies' area, worked out once in init() from the screen width.
    fountainX = 0;

    // Per-frame counters shown on the panel and in testState().
    drawn = 0;
    dropped = 0;
    spriteBatches = 0;

    // Shows the engine overlay immediately so FPS and Draw Calls are on screen.
    configure() {
        return {
            // Logical pixels. Providing displaySize makes the drawing buffer match it, so
            // the playfield is 640 by 400 and the page scales that picture up.
            displaySize: new Vector2i(640, 400),

            isOverlayVisibleAtStart: true,

            // Space spawns bunnies, and the browser scrolls the host page on Space. Opt
            // in so that press stays in the demo.
            isCapturingKeyboardScroll: true,

            // Adds the Prim / Spr row: the engine's own vertex use and overflow count.
            isOverlayRendererDiagnosticsBarEnabled: true,

            // Scrolling update() and render() bars between the title and Present. The
            // default band is 22 px, which is what OVERLAY_BOTTOM counts on.
            isOverlayTimingChartEnabled: true,

            overlayStyle: {
                textPaletteIndex: UI_TEXT,
                barPaletteIndex: UI_PANEL,
            },
        };
    }

    // Builds the bunny picture, the recolor rows, and the sheet copies.
    async init() {
        // Bunny colors first, then the kit's theme colors, then hand the palette over.
        this.palette = BT.paletteCreate(256);
        installVariantColors(this.palette);
        this.theme = applyTheme(this.palette);
        BT.paletteSet(this.palette);

        // Read once. displaySize clones, and this demo does not resize the grid.
        const display = BT.displaySize;
        const screenW = display.x;
        const screenH = display.y;

        // Sides and floor are the canvas. The ceiling is ARENA_TOP, under the chart.
        this.arenaRight = screenW - BUNNY_W;
        this.arenaFloor = screenH - BUNNY_H;
        this.capsSprites = BT.activeBackend === 'webgpu';

        // Every column at full length now, so no spawn ever has to grow them.
        const limit = this.fieldLimit();

        this.xs = new Float32Array(limit);
        this.ys = new Float32Array(limit);
        this.vxs = new Float32Array(limit);
        this.vys = new Float32Array(limit);
        this.variants = new Uint8Array(limit);

        BT.randomSeed(RANDOM_SEED);

        // A failed upload throws out of init(). The engine reports that and does not
        // start the loop.
        this.sheets = await loadBunnySheets(this.palette);

        // The fountain sits in the middle of the canvas. `>> 1` halves a whole number,
        // like Math.floor(n / 2). Bunnies bounce off the canvas left edge.
        this.fountainX = (screenW - BUNNY_W) >> 1;

        this.applyUrlSwitches();

        return true;
    }

    // Fixed-rate tick: moves every bunny, then adds a batch if any input asks for one.
    update() {
        // Latches key presses and touches before they are read.
        ui.tick();

        // The hop writes into slots that already exist.
        this.stepBunnies();

        if (this.wantsSpawn()) {
            this.spawnBatch(SPAWN_BATCH);
        }
    }

    // Draws the field, then the panel on top, once per screen refresh.
    render() {
        BT.clear(this.theme.bg);
        this.drawBunnies();
        this.drawHud();
    }

    // Plain numbers for window.BT.testState() so a browser check can read the counters
    // without scraping the picture. WebGPU drops past the bunny draw cap; software draws
    // every live bunny.
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

    // Reads the optional ?bunnies=N and ?split URL switches, so a timing run can start
    // with a known crowd instead of a lot of clicking. Without ?bunnies the demo starts
    // with one ordinary batch. A present value must be digits from 1 to the active field
    // limit (5000, not 5.5 or 1e3), or init() stops.
    applyUrlSwitches() {
        const params = new URLSearchParams(window.location.search);

        this.splitSheets = params.has(PARAM_SPLIT);
        this.spawnX = this.fountainX;
        this.spawnY = ARENA_TOP;
        this.spawnBatch(bunnyCountFromParams(params, this.fieldLimit()));
    }

    // Empties the field and restarts the random stream so the next batch matches the one
    // from a fresh load.
    reset() {
        this.count = 0;
        this.drawn = 0;
        this.dropped = 0;
        this.spriteBatches = 0;

        BT.randomSeed(RANDOM_SEED);
    }

    // Moves every live bunny. Gravity, then bounce off the canvas sides, the overlay
    // ceiling, and the floor. Nothing in this loop creates an object. That is the whole
    // point.
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

            // Past the side walls: pin to the wall and reverse sideways speed. The left
            // wall is the canvas edge.
            if (x < 0) {
                x = 0;
                vx = -vx;
            } else if (x > right) {
                x = right;
                vx = -vx;
            }

            // Past the ceiling: pin and head back down (positive Y). The ceiling is the
            // overlay, not the canvas top, so bunnies stay under the timing chart.
            if (y < ARENA_TOP) {
                y = ARENA_TOP;
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

    // Returns true when the pointer, the Add button (or its N key), or gamepad A / Space
    // wants another batch. Also chooses where that batch appears.
    wantsSpawn() {
        const fromPointer = this.pointerWantsSpawn();
        const fromButton = this.addPressed;

        this.addPressed = false;

        // Face button A is also Space. It is held state, so it keeps spawning while held.
        // N is not read here: the Add button's { key } binding fires once per tap.
        const fromHeld = BT.isDown(BT.BTN_A, 0);

        if (!fromPointer && !fromButton && !fromHeld) {
            return false;
        }

        if (this.count >= this.fieldLimit()) {
            return false;
        }

        // Pointer spawn already stored a point. Everything else uses the fountain.
        if (!fromPointer) {
            this.spawnX = this.fountainX;
            this.spawnY = ARENA_TOP;
        }

        return true;
    }

    // Returns true while a mouse button or a finger is held on empty screen (not on a
    // widget), and stores where.
    pointerWantsSpawn() {
        for (let slot = 0; slot < POINTER_SLOT_COUNT; slot++) {
            if (!BT.isPointerActive(slot) || !BT.isDown(BT.BTN_POINTER_A, slot)) {
                continue;
            }

            // pointerPos() would clone a vector every call. pointerPosTo writes into
            // pointerScratch instead.
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

    // How many bunnies the arrays may hold: MAX_WEBGPU_BUNNIES on WebGPU,
    // MAX_SOFTWARE_BUNNIES on software.
    fieldLimit() {
        return this.capsSprites ? MAX_WEBGPU_BUNNIES : MAX_SOFTWARE_BUNNIES;
    }

    // Writes the next `size` bunnies into the free slots at the end of the arrays,
    // stopping at the field limit. Random velocities come from the seeded BT.random
    // stream.
    spawnBatch(size) {
        // Keep the spawn point on the canvas, so a click in a corner still shows a bunny.
        // Math.max keeps the higher number, Math.min the lower, so a click past the edge
        // is pushed back inside. The top edge is the overlay, so a click on the chart
        // spawns just under it.
        const x = Math.min(this.arenaRight, Math.max(0, this.spawnX));
        const y = Math.min(this.arenaFloor, Math.max(ARENA_TOP, this.spawnY));
        const end = Math.min(this.fieldLimit(), this.count + size);

        for (let n = this.count; n < end; n++) {
            this.xs[n] = x;
            this.ys[n] = y;
            this.vxs[n] = BT.random.float(SPAWN_VX_MIN, SPAWN_VX_MAX);
            this.vys[n] = BT.random.float(SPAWN_VY_MIN, SPAWN_VY_MAX);
            this.variants[n] = BT.random.int(VARIANT_COUNT);
        }

        this.count = end;
    }

    // On WebGPU, submits at most BUNNY_DRAW_CAP bunnies and counts the rest as dropped,
    // so the sprite buffer does not warn and the panel letters keep their reserve.
    // Software has no vertex cap, so every live bunny is submitted and Dropped stays 0.
    // render() runs only after init() stored the sheets.
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

        // One sheet: span is 1, and the remainder of any count divided by 1 is 0, so
        // every bunny stays on texture 0 (one batch). Split mode uses all four copies in
        // turn (0, 1, 2, 3, 0, ...). Each change of sheet is another batch.
        const sheetSpan = this.splitSheets ? SHEET_COUNT : 1;
        let batches = 0;
        let lastSheet = -1;

        for (let i = 0; i < limit; i++) {
            const sheetIndex = i % sheetSpan;

            if (sheetIndex !== lastSheet) {
                batches += 1;
                lastSheet = sheetIndex;
            }

            // `| 0` drops the fraction on a positive number, the way Math.floor would,
            // without a function call. Sprites want whole pixels.
            pos.x = xs[i] | 0;
            pos.y = ys[i] | 0;

            // paletteOffset slides the stored 1-4 colors onto this bunny's row.
            BT.drawSprite(sheets[sheetIndex], src, pos, variants[i] * COLOR_COUNT);
        }

        this.spriteBatches = batches;
    }

    // Panel: counts and the buttons. update() and render() timings stay on the engine
    // overlay.
    drawHud() {
        // Fixed width and position. Bunnies use the full canvas, including behind this
        // panel.
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

    // One short line under the numbers. Warm when bunnies are being skipped.
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
