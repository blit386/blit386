// Fonts Demo -- shows the built-in system font and palette-animated text effects.
//
// Demo 004 in the Blit-Tech demo series.
// Prerequisites: 001-Basics -- https://vancura.dev/articles/blit-tech-basics
// Live version: https://vancura.dev/articles/blit-tech-fonts
//
// BT.systemPrint() is the simplest way to draw text in Blit-Tech.
// It uses a built-in 8x8 pixel monospace font that is always available --
// no file loading, no await, no font object to manage.
//
// This demo shows:
//   - How to print text in different colors using the palette.
//   - Rainbow text: calling BT.systemPrint() once per character with a unique palette slot.
//   - Pulsing text: animating a palette slot in update() so the color changes each frame.
//
// If you need a proportional (variable-width) font or want to measure text width before
// drawing it, see Demo 022 - Bitmap Font for the BitmapFont / BT.printFont() approach.

import { bootstrap, BT, Color32, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Palette Constants

// Every color used for drawing is stored in a numbered palette slot.
// Index 0 is always transparent. Custom colors start at 1.
const C_WHITE = 1; // Pure white: title and special characters
const C_BG = 2; // Dark blue-navy: fills the screen each frame
const C_RED_TEXT = 3; // Soft red: "Red Text" sample line
const C_GREEN_TEXT = 4; // Soft green: "Green Text" sample line
const C_BLUE_TEXT = 5; // Soft blue: "Blue Text" sample line
const C_YELLOW_TEXT = 6; // Yellow: "Yellow Text" sample line
const C_GRAY_TEXT = 7; // Light gray: secondary info lines
// Slot 8 is intentionally skipped to keep C_DIM_GRAY at index 9.
const C_DIM_GRAY = 9; // Dim gray: FPS/tick counter

// Dynamic slots: the rainbow text has 18 characters that each need a unique animated color.
// We reserve palette slots 20..37 -- one slot per character in RAINBOW_TEXT.
// update() computes each character's current hue and stores it here.
// render() then reads the slot index -- no Color32 math happens during drawing!
const C_RAINBOW_BASE = 20; // slots 20, 21, 22, ... 37 for the 18 rainbow characters

// Dynamic slot: pulsing text changes color every frame (brightens and darkens in a wave).
const C_PULSE = 38; // single slot for the pulsing-text color

// #endregion

// #region Module Constants

// We define the rainbow text string here so both update() and render() use the exact same letters.
// If you change this string, update() will compute the right number of palette colors automatically.
const RAINBOW_TEXT = 'Rainbow Animation!';

// The system font draws each character at a fixed 8 pixels wide.
// We use this constant when stepping through RAINBOW_TEXT character by character.
const SYSTEM_FONT_CHAR_W = 8;

// #endregion

// #region Demo Class

/**
 * Demonstrates BT.systemPrint() with various text effects powered by palette animation.
 * Shows static colors, per-character rainbow animation, and pulsing brightness.
 * Compare with Demo 022 - Bitmap Font for the loaded-font approach.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    // palette holds all the colors this demo uses.
    palette = null;

    // animTime is a timer that counts up in seconds.
    // We use it to control the speed of color animations.
    animTime = 0;

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Tells the engine how big the screen should be and how fast to run.
     *
     * @returns {{displaySize: Vector2i, canvasDisplaySize: Vector2i, targetFPS: number}}
     */
    queryHardware() {
        return {
            // 320x240 is a classic retro resolution, similar to the Game Boy Advance.
            displaySize: new Vector2i(320, 240),

            // The canvas on the page is displayed at double size (640x480).
            // This makes every pixel look 2x2 screen pixels large.
            canvasDisplaySize: new Vector2i(640, 480),

            // Run at 60 frames per second.
            targetFPS: 60,
        };
    }

    /**
     * Sets up the color palette.
     * Unlike Demo 022, there is no font to load -- BT.systemPrint() needs nothing.
     *
     * @returns {Promise<boolean>} Returns true when ready.
     */
    async initialize() {
        // --- Set up the color palette ---
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
        this.palette.set(C_DIM_GRAY, new Color32(100, 100, 100)); // dim gray

        // Pre-fill dynamic rainbow slots with gray so they're not empty on the first frame.
        for (let i = 0; i < RAINBOW_TEXT.length; i++) {
            this.palette.set(C_RAINBOW_BASE + i, new Color32(128, 128, 128));
        }
        // Pre-fill pulse slot.
        this.palette.set(C_PULSE, new Color32(100, 100, 255));

        // Tell the engine to use this palette for all drawing.
        BT.paletteSet(this.palette);

        return true;
    }

    /**
     * Runs at a fixed rate (60 times per second). See the Basics demo for the full explanation:
     * https://vancura.dev/articles/blit-tech-basics
     * We advance the animation timer AND update dynamic palette colors here.
     */
    update() {
        // Move the animation clock forward by one update tick's worth of time (1/60 second).
        this.animTime += 1 / 60;

        // --- Update the pulsing text color ---
        // Math.sin returns a wave between -1 and +1 that oscillates smoothly.
        // Multiplying animTime by 3 makes it cycle 3 times per second.
        // Adding 0.5 and multiplying by 0.5 shifts the range from [-1,1] to [0,1].
        const pulse = Math.sin(this.animTime * 3) * 0.5 + 0.5;
        // Red and green rise with pulse while blue stays at 255, so the text shifts from
        // medium blue (100, 100, 255) toward bright white (255, 255, 255).
        this.palette.set(C_PULSE, new Color32(Math.floor(100 + pulse * 155), Math.floor(100 + pulse * 155), 255));

        // --- Update the rainbow text character colors ---
        // Each character gets a hue based on its horizontal position and the current time.
        // The system font is monospace: every character is SYSTEM_FONT_CHAR_W pixels wide.
        let charX = 10; // Starting x position -- same as where render() draws the rainbow text.
        for (let i = 0; i < RAINBOW_TEXT.length; i++) {
            // hue is a position on the color wheel (0=red, 120=green, 240=blue, 360=back to red).
            // Using charX (actual x position) matches the visual rhythm of the rainbow.
            // Adding animTime*100 scrolls the rainbow to the left over time.
            const hue = (charX * 3 + this.animTime * 100) % 360;
            this.palette.set(C_RAINBOW_BASE + i, Color32.fromHSL(hue, 100, 60));
            charX += SYSTEM_FONT_CHAR_W;
        }
    }

    /**
     * Runs once per screen refresh to draw all the text demonstrations on screen.
     */
    render() {
        // Fill the screen with the dark blue-navy background.
        BT.clear(C_BG);

        // BT.systemPrint() arguments: (position, paletteIndex, text)
        // paletteIndex is the slot number in the palette (1 = C_WHITE, 3 = C_RED_TEXT, etc.).
        // This is simpler than BT.printFont() which uses a 0-based offset from slot 1.

        // Start drawing from near the top of the screen.
        let y = 10;

        // Draw the title in white (palette slot 1 = C_WHITE).
        BT.systemPrint(new Vector2i(10, y), C_WHITE, 'Blit-Tech System Font Demo (004)');

        // Move down one line (8 pixels for the system font) plus a small gap.
        y += 14;

        // Draw each section in order, updating y as we go so nothing overlaps.
        y = this.renderColoredText(y);
        y = this.renderRainbowText(y);
        y = this.renderPulsingText(y);
        y = this.renderSpecialCharacters(y);

        // Draw the FPS counter at the bottom.
        BT.systemPrint(
            new Vector2i(10, BT.displaySize().y - 13),
            C_DIM_GRAY,
            `FPS: ${BT.fps()} | Ticks: ${BT.ticks()}`,
        );
    }

    // #endregion

    // #region Rendering Helpers

    /**
     * Draws the same four words, each in a different color.
     * Pass the palette slot number directly to BT.systemPrint() to change the text color.
     *
     * @param {number} y - The Y position to start drawing at.
     * @returns {number} The Y position after the last line drawn.
     */
    renderColoredText(y) {
        // BT.systemPrint(position, paletteSlot, text) -- the slot number IS the color directly.
        // Compare to BT.printFont() which uses a 0-based offset: slot 3 needs offset 2 there.
        BT.systemPrint(new Vector2i(10, y), C_RED_TEXT, 'Red Text');
        y += 10;

        BT.systemPrint(new Vector2i(10, y), C_GREEN_TEXT, 'Green Text');
        y += 10;

        BT.systemPrint(new Vector2i(10, y), C_BLUE_TEXT, 'Blue Text');
        y += 10;

        BT.systemPrint(new Vector2i(10, y), C_YELLOW_TEXT, 'Yellow Text');

        // Add extra space after this section.
        y += 14;

        return y;
    }

    /**
     * Draws text where each character has a different animated color.
     * The system font is monospace (8px wide per character), so we can step exactly
     * SYSTEM_FONT_CHAR_W pixels per character. The colors were pre-computed in update().
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

            // Step right by exactly SYSTEM_FONT_CHAR_W (8) pixels for the next character.
            // In a proportional font (see Demo 022) each character has its own advance width.
            x += SYSTEM_FONT_CHAR_W;
            slotIndex++;
        }

        return y + 14;
    }

    /**
     * Draws text that pulses -- it gets brighter and darker in a smooth rhythm.
     * The color is pre-computed in update() and stored in palette slot C_PULSE.
     *
     * @param {number} y - The Y position to start drawing at.
     * @returns {number} The Y position after the text.
     */
    renderPulsingText(y) {
        // C_PULSE (slot 38) holds the animated blue-to-white color computed in update().
        BT.systemPrint(new Vector2i(10, y), C_PULSE, 'Pulsing Text');

        return y + 14;
    }

    /**
     * Shows that the system font can draw special characters.
     *
     * @param {number} y - The Y position to start drawing at.
     * @returns {number} The Y position after the text.
     */
    renderSpecialCharacters(y) {
        BT.systemPrint(new Vector2i(10, y), C_GRAY_TEXT, 'Special: 3 x 4 = 12');

        return y + 10;
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Hand the Demo class to Blit-Tech to start the demo loop.
bootstrap(Demo);

// #endregion
