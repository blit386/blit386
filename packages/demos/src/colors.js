// Colors Demo – a deep dive into Color32 and palettes in BLIT386.
// @description A deep dive into Color32: named colors, HSL, and interpolating between two colors.
//
// Part of the BLIT386 demo series, written for young learners (around 12)
// who are getting comfortable with code. You will see:
//
//   - Named shortcut colors (Color32.red and friends – static properties, not function calls)
//   - HSL: another way to pick colors (hue, saturation, lightness) and a scrolling rainbow
//   - Lerp: smoothly sliding between two colors (like a dimmer between two lights)
//
// We learned about the demo lifecycle, Vector2i, Rect2i, and clearing the screen in the Basics demo:
// https://demos.blit386.dev/basics
//
// Live version: https://demos.blit386.dev/colors
// Guide: https://blit386.dev/docs/api/core-types#color32
//
// IMPORTANT – palettes and how they changed from older demos:
//
//   The engine now uses a "palette" – a table of up to 256 numbered colors.
//   Instead of passing a Color32 to every draw call, you pick a number (an "index")
//   from the palette. Think of it like numbered paint cans: you choose which can to use,
//   not the exact mix of paint every time you pick up the brush.
//
//   Static colors (named swatches, overlay text) go into the palette once during init().
//   Animated colors (HSL rainbow, lerp gradient, pulse) are recalculated every tick
//   inside update() and written back into their reserved palette slots.
//   render() only ever uses palette index numbers – no Color32 objects there.
//
//   The numbered section headers are drawn with the shared UI kit (src/shared/ui.js),
//   which parks its own twelve colors in high slots 240-251 – far away from every slot
//   this lesson uses. The swatches and their little labels stay hand-drawn on purpose:
//   they ARE the lesson.
//
// IMPORTANT – update() ticks vs render() frames:
//   update() runs at a fixed rate (here, 60 times per second when the tab is active).
//   Each call to update() is one "tick". Our animTime adds 1/60 on every tick, so after
//   60 ticks (about one second), animTime is about 1.0. That is time measured in ticks,
//   not in how often the monitor redraws. render() can run a different number of times
//   per second on high-refresh screens, but animTime still only changes inside update().

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

// The shared demo UI kit: applyTheme() installs the series' standard UI colors into the
// palette, and ui.caption() prints the section headers with them. We met the kit in the
// Basics demo: https://demos.blit386.dev/basics
import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').Color32} Color32 */

//
// These numbers are the palette "addresses". We name them so the code is readable.
// Index 0 is always transparent and reserved – never assign to it.

// Basic colors (set once in init, never change).
const C_WHITE = 1; // Pure white – the WHT swatch and labels on dark swatches.
const C_BG = 2; // Dark gray-blue background.
const C_BLACK = 3; // Pure black – labels on light-colored swatches.
const C_RED = 4; // Color32.red – (255, 0, 0).
const C_GREEN_N = 5; // Color32.green – (0, 255, 0).
const C_BLUE_N = 6; // Color32.blue – (0, 0, 255).
const C_YELLOW_N = 7; // Color32.yellow – (255, 255, 0).
const C_CYAN_N = 8; // Color32.cyan – (0, 255, 255).
const C_MAGENTA_N = 9; // Color32.magenta – (255, 0, 255).

// Overlay text color: a muted purple, set once in init() like the basic colors above.
const C_OVERLAY_TEXT = 15; // (200, 80, 200, 140) – semi-transparent purple.

// Lerp endpoints (the two colors being blended).
const C_LERP_A = 18; // (180, 40, 220) – purple.
const C_LERP_B = 19; // (40, 220, 160) – teal.

// Static overlay bar color – never animated (configure() needs a fixed slot).
const C_OVERLAY_BAR = 20; // Soft blue-gray for the engine overlay background strip.

// Dynamic slots – recalculated every tick in update().

// HSL rainbow strip: 64 hue slots covering the full 0..360 degree color wheel.
// Slot C_HSL_BASE+i represents the color for column group i.
const C_HSL_BASE = 30;
const HSL_SLOTS = 64; // 64 slots * (320/64 ≈ 5 pixels wide each) covers the screen.

// Lerp gradient bar: 32 color steps blending from C_LERP_A to C_LERP_B.
const C_LERP_BASE = 94;
const LERP_SLOTS = 32;

// Pulse slot: a single color that breathes back and forth between A and B.
const C_PULSE = 126;

/**
 * Shows how Color32 works: named colors, HSL rainbow, and lerp.
 * All animated colors are computed in update() and stored in palette slots.
 * render() uses only palette index numbers – no Color32 objects there.
 *
 * @implements {IBTDemo}
 */
class Demo {
    // animTime is "how many seconds of game time have passed".
    // We only change it in update(), so it follows logical time, not drawing time.
    animTime = 0;

    // The palette holds all the colors we are allowed to draw with.
    // Imagine it as a box of 256 numbered paint cans.
    /** @type {Palette | null} */
    palette = null;

    // theme remembers which palette slots the shared UI kit colors landed in.
    // applyTheme() in init() fills it with a map like { bg, text, dim, header, ... }.
    theme = null;

    // The two Color32 objects used to compute the lerp gradient.
    // We store them here so update() can call colorA.lerp(colorB, t) every tick.
    /** @type {Color32 | null} */
    lerpColorA = null;
    /** @type {Color32 | null} */
    lerpColorB = null;

    /**
     * Optional engine settings. We keep the default 320x240 screen and show the
     * palette grid in the overlay with 4 visible rows (scroll for the rest).
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            isOverlayPaletteEnabled: true,
            overlayPaletteRowsVisible: 4,

            overlayStyle: {
                // Dedicated static slot – not C_LERP_BASE, which update() rewrites every tick.
                barPaletteIndex: C_OVERLAY_BAR,
                textPaletteIndex: C_OVERLAY_TEXT,
                gapPaletteIndex: C_BLACK,
            },
        };
    }

    /**
     * Sets up the palette and prepares lerp color objects.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        // Step 1: Create the palette
        this.palette = BT.paletteCreate(256);

        // Step 2: Fill in static colors

        // Basic colors.
        this.palette.set(C_WHITE, new Color32(255, 255, 255));
        this.palette.set(C_BG, new Color32(24, 28, 40));
        this.palette.set(C_BLACK, new Color32(0, 0, 0));

        // Named shortcut colors: Color32.red, Color32.green, etc. are static properties
        // on the Color32 class (ready-made Color32 objects). Copy them into the palette
        // so render() can draw with index numbers instead of passing Color32 each time.
        this.palette.set(C_RED, Color32.red);
        this.palette.set(C_GREEN_N, Color32.green);
        this.palette.set(C_BLUE_N, Color32.blue);
        this.palette.set(C_YELLOW_N, Color32.yellow);
        this.palette.set(C_CYAN_N, Color32.cyan);
        this.palette.set(C_MAGENTA_N, Color32.magenta);

        // Overlay text color. The fourth argument to Color32 is alpha: 255 = fully
        // solid, 0 = fully invisible.
        this.palette.set(C_OVERLAY_TEXT, new Color32(200, 80, 200, 140));

        // Lerp endpoints – the two colors the gradient blends between.
        this.lerpColorA = new Color32(180, 40, 220); // Purple.
        this.lerpColorB = new Color32(40, 220, 160); // Teal.
        this.palette.set(C_LERP_A, this.lerpColorA);
        this.palette.set(C_LERP_B, this.lerpColorB);

        // Overlay bar: a calm static color so the HUD strip does not pulse with the lerp demo.
        this.palette.set(C_OVERLAY_BAR, new Color32(40, 48, 64));

        // HSL, lerp gradient, and pulse slots are left empty here.
        // update() will fill them before the first frame is drawn.

        // Step 3: Install the shared UI theme
        // applyTheme() writes the series' twelve standard UI colors into slots 240-251,
        // safely above every slot this lesson uses (the static colors in 1-20 and the
        // animated ranges 30-93, 94-125, and 126). The section headers draw with them.
        // This must happen BEFORE BT.paletteSet() below so the colors are included.
        this.theme = applyTheme(this.palette);

        // Step 4: Activate the palette
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

        // HSL rainbow: 64 animated hue slots
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

        // Lerp gradient: 32 sliding color steps
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

        // Pulse: one color that breathes back and forth
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

        // Section 2: HSL rainbow strip with hue that scrolls over time.
        this.drawHslRainbowSection();

        // Section 3: sliding blend between two colors using colorA.lerp(colorB, t).
        this.drawLerpSection();
    }

    /**
     * Paints the top row of preset Color32 colors (red(), green(), and so on).
     * Each block is a filled rectangle; the label sits above it in small text.
     */
    drawNamedColorsSection() {
        // Section header, drawn with ui.caption() from the shared UI kit. Every demo in
        // the series uses this same widget, so all headers look identical everywhere.
        ui.caption(6, 3, '1: NAMED COLORS (shortcuts)');

        const rowY = 16;
        const swatchH = 11;

        // Each entry: a short label and the palette index for that named color.
        const entries = [
            { label: 'RED', index: C_RED },
            { label: 'GREEN', index: C_GREEN_N },
            { label: 'BLUE', index: C_BLUE_N },
            { label: 'YELLOW', index: C_YELLOW_N },
            { label: 'CYAN', index: C_CYAN_N },
            { label: 'WHITE', index: C_WHITE },
            { label: 'BLACK', index: C_BLACK },
        ];

        // Shared horizontal padding so the row does not touch the screen edge.
        const margin = 6;

        // How many pixels wide each swatch can be if we split the row evenly.
        const slotW = Math.floor((320 - margin * 2) / entries.length);

        for (let slotIndex = 0; slotIndex < entries.length; slotIndex++) {
            const entry = entries[slotIndex];
            const x = margin + slotIndex * slotW;
            const swatchW = slotW - 4;

            // Light swatches (white, yellow, green, cyan) need black labels so you can read them.
            // Dark swatches get white labels.
            const isLight =
                entry.index === C_WHITE ||
                entry.index === C_YELLOW_N ||
                entry.index === C_GREEN_N ||
                entry.index === C_CYAN_N;
            const labelColor = isLight ? C_BLACK : C_WHITE;

            // Fill a rectangle with that named color.
            BT.drawRectFill(new Rect2i(x, rowY, swatchW, swatchH), entry.index);

            // Print the label into the swatch.
            BT.systemPrint(new Vector2i(x + 2, rowY - 1), labelColor, entry.label);
        }
    }

    /**
     * Draws one horizontal strip where each column group uses a palette slot from C_HSL_BASE.
     *
     * The HSL slots are updated in update() so the rainbow scrolls over time.
     * This function only maps each x column to the right slot – no Color32 objects needed.
     *
     * Hue is an angle 0..360 on a color wheel. 64 slots cover the whole wheel in steps.
     */
    drawHslRainbowSection() {
        ui.caption(6, 30, '2: HSL RAINBOW (fromHSL, scrolling hue)');

        const stripY = 43;
        const stripH = 11;

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
     * Section 3: lerp (linear interpolation) between two colors.
     *
     * Think of t like a dimmer switch between two lamps: t = 0 is only lamp A (purple),
     * t = 1 is only lamp B (teal), and t = 0.5 is an even mix halfway between them.
     * colorA.lerp(colorB, t) returns a new Color32 at that blend point.
     *
     * The wide bar uses 32 palette slots that slide over time (a moving gradient).
     * The thin strip below uses one slot that breathes A <-> B with a sine wave.
     */
    drawLerpSection() {
        ui.caption(6, 57, '3: LERP: slide + pulse (see comments)');

        const barY = 70;

        // Dimmer analogy: these end squares are the two "lamps" at full brightness (pure A and B).
        BT.drawRectFill(new Rect2i(6, barY, 11, 11), C_LERP_A);
        BT.systemPrint(new Vector2i(8, barY - 1), C_BLACK, 'A');
        BT.drawRectFill(new Rect2i(300, barY, 11, 11), C_LERP_B);
        BT.systemPrint(new Vector2i(302, barY - 1), C_BLACK, 'B');

        // Middle gradient bar: each column is another step on the dimmer between A and B.
        // update() already wrote 32 blended colors into palette slots C_LERP_BASE.. .
        const barX = 24;
        const barW = 268;
        const barH = 11;

        for (let i = 0; i < barW; i++) {
            // Pick which of the 32 pre-blended "dimmer steps" this pixel column uses.
            const slot = Math.min(Math.floor((i / barW) * LERP_SLOTS), LERP_SLOTS - 1);
            BT.drawRectFill(new Rect2i(barX + i, barY, 1, barH), C_LERP_BASE + slot);
        }

        // Thin strip: one color slot whose t value waves back and forth (whole bar pulses).
        // In update(), pulseT follows a sine wave so the dimmer slides A -> B -> A smoothly.
        BT.drawRectFill(new Rect2i(24, 82, 268, 11), C_PULSE);
    }
}

bootstrap(Demo);
