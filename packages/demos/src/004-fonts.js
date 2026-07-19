/**
 * Fonts Demo - built-in system font and palette-animated text.
 *
 * Demo 004 in the BLIT386 demo series.
 * Prerequisites: 001-Basics - https://demos.blit386.dev/001-basics
 * Live version: https://demos.blit386.dev/004-fonts
 *
 * BT.systemPrint() draws text with the engine's built-in system font (6 pixels wide,
 * 14 pixels tall per character). No file loading, no await, no font object.
 *
 * This demo shows:
 *   - Colored lines via palette indices passed to BT.systemPrint()
 *   - Measuring text with BT.systemPrintMeasure() before placing it
 *   - Rainbow text: one systemPrint call per character with its own palette slot
 *   - Pulsing text: animating alpha in update() on a single palette slot
 *
 * The title strip and the small pointer to Demo 022 are chrome drawn by the shared UI kit
 * (src/shared/ui.js). The showcase lines themselves stay hand-rolled on purpose - drawing
 * text with BT.systemPrint() is the whole lesson of this demo.
 *
 * For custom bitmap fonts loaded from disk, variable glyph widths, and BT.printFont(),
 * see Demo 022 - Bitmap Font: https://demos.blit386.dev/022-bitmap-font
 */

import { bootstrap, BT, Color32, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// Every color used for drawing is stored in a numbered palette slot.
// Index 0 is always transparent. Custom colors start at 1.
const C_WHITE = 1; // Pure white: the overlay bar style color (see configure())
const C_BG = 2; // Dark blue-navy: fills the screen each frame
const C_RED_TEXT = 3; // Soft red: "Red Text" sample line
const C_GREEN_TEXT = 4; // Soft green: "Green Text" sample line
const C_BLUE_TEXT = 5; // Soft blue: "Blue Text" sample line
const C_YELLOW_TEXT = 6; // Yellow: "Yellow Text" sample line
const C_GRAY_TEXT = 7; // Light gray: secondary info lines

// Dynamic slots: the rainbow text has 18 characters that each need a unique animated color.
// We reserve palette slots 20..37 - one slot per character in RAINBOW_TEXT.
// update() computes each character's current hue and stores it here.
// render() then reads the slot index - no Color32 math happens during drawing!
const C_RAINBOW_BASE = 20; // slots 20, 21, 22, ... 37 for the 18 rainbow characters

// Dynamic slot: pulsing text changes alpha every frame (fades in and out in a smooth wave).
const C_PULSE = 38; // single slot for the pulsing-text color

// We define the rainbow text string here so both update() and render() use the exact same letters.
// If you change this string, update() will compute the right number of palette colors automatically.
const RAINBOW_TEXT = 'Rainbow Animation!';

// Filled in init() from BT.systemPrintMeasure - width of one monospace system glyph.
let systemCharWidth = 6;

/**
 * Demonstrates BT.systemPrint() with various text effects powered by palette animation.
 * Shows static colors, per-character rainbow animation, and pulsing brightness.
 * Compare with Demo 022 - Bitmap Font for BitmapFont.load() and BT.printFont().
 *
 * @implements {IBTDemo}
 */
class Demo {
    // palette holds all the colors this demo uses.
    /** @type {Palette | null} */
    palette = null;

    // Where the shared UI theme colors landed in the palette, filled by applyTheme() in
    // init(). The UI kit draws the title strip and captions with these slots.
    theme = null;

    // animTime is a timer that counts up in seconds.
    // We use it to control the speed of color animations.
    animTime = 0;

    /**
     * Optional engine settings. We keep the default 320x240 screen and show the
     * palette grid in the overlay with 32 swatches per row and 2 visible rows.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            isOverlayPaletteEnabled: true,
            overlayPaletteColumns: 32,
            overlayPaletteRowsVisible: 2,

            overlayStyle: {
                barPaletteIndex: C_WHITE,
                textPaletteIndex: C_BG,
                gapPaletteIndex: C_BG,
            },
        };
    }

    /**
     * Sets up the color palette.
     * Unlike Demo 022, there is no font to load - BT.systemPrint() needs nothing.
     *
     * @returns {Promise<boolean>} Returns true when ready.
     */
    async init() {
        // Set up the color palette
        // We pick every color before drawing anything, like an artist mixing paint.
        this.palette = BT.paletteCreate(256);

        // Static colors that never change from frame to frame.
        this.palette.set(C_WHITE, new Color32(255, 255, 255)); // pure white
        this.palette.set(C_BG, new Color32(20, 30, 50)); // dark blue-navy background
        this.palette.set(C_RED_TEXT, new Color32(255, 100, 100)); // soft red
        this.palette.set(C_GREEN_TEXT, new Color32(100, 255, 100)); // soft green
        this.palette.set(C_BLUE_TEXT, new Color32(100, 100, 255)); // soft blue
        this.palette.set(C_YELLOW_TEXT, new Color32(255, 255, 100)); // yellow
        this.palette.set(C_GRAY_TEXT, new Color32(200, 200, 200)); // light gray

        // Measure the built-in system font once. systemPrintMeasure returns Vector2i(width, height).
        // The system font is monospace: every character is the same width (6) and height (14).
        const glyphSize = BT.systemPrintMeasure('M');
        systemCharWidth = glyphSize.x;

        // Pre-fill dynamic rainbow slots with gray so they're not empty on the first frame.
        for (let i = 0; i < RAINBOW_TEXT.length; i++) {
            this.palette.set(C_RAINBOW_BASE + i, new Color32(128, 128, 128));
        }
        // Pre-fill pulse slot.
        this.palette.set(C_PULSE, new Color32(100, 100, 255));

        // Install the shared UI theme the kit's title strip and caption draw with.
        // It writes 12 colors into slots 240-251, far above everything this demo uses
        // (static colors in 1-7, animated rainbow and pulse in 20-38), so the palette
        // animation never collides with the UI colors. Must happen before BT.paletteSet().
        this.theme = applyTheme(this.palette);

        // Tell the engine to use this palette for all drawing.
        BT.paletteSet(this.palette);
        return true;
    }

    /**
     * Runs at a fixed rate (60 times per second). See the Basics demo for the full explanation:
     * https://demos.blit386.dev/001-basics
     * We advance the animation timer AND update dynamic palette colors here.
     */
    update() {
        // Move the animation clock forward using deltaSeconds (works at any targetFPS).
        this.animTime += BT.deltaSeconds;

        // Update the pulsing text color
        // Math.sin returns a wave between -1 and +1 that oscillates smoothly.
        // Multiplying by 2 * Math.PI * 3 makes it complete 3 full cycles per second.
        // Adding 0.5 and multiplying by 0.5 shifts the range from [-1,1] to [0,1].
        const pulse = Math.sin(2 * Math.PI * 3 * this.animTime) * 0.5 + 0.5;
        // We drive the alpha (opacity) channel so the text fades in and out in a smooth wave.
        // RGB stays fixed at (100, 100, 255) - a soft blue - while alpha goes from 0 to 255.
        this.palette.set(C_PULSE, new Color32(100, 100, 255, Math.floor(pulse * 255)));

        // Update the rainbow text character colors
        // Each character gets a hue based on its horizontal position and the current time.
        // systemCharWidth comes from systemPrintMeasure in init() (6 pixels for this font).
        let charX = 10; // Starting x position - same as where render() draws the rainbow text.
        for (let i = 0; i < RAINBOW_TEXT.length; i++) {
            // hue is a position on the color wheel (0=red, 120=green, 240=blue, 360=back to red).
            // Using charX (actual x position) matches the visual rhythm of the rainbow.
            // Adding animTime*100 scrolls the rainbow to the left over time.
            const hue = (charX * 3 + this.animTime * 100) % 360;
            this.palette.set(C_RAINBOW_BASE + i, Color32.fromHSL(hue, 100, 60));
            charX += systemCharWidth;
        }
    }

    /**
     * Runs once per screen refresh to draw all the text demonstrations on screen.
     */
    render() {
        // Fill the screen with the dark blue-navy background.
        BT.clear(C_BG);

        // Title strip across the top, drawn by the shared UI kit. begin('topBar') opens a
        // full-width 22-pixel band, panel() fills it and prints the amber title, and end()
        // closes the group. This is chrome only - the lesson lives in the lines below.
        ui.begin('topBar');
        ui.panel('Fonts - BT.systemPrint() showcase');
        ui.end();

        // Start drawing below the 22-pixel title strip.
        let y = 32;

        // Draw each section in order, updating y as we go so nothing overlaps.
        y = this.renderColoredText(y);
        y = this.renderRainbowText(y);
        y = this.renderPulsingText(y);
        this.renderSpecialCharacters(y);

        // A small dim caption in the bottom-left corner pointing to the next font lesson.
        // No ui.panel() call inside the group means it is just floating text - no box.
        ui.begin('bottomLeft');
        ui.label('To see how to load bitmap fonts from disk,', { color: 'dim' });
        ui.label('go to demo 022', { color: 'dim' });
        ui.end();
    }

    /**
     * Draws the same four words, each in a different color.
     * Pass the palette slot number directly to BT.systemPrint() to change the text color.
     *
     * @param {number} y - The Y position to start drawing at.
     * @returns {number} The Y position after the last line drawn.
     */
    renderColoredText(y) {
        // Use a local variable so we don't modify the original parameter.
        // In JavaScript, changing a parameter's value inside a function can confuse readers
        // because they expect the original value to stay the same throughout the function.
        let currentY = y;

        // BT.systemPrint(position, paletteSlot, text) - the slot number IS the color directly.
        // Compare to BT.printFont() in Demo 022 which uses a 0-based palette offset per glyph.
        BT.systemPrint(new Vector2i(10, currentY), C_RED_TEXT, 'Red Text');
        const lineAdvance = BT.systemPrintMeasure('Red Text').y + 4;
        currentY += lineAdvance;

        BT.systemPrint(new Vector2i(10, currentY), C_GREEN_TEXT, 'Green Text');
        currentY += lineAdvance;

        BT.systemPrint(new Vector2i(10, currentY), C_BLUE_TEXT, 'Blue Text');
        currentY += lineAdvance;

        BT.systemPrint(new Vector2i(10, currentY), C_YELLOW_TEXT, 'Yellow Text');

        // Move down one line height after the last word, just like the rows above.
        currentY += lineAdvance;

        return currentY;
    }

    /**
     * Draws text where each character has a different animated color.
     * The system font is monospace, so we step systemCharWidth pixels per character.
     * Colors were pre-computed in update().
     *
     * @param {number} y - The Y position to start drawing at.
     * @returns {number} The Y position after the text.
     */
    renderRainbowText(y) {
        // Start drawing from the left margin.
        let x = 10;
        let slotIndex = 0;

        // Loop through each character in the string one at a time.
        // We call BT.systemPrint() once per character, each with its own palette slot.
        for (const char of RAINBOW_TEXT) {
            // C_RAINBOW_BASE + slotIndex gives the palette slot for this character.
            // That slot was updated with a fresh color in update() this tick.
            BT.systemPrint(new Vector2i(x, y), C_RAINBOW_BASE + slotIndex, char);

            // Step right by the measured glyph width (6 px for the built-in system font).
            // Demo 022 uses BitmapFont metrics per character instead of a fixed step.
            x += systemCharWidth;
            slotIndex++;
        }

        return y + BT.systemPrintMeasure('M').y + 4;
    }

    /**
     * Draws the pulsing-text line. The text fades in and out in a smooth rhythm (alpha pulsing).
     * The alpha value is pre-computed in update() using Math.sin and stored in palette slot C_PULSE.
     *
     * @param {number} y - The Y position to start drawing at.
     * @returns {number} The Y position after the text.
     */
    renderPulsingText(y) {
        // C_PULSE (slot 38) holds an alpha (transparency) pulse precomputed in update():
        // RGB stays fixed at (100, 100, 255) - a soft blue - and the alpha channel is
        // animated from 0 to 255 with Math.sin(), so the text fades in and out smoothly
        // rather than shifting hue. The engine blends the palette color against the
        // background at draw time, which is what gives the pulse its smooth look.
        BT.systemPrint(new Vector2i(10, y), C_PULSE, 'Pulsing Text');

        return y + BT.systemPrintMeasure('M').y + 4;
    }

    /**
     * Shows that the system font can draw special characters.
     * Last section before the overlay bars, so this helper does not return an updated y.
     *
     * @param {number} y - The Y position to start drawing at.
     */
    renderSpecialCharacters(y) {
        BT.systemPrint(new Vector2i(10, y), C_GRAY_TEXT, 'Special: 3 x 4 = 12');
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
