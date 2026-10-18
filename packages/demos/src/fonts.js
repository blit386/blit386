/*

Fonts: the built-in system font and palette-animated text.
@description Draw text with the built-in system font, measure it before drawing, and animate its palette colors.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Colors: https://demos.blit386.dev/colors

Live version: https://demos.blit386.dev/fonts

Guides:
  - Bitmap Fonts: https://blit386.dev/docs/guides/bitmap-fonts#built-in-system-font
  - Palette: https://blit386.dev/docs/guides/palette#draw-using-absolute-palette-indices
  - Overlay: https://blit386.dev/docs/guides/overlay#colors-and-hud-palette-slots

Reference:
  - Rendering: https://blit386.dev/docs/api/rendering#system-font
  - Core Types: https://blit386.dev/docs/api/core-types#color32

---

WHAT YOU WILL SEE
-----------------

A dark navy screen with a column of text starting 12 pixels from the left edge and 50
pixels from the top. From top to bottom:

- Four lines in fixed colors: "Red Text (#3)", "Green Text (#4)", "Blue Text (#5)", and
  "Yellow Text (#6)". The number in brackets is the palette slot the line is drawn with.
- "Rainbow Animation (#20 to #49)": every character has its own color, and the colors
  slide to the left over time.
- "Pulsing Text (#50)": soft blue text that fades out and back in three times a second.
- A light gray "Special (#7): 3 x 4 = 12" line, showing digits and symbols.
- Two dim lines near the bottom pointing at the Bitmap Font demo.

The engine overlay is open from the start with its palette grid showing 32 swatches per
row and two rows, so slots 20-50 are visible while update() repaints them every tick.

WHAT YOU WILL LEARN
-------------------

- BT.systemPrint(position, paletteIndex, text) draws text with the engine's built-in
  system font: 6 pixels wide and 14 pixels tall per character, no file to load, no await,
  no font object.
- The palette index you pass is the text color. Change the number, change the color.
- BT.systemPrintMeasure(text) returns a Vector2i with the width and height of that text,
  used here for line spacing and for the width of one character.
- Rainbow text: one BT.systemPrint() call per character, each with its own palette slot.
  update() computes the colors with Color32.fromHSL(); render() only passes slot numbers.
- Pulsing text: animating just the alpha channel of a single slot with Math.sin().
- Keeping all color math in update() and only palette indices in render().

For custom bitmap fonts loaded from disk, variable glyph widths, and BT.printFont(), see
the Bitmap Font demo: https://demos.blit386.dev/bitmap-font

TRY THIS
--------

- Watch the overlay's palette grid: slots 20-49 cycle through the rainbow and slot 50
  fades in and out in step with the text below.
- Press the backquote key (`) to hide the overlay and see the text alone, then again to
  bring it back.

*/

import { bootstrap, BT, Color32, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// Every color used for drawing lives in a numbered palette slot. Slot 0 is always
// transparent, so our own colors start at 1.
const C_WHITE = 1; // pure white: the overlay bar color (see configure())
const C_BG = 2; // dark blue-navy: fills the screen each frame
const C_RED_TEXT = 3; // soft red: "Red Text" sample line
const C_GREEN_TEXT = 4; // soft green: "Green Text" sample line
const C_BLUE_TEXT = 5; // soft blue: "Blue Text" sample line
const C_YELLOW_TEXT = 6; // yellow: "Yellow Text" sample line
const C_GRAY_TEXT = 7; // light gray: the "Special" line

// Dynamic slots: one animated color per character in RAINBOW_TEXT. update() computes each
// character's current hue and stores it in its slot; render() then only passes the slot
// number, so no color math happens while drawing.
const C_RAINBOW_BASE = 20; // first rainbow character; the next slots follow in order

// The rainbow string is defined once so update() and render() use exactly the same
// letters. If you change it, keep the printed end slot equal to C_RAINBOW_BASE +
// RAINBOW_TEXT.length - 1 (the last rainbow slot) so the label stays honest.
const RAINBOW_TEXT = `Rainbow Animation (#${C_RAINBOW_BASE} to #${C_RAINBOW_BASE + 29})`;

// Dynamic slot for the pulsing text: its alpha changes every tick, fading in and out in a
// smooth wave. It always sits right after the last rainbow character slot.
const C_PULSE = C_RAINBOW_BASE + RAINBOW_TEXT.length;

// Width of one system font character in pixels. Filled in init() from
// BT.systemPrintMeasure(); the font is monospace, so every character is this wide.
let systemCharWidth = 6;

// Shared left edge for every showcase line drawn with BT.systemPrint().
const TEXT_LEFT_X = 12;

// Shows BT.systemPrint() with text effects powered by palette animation: fixed colors, a
// per-character rainbow, and pulsing brightness. Compare with the Bitmap Font demo, which
// uses BitmapFont.load() and BT.printFont().
class Demo {
    // The palette holds every color this demo uses.
    /** @type {Palette | null} */
    palette = null;

    // Where the shared UI theme colors landed in the palette, filled by applyTheme() in
    // init(). The UI kit draws the dim note at the bottom with these slots.
    theme = null;

    // A clock that counts up in seconds. It drives the speed of the color animations.
    animTime = 0;

    // Optional engine settings. We keep the default 320x240 screen, open the overlay from
    // the start, and show its palette grid with 32 swatches per row and two visible rows.
    configure() {
        return {
            isOverlayPaletteEnabled: true,
            overlayPaletteColumns: 32,
            overlayPaletteRowsVisible: 2,
            isOverlayVisibleAtStart: true,

            // The overlay bar is drawn in white with navy text, matching the screen.
            overlayStyle: {
                barPaletteIndex: C_WHITE,
                textPaletteIndex: C_BG,
                gapPaletteIndex: C_BG,
            },
        };
    }

    // Sets up the palette. Unlike the Bitmap Font demo there is no font to load:
    // BT.systemPrint() needs nothing. Returns true when ready.
    async init() {
        // Create the palette first. We pick every color before drawing anything, like an
        // artist mixing paint before touching the canvas.
        this.palette = BT.paletteCreate(256);

        // Static colors that never change from frame to frame.
        this.palette.set(C_WHITE, new Color32(255, 255, 255)); // pure white
        this.palette.set(C_BG, new Color32(20, 30, 50)); // dark blue-navy background
        this.palette.set(C_RED_TEXT, new Color32(255, 100, 100)); // soft red
        this.palette.set(C_GREEN_TEXT, new Color32(100, 255, 100)); // soft green
        this.palette.set(C_BLUE_TEXT, new Color32(100, 100, 255)); // soft blue
        this.palette.set(C_YELLOW_TEXT, new Color32(255, 255, 100)); // yellow
        this.palette.set(C_GRAY_TEXT, new Color32(200, 200, 200)); // light gray

        // Measure the built-in system font once. systemPrintMeasure() returns a Vector2i
        // (width, height); the font is monospace, so one 'M' tells us the width of every
        // character (6 pixels; the height is 14).
        const glyphSize = BT.systemPrintMeasure('M');
        systemCharWidth = glyphSize.x;

        // Pre-fill the rainbow slots with gray so they are not empty on the first frame.
        for (let i = 0; i < RAINBOW_TEXT.length; i++) {
            this.palette.set(C_RAINBOW_BASE + i, new Color32(128, 128, 128));
        }

        // Pre-fill the pulse slot with the soft blue it keeps all along.
        this.palette.set(C_PULSE, new Color32(100, 100, 255));

        // Install the shared UI theme the kit's labels draw with. It writes 12 colors
        // into slots 240-251, far above everything this demo uses (static colors in 1-7,
        // rainbow and pulse in 20-50), so the palette animation never collides with the
        // UI colors. Must happen before BT.paletteSet().
        this.theme = applyTheme(this.palette);

        // Tell the engine to use this palette for all drawing.
        BT.paletteSet(this.palette);

        return true;
    }

    // Runs at a fixed rate (60 times per second by default). Advances the animation clock
    // and repaints the dynamic palette slots. See the Basics demo for why update() and
    // render() are separate steps: https://demos.blit386.dev/basics
    update() {
        // Move the clock forward by one tick's worth of seconds. deltaSeconds is the
        // length of one fixed update step, so this works at any targetFPS.
        this.animTime += BT.deltaSeconds;

        // The pulse: Math.sin() returns a wave between -1 and +1. Multiplying the time by
        // 2 * Math.PI * 3 makes the wave complete 3 full cycles per second. Multiplying
        // by 0.5 and adding 0.5 moves the range from -1..1 to 0..1.
        const pulse = Math.sin(2 * Math.PI * 3 * this.animTime) * 0.5 + 0.5;

        // Drive the alpha (opacity) channel so the text fades in and out. RGB stays fixed
        // at (100, 100, 255), a soft blue, while alpha goes from 0 to 255.
        this.palette.set(C_PULSE, new Color32(100, 100, 255, Math.floor(pulse * 255)));

        // The rainbow: each character gets a hue based on its x position and the current
        // time. We walk the same x positions renderRainbowText() uses, so the hue scroll
        // lines up with the pixels on screen.
        let charX = TEXT_LEFT_X;

        for (let i = 0; i < RAINBOW_TEXT.length; i++) {
            // hue is a position on the color wheel: 0 is red, 120 green, 240 blue, and
            // 360 is back to red. `% 360` keeps the value on the wheel as it grows.
            // Adding animTime * 100 scrolls the rainbow to the left over time.
            const hue = (charX * 3 + this.animTime * 100) % 360;

            this.palette.set(C_RAINBOW_BASE + i, Color32.fromHSL(hue, 100, 60));
            charX += systemCharWidth;
        }
    }

    // Runs once per screen refresh and draws every text showcase.
    render() {
        // Fill the screen with the dark blue-navy background.
        BT.clear(C_BG);

        // Start drawing a bit down from the top edge.
        let y = 50;

        // Draw each section in order. Every helper returns the y below what it drew, so
        // nothing overlaps.
        y = this.renderColoredText(y);
        y = this.renderRainbowText(y);
        y = this.renderPulsingText(y);

        this.renderSpecialCharacters(y);

        // A dim two-line note pointing to the next font lesson, drawn with the shared UI
        // kit at the same left edge as the showcase lines. pad: 0 removes the group's
        // inner padding so x and y place the first line directly.
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: TEXT_LEFT_X, y: 174, pad: 0 });
        ui.label('To see how to load bitmap fonts from disk,', { color: 'dim' });
        ui.label('go to Bitmap Font demo', { color: 'dim' });
        ui.end();
    }

    // Draws four sample lines, each in a different color, starting at `y`. Returns the y
    // just below the last line.
    renderColoredText(y) {
        // Work on a copy so the parameter itself is never changed. Readers of a function
        // expect its parameters to keep their original values all the way through.
        let currentY = y;

        // BT.systemPrint(position, paletteSlot, text): the slot number IS the color.
        // Compare with BT.printFont() in the Bitmap Font demo, which draws a loaded
        // BitmapFont instead.
        BT.systemPrint(new Vector2i(TEXT_LEFT_X, currentY), C_RED_TEXT, `Red Text (#${C_RED_TEXT})`);

        // Line spacing: the measured text height plus a 2-pixel gap.
        const lineAdvance = BT.systemPrintMeasure('Red Text').y + 2;
        currentY += lineAdvance;

        BT.systemPrint(new Vector2i(TEXT_LEFT_X, currentY), C_GREEN_TEXT, `Green Text (#${C_GREEN_TEXT})`);
        currentY += lineAdvance;

        BT.systemPrint(new Vector2i(TEXT_LEFT_X, currentY), C_BLUE_TEXT, `Blue Text (#${C_BLUE_TEXT})`);
        currentY += lineAdvance;

        BT.systemPrint(new Vector2i(TEXT_LEFT_X, currentY), C_YELLOW_TEXT, `Yellow Text (#${C_YELLOW_TEXT})`);

        // Move down one line after the last word too, just like the rows above.
        currentY += lineAdvance;

        return currentY;
    }

    // Draws text where every character has its own animated color. The system font is
    // monospace, so we step systemCharWidth pixels per character. The colors were already
    // computed in update(). Returns the y just below the text.
    renderRainbowText(y) {
        // Start from the shared left margin, with the first rainbow slot.
        let x = TEXT_LEFT_X;
        let slotIndex = 0;

        // Walk the string one character at a time and call BT.systemPrint() once per
        // character, each with its own palette slot.
        for (const char of RAINBOW_TEXT) {
            // C_RAINBOW_BASE + slotIndex is this character's slot, freshly repainted by
            // update() this tick.
            BT.systemPrint(new Vector2i(x, y), C_RAINBOW_BASE + slotIndex, char);

            // Step right by the measured glyph width (6 pixels for the system font). The
            // Bitmap Font demo uses each glyph's own width instead of a fixed step.
            x += systemCharWidth;
            slotIndex++;
        }

        return y + BT.systemPrintMeasure('M').y + 4;
    }

    // Draws the pulsing line. Slot C_PULSE holds the alpha pulse computed in update():
    // RGB stays a soft blue while alpha swings from 0 to 255, so the text fades in and
    // out instead of changing hue. The slot's alpha is applied when the pixels are drawn,
    // which is what makes the fade look smooth. Returns the y just below the text.
    renderPulsingText(y) {
        BT.systemPrint(new Vector2i(TEXT_LEFT_X, y), C_PULSE, `Pulsing Text (#${C_PULSE})`);

        return y + BT.systemPrintMeasure('M').y + 4;
    }

    // Shows that the system font also has digits and symbols. This is the last text
    // section, so the helper does not return a new y.
    renderSpecialCharacters(y) {
        BT.systemPrint(new Vector2i(TEXT_LEFT_X, y), C_GRAY_TEXT, `Special (#${C_GRAY_TEXT}): 3 x 4 = 12`);
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
