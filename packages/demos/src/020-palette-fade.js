// Demo 020 -- Palette Fade & Flash: smooth color transitions and flash effects.
//
// Demo 020 in the Blit-Tech series (written for readers about 12 years old).
//
// Prerequisites:
//   001-Basics            https://vancura.dev/articles/blit-tech-basics
//   002-Primitives        https://vancura.dev/articles/blit-tech-primitives
//   015-Palette Presets   https://vancura.dev/articles/blit-tech-palette-presets
//   016-Palette Animation https://vancura.dev/articles/blit-tech-palette-animation
//   019-Palette Cycling   https://vancura.dev/articles/blit-tech-palette-cycling
//
// WHAT ARE PALETTE FADES?
//
// Imagine you have two sets of paint buckets: one for a sunny day, one for a
// dark night. A "palette fade" gradually mixes the day paints with the night
// paints over several seconds, so the whole picture smoothly transitions from
// bright to dark -- like watching a sunset.
//
// Blit-Tech does this with BT.paletteFade(targetPalette, durationMs, easing).
// You give it the destination paint set, how long the transition should take,
// and optionally a curve that controls how fast the change happens ("ease-in"
// starts slow, "ease-out" starts fast, "ease-in-out" is smooth on both ends).
//
// WHAT IS A PALETTE FLASH?
//
// A "flash" instantly turns every color to one single color (like white for
// lightning) for a short moment, then snaps everything back to normal.
// BT.paletteFlash(color, durationMs) does this in one call.
//
// WHAT YOU WILL SEE:
//   A pixel-art landscape (sky, ground, trees, sun) that loops through:
//   1. Day (bright)   -- hold 3 seconds
//   2. Fade to night  -- 2 seconds, ease-in-out
//   3. Night (dark)   -- hold 3 seconds
//   4. Lightning flash -- 200 ms white flash
//   5. Night hold     -- 2 seconds
//   6. Fade to day    -- 2 seconds, ease-out (dawn)
//   Repeat forever.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

// Phase durations in ticks (at 60 FPS, 60 ticks = 1 second).
const PHASE_DAY_HOLD = 180; // 3 seconds
const PHASE_FADE_TO_NIGHT = 120; // 2 seconds
const PHASE_NIGHT_HOLD = 180; // 3 seconds
const PHASE_FLASH = 12; // 200 ms
const PHASE_NIGHT_HOLD_2 = 120; // 2 seconds
const PHASE_FADE_TO_DAY = 120; // 2 seconds

// Slot 0: always transparent.
const C_WHITE = 1;
const C_BG = 2; // Not used for scene, but available.
const C_LABEL = 3;
const C_DIM = 4;
const C_FPS = 5;

// Scene colors: sky, sun, ground, tree trunk, tree leaves, flowers.
const C_SKY = 10;
const C_SKY_LIGHT = 11;
const C_SUN = 12;
const C_SUN_GLOW = 13;
const C_GROUND = 14;
const C_GROUND_DARK = 15;
const C_TRUNK = 16;
const C_LEAVES = 17;
const C_LEAVES_LIGHT = 18;
const C_FLOWER_1 = 19;
const C_FLOWER_2 = 20;
const C_CLOUD = 21;
const C_MOUNTAIN = 22;
const C_MOUNTAIN_LIGHT = 23;

// #endregion

// #region Helper Functions

/**
 * Builds the "day" palette -- bright, saturated outdoor colors.
 *
 * @param {Palette} p - Palette to fill.
 */
function fillDayPalette(p) {
    p.set(C_WHITE, new Color32(255, 255, 255));
    p.set(C_BG, new Color32(10, 12, 20));
    p.set(C_LABEL, new Color32(255, 210, 80));
    p.set(C_DIM, new Color32(120, 130, 160));
    p.set(C_FPS, new Color32(70, 70, 90));

    p.set(C_SKY, new Color32(100, 170, 255));
    p.set(C_SKY_LIGHT, new Color32(150, 200, 255));
    p.set(C_SUN, new Color32(255, 240, 100));
    p.set(C_SUN_GLOW, new Color32(255, 255, 180));
    p.set(C_GROUND, new Color32(80, 160, 60));
    p.set(C_GROUND_DARK, new Color32(50, 120, 40));
    p.set(C_TRUNK, new Color32(100, 60, 30));
    p.set(C_LEAVES, new Color32(40, 140, 50));
    p.set(C_LEAVES_LIGHT, new Color32(80, 180, 70));
    p.set(C_FLOWER_1, new Color32(255, 80, 120));
    p.set(C_FLOWER_2, new Color32(255, 200, 60));
    p.set(C_CLOUD, new Color32(240, 245, 255));
    p.set(C_MOUNTAIN, new Color32(100, 110, 140));
    p.set(C_MOUNTAIN_LIGHT, new Color32(140, 150, 175));
}

/**
 * Builds the "night" palette -- dark, desaturated blues and purples.
 *
 * @param {Palette} p - Palette to fill.
 */
function fillNightPalette(p) {
    p.set(C_WHITE, new Color32(200, 200, 220));
    p.set(C_BG, new Color32(5, 5, 15));
    p.set(C_LABEL, new Color32(180, 160, 100));
    p.set(C_DIM, new Color32(80, 80, 110));
    p.set(C_FPS, new Color32(40, 40, 60));

    p.set(C_SKY, new Color32(15, 20, 50));
    p.set(C_SKY_LIGHT, new Color32(25, 35, 70));
    p.set(C_SUN, new Color32(200, 200, 160));
    p.set(C_SUN_GLOW, new Color32(60, 60, 80));
    p.set(C_GROUND, new Color32(20, 50, 30));
    p.set(C_GROUND_DARK, new Color32(15, 35, 20));
    p.set(C_TRUNK, new Color32(40, 25, 15));
    p.set(C_LEAVES, new Color32(15, 50, 25));
    p.set(C_LEAVES_LIGHT, new Color32(25, 65, 35));
    p.set(C_FLOWER_1, new Color32(100, 30, 50));
    p.set(C_FLOWER_2, new Color32(100, 80, 30));
    p.set(C_CLOUD, new Color32(40, 45, 60));
    p.set(C_MOUNTAIN, new Color32(30, 35, 55));
    p.set(C_MOUNTAIN_LIGHT, new Color32(45, 50, 70));
}

// #endregion

// #region Main Logic

/**
 * Demonstrates BT.paletteFade(), BT.paletteFadeRange(), and BT.paletteFlash().
 * A pixel-art landscape transitions between day and night with smooth fades,
 * plus a lightning flash effect.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    palette = null;
    dayPalette = null;
    nightPalette = null;

    // Which phase of the day/night cycle we are in.
    phase = 'day';

    // Tick when the current phase started.
    phaseStartTick = 0;

    // Whether a fade/flash has been triggered for this phase.
    effectTriggered = false;

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Creates day and night palettes, activates the day palette, loads font.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        console.log('[PaletteFadeDemo] Initializing...');

        // Build both palettes.
        this.dayPalette = BT.paletteCreate(256);
        fillDayPalette(this.dayPalette);

        this.nightPalette = BT.paletteCreate(256);
        fillNightPalette(this.nightPalette);

        // Start with the day palette.
        this.palette = BT.paletteCreate(256);
        fillDayPalette(this.palette);
        BT.paletteSet(this.palette);

        console.log('[PaletteFadeDemo] Initialized');
        return true;
    }

    /**
     * Manages the day/night cycle state machine.
     * Each phase triggers a palette effect at its start and waits for a duration.
     */
    update() {
        const tick = BT.ticks();
        const elapsed = tick - this.phaseStartTick;

        // Trigger the effect for this phase (only once).
        this.triggerPhaseEffect();

        // Check if the current phase has expired and advance to the next one.
        this.advancePhaseIfExpired(elapsed, tick);
    }

    /**
     * Fires the palette effect for the current phase, if not already triggered.
     */
    triggerPhaseEffect() {
        if (this.effectTriggered) {
            return;
        }

        if (this.phase === 'fade-to-night') {
            // Smooth 2-second fade from current palette to night.
            BT.paletteFade(this.nightPalette, 2000, 'ease-in-out');
            this.effectTriggered = true;
        } else if (this.phase === 'flash') {
            // Lightning! White flash for 200ms.
            BT.paletteFlash(new Color32(255, 255, 255), 200);
            this.effectTriggered = true;
        } else if (this.phase === 'fade-to-day') {
            // Dawn: 2-second fade back to day, with ease-out for a quick start.
            BT.paletteFade(this.dayPalette, 2000, 'ease-out');
            this.effectTriggered = true;
        }
    }

    /**
     * Checks whether the current phase has run long enough and advances to the next.
     *
     * @param {number} elapsed - Ticks since the current phase started.
     * @param {number} tick - Current tick count.
     */
    advancePhaseIfExpired(elapsed, tick) {
        // Each phase has a fixed duration and a "next phase" to transition into.
        const transitions = {
            day: { duration: PHASE_DAY_HOLD, next: 'fade-to-night' },
            'fade-to-night': { duration: PHASE_FADE_TO_NIGHT, next: 'night' },
            night: { duration: PHASE_NIGHT_HOLD, next: 'flash' },
            flash: { duration: PHASE_FLASH, next: 'night-2' },
            'night-2': { duration: PHASE_NIGHT_HOLD_2, next: 'fade-to-day' },
            'fade-to-day': { duration: PHASE_FADE_TO_DAY, next: 'day' },
        };

        const current = transitions[this.phase];

        if (current && elapsed >= current.duration) {
            this.startPhase(current.next, tick);
        }
    }

    /**
     * Draws the pixel-art landscape. The scene geometry never changes --
     * only the palette colors shift via the fade/flash effects.
     */
    render() {
        // Sky fills the whole screen as background.
        BT.clear(C_SKY);

        this.renderScene();
        this.renderUI();
    }

    // #endregion

    // #region Phase Management

    /**
     * Transitions to a new phase of the day/night cycle.
     *
     * @param {string} newPhase - Name of the phase to enter.
     * @param {number} tick - Current tick when the phase starts.
     */
    startPhase(newPhase, tick) {
        this.phase = newPhase;
        this.phaseStartTick = tick;
        this.effectTriggered = false;
    }

    // #endregion

    // #region Render Helpers

    /**
     * Draws the landscape: sky gradient, clouds, mountains, sun, ground, trees, flowers.
     * All draw calls use palette indices only.
     */
    renderScene() {
        // --- Sky gradient (two bands) ---
        BT.drawRectFill(new Rect2i(0, 0, 320, 80), C_SKY);
        BT.drawRectFill(new Rect2i(0, 80, 320, 40), C_SKY_LIGHT);

        // --- Clouds ---
        this.drawCloud(30, 20);
        this.drawCloud(180, 35);
        this.drawCloud(260, 15);

        // --- Mountains ---
        this.drawMountain(60, 105, 80, 35);
        this.drawMountain(160, 100, 100, 40);
        this.drawMountain(250, 108, 70, 32);

        // --- Sun ---
        BT.drawRectFill(new Rect2i(250, 25, 20, 20), C_SUN);
        BT.drawRectFill(new Rect2i(248, 27, 24, 16), C_SUN_GLOW);

        // --- Ground ---
        BT.drawRectFill(new Rect2i(0, 120, 320, 120), C_GROUND);
        BT.drawRectFill(new Rect2i(0, 180, 320, 60), C_GROUND_DARK);

        // --- Trees ---
        this.drawTree(40, 110);
        this.drawTree(100, 115);
        this.drawTree(200, 108);
        this.drawTree(270, 118);

        // --- Flowers ---
        this.drawFlowers();
    }

    /**
     * Draws a simple cloud shape at the given position.
     *
     * @param {number} x - Left position.
     * @param {number} y - Top position.
     */
    drawCloud(x, y) {
        BT.drawRectFill(new Rect2i(x, y, 30, 8), C_CLOUD);
        BT.drawRectFill(new Rect2i(x + 5, y - 4, 20, 6), C_CLOUD);
    }

    /**
     * Draws a triangular mountain shape using stacked rectangles.
     *
     * @param {number} x - Center x.
     * @param {number} baseY - Bottom of the mountain.
     * @param {number} width - Base width.
     * @param {number} height - Mountain height.
     */
    drawMountain(x, baseY, width, height) {
        // Draw the mountain as a series of horizontal slices getting narrower toward the top.
        for (let row = 0; row < height; row++) {
            const t = row / height; // 0 at bottom, 1 at top
            const sliceW = Math.floor(width * (1 - t * 0.8));
            const sliceX = x - Math.floor(sliceW / 2);
            const sliceY = baseY - row;

            // Upper half is lighter (snow-capped effect).
            const slot = t > 0.6 ? C_MOUNTAIN_LIGHT : C_MOUNTAIN;

            BT.drawRectFill(new Rect2i(sliceX, sliceY, sliceW, 1), slot);
        }
    }

    /**
     * Draws a simple tree (trunk + leaf canopy).
     *
     * @param {number} x - Trunk center x.
     * @param {number} groundY - Y position of the ground line.
     */
    drawTree(x, groundY) {
        // Trunk.
        BT.drawRectFill(new Rect2i(x - 2, groundY - 20, 4, 20), C_TRUNK);

        // Leaf canopy (rounded-ish shape from stacked rects).
        BT.drawRectFill(new Rect2i(x - 10, groundY - 35, 20, 8), C_LEAVES);
        BT.drawRectFill(new Rect2i(x - 14, groundY - 27, 28, 10), C_LEAVES);
        BT.drawRectFill(new Rect2i(x - 8, groundY - 40, 16, 8), C_LEAVES_LIGHT);
    }

    /**
     * Scatters small flower pixels across the ground.
     */
    drawFlowers() {
        // A fixed set of flower positions so they don't jump around.
        const flowers = [
            [20, 140],
            [55, 155],
            [80, 145],
            [120, 160],
            [155, 142],
            [190, 158],
            [220, 148],
            [255, 165],
            [290, 138],
            [35, 170],
            [70, 175],
            [140, 172],
            [210, 170],
            [260, 178],
        ];

        for (let i = 0; i < flowers.length; i++) {
            const [fx, fy] = flowers[i];
            // Alternate between two flower colors.
            const slot = i % 2 === 0 ? C_FLOWER_1 : C_FLOWER_2;

            BT.drawPixel(new Vector2i(fx, fy), slot);
            BT.drawPixel(new Vector2i(fx + 1, fy), slot);
            BT.drawPixel(new Vector2i(fx, fy + 1), slot);
            BT.drawPixel(new Vector2i(fx + 1, fy + 1), slot);
        }
    }

    /**
     * Draws UI overlay: phase label and FPS counter.
     */
    renderUI() {
        // Phase label.
        const phaseLabels = {
            day: 'Day',
            'fade-to-night': 'Fading to night... (ease-in-out)',
            night: 'Night',
            flash: 'Lightning flash!',
            'night-2': 'Night',
            'fade-to-day': 'Dawn... (ease-out)',
        };

        const label = phaseLabels[this.phase] || this.phase;

        // Dark background strip for readability.
        BT.drawRectFill(new Rect2i(0, 0, 320, 16), C_GROUND_DARK);
        BT.systemPrint(new Vector2i(6, 2), C_LABEL, `Palette Fade & Flash - ${label}`);

        // FPS counter.
        BT.systemPrint(new Vector2i(250, 225), C_DIM, `FPS: ${BT.fps()}`);
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

bootstrap(Demo);

// #endregion
