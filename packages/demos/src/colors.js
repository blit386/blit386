/*

Colors: a closer look at Color32 - named colors, HSL, and blending between two colors.
@description A deep dive into Color32: named colors, HSL, and interpolating between two colors.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives

Live version: https://demos.blit386.dev/colors

Guides:
  - Palette: https://blit386.dev/docs/guides/palette#draw-using-absolute-palette-indices
  - Overlay: https://blit386.dev/docs/guides/overlay#colors-and-hud-palette-slots

Reference:
  - Core types: https://blit386.dev/docs/api/core-types#color32

---

WHAT YOU WILL SEE
-----------------

Three numbered sections stacked on a dark gray-blue screen:

  1. NAMED COLORS: a row of seven labeled swatches - red, green, blue, yellow, cyan,
     white, and black.
  2. HSL RAINBOW: a strip across the full screen width that cycles through every hue, and
     keeps scrolling sideways.
  3. LERP: a purple "A" square on the left, a teal "B" square on the right, a gradient
     bar between them that slides along, and a thin strip below it that pulses from A to
     B and back.

The engine overlay is open from the start, with the palette grid showing 4 rows at a time
so you can watch the animated slots change color.

WHAT YOU WILL LEARN
-------------------

- Named shortcut colors: Color32.red, Color32.green, and friends are static properties,
  not function calls - ready-made Color32 objects you can copy into a palette.
- HSL: Color32.fromHSL(hue, saturation, lightness) picks a color by its angle on the
  color wheel (0-360) instead of mixing red, green, and blue by hand.
- Lerp: colorA.lerp(colorB, t) returns the color a fraction t of the way from A to B,
  like a dimmer between two lamps.
- The fourth Color32 argument is alpha: 255 is fully solid, 0 fully invisible.
- Palette animation: static colors go into the palette once in init(); animated colors
  are recalculated every tick in update() and written back into reserved slots. render()
  only ever uses slot numbers.
- Counting time in seconds with BT.deltaSeconds, the length of one update tick.

HOW THE PALETTE IS LAID OUT
---------------------------

- Slots 1-9: the static basics - white, background, black, and the six named colors.
- Slot 15: the overlay text color. Slots 18-19: the lerp endpoints A and B. Slot 20: the
  overlay bar color.
- Slots 30-93: the 64 rainbow hues. Slots 94-125: the 32 gradient steps. Slot 126: the
  pulse color. These are rewritten every tick.
- Slots 240-251: the shared UI kit's own twelve colors, used for the numbered
  section headers. The swatches and their small labels are hand-drawn on purpose:
  they ARE the lesson.

UPDATE VS RENDER
----------------

- update() runs at a fixed rate, 60 times per second (the engine default). Each call is
  one "tick", and animTime grows by BT.deltaSeconds (1/60 of a second) per tick, so after
  60 ticks it is about 1.0.
- render() may run a different number of times per second on a high-refresh monitor, but
  animTime only changes inside update(), so the animation speed is the same everywhere.

TRY THIS
--------

- The overlay is already open. Watch its palette grid at the bottom: slots 30-93 scroll
  through the rainbow, 94-125 slide, and 126 pulses, in step with the strips above.
- Press the backquote key (`) or click/tap the symbol in the bottom-left corner to hide
  the overlay and see the whole screen.

*/

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

// The shared demo UI kit: applyTheme() installs the series' standard UI colors into the
// palette, and ui.caption() prints the section headers with them. We met the kit in the
// Basics demo: https://demos.blit386.dev/basics
import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').Color32} Color32 */

// These numbers are the palette "addresses". We name them so the code reads well. Slot 0
// is always transparent and reserved - never write to it.

// Basic colors: set once in init(), never changed.
const C_WHITE = 1; // pure white: the WHITE swatch and labels on dark swatches
const C_BG = 2; // dark gray-blue background
const C_BLACK = 3; // pure black: the BLACK swatch and labels on light swatches
const C_RED = 4; // Color32.red (255, 0, 0)
const C_GREEN_N = 5; // Color32.green (0, 255, 0)
const C_BLUE_N = 6; // Color32.blue (0, 0, 255)
const C_YELLOW_N = 7; // Color32.yellow (255, 255, 0)
const C_CYAN_N = 8; // Color32.cyan (0, 255, 255)
const C_MAGENTA_N = 9; // Color32.magenta (255, 0, 255)

// Overlay text color: a muted purple, set once in init() like the basic colors above.
const C_OVERLAY_TEXT = 15; // (200, 80, 200, 140): semi-transparent purple

// Lerp endpoints: the two colors being blended.
const C_LERP_A = 18; // (180, 40, 220) purple
const C_LERP_B = 19; // (40, 220, 160) teal

// Static overlay bar color, never animated: configure() needs a slot that holds still.
const C_OVERLAY_BAR = 20; // soft blue-gray strip behind the engine overlay text

// Animated slots: recalculated every tick in update().

// HSL rainbow strip: 64 hue slots covering the whole 0-360 degree color wheel. Slot
// C_HSL_BASE + i holds the color for the i-th group of columns.
const C_HSL_BASE = 30;
const HSL_SLOTS = 64; // 64 slots, each 5 pixels wide, cover the 320-pixel screen

// Lerp gradient bar: 32 color steps blending from C_LERP_A to C_LERP_B.
const C_LERP_BASE = 94;
const LERP_SLOTS = 32;

// Pulse slot: a single color that breathes back and forth between A and B.
const C_PULSE = 126;

// Shows how Color32 works: named colors, an HSL rainbow, and lerp. All animated colors
// are computed in update() and stored in palette slots; render() uses only slot numbers.
class Demo {
    // How many seconds of game time have passed. We only change it in update(), so it
    // follows logical time, not drawing time.
    animTime = 0;

    // The palette holds all the colors we are allowed to draw with. Imagine a box of 256
    // numbered paint cans.
    /** @type {Palette | null} */
    palette = null;

    // Palette slot map for the shared UI kit theme, filled in init() by applyTheme(): a
    // map like { bg, text, dim, header, ... } of slot numbers.
    theme = null;

    // The two Color32 objects the lerp gradient blends between. We keep them here so
    // update() can call lerpColorA.lerp(lerpColorB, t) every tick.
    /** @type {Color32 | null} */
    lerpColorA = null;

    /** @type {Color32 | null} */
    lerpColorB = null;

    // Optional engine settings. We keep the default 320x240 screen, open the overlay from
    // the start, and show its palette grid with 4 visible rows (scroll for the rest).
    configure() {
        return {
            isOverlayPaletteEnabled: true,
            overlayPaletteRowsVisible: 4,

            overlayStyle: {
                // A dedicated static slot - not one of the lerp slots update() rewrites.
                barPaletteIndex: C_OVERLAY_BAR,
                textPaletteIndex: C_OVERLAY_TEXT,
                gapPaletteIndex: C_BLACK,
            },
        };
    }

    // Sets up the palette and prepares the two lerp colors.
    async init() {
        // Step 1: create the palette.
        this.palette = BT.paletteCreate(256);

        // Step 2: fill in the static colors, starting with the basics.
        this.palette.set(C_WHITE, new Color32(255, 255, 255));
        this.palette.set(C_BG, new Color32(24, 28, 40));
        this.palette.set(C_BLACK, new Color32(0, 0, 0));

        // Named shortcut colors: Color32.red, Color32.green, and so on are static
        // properties on the Color32 class - ready-made Color32 objects. Copy them into
        // the palette so render() can draw with slot numbers instead of passing a
        // Color32 each time.
        this.palette.set(C_RED, Color32.red);
        this.palette.set(C_GREEN_N, Color32.green);
        this.palette.set(C_BLUE_N, Color32.blue);
        this.palette.set(C_YELLOW_N, Color32.yellow);
        this.palette.set(C_CYAN_N, Color32.cyan);
        this.palette.set(C_MAGENTA_N, Color32.magenta);

        // Overlay text color. The fourth argument to Color32 is alpha: 255 is fully
        // solid, 0 is fully invisible.
        this.palette.set(C_OVERLAY_TEXT, new Color32(200, 80, 200, 140));

        // Lerp endpoints: the two colors the gradient blends between.
        this.lerpColorA = new Color32(180, 40, 220); // purple
        this.lerpColorB = new Color32(40, 220, 160); // teal
        this.palette.set(C_LERP_A, this.lerpColorA);
        this.palette.set(C_LERP_B, this.lerpColorB);

        // Overlay bar: a calm static color so the HUD strip does not pulse with the lerp.
        this.palette.set(C_OVERLAY_BAR, new Color32(40, 48, 64));

        // The HSL, gradient, and pulse slots stay empty here. update() fills them before
        // the first frame is drawn.

        // Step 3: install the shared UI theme. applyTheme() writes the series' twelve
        // standard UI colors into slots 240-251, safely above every slot this lesson uses
        // (the static colors in 1-20 and the animated ranges 30-93, 94-125, and 126). The
        // section headers draw with them. This must happen BEFORE BT.paletteSet() below
        // so the colors go live with the palette.
        this.theme = applyTheme(this.palette);

        // Step 4: activate the palette.
        BT.paletteSet(this.palette);

        return true;
    }

    // Advances logical time and recalculates every animated palette slot:
    //   - HSL rainbow: 64 hue slots that scroll with animTime.
    //   - Lerp gradient: 32 slots blending from A to B with a sliding phase.
    //   - Pulse: 1 slot breathing between A and B on a sine wave.
    update() {
        // Add one tick's worth of seconds. BT.deltaSeconds is 1/60 at 60
        // ticks per second.
        this.animTime += BT.deltaSeconds;

        // HSL rainbow: each slot gets a hue from its position on the color wheel PLUS a
        // time-based offset, so the whole rainbow scrolls over time.
        const scroll = this.animTime * 90; // 90 degrees per second

        for (let i = 0; i < HSL_SLOTS; i++) {
            // Spread the base hues evenly: slot 0 is hue 0, slot 63 is hue 337.5.
            const baseHue = (i / HSL_SLOTS) * 360;

            // Add the scroll and wrap into 0-360. % (remainder) can give a negative
            // result in JavaScript when its input is negative, so we add 360 first
            // and wrap again.
            const hue = (((baseHue + scroll) % 360) + 360) % 360;

            // fromHSL(hue, saturation, lightness): a vivid rainbow needs saturation 100
            // and lightness 50.
            this.palette.set(C_HSL_BASE + i, Color32.fromHSL(hue, 100, 50));
        }

        // Lerp gradient: phase01 cycles from 0 to 1 over and over, which makes the
        // gradient appear to travel along the bar.
        const phase = this.animTime * 0.35; // speed of the slide
        const phase01 = phase - Math.floor(phase); // only the fractional part (0-1)

        for (let j = 0; j < LERP_SLOTS; j++) {
            // u is this slot's position along the bar: 0 at the left, 1 at the right.
            const u = j / (LERP_SLOTS - 1);

            // Combine the bar position with the animated phase so the pattern moves.
            const t = (u + phase01) % 1; // wraps at 1 to keep cycling

            // lerp returns a new Color32 blended between A and B at position t.
            this.palette.set(C_LERP_BASE + j, this.lerpColorA.lerp(this.lerpColorB, t));
        }

        // Pulse: one color that breathes back and forth. Math.sin() returns a wave
        // between -1 and 1; adding 1 and dividing by 2 shifts it into 0-1.
        const sinVal = Math.sin(this.animTime * 2.5);
        const pulseT = (sinVal + 1) / 2; // 0 is all A, 1 is all B
        this.palette.set(C_PULSE, this.lerpColorA.lerp(this.lerpColorB, pulseT));
    }

    // Draws every section each frame. Always clear first, then paint from back to front.
    // Notice: NO Color32 objects appear here. Every draw call uses a palette slot.
    render() {
        // Dark gray-blue background so the bright color samples pop.
        BT.clear(C_BG);

        // Section 1: ready-made named colors in a row with short labels.
        this.drawNamedColorsSection();

        // Section 2: the HSL rainbow strip with a hue that scrolls over time.
        this.drawHslRainbowSection();

        // Section 3: a sliding blend between two colors, made with lerp.
        this.drawLerpSection();
    }

    // Paints the row of swatches: red, green, blue, yellow, cyan, white, black. Each is a
    // filled rectangle with its label printed over the top edge.
    drawNamedColorsSection() {
        // Section header, drawn with ui.caption() from the shared UI kit. Every demo in
        // the series uses this same widget, so all headers look identical everywhere.
        ui.caption(6, 3, '1: NAMED COLORS (shortcuts)');

        const rowY = 16;
        const swatchH = 11;

        // Each entry: a short label and the palette slot for that color.
        const entries = [
            { label: 'RED', index: C_RED },
            { label: 'GREEN', index: C_GREEN_N },
            { label: 'BLUE', index: C_BLUE_N },
            { label: 'YELLOW', index: C_YELLOW_N },
            { label: 'CYAN', index: C_CYAN_N },
            { label: 'WHITE', index: C_WHITE },
            { label: 'BLACK', index: C_BLACK },
        ];

        // Horizontal padding so the row does not touch the screen edge.
        const margin = 6;

        // How many pixels wide each swatch may be if we split the row evenly.
        const slotW = Math.floor((320 - margin * 2) / entries.length);

        for (let slotIndex = 0; slotIndex < entries.length; slotIndex++) {
            const entry = entries[slotIndex];
            const x = margin + slotIndex * slotW;
            const swatchW = slotW - 4;

            // Light swatches (white, yellow, green, cyan) need black labels to stay
            // readable. Dark swatches get white labels.
            const isLight =
                entry.index === C_WHITE ||
                entry.index === C_YELLOW_N ||
                entry.index === C_GREEN_N ||
                entry.index === C_CYAN_N;
            const labelColor = isLight ? C_BLACK : C_WHITE;

            // Fill a rectangle with that color.
            BT.drawRectFill(new Rect2i(x, rowY, swatchW, swatchH), entry.index);

            // Print the label into the swatch.
            BT.systemPrint(new Vector2i(x + 2, rowY - 1), labelColor, entry.label);
        }
    }

    // Draws one horizontal strip where each group of columns uses a slot from C_HSL_BASE.
    // The slots are rewritten in update(), so the rainbow scrolls over time; this method
    // only maps each x column to the right slot - no Color32 objects needed.
    //
    // Hue is an angle from 0 to 360 on a color wheel. 64 slots cover the whole
    // wheel in steps.
    drawHslRainbowSection() {
        ui.caption(6, 30, '2: HSL RAINBOW (fromHSL, scrolling hue)');

        const stripY = 43;
        const stripH = 11;

        // Walk every x column on the screen from left to right. Each column maps to one
        // of the 64 HSL slots.
        for (let x = 0; x < 320; x++) {
            // Which slot does this column belong to? 64 slots cover 320 pixels, so each
            // slot is 5 columns wide. Math.floor rounds down to a whole slot index, and
            // Math.min keeps it inside the range.
            const slot = Math.min(Math.floor((x / 320) * HSL_SLOTS), HSL_SLOTS - 1);

            BT.drawRectFill(new Rect2i(x, stripY, 1, stripH), C_HSL_BASE + slot);
        }
    }

    // Section 3: lerp (linear interpolation) between two colors.
    //
    // Think of t as a dimmer switch between two lamps: t = 0 is only lamp A (purple), t =
    // 1 is only lamp B (teal), and t = 0.5 is an even mix halfway between them.
    // lerpColorA.lerp(lerpColorB, t) returns a new Color32 at that blend point.
    //
    // The wide bar uses 32 palette slots that slide over time (a moving gradient). The
    // thin strip below uses one slot that breathes from A to B and back on a sine wave.
    drawLerpSection() {
        ui.caption(6, 57, '3: LERP: slide + pulse (see comments)');

        const barY = 70;

        // The two end squares are the "lamps" at full brightness: pure A and pure B.
        BT.drawRectFill(new Rect2i(6, barY, 11, 11), C_LERP_A);
        BT.systemPrint(new Vector2i(8, barY - 1), C_BLACK, 'A');
        BT.drawRectFill(new Rect2i(300, barY, 11, 11), C_LERP_B);
        BT.systemPrint(new Vector2i(302, barY - 1), C_BLACK, 'B');

        // The gradient bar: each column is another step on the dimmer between A and B.
        // update() already wrote 32 blended colors into slots C_LERP_BASE and up.
        const barX = 24;
        const barW = 268;
        const barH = 11;

        for (let i = 0; i < barW; i++) {
            // Pick which of the 32 pre-blended dimmer steps this pixel column uses.
            const slot = Math.min(Math.floor((i / barW) * LERP_SLOTS), LERP_SLOTS - 1);
            BT.drawRectFill(new Rect2i(barX + i, barY, 1, barH), C_LERP_BASE + slot);
        }

        BT.drawRectFill(new Rect2i(24, 82, 268, 11), C_PULSE);
        // The thin strip: one slot whose t value waves back and forth, so the whole
        // strip pulses. In update(), pulseT follows a sine wave, so the dimmer slides A
        // to B to A smoothly.
    }
}

bootstrap(Demo);
