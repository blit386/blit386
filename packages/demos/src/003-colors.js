// @pageTitle Blit-Tech Demo 003 - Colors
//
// Colors Demo -- a deep dive into Color32 and palettes in Blit-Tech.
//
// Demo 003 in the Blit-Tech demo series, written for young learners (around 12)
// who are getting comfortable with code. You will see:
//
//   - Named shortcut colors (red, green, blue, and friends)
//   - How red, green, and blue light mix to make new colors
//   - HSL: another way to pick colors (hue, saturation, lightness) and a scrolling rainbow
//   - Alpha: the fourth number that makes colors see-through
//   - Lerp: smoothly sliding between two colors (like a dimmer between two lights)
//
// We learned about the demo lifecycle, Vector2i, Rect2i, and clearing the screen in the Basics demo:
// https://vancura.dev/articles/blit-tech-basics
//
// Live version: https://vancura.dev/articles/blit-tech-colors
//
// IMPORTANT -- palettes and how they changed from older demos:
//
//   The engine now uses a "palette" -- a table of up to 256 numbered colors.
//   Instead of passing a Color32 to every draw call, you pick a number (an "index")
//   from the palette. Think of it like numbered paint cans: you choose which can to use,
//   not the exact mix of paint every time you pick up the brush.
//
//   Static colors (named swatches, alpha layers) go into the palette once during init().
//   Animated colors (HSL rainbow, lerp gradient, pulse) are recalculated every tick
//   inside update() and written back into their reserved palette slots.
//   render() only ever uses palette index numbers -- no Color32 objects there.
//
// IMPORTANT -- update() ticks vs render() frames:
//   update() runs at a fixed rate (here, 60 times per second when the tab is active).
//   Each call to update() is one "tick". Our animTime adds 1/60 on every tick, so after
//   60 ticks (about one second), animTime is about 1.0. That is time measured in ticks,
//   not in how often the monitor redraws. render() can run a different number of times
//   per second on high-refresh screens, but animTime still only changes inside update().

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

//
// These numbers are the palette "addresses". We name them so the code is readable.
// Index 0 is always transparent and reserved -- never assign to it.

// Basic colors (set once in init, never change).
const C_WHITE = 1; // Pure white -- font base and section headers.
const C_BG = 2; // Dark gray-blue background.
const C_BLACK = 3; // Pure black -- labels on light-colored swatches.
const C_RED = 4; // Color32.red -- (255, 0, 0).
const C_GREEN_N = 5; // Color32.green -- (0, 255, 0).
const C_BLUE_N = 6; // Color32.blue -- (0, 0, 255).
const C_YELLOW_N = 7; // Color32.yellow -- (255, 255, 0).
const C_CYAN_N = 8; // Color32.cyan -- (0, 255, 255).
const C_MAGENTA_N = 9; // Color32.magenta -- (255, 0, 255).

// Semi-transparent versions for the RGB mix section.
const C_MIX_RED_A = 10; // (255, 0, 0, 140) -- translucent red.
const C_MIX_GREEN_A = 11; // (0, 255, 0, 140) -- translucent green.
const C_MIX_BLUE_A = 12; // (0, 0, 255, 140) -- translucent blue.

// Alpha-layered colors for the alpha demo section.
const C_ALPHA_BASE = 13; // (255, 140, 40, 255) -- opaque orange base.
const C_ALPHA_1 = 14; // (80, 120, 255, 180) -- semi-transparent blue.
const C_ALPHA_2 = 15; // (200, 80, 200, 140) -- semi-transparent purple.
const C_ALPHA_3 = 16; // (120, 255, 120, 100) -- semi-transparent green.
const C_ALPHA_4 = 17; // (255, 255, 255, 70)  -- almost-invisible white.

// Lerp endpoints (the two colors being blended).
const C_LERP_A = 18; // (180, 40, 220) -- purple.
const C_LERP_B = 19; // (40, 220, 160) -- teal.

// Dynamic slots -- recalculated every tick in update().

// HSL rainbow strip: 64 hue slots covering the full 0..360 degree color wheel.
// Slot C_HSL_BASE+i represents the color for column group i.
const C_HSL_BASE = 30;
const HSL_SLOTS = 64; // 64 slots * (320/64 ≈ 5 pixels wide each) covers the screen.

// Lerp gradient bar: 32 color steps blending from C_LERP_A to C_LERP_B.
const C_LERP_BASE = 94;
const LERP_SLOTS = 32;

// Pulse slot: a single color that breathes back and forth between A and B.
const C_PULSE = 126;

// #endregion

// #region Main Logic

/**
 * Shows how Color32 works: RGB names, mixing, HSL rainbow, alpha, and lerp.
 * All animated colors are computed in update() and stored in palette slots.
 * render() uses only palette index numbers -- no Color32 objects there.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Instance State

    // animTime is "how many seconds of game time have passed".
    // We only change it in update(), so it follows logical time, not drawing time.
    animTime = 0;

    // The palette holds all the colors we are allowed to draw with.
    // Imagine it as a box of 256 numbered paint cans.
    palette = null;

    // The two Color32 objects used to compute the lerp gradient.
    // We store them here so update() can call colorA.lerp(colorB, t) every tick.
    lerpColorA = null;
    lerpColorB = null;

    // #endregion

    // #region Lifecycle

    /**
     * Sets up the palette and prepares lerp color objects.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        // --- Step 1: Create the palette ---
        this.palette = BT.paletteCreate(256);

        // --- Step 2: Fill in static colors ---

        // Basic colors.
        this.palette.set(C_WHITE, new Color32(255, 255, 255));
        this.palette.set(C_BG, new Color32(24, 28, 40));
        this.palette.set(C_BLACK, new Color32(0, 0, 0));

        // Named shortcut colors (same values as the Color32 static helpers).
        this.palette.set(C_RED, Color32.red);
        this.palette.set(C_GREEN_N, Color32.green);
        this.palette.set(C_BLUE_N, Color32.blue);
        this.palette.set(C_YELLOW_N, Color32.yellow);
        this.palette.set(C_CYAN_N, Color32.cyan);
        this.palette.set(C_MAGENTA_N, Color32.magenta);

        // Semi-transparent versions for the RGB mix section.
        // The fourth argument to Color32 is alpha: 255 = fully solid, 0 = fully invisible.
        this.palette.set(C_MIX_RED_A, new Color32(255, 0, 0, 140));
        this.palette.set(C_MIX_GREEN_A, new Color32(0, 255, 0, 140));
        this.palette.set(C_MIX_BLUE_A, new Color32(0, 0, 255, 140));

        // Alpha section layers (stacked from opaque base to nearly invisible).
        this.palette.set(C_ALPHA_BASE, new Color32(255, 140, 40, 255));
        this.palette.set(C_ALPHA_1, new Color32(80, 120, 255, 180));
        this.palette.set(C_ALPHA_2, new Color32(200, 80, 200, 140));
        this.palette.set(C_ALPHA_3, new Color32(120, 255, 120, 100));
        this.palette.set(C_ALPHA_4, new Color32(255, 255, 255, 70));

        // Lerp endpoints -- the two colors the gradient blends between.
        this.lerpColorA = new Color32(180, 40, 220); // Purple.
        this.lerpColorB = new Color32(40, 220, 160); // Teal.
        this.palette.set(C_LERP_A, this.lerpColorA);
        this.palette.set(C_LERP_B, this.lerpColorB);

        // HSL, lerp gradient, and pulse slots are left empty here.
        // update() will fill them before the first frame is drawn.

        // --- Step 3: Activate the palette ---
        BT.paletteSet(this.palette);

        return true;
    }

    /**
     * Advances logical time and recalculates all animated palette entries.
     *
     * - HSL rainbow: 64 hue slots scroll with animTime.
     * - Lerp gradient: 32 slots blend from colorA to colorB with a sliding phase.
     * - Pulse: 1 slot breathes between colorA and colorB using a sine wave.
     */
    update() {
        // Add one tick's worth of seconds. At 60 ticks per second, each tick is 1/60 of a second.
        this.animTime += BT.deltaSeconds;

        // --- HSL rainbow: 64 animated hue slots ---
        // Each slot gets a hue based on its position on the color wheel PLUS
        // a time-based scroll offset so the whole rainbow moves over time.
        const scroll = this.animTime * 90; // 90 degrees per second.
        for (let i = 0; i < HSL_SLOTS; i++) {
            // Spread the base hue evenly: slot 0 is hue 0, slot 63 is hue 337.5.
            const baseHue = (i / HSL_SLOTS) * 360;

            // Add scroll and wrap into 0..360 range.
            // % can give negative values in JS if the input is negative, so we add 360 first.
            const hue = (((baseHue + scroll) % 360) + 360) % 360;

            // fromHSL(hue, saturation, lightness): vivid rainbow needs 100% saturation, 50% lightness.
            this.palette.set(C_HSL_BASE + i, Color32.fromHSL(hue, 100, 50));
        }

        // --- Lerp gradient: 32 sliding color steps ---
        // phase01 cycles from 0 to 1 repeatedly, making the gradient appear to travel.
        const phase = this.animTime * 0.35; // Speed of the scroll.
        const phase01 = phase - Math.floor(phase); // Only the fractional part (0..1).

        for (let j = 0; j < LERP_SLOTS; j++) {
            // u is this slot's position along the bar (0 = left, 1 = right).
            const u = j / (LERP_SLOTS - 1);

            // Combine the bar position with the animated phase so the pattern moves.
            const t = (u + phase01) % 1; // Wraps at 1 to keep cycling.

            // lerp returns a new Color32 blended between A and B at position t.
            this.palette.set(C_LERP_BASE + j, this.lerpColorA.lerp(this.lerpColorB, t));
        }

        // --- Pulse: one color that breathes back and forth ---
        // Math.sin() returns a wave between -1 and 1.
        // We shift it to 0..1 by adding 1 and dividing by 2.
        const sinVal = Math.sin(this.animTime * 2.5);
        const pulseT = (sinVal + 1) / 2; // 0 when all colorA, 1 when all colorB.
        this.palette.set(C_PULSE, this.lerpColorA.lerp(this.lerpColorB, pulseT));
    }

    /**
     * Draws every section each frame. Always clear first, then paint from back to front.
     *
     * Notice: NO Color32 objects appear here. Every draw call uses a palette index.
     */
    render() {
        // Dark gray-blue background so bright color samples pop.
        BT.clear(C_BG);

        // Section 1: ready-made named colors in a row with short labels.
        this.drawNamedColorsSection();

        // Section 2: overlapping squares with transparency so mixes are visible.
        this.drawRgbMixSection();

        // Section 3: HSL rainbow strip with hue that scrolls over time.
        this.drawHslRainbowSection();

        // Section 4: solid base with softer layers on top to show alpha.
        this.drawAlphaSection();

        // Section 5: sliding blend between two colors using colorA.lerp(colorB, t).
        this.drawLerpSection();
    }

    // #endregion

    // #region Section Helpers

    /**
     * Paints the top row of preset Color32 colors (red(), green(), and so on).
     * Each block is a filled rectangle; the label sits above it in small text.
     */
    drawNamedColorsSection() {
        // Section header in white.
        // BT.systemPrint() arguments: (position, paletteIndex, text).
        BT.systemPrint(new Vector2i(6, 4), C_WHITE, '1 NAMED COLORS (shortcuts)');

        const rowY = 20;
        const swatchH = 16;

        // Each entry: a short label and the palette index for that named color.
        const entries = [
            { label: 'RED', index: C_RED },
            { label: 'GRN', index: C_GREEN_N },
            { label: 'BLU', index: C_BLUE_N },
            { label: 'YEL', index: C_YELLOW_N },
            { label: 'CYN', index: C_CYAN_N },
            { label: 'WHT', index: C_WHITE },
            { label: 'BLK', index: C_BLACK },
        ];

        // Shared horizontal padding so the row does not touch the screen edge.
        const margin = 6;
        // How many pixels wide each swatch can be if we split the row evenly.
        const slotW = Math.floor((320 - margin * 2) / entries.length);

        for (let slotIndex = 0; slotIndex < entries.length; slotIndex++) {
            const entry = entries[slotIndex];
            const x = margin + slotIndex * slotW;
            const swatchW = slotW - 4;

            // Light swatches (white, yellow) need black labels so you can read them.
            // Dark swatches get white labels.
            const isLight = entry.index === C_WHITE || entry.index === C_YELLOW_N;
            const labelColor = isLight ? C_BLACK : C_WHITE;

            // Print the label above the swatch.
            BT.systemPrint(new Vector2i(x, rowY - 10), labelColor, entry.label);

            // Fill a rectangle with that named color.
            BT.drawRectFill(new Rect2i(x, rowY, swatchW, swatchH), entry.index);
        }
    }

    /**
     * Shows additive-style mixing using semi-transparent squares.
     * When two colors overlap with alpha blending, your eye mixes them like colored lights.
     */
    drawRgbMixSection() {
        // Section header in white.
        BT.systemPrint(new Vector2i(6, 40), C_WHITE, '2 RGB MIX (overlap, see-through)');

        // Base y for the three little experiments side by side.
        const y0 = 52;
        const size = 34;

        // Left pair: red and green make yellow where they cross. Label in yellow.
        BT.systemPrint(new Vector2i(8, y0 - 10), C_YELLOW_N, 'R+G');
        BT.drawRectFill(new Rect2i(12, y0, size, size), C_MIX_RED_A);
        BT.drawRectFill(new Rect2i(28, y0 + 14, size, size), C_MIX_GREEN_A);

        // Middle pair: red and blue make magenta in the overlap. Label in magenta.
        BT.systemPrint(new Vector2i(118, y0 - 10), C_MAGENTA_N, 'R+B');
        BT.drawRectFill(new Rect2i(122, y0, size, size), C_MIX_RED_A);
        BT.drawRectFill(new Rect2i(138, y0 + 14, size, size), C_MIX_BLUE_A);

        // Right pair: green and blue make cyan in the overlap. Label in cyan.
        BT.systemPrint(new Vector2i(228, y0 - 10), C_CYAN_N, 'G+B');
        BT.drawRectFill(new Rect2i(232, y0, size, size), C_MIX_GREEN_A);
        BT.drawRectFill(new Rect2i(248, y0 + 14, size, size), C_MIX_BLUE_A);
    }

    /**
     * Draws one horizontal strip where each column group uses a palette slot from C_HSL_BASE.
     *
     * The HSL slots are updated in update() so the rainbow scrolls over time.
     * This function only maps each x column to the right slot -- no Color32 objects needed.
     *
     * Hue is an angle 0..360 on a color wheel. 64 slots cover the whole wheel in steps.
     */
    drawHslRainbowSection() {
        BT.systemPrint(new Vector2i(6, 102), C_WHITE, '3 HSL RAINBOW (fromHSL, scrolling hue)');

        const stripY = 114;
        const stripH = 8;

        // Walk every x column on the screen from left to right.
        // Each column maps to one of the 64 HSL palette slots.
        for (let x = 0; x < 320; x++) {
            // Which slot does this column belong to? There are 64 slots covering 320 pixels.
            // Math.floor(...) rounds down to get an integer slot index.
            const slot = Math.min(Math.floor((x / 320) * HSL_SLOTS), HSL_SLOTS - 1);

            BT.drawRectFill(new Rect2i(x, stripY, 1, stripH), C_HSL_BASE + slot);
        }
    }

    /**
     * Draws a bright base rectangle, then stacks softer rectangles on top.
     * The fourth number in new Color32(r, g, b, a) is alpha: 255 = solid, 0 = invisible.
     *
     * Each layer was pre-registered as a palette slot in init() so we only
     * need to pass index numbers here.
     */
    drawAlphaSection() {
        BT.systemPrint(new Vector2i(6, 126), C_WHITE, '4 ALPHA (fourth number = see-through)');

        const box = new Rect2i(20, 138, 200, 40);

        // Bottom layer: fully opaque orange -- you always see this one.
        BT.drawRectFill(box, C_ALPHA_BASE);

        // Each new layer is more transparent so you still see the orange through them.
        // Think of stacking colored plastic sheets on a flashlight.
        BT.drawRectFill(new Rect2i(36, 144, 168, 14), C_ALPHA_1);
        BT.drawRectFill(new Rect2i(50, 150, 140, 14), C_ALPHA_2);
        BT.drawRectFill(new Rect2i(64, 156, 112, 12), C_ALPHA_3);
        BT.drawRectFill(new Rect2i(78, 162, 84, 10), C_ALPHA_4);
    }

    /**
     * Uses lerp (linear interpolation) between two colors.
     * colorA.lerp(colorB, t) with t between 0 and 1 returns a mix: 0 means all A, 1 means all B.
     *
     * The gradient uses 32 slots computed in update() that scroll over time.
     * The pulse strip below uses a single slot that breathes A <-> B via a sine wave.
     *
     * The end swatches (small colored squares at left and right) use C_LERP_A and C_LERP_B directly.
     */
    drawLerpSection() {
        BT.systemPrint(new Vector2i(6, 184), C_WHITE, '5 LERP: slide + pulse (see comments)');

        const barY = 198;

        // Small squares at the ends showing the pure A and B colors.
        BT.drawRectFill(new Rect2i(8, barY, 12, 12), C_LERP_A);
        BT.systemPrint(new Vector2i(8, barY + 13), C_WHITE, 'A');
        BT.drawRectFill(new Rect2i(300, barY, 12, 12), C_LERP_B);
        BT.systemPrint(new Vector2i(300, barY + 13), C_WHITE, 'B');

        // Middle gradient bar: 268 pixels wide, using 32 pre-computed lerp slots.
        const barX = 26;
        const barW = 268;
        const barH = 8;

        for (let i = 0; i < barW; i++) {
            // Map this pixel to one of the 32 lerp slots.
            const slot = Math.min(Math.floor((i / barW) * LERP_SLOTS), LERP_SLOTS - 1);
            BT.drawRectFill(new Rect2i(barX + i, barY, 1, barH), C_LERP_BASE + slot);
        }

        // Thin strip below the gradient: the single pulsing color from C_PULSE.
        // In update() we use a sine wave to smoothly cycle pulseT 0 -> 1 -> 0 -> ...
        BT.drawRectFill(new Rect2i(26, 212, 268, 5), C_PULSE);
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

bootstrap(Demo);

// #endregion
