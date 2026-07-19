// Demo 019 - Palette Cycling: classic retro color rotation using BT.paletteCycle().
//
// Demo 019 in the BLIT386 series (written for readers about 12 years old).
//
// Prerequisites:
//   001-Basics            https://demos.blit386.dev/001-basics
//   002-Primitives        https://demos.blit386.dev/002-primitives
//   015-Palette Presets   https://demos.blit386.dev/015-palette-presets
//   016-Palette Animation https://demos.blit386.dev/016-palette-animation
//     (walkthroughs: https://vancura.dev/articles/blit386-palette-presets,
//      https://vancura.dev/articles/blit386-palette-animation)
//
// Live version: https://demos.blit386.dev/019-palette-cycling
// Live article: https://vancura.dev/articles/blit386-palette-cycling
//
// WHAT IS PALETTE CYCLING?
//
// On old hardware, colors were stored in numbered "slots" called a palette.
// Every pixel on screen was just a number pointing to a slot.
// If you ROTATE the colors - move each color one slot forward, wrap the last
// one to the beginning - everything on screen that uses those slots appears
// to ripple or flow. The picture data never changes; only the paint-bucket
// labels shift around.
//
// This trick powered water, lava, plasma, and aurora effects in classic games
// like Sonic, Secret of Mana, and Chrono Trigger - all without redrawing a
// single pixel.
//
// BLIT386 gives you BT.paletteCycle(start, end, speed) to do exactly that.
// Call it once in init(), and the engine rotates the colors automatically
// each frame. Positive speed = forward, negative = backward.
//
// UPDATE VS RENDER (palette work split):
//   init() registers gradient colors and starts BT.paletteCycle() - the engine
//   rotates those slot ranges automatically every frame.
//   update() only runs the periodic BT.paletteSwap() demo and hides its label.
//   render() draws fixed rectangles using palette index numbers; the bands
//   appear to flow because the engine shifted slot colors, not because render()
//   recomputes Color32 values.
//
// The band headings are drawn with the shared UI kit (src/shared/ui.js); its theme
// colors live in high palette slots (240 and up), far away from every cycling range.
//
// WHAT YOU WILL SEE (three horizontal bands):
//   1. Sky   (top)    - purple-pink slots cycling very slowly = twilight drift
//   2. Fire  (middle) - orange-yellow slots cycling backward = rising flames
//   3. Water (bottom) - blue gradient slots cycling forward = flowing water
//
// Plus a palette swap demonstration every few seconds.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// Water
// 8 blue-gradient slots cycling at 4 steps per second.
const WATER_SLOTS = 8;
const WATER_SPEED = 4;

// Fire
// 6 orange-yellow slots cycling backward at 6 steps per second.
const FIRE_SLOTS = 6;
const FIRE_SPEED = -6;

// Sky
// 10 purple-pink slots cycling very slowly at 0.5 steps per second.
const SKY_SLOTS = 10;
const SKY_SPEED = 0.5;

// Palette swap demo
// Every SWAP_INTERVAL ticks, swap two fire slots to show BT.paletteSwap().
const SWAP_INTERVAL = 180; // ~3 seconds at 60 FPS

// Slot 0: always transparent (reserved by the engine).

// Engine overlay style slots. configure() runs BEFORE init() installs the shared UI
// theme, so the overlay style cannot use theme slots - instead it points at these six
// low slots, which init() fills by hand with fixed colors.
const C_OVERLAY_TAG = 1; // Chart milestone tags (white).
const C_OVERLAY_BAR = 2; // Overlay bar background (very dark navy).
const C_OVERLAY_RENDER = 3; // Timing chart render bars (dark blue).
const C_OVERLAY_TEXT = 4; // Overlay text and chart update bars (golden yellow).
const C_OVERLAY_WARN = 5; // Timing chart warnings (cool gray-blue).
const C_OVERLAY_ERR = 6; // Timing chart error bars (dark gray-violet).

// Sky gradient: slots 10..19 (10 slots).
const C_SKY_BASE = 10;

// Fire gradient: slots 30..35 (6 slots).
const C_FIRE_BASE = 30;

// Water gradient: slots 50..57 (8 slots).
const C_WATER_BASE = 50;

/**
 * Fills a run of palette slots with a smooth gradient.
 *
 * For each slot we compute t = i / (count - 1). Think of t as "how far along the
 * gradient are we?" - the first slot gets t = 0 (the start), the last slot gets
 * t = 1 (the end), and the slots between get evenly spaced fractions like 0.25
 * or 0.5 (exactly halfway). The colorAt callback turns that fraction into the
 * actual Color32 for the slot, so each gradient only has to describe its own
 * start and end colors.
 *
 * @param {Palette} palette - The palette to write into.
 * @param {number} baseSlot - The first slot of the gradient run.
 * @param {number} count - How many slots to fill.
 * @param {(t: number) => Color32} colorAt - Returns the color for progress t (0..1).
 */
function fillGradient(palette, baseSlot, count, colorAt) {
    for (let i = 0; i < count; i++) {
        palette.set(baseSlot + i, colorAt(i / (count - 1)));
    }
}

/**
 * Demonstrates BT.paletteCycle() for automatic palette rotation, plus
 * BT.paletteSwap() for instant entry exchange and BT.paletteClearEffects()
 * for stopping all running effects.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slot map for the shared UI kit theme, filled in init() by applyTheme().
    // theme.bg, theme.dim, ... are palette indices ready for BT draw calls.
    theme = null;

    // Track the last swap tick so we know when to do the next swap demo.
    lastSwapTick = 0;

    // Which two slots were last swapped (for the UI label).
    swappedA = 0;
    swappedB = 0;
    showSwapLabel = false;

    /**
     * Palette cycling runs in the engine each frame; the chart shows update vs render
     * time. The overlay style colors come from the dedicated low slots set in init().
     *
     * @returns {Partial<HardwareSettings>}
     */
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

    /**
     * Builds the palette with gradient colors and starts the cycling effects.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        console.log('[PaletteCyclingDemo] Initializing...');

        this.palette = BT.paletteCreate(256);

        // Colors for the engine overlay (the stats HUD). These live in low slots so
        // configure() could reference them before the UI theme existed.
        this.palette.set(C_OVERLAY_TAG, new Color32(255, 255, 255));
        this.palette.set(C_OVERLAY_BAR, new Color32(10, 12, 20));
        this.palette.set(C_OVERLAY_RENDER, new Color32(20, 24, 36));
        this.palette.set(C_OVERLAY_TEXT, new Color32(255, 210, 80));
        this.palette.set(C_OVERLAY_WARN, new Color32(120, 130, 160));
        this.palette.set(C_OVERLAY_ERR, new Color32(70, 70, 90));

        // The three gradients below all use the same fillGradient() helper (defined
        // above the class): each one only supplies its own start and end channel values.

        // Sky gradient: deep purple to soft pink (red 40..160, green 20..60, blue 80..180).
        fillGradient(
            this.palette,
            C_SKY_BASE,
            SKY_SLOTS,
            (t) => new Color32(Math.floor(40 + t * 120), Math.floor(20 + t * 40), Math.floor(80 + t * 100)),
        );

        // Fire gradient: dark red to bright yellow (red 80..255, green 0..200, blue 0..40).
        fillGradient(
            this.palette,
            C_FIRE_BASE,
            FIRE_SLOTS,
            (t) => new Color32(Math.floor(80 + t * 175), Math.floor(t * 200), Math.floor(t * 40)),
        );

        // Water gradient: dark blue to bright cyan (red 0..60, green 40..200, blue 100..255).
        fillGradient(
            this.palette,
            C_WATER_BASE,
            WATER_SLOTS,
            (t) => new Color32(Math.floor(t * 60), Math.floor(40 + t * 160), Math.floor(100 + t * 155)),
        );

        // Install the shared UI kit colors (panel fills, borders, headings, dim text).
        // applyTheme() writes 12 colors into slots 240..251 - far above every range the
        // engine cycles here (sky 10..19, fire 30..35, water 50..57), so the rotation
        // can never touch the UI theme.
        this.theme = applyTheme(this.palette);

        // Activate palette
        BT.paletteSet(this.palette);

        // Start cycling effects
        // These run automatically each frame until we call BT.paletteClearEffects().
        BT.paletteCycle(C_SKY_BASE, C_SKY_BASE + SKY_SLOTS - 1, SKY_SPEED);
        BT.paletteCycle(C_FIRE_BASE, C_FIRE_BASE + FIRE_SLOTS - 1, FIRE_SPEED);
        BT.paletteCycle(C_WATER_BASE, C_WATER_BASE + WATER_SLOTS - 1, WATER_SPEED);

        console.log('[PaletteCyclingDemo] Initialized');
        return true;
    }

    /**
     * Periodically swaps two fire palette entries to demonstrate BT.paletteSwap().
     */
    update() {
        const tick = BT.ticks;

        // Every SWAP_INTERVAL ticks, swap two fire slots to demonstrate BT.paletteSwap().
        // The pair is not random - it is computed from the tick counter, so each swap
        // picks a predictable pair: tick % FIRE_SLOTS and (tick + 3) % FIRE_SLOTS.
        if (tick - this.lastSwapTick >= SWAP_INTERVAL) {
            // Pick two different slots within the fire range.
            this.swappedA = C_FIRE_BASE + (tick % FIRE_SLOTS);
            this.swappedB = C_FIRE_BASE + ((tick + 3) % FIRE_SLOTS);

            if (this.swappedA !== this.swappedB) {
                BT.paletteSwap(this.swappedA, this.swappedB);
                this.showSwapLabel = true;
            }

            this.lastSwapTick = tick;
        }

        // Hide the swap label after 60 ticks (~1 second).
        if (this.showSwapLabel && tick - this.lastSwapTick > 60) {
            this.showSwapLabel = false;
        }
    }

    /**
     * Draws the three animated bands and their kit-panel headings.
     * No Color32 objects here - only palette indices.
     */
    render() {
        BT.clear(this.theme.bg);

        this.renderSkyPanel();
        this.renderFirePanel();
        this.renderWaterPanel();
    }

    /**
     * Sky band: 10 horizontal stripes at the top, each using one sky slot.
     * The slow cycling makes the twilight colors gently shift.
     */
    renderSkyPanel() {
        const bandY = 6;
        const stripeH = 5;

        // The heading lives in a kit panel pinned to the band position. ui.end() draws
        // the panel right away, so the stripes drawn after it land ON TOP of the panel
        // background. ui.spacer() reserves empty rows for that artwork.
        ui.begin('topLeft', { x: 0, y: bandY, width: 320 });
        ui.panel('Sky (0.5 steps/sec, forward)');
        ui.spacer(40);
        ui.end();

        // Draw 10 horizontal stripes, repeated twice for fullness.
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

    /**
     * Fire band: 6 vertical columns in the middle section.
     * Negative speed makes the colors cycle backward (rising flame illusion).
     */
    renderFirePanel() {
        const bandY = 76;
        const colW = Math.floor(308 / FIRE_SLOTS);

        // Kit panel with the heading; the spacer reserves room for the fire columns.
        ui.begin('topLeft', { x: 0, y: bandY, width: 320 });
        ui.panel('Fire (-6 steps/sec, backward)');
        ui.spacer(40);
        ui.end();

        // Draw fire columns.
        for (let i = 0; i < FIRE_SLOTS; i++) {
            // Each column is drawn with multiple rows of the same slot to make it taller.
            for (let row = 0; row < 8; row++) {
                const x = 6 + i * colW;
                const y = bandY + 20 + row * 5;

                BT.drawRectFill(new Rect2i(x, y, colW - 1, 5), C_FIRE_BASE + ((i + row) % FIRE_SLOTS));
            }
        }

        // Show swap label if active (printed over the tiles, like a caption).
        if (this.showSwapLabel) {
            BT.systemPrint(
                new Vector2i(6, bandY + 44),
                this.theme.text,
                `Swapped slots ${this.swappedA} <-> ${this.swappedB}`,
            );
        }
    }

    /**
     * Water band: 8 vertical columns at the bottom.
     * Forward cycling at 4 steps/sec makes colors flow like water.
     */
    renderWaterPanel() {
        const bandY = 146;
        const colW = Math.floor(308 / WATER_SLOTS);

        // Kit panel with the heading; the spacer reserves room for the water tiles.
        ui.begin('topLeft', { x: 0, y: bandY, width: 320 });
        ui.panel('Water (4 steps/sec, forward)');
        ui.spacer(54);
        ui.end();

        // Draw water tiles in a grid pattern.
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < WATER_SLOTS; col++) {
                const x = 6 + col * colW;
                const y = bandY + 20 + row * 5;

                // Offset the slot index by the row to create a diagonal wave pattern.
                const slot = C_WATER_BASE + ((col + row) % WATER_SLOTS);

                BT.drawRectFill(new Rect2i(x, y, colW - 1, 5), slot);
            }
        }

        // Explanatory text (printed over the tiles, like a caption).
        BT.systemPrint(new Vector2i(6, bandY + 58), this.theme.text, 'BT.paletteCycle() runs automatically');
    }
}

bootstrap(Demo);
