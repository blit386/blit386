/*

Palette Cycling: classic retro color rotation using BT.paletteCycle().
@description Classic retro color rotation with BT.paletteCycle: rotate palette slots to make a still image flow.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives
  - Palette Animation: https://demos.blit386.dev/palette-animation

Live version: https://demos.blit386.dev/palette-cycling

Guides:
  - Palette: https://blit386.dev/docs/guides/palette#runtime-palette-effects
  - Palette patterns: https://blit386.dev/docs/guides/palette#practical-palette-first-patterns
  - Overlay: https://blit386.dev/docs/guides/overlay#colors-and-hud-palette-slots

Reference:
  - Palette: https://blit386.dev/docs/api/palette#palette-effects

---

WHAT YOU WILL SEE
-----------------

Three kit panels stacked down the screen, each filled with rectangles that never move but
whose colors flow:

  1. Sky (top) - a stack of thin purple-to-pink stripes from 10 slots (10-19), cycling
     very slowly at 0.5 steps per second.
  2. Fire (middle) - 6 columns of 8 small blocks from 6 slots (30-35), dark red to bright
     yellow, cycling at 6 steps per second with a negative speed, so the other way round.
  3. Water (bottom) - a grid of 8 by 10 small blocks from 8 slots (50-57), dark blue to
     cyan, laid out diagonally and cycling at 4 steps per second.

Every 3 seconds the demo also swaps two fire slots with BT.paletteSwap() and shows a
caption naming them for about a second.

WHAT YOU WILL LEARN
-------------------

- BT.paletteCycle(start, end, speed) rotates the colors in slots start to end (both
  inclusive) at `speed` steps per second, forever. A positive speed moves every color one
  slot down (slot 11's color lands in slot 10, and slot 10's wraps to the end); a negative
  speed moves them the other way.
- BT.paletteSwap(indexA, indexB) exchanges two slots instantly - not an effect, a one-off.
- Palette effects run inside the engine once per tick, so init() starts them and the demo
  never touches those colors again.
- Filling a run of slots with a gradient from a tiny helper and a callback.
- Keeping the cycled ranges clear of the slots the UI kit and the overlay own.

WHAT IS PALETTE CYCLING?
------------------------

On old hardware, colors were stored in numbered "slots" called a palette. Every pixel on
screen was just a number pointing to a slot. If you ROTATE the colors - move each color
one slot over and wrap the one that falls off the end back to the start - everything on
screen that uses those slots appears to ripple or flow. The picture data never changes;
only the paint-bucket labels shift around.

This trick powered water, lava, plasma, and aurora effects in classic games like Sonic,
Secret of Mana, and Chrono Trigger - all without redrawing a single pixel.

BLIT386 gives you BT.paletteCycle(start, end, speed) to do exactly that. Call it once in
init(), and the engine rotates the colors automatically every tick.

UPDATE VS RENDER
----------------

  - init() fills the gradient slots and starts three BT.paletteCycle() effects. The engine
    rotates those slot ranges on its own every tick until BT.paletteClearEffects() is
    called - which this demo never does.
  - update() only runs the periodic BT.paletteSwap() and hides its caption.
  - render() draws fixed rectangles using palette index numbers; the bands appear to flow
    because the engine shifted the slot colors, not because render() recomputes Color32
    values.

The band headings are drawn with the shared UI kit (src/shared/ui.js); its theme colors
live in slots 240-251, far away from every cycling range.

TRY THIS
--------

- Press the backquote key (`) to open the engine overlay. The timing chart shows that
  update() does almost nothing - the rotation happens inside the engine.
- Watch the fire panel: every 3 seconds a caption names the two slots that just swapped.
  The two colors trade places in the rotating ring for good, so the fire gradient slowly
  gets scrambled.

*/

import { bootstrap, BT, Color32, Rect2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// Water: 8 blue slots cycling at 4 steps per second.
const WATER_SLOTS = 8;
const WATER_SPEED = 4;

// Fire: 6 orange-yellow slots cycling the other way at 6 steps per second.
const FIRE_SLOTS = 6;
const FIRE_SPEED = -6;

// Sky: 10 purple-pink slots cycling very slowly at 0.5 steps per second.
const SKY_SLOTS = 10;
const SKY_SPEED = 0.5;

// Palette swap demo: every SWAP_INTERVAL ticks, swap two fire slots to show
// BT.paletteSwap(). A tick is one fixed update; 180 ticks is 3 seconds at 60 ticks per
// second.
const SWAP_INTERVAL = 180;

// Slot 0 is always transparent (reserved by the engine).

// Engine overlay style slots. configure() runs BEFORE init() installs the shared UI
// theme, so the overlay style cannot use theme slots - instead it points at these six
// low slots, which init() fills by hand with fixed colors.
const C_OVERLAY_TAG = 1; // chart milestone tags (white)
const C_OVERLAY_BAR = 2; // overlay bar background (very dark navy)
const C_OVERLAY_RENDER = 3; // timing chart render bars (dark blue)
const C_OVERLAY_TEXT = 4; // overlay text and chart update bars (golden yellow)
const C_OVERLAY_WARN = 5; // timing chart warnings (cool gray-blue)
const C_OVERLAY_ERR = 6; // timing chart error bars (dark gray-violet)

// Sky gradient: slots 10-19 (10 slots).
const C_SKY_BASE = 10;

// Fire gradient: slots 30-35 (6 slots).
const C_FIRE_BASE = 30;

// Water gradient: slots 50-57 (8 slots).
const C_WATER_BASE = 50;

// Fills a run of palette slots with a smooth gradient. For each slot we compute
// t = i / (count - 1): think of t as "how far along the gradient are we?" - the first
// slot gets t = 0 (the start), the last slot gets t = 1 (the end), and the slots between
// get evenly spaced fractions like 0.25 or 0.5 (exactly halfway). The `colorAt` callback
// turns that fraction into the actual Color32 for the slot, so each gradient only has to
// describe its own start and end colors. `baseSlot` is the first slot of the run.
function fillGradient(palette, baseSlot, count, colorAt) {
    for (let i = 0; i < count; i++) {
        palette.set(baseSlot + i, colorAt(i / (count - 1)));
    }
}

// Demonstrates BT.paletteCycle() for automatic palette rotation and BT.paletteSwap() for
// an instant exchange of two slots.
class Demo {
    // The active palette, built in init().
    /** @type {Palette | null} */
    palette = null;

    // Palette slot map for the shared UI kit theme, filled in init() by applyTheme().
    // theme.bg, theme.dim, and friends are palette indices ready for BT draw calls.
    theme = null;

    // Tick of the last swap, so we know when the next one is due.
    lastSwapTick = 0;

    // Which two slots were last swapped, for the caption.
    swappedA = 0;
    swappedB = 0;

    // Whether the swap caption is currently shown.
    showSwapLabel = false;

    // Palette cycling runs in the engine every tick; the timing chart shows update vs
    // render time. The overlay style colors come from the dedicated low slots set in
    // init().
    configure() {
        return {
            isOverlayTimingChartEnabled: true,
            overlayStyle: {
                barPaletteIndex: C_OVERLAY_BAR,
                textPaletteIndex: C_OVERLAY_TEXT,
                gapPaletteIndex: C_OVERLAY_BAR,
            },
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_OVERLAY_TEXT,
                renderBarPaletteIndex: C_OVERLAY_RENDER,
                warningPaletteIndex: C_OVERLAY_WARN,
                errorPaletteIndex: C_OVERLAY_ERR,
                tagPaletteIndex: C_OVERLAY_TAG,
            },
        };
    }

    // Builds the palette with gradient colors and starts the cycling effects.
    async init() {
        console.log('[PaletteCyclingDemo] Initializing...');

        this.palette = BT.paletteCreate(256);

        // Colors for the engine overlay (the stats HUD). They live in low slots so
        // configure() could name them before the UI theme existed.
        this.palette.set(C_OVERLAY_TAG, new Color32(255, 255, 255));
        this.palette.set(C_OVERLAY_BAR, new Color32(10, 12, 20));
        this.palette.set(C_OVERLAY_RENDER, new Color32(20, 24, 36));
        this.palette.set(C_OVERLAY_TEXT, new Color32(255, 210, 80));
        this.palette.set(C_OVERLAY_WARN, new Color32(120, 130, 160));
        this.palette.set(C_OVERLAY_ERR, new Color32(70, 70, 90));

        // The three gradients below all use the fillGradient() helper defined above the
        // class; each one only supplies its own start and end channel values.

        // Sky gradient: deep purple to soft pink (red 40-160, green 20-60, blue 80-180).
        fillGradient(
            this.palette,
            C_SKY_BASE,
            SKY_SLOTS,
            (t) => new Color32(Math.floor(40 + t * 120), Math.floor(20 + t * 40), Math.floor(80 + t * 100)),
        );

        // Fire gradient: dark red to bright yellow (red 80-255, green 0-200, blue 0-40).
        fillGradient(
            this.palette,
            C_FIRE_BASE,
            FIRE_SLOTS,
            (t) => new Color32(Math.floor(80 + t * 175), Math.floor(t * 200), Math.floor(t * 40)),
        );

        // Water gradient: dark blue to bright cyan (red 0-60, green 40-200, blue
        // 100-255).
        fillGradient(
            this.palette,
            C_WATER_BASE,
            WATER_SLOTS,
            (t) => new Color32(Math.floor(t * 60), Math.floor(40 + t * 160), Math.floor(100 + t * 155)),
        );

        // Install the shared UI kit colors (panel fills, borders, headings, dim text).
        // applyTheme() writes 12 colors into slots 240-251 - far above every range the
        // engine cycles here (sky 10-19, fire 30-35, water 50-57), so the rotation can
        // never touch the UI theme.
        this.theme = applyTheme(this.palette);

        // Make this palette the one the engine draws with.
        BT.paletteSet(this.palette);

        // Start the cycling effects. The engine runs them once per tick until
        // BT.paletteClearEffects() is called - this demo never calls it, so they run
        // forever. Each call names the first and last slot of a range (both inclusive)
        // and a speed in steps per second.
        BT.paletteCycle(C_SKY_BASE, C_SKY_BASE + SKY_SLOTS - 1, SKY_SPEED);
        BT.paletteCycle(C_FIRE_BASE, C_FIRE_BASE + FIRE_SLOTS - 1, FIRE_SPEED);
        BT.paletteCycle(C_WATER_BASE, C_WATER_BASE + WATER_SLOTS - 1, WATER_SPEED);

        console.log('[PaletteCyclingDemo] Initialized');

        return true;
    }

    // Swaps two fire slots every SWAP_INTERVAL ticks to demonstrate BT.paletteSwap(), and
    // hides the caption a second later.
    update() {
        const tick = BT.ticks;

        // The pair is not random - it is computed from the tick counter, so each swap
        // picks a predictable pair: tick % FIRE_SLOTS and (tick + 3) % FIRE_SLOTS. `%` is
        // the remainder after division, so both land inside the 6 fire slots.
        if (tick - this.lastSwapTick >= SWAP_INTERVAL) {
            // Two slots within the fire range, always 3 apart.
            this.swappedA = C_FIRE_BASE + (tick % FIRE_SLOTS);
            this.swappedB = C_FIRE_BASE + ((tick + 3) % FIRE_SLOTS);

            // The two slots can never be equal here, so this check is just a safety net.
            if (this.swappedA !== this.swappedB) {
                BT.paletteSwap(this.swappedA, this.swappedB);
                this.showSwapLabel = true;
            }

            this.lastSwapTick = tick;
        }

        // Hide the swap caption after 60 ticks (1 second).
        if (this.showSwapLabel && tick - this.lastSwapTick > 60) {
            this.showSwapLabel = false;
        }
    }

    // Draws the three animated bands and their kit-panel headings. No Color32 objects
    // here - only palette indices.
    render() {
        BT.clear(this.theme.bg);

        this.renderSkyPanel();
        this.renderFirePanel();
        this.renderWaterPanel();
    }

    // Sky band: thin horizontal stripes at the top, each using one sky slot. The slow
    // cycling makes the twilight colors gently shift.
    renderSkyPanel() {
        const bandY = 6;
        const stripeH = 5;

        // The heading lives in a kit panel pinned to the band position. ui.end() draws
        // the panel right away, and ui.spacer() reserves empty rows for the stripes we
        // draw after it. The stripes use ui.drawRectFill(), not BT.drawRectFill(): kit
        // panels are sprites, and the engine draws every BT.drawRectFill() before any
        // sprite - so a plain one would hide under the panel. ui.drawRectFill() takes the
        // same rectangle and palette slot, but draws a sprite, which lands on top in call
        // order.
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: 0, y: bandY, width: 320 });
        ui.panel('Sky (0.5 steps/sec, forward)');
        ui.spacer(40);
        ui.end();

        // Two passes of 10 stripes. The second pass starts 25 pixels down, so it overlaps
        // the tail of the first, and the check inside skips any stripe that would poke
        // out of the 40-pixel band.
        for (let row = 0; row < 2; row++) {
            for (let i = 0; i < SKY_SLOTS; i++) {
                const y = bandY + 20 + (row * (stripeH * SKY_SLOTS)) / 2 + i * stripeH;

                // Only draw stripes that fit inside the panel's content area.
                if (y + stripeH <= bandY + 60) {
                    BT.drawRectFill(new Rect2i(6, y, 308, stripeH), C_SKY_BASE + (i % SKY_SLOTS));
                }
            }
        }
    }

    // Fire band: 6 columns in the middle section. The negative speed cycles the colors
    // the other way from the water.
    renderFirePanel() {
        const bandY = 76;
        const colW = Math.floor(308 / FIRE_SLOTS);

        // Kit panel with the heading; the spacer reserves room for the fire columns.
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: 0, y: bandY, width: 320 });
        ui.panel('Fire (-6 steps/sec, backward)');
        ui.spacer(40);
        ui.end();

        // The fire columns: 8 rows of small blocks per column. The slot shifts by one per
        // row, so each column is a stack of the gradient.
        for (let i = 0; i < FIRE_SLOTS; i++) {
            for (let row = 0; row < 8; row++) {
                const x = 6 + i * colW;
                const y = bandY + 20 + row * 5;

                BT.drawRectFill(new Rect2i(x, y, colW - 1, 5), C_FIRE_BASE + ((i + row) % FIRE_SLOTS));
            }
        }

        // The swap caption, while it is active (shared caption helper from the UI kit).
        if (this.showSwapLabel) {
            ui.caption(6, bandY + 44, `Swapped slots ${this.swappedA} <-> ${this.swappedB}`);
        }
    }

    // Water band: a grid of 8 columns by 10 rows at the bottom. Forward cycling at 4
    // steps per second makes the colors flow like water.
    renderWaterPanel() {
        const bandY = 146;
        const colW = Math.floor(308 / WATER_SLOTS);

        // Kit panel with the heading; the spacer reserves room for the water tiles.
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: 0, y: bandY, width: 320 });
        ui.panel('Water (4 steps/sec, forward)');
        ui.spacer(54);
        ui.end();

        // The water tiles in a grid.
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < WATER_SLOTS; col++) {
                const x = 6 + col * colW;
                const y = bandY + 20 + row * 5;

                // Shift the slot by the row so the gradient runs diagonally across the
                // grid.
                const slot = C_WATER_BASE + ((col + row) % WATER_SLOTS);

                BT.drawRectFill(new Rect2i(x, y, colW - 1, 5), slot);
            }
        }

        // A caption over the tiles (shared caption helper from the UI kit).
        ui.caption(6, bandY + 58, 'BT.paletteCycle() runs automatically');
    }
}

bootstrap(Demo);
