// Demo 019 -- Palette Cycling: classic retro color rotation using BT.paletteCycle().
//
// Demo 019 in the Blit-Tech series (written for readers about 12 years old).
//
// Prerequisites:
//   001-Basics            https://vancura.dev/articles/blit-tech-basics
//   002-Primitives        https://vancura.dev/articles/blit-tech-primitives
//   015-Palette Presets   https://vancura.dev/articles/blit-tech-palette-presets
//   016-Palette Animation https://vancura.dev/articles/blit-tech-palette-animation
//
// WHAT IS PALETTE CYCLING?
//
// On old hardware, colors were stored in numbered "slots" called a palette.
// Every pixel on screen was just a number pointing to a slot.
// If you ROTATE the colors -- move each color one slot forward, wrap the last
// one to the beginning -- everything on screen that uses those slots appears
// to ripple or flow. The picture data never changes; only the paint-bucket
// labels shift around.
//
// This trick powered water, lava, plasma, and aurora effects in classic games
// like Sonic, Secret of Mana, and Chrono Trigger -- all without redrawing a
// single pixel.
//
// Blit-Tech gives you BT.paletteCycle(start, end, speed) to do exactly that.
// Call it once in initialize(), and the engine rotates the colors automatically
// each frame. Positive speed = forward, negative = backward.
//
// WHAT YOU WILL SEE (three horizontal bands):
//   1. Water (bottom) -- blue gradient slots cycling forward = flowing water
//   2. Fire  (middle) -- orange-yellow slots cycling backward = rising flames
//   3. Sky   (top)    -- purple-pink slots cycling very slowly = twilight drift
//
// Plus a palette swap demonstration every few seconds.

import { BitmapFont, bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

// --- Water ---
// 8 blue-gradient slots cycling at 4 steps per second.
const WATER_SLOTS = 8;
const WATER_SPEED = 4;

// --- Fire ---
// 6 orange-yellow slots cycling backward at 6 steps per second.
const FIRE_SLOTS = 6;
const FIRE_SPEED = -6;

// --- Sky ---
// 10 purple-pink slots cycling very slowly at 0.5 steps per second.
const SKY_SLOTS = 10;
const SKY_SPEED = 0.5;

// --- Palette swap demo ---
// Every SWAP_INTERVAL ticks, swap two fire slots to show BT.paletteSwap().
const SWAP_INTERVAL = 180; // ~3 seconds at 60 FPS

// #endregion

// #region Palette Slot Constants

// Slot 0: always transparent (reserved by the engine).
const C_WHITE = 1;
const C_BG = 2;
const C_PANEL = 3;
const C_LABEL = 4;
const C_DIM = 5;
const C_FPS = 6;

// Sky gradient: slots 10..19 (10 slots).
const C_SKY_BASE = 10;

// Fire gradient: slots 30..35 (6 slots).
const C_FIRE_BASE = 30;

// Water gradient: slots 50..57 (8 slots).
const C_WATER_BASE = 50;

// #endregion

// #region Demo Class

/**
 * Demonstrates BT.paletteCycle() for automatic palette rotation, plus
 * BT.paletteSwap() for instant entry exchange and BT.paletteClearEffects()
 * for stopping all running effects.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    palette = null;
    font = null;

    // Track the last swap tick so we know when to do the next swap demo.
    lastSwapTick = 0;

    // Which two slots were last swapped (for the UI label).
    swappedA = 0;
    swappedB = 0;
    showSwapLabel = false;

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Tells the engine the screen size and target frame rate.
     *
     * @returns {{displaySize: Vector2i, canvasDisplaySize: Vector2i, targetFPS: number}}
     */
    queryHardware() {
        return {
            displaySize: new Vector2i(320, 240),
            canvasDisplaySize: new Vector2i(640, 480),
            targetFPS: 60,
        };
    }

    /**
     * Builds the palette with gradient colors, starts the cycling effects,
     * and loads the bitmap font.
     *
     * @returns {Promise<boolean>}
     */
    async initialize() {
        console.log('[PaletteCyclingDemo] Initializing...');

        this.palette = BT.paletteCreate(256);

        // --- Static UI colors ---
        this.palette.set(C_WHITE, new Color32(255, 255, 255));
        this.palette.set(C_BG, new Color32(10, 12, 20));
        this.palette.set(C_PANEL, new Color32(20, 24, 36));
        this.palette.set(C_LABEL, new Color32(255, 210, 80));
        this.palette.set(C_DIM, new Color32(120, 130, 160));
        this.palette.set(C_FPS, new Color32(70, 70, 90));

        // --- Sky gradient: purple to pink ---
        // Each slot goes from deep purple to soft pink across 10 steps.
        for (let i = 0; i < SKY_SLOTS; i++) {
            const t = i / (SKY_SLOTS - 1); // 0..1
            const r = Math.floor(40 + t * 120); // 40..160
            const g = Math.floor(20 + t * 40); // 20..60
            const b = Math.floor(80 + t * 100); // 80..180

            this.palette.set(C_SKY_BASE + i, new Color32(r, g, b));
        }

        // --- Fire gradient: dark red to bright yellow ---
        for (let i = 0; i < FIRE_SLOTS; i++) {
            const t = i / (FIRE_SLOTS - 1);
            const r = Math.floor(80 + t * 175); // 80..255
            const g = Math.floor(t * 200); // 0..200
            const b = Math.floor(t * 40); // 0..40

            this.palette.set(C_FIRE_BASE + i, new Color32(r, g, b));
        }

        // --- Water gradient: dark blue to bright cyan ---
        for (let i = 0; i < WATER_SLOTS; i++) {
            const t = i / (WATER_SLOTS - 1);
            const r = Math.floor(t * 60); // 0..60
            const g = Math.floor(40 + t * 160); // 40..200
            const b = Math.floor(100 + t * 155); // 100..255

            this.palette.set(C_WATER_BASE + i, new Color32(r, g, b));
        }

        // --- Activate palette ---
        BT.paletteSet(this.palette);

        // --- Load font ---
        try {
            this.font = await BitmapFont.load('/fonts/PragmataPro14.btfont');
            this.font.getSpriteSheet().indexize(this.palette);
            console.log(`[PaletteCyclingDemo] Loaded font: ${this.font.name}`);
        } catch (error) {
            console.error('[PaletteCyclingDemo] Failed to load font:', error);
            return false;
        }

        // --- Start cycling effects ---
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
        const tick = BT.ticks();

        // Every SWAP_INTERVAL ticks, swap two random fire slots.
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
     * Draws the three animated bands and UI labels.
     * No Color32 objects here -- only palette indices.
     */
    render() {
        BT.clear(C_BG);

        if (!this.font) {
            BT.print(new Vector2i(10, 10), C_WHITE, 'Loading font...');
            return;
        }

        // Title.
        BT.printFont(this.font, new Vector2i(6, 4), 'Blit-Tech - Palette Cycling', 3);

        this.renderSkyPanel();
        this.renderFirePanel();
        this.renderWaterPanel();

        // FPS counter.
        BT.printFont(this.font, new Vector2i(250, 225), `FPS: ${BT.fps()}`, 5);
    }

    // #endregion

    // #region Render Helpers

    /**
     * Sky band: 10 horizontal stripes at the top, each using one sky slot.
     * The slow cycling makes the twilight colors gently shift.
     */
    renderSkyPanel() {
        const panelY = 18;
        const stripeH = 5;

        BT.drawRectFill(new Rect2i(0, panelY, 320, 60), C_PANEL);
        BT.printFont(this.font, new Vector2i(6, panelY + 2), 'Sky (0.5 steps/sec, forward)', 3);

        // Draw 10 horizontal stripes, repeated twice for fullness.
        for (let row = 0; row < 2; row++) {
            for (let i = 0; i < SKY_SLOTS; i++) {
                const y = panelY + 16 + (row * (stripeH * SKY_SLOTS)) / 2 + i * stripeH;

                if (y + stripeH <= panelY + 60) {
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
        const panelY = 84;
        const colW = Math.floor(308 / FIRE_SLOTS);

        BT.drawRectFill(new Rect2i(0, panelY, 320, 60), C_PANEL);
        BT.printFont(this.font, new Vector2i(6, panelY + 2), 'Fire (-6 steps/sec, backward)', 3);

        // Draw fire columns.
        for (let i = 0; i < FIRE_SLOTS; i++) {
            // Each column is drawn with multiple rows of the same slot to make it taller.
            for (let row = 0; row < 8; row++) {
                const x = 6 + i * colW;
                const y = panelY + 16 + row * 5;

                BT.drawRectFill(new Rect2i(x, y, colW - 1, 5), C_FIRE_BASE + ((i + row) % FIRE_SLOTS));
            }
        }

        // Show swap label if active.
        if (this.showSwapLabel) {
            BT.printFont(
                this.font,
                new Vector2i(6, panelY + 48),
                `Swapped slots ${this.swappedA} <-> ${this.swappedB}`,
                4,
            );
        }
    }

    /**
     * Water band: 8 vertical columns at the bottom.
     * Forward cycling at 4 steps/sec makes colors flow like water.
     */
    renderWaterPanel() {
        const panelY = 150;
        const colW = Math.floor(308 / WATER_SLOTS);

        BT.drawRectFill(new Rect2i(0, panelY, 320, 70), C_PANEL);
        BT.printFont(this.font, new Vector2i(6, panelY + 2), 'Water (4 steps/sec, forward)', 3);

        // Draw water tiles in a grid pattern.
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < WATER_SLOTS; col++) {
                const x = 6 + col * colW;
                const y = panelY + 16 + row * 5;

                // Offset the slot index by the row to create a diagonal wave pattern.
                const slot = C_WATER_BASE + ((col + row) % WATER_SLOTS);

                BT.drawRectFill(new Rect2i(x, y, colW - 1, 5), slot);
            }
        }

        // Explanatory text.
        BT.printFont(this.font, new Vector2i(6, panelY + 56), 'BT.paletteCycle() runs automatically', 4);
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

bootstrap(Demo);

// #endregion
