// Bitmap Font Demo -- shows how to load and use a proportional bitmap font.
//
// Demo 022 in the Blit-Tech demo series.
// Prerequisites: 001-Basics -- https://vancura.dev/articles/blit-tech-basics
//                004-Fonts  -- https://vancura.dev/articles/blit-tech-fonts
//
// Demos 002-020 use BT.systemPrint() -- the built-in 8x8 pixel font that needs no file to load.
// This demo shows the ALTERNATIVE approach: loading a proportional bitmap font from a .btfont file.
//
// A "bitmap font" is a font where every letter is pre-drawn as a small picture
// (a grid of pixels), rather than being drawn from mathematical curves.
// This gives text a crisp, retro look that matches pixel art perfectly.
//
// When would you choose a bitmap font over the system font?
//   - You want a proportional font (each letter has its own width, like real typography).
//   - You need a specific visual style (blocky, cursive, monospace, etc.).
//   - You want fine control over per-character color effects (like the rainbow below).
//   - You need to measure text width precisely before drawing it (font.measureText()).
//
// When should you stick with BT.systemPrint()?
//   - You just need a quick debug overlay (FPS, position, counters).
//   - You don't want the extra complexity of loading a font asset.
//   - Startup speed matters more than visual style.
//
// This demo shows how to load a font, draw text in different colors,
// make text that changes color over time (rainbow), text that pulses in brightness,
// and how to measure how wide a piece of text will be before drawing it.

import { BitmapFont, bootstrap, BT, Color32, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Palette Constants

// Every color used for drawing is stored in a numbered palette slot.
// Index 0 is always transparent. Custom colors start at 1.
const C_WHITE = 1; // Pure white: title, special characters, 'A'/'B' labels
const C_BG = 2; // Dark blue-navy: fills the screen each frame
const C_RED_TEXT = 3; // Soft red: "Red Text" sample line
const C_GREEN_TEXT = 4; // Soft green: "Green Text" sample line
const C_BLUE_TEXT = 5; // Soft blue: "Blue Text" sample line
const C_YELLOW_TEXT = 6; // Yellow: "Yellow Text" sample line
const C_GRAY_TEXT = 7; // Light gray: "Measured Width" and font info text
const C_ORANGE_LINE = 8; // Orange: underline below the measured-width text
const C_DIM_GRAY = 9; // Dim gray: font metadata line
const C_DARKER_GRAY = 10; // Darker gray: FPS/tick counter

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

// #endregion

// #region Demo Class

/**
 * Demonstrates bitmap font loading and rendering with various text effects.
 * Shows static colors, animated rainbow effects, text measurement, and font metadata.
 * Contrast this approach with BT.systemPrint() used in the other demos.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    // font will hold the loaded bitmap font once it is downloaded.
    // It starts as null because nothing is loaded yet.
    font = null;

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
     * Sets up the color palette and downloads the bitmap font.
     * Notice the "await" keyword -- we wait here until the font file is fully downloaded.
     * The built-in system font (BT.systemPrint) skips this step entirely.
     *
     * @returns {Promise<boolean>} Returns true when the font has loaded successfully.
     */
    async initialize() {
        console.log('[BitmapFontDemo] Initializing...');

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
        this.palette.set(C_ORANGE_LINE, new Color32(255, 200, 100)); // orange for underlines
        this.palette.set(C_DIM_GRAY, new Color32(150, 150, 150)); // dim gray
        this.palette.set(C_DARKER_GRAY, new Color32(100, 100, 100)); // darker gray

        // Pre-fill dynamic rainbow slots with gray so they're not empty on the first frame.
        for (let i = 0; i < RAINBOW_TEXT.length; i++) {
            this.palette.set(C_RAINBOW_BASE + i, new Color32(128, 128, 128));
        }
        // Pre-fill pulse slot.
        this.palette.set(C_PULSE, new Color32(100, 100, 255));

        // Tell the engine to use this palette for all drawing.
        BT.paletteSet(this.palette);

        // Load the font file from the server.
        // .btfont is Blit-Tech's custom font format that includes glyph images.
        // This is the step that BT.systemPrint() skips -- the system font is built in.
        try {
            this.font = await BitmapFont.load('/fonts/PragmataPro14.btfont');

            // The font object exposes useful metadata you can read and display.
            console.log(`[BitmapFontDemo] Loaded font: ${this.font.name}`);
            console.log(`  Size: ${this.font.size}pt`);
            console.log(`  Line height: ${this.font.lineHeight}px`);
            console.log(`  Glyphs: ${this.font.glyphCount}`);
        } catch (error) {
            console.error('[BitmapFontDemo] Failed to load font:', error);
            return false;
        }

        // Tell the font about our palette. Font glyphs are stored as white pixels in the
        // font's sprite sheet. indexize() maps those white pixels to palette slot C_WHITE (1).
        // After this call, BT.printFont() can recolor the glyphs by shifting the palette index.
        this.font.getSpriteSheet().indexize(this.palette);

        console.log('[BitmapFontDemo] Font loaded successfully!');
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
        // We compute hue (color wheel position) for each character based on its x position
        // and animTime. We need the font loaded to get the correct glyph widths.
        if (this.font) {
            let charX = 10; // Starting x position -- same as where render() draws the rainbow text.
            for (let i = 0; i < RAINBOW_TEXT.length; i++) {
                // hue is a position on the color wheel (0=red, 120=green, 240=blue, 360=back to red).
                // Using charX (actual x position) matches the visual rhythm of the rainbow.
                // Adding animTime*100 scrolls the rainbow to the left over time.
                const hue = (charX * 3 + this.animTime * 100) % 360;
                this.palette.set(C_RAINBOW_BASE + i, Color32.fromHSL(hue, 100, 60));

                // Advance charX by this character's actual pixel width in the font.
                // This is specific to BitmapFont -- the system font has fixed 8x8 glyphs.
                const glyph = this.font.getGlyph(RAINBOW_TEXT[i]);
                charX += glyph ? glyph.advance : 7;
            }
        }
    }

    /**
     * Runs once per screen refresh to draw all the text demonstrations on screen.
     */
    render() {
        // Fill the screen with the dark blue-navy background.
        BT.clear(C_BG);

        // If the font hasn't loaded yet, show a waiting message using the built-in system print.
        // BT.systemPrint() is always available -- it doesn't need a font file to load.
        // This is a good example of when the system font is useful: as a loading screen fallback.
        if (!this.font) {
            BT.systemPrint(new Vector2i(10, 10), C_WHITE, 'Loading font...');
            return;
        }

        // Start drawing from near the top of the screen.
        let y = 10;

        // lineHeight tells us how many pixels tall one line of text is.
        // This comes from the font itself -- the system font always uses 8 pixels.
        // We add 2 extra pixels as spacing between lines.
        const lineHeight = this.font.lineHeight + 2;

        // BT.printFont() arguments: (font, position, text, colorOffset)
        // The colorOffset is a 0-based index FROM palette slot 1.
        // So offset 0 = slot 1 (C_WHITE), offset 2 = slot 3 (C_RED_TEXT), etc.
        // This is different from BT.systemPrint() which takes the palette slot number directly.
        BT.printFont(this.font, new Vector2i(10, y), 'Blit-Tech Bitmap Font Demo (022)', 0);

        // Move down past the title, with a little extra gap.
        y += lineHeight + 4;

        // Draw each section in order, updating y as we go so nothing overlaps.
        y = this.renderColoredText(y, lineHeight);
        y = this.renderRainbowText(y, lineHeight);
        y = this.renderPulsingText(y, lineHeight);
        y = this.renderSpecialCharacters(y, lineHeight);
        y = this.renderTextMeasurement(y, lineHeight);

        // Draw the font info and FPS counter at the bottom.
        this.renderFontInfo(y, lineHeight);
    }

    // #endregion

    // #region Rendering Helpers

    /**
     * Draws the same four words, each in a different color.
     * This shows how passing different palette offsets changes the text color.
     * Compare to BT.systemPrint() where you pass the palette slot directly.
     *
     * @param {number} y - The Y position to start drawing at.
     * @param {number} lineHeight - How many pixels to move down between lines.
     * @returns {number} The Y position after the last line drawn.
     */
    renderColoredText(y, lineHeight) {
        // Each color is looked up by offset: palette[1 + offset] = the desired color.
        // C_RED_TEXT = 3, so offset = 3 - 1 = 2. That means palette[1 + 2] = palette[3] = red.
        // With BT.systemPrint() you would just write: BT.systemPrint(pos, C_RED_TEXT, text).
        BT.printFont(this.font, new Vector2i(10, y), 'Red Text', C_RED_TEXT - 1);
        y += lineHeight;

        BT.printFont(this.font, new Vector2i(10, y), 'Green Text', C_GREEN_TEXT - 1);
        y += lineHeight;

        BT.printFont(this.font, new Vector2i(10, y), 'Blue Text', C_BLUE_TEXT - 1);
        y += lineHeight;

        BT.printFont(this.font, new Vector2i(10, y), 'Yellow Text', C_YELLOW_TEXT - 1);

        // Add extra space after this section.
        y += lineHeight + 4;

        return y;
    }

    /**
     * Draws text where each character has a different color, and the colors
     * shift over time to create a flowing rainbow animation.
     * The colors were pre-computed in update() and stored in palette slots C_RAINBOW_BASE+i.
     * This technique works with BT.printFont() because it draws one character at a time
     * with a different palette offset for each glyph.
     *
     * @param {number} y - The Y position to start drawing at.
     * @param {number} lineHeight - How many pixels to move down between lines.
     * @returns {number} The Y position after the text.
     */
    renderRainbowText(y, lineHeight) {
        // Start drawing from the left margin.
        let x = 10;
        let slotIndex = 0;

        // Loop through each character in the string one at a time.
        for (const char of RAINBOW_TEXT) {
            // The palette offset for character i = C_RAINBOW_BASE + i - 1.
            // This is because printFont offset N means palette[1 + N].
            // We want palette[C_RAINBOW_BASE + i], so offset = C_RAINBOW_BASE + i - 1.
            BT.printFont(this.font, new Vector2i(x, y), char, C_RAINBOW_BASE - 1 + slotIndex);

            // Look up how wide this character is in the font's glyph table.
            // "advance" is the number of pixels to move right before drawing the next character.
            // This is unique to BitmapFont -- each letter has its own width in a proportional font.
            // The built-in system font always advances exactly 8 pixels per character.
            const glyph = this.font.getGlyph(char);

            // If the glyph exists, use its advance width; otherwise fall back to 7 pixels.
            x += glyph ? glyph.advance : 7;
            slotIndex++;
        }

        return y + lineHeight + 4;
    }

    /**
     * Draws text that pulses -- it gets brighter and darker in a smooth rhythm.
     * The color is pre-computed in update() and stored in palette slot C_PULSE.
     * This palette animation technique works exactly the same with BT.systemPrint().
     *
     * @param {number} y - The Y position to start drawing at.
     * @param {number} lineHeight - How many pixels to move down between lines.
     * @returns {number} The Y position after the text.
     */
    renderPulsingText(y, lineHeight) {
        // C_PULSE - 1 = 37. That means palette[1 + 37] = palette[38] = C_PULSE (the animated color).
        BT.printFont(this.font, new Vector2i(10, y), 'Pulsing Text', C_PULSE - 1);

        return y + lineHeight + 4;
    }

    /**
     * Shows that the font can draw special characters like multiplication signs.
     *
     * @param {number} y - The Y position to start drawing at.
     * @param {number} lineHeight - How many pixels to move down between lines.
     * @returns {number} The Y position after the text.
     */
    renderSpecialCharacters(y, lineHeight) {
        // Offset 0 = palette[1] = C_WHITE = white text.
        BT.printFont(this.font, new Vector2i(10, y), 'Special: 3 x 4 = 12', 0);

        return y + lineHeight;
    }

    /**
     * Demonstrates font.measureText() -- which tells you exactly how wide a string will
     * be before you draw it. We draw an underline that is exactly the right length.
     * BT.systemPrint() does not have a measureText() equivalent; this is a BitmapFont-only feature.
     *
     * @param {number} y - The Y position to start drawing at.
     * @param {number} lineHeight - How many pixels to move down between lines.
     * @returns {number} The Y position after the text and underline.
     */
    renderTextMeasurement(y, lineHeight) {
        const measureText = 'Measured Width';

        // Ask the font how many pixels wide this string will be when drawn.
        // The system font doesn't support this -- it's a BitmapFont-specific feature.
        const textWidth = this.font.measureText(measureText);

        // Draw the text in light gray.
        // C_GRAY_TEXT - 1 = 6. That means palette[1 + 6] = palette[7] = C_GRAY_TEXT.
        BT.printFont(this.font, new Vector2i(10, y), measureText, C_GRAY_TEXT - 1);

        // Draw an orange underline that is exactly as wide as the text we measured.
        // The underline sits 2 pixels above the bottom of the line.
        // BT.drawLine() takes start point, end point, and a palette slot number (not an offset).
        BT.drawLine(
            new Vector2i(10, y + lineHeight - 2),
            new Vector2i(10 + textWidth, y + lineHeight - 2),
            C_ORANGE_LINE,
        );

        return y + lineHeight + 4;
    }

    /**
     * Shows information about the loaded font and the current frame rate at the bottom.
     * The font metadata (name, glyph count, line height) is only available with BitmapFont.
     * BT.systemPrint() has no equivalent -- the built-in font has no external representation.
     *
     * @param {number} y - The Y position to start drawing at.
     * @param {number} lineHeight - How many pixels to move down between lines.
     */
    renderFontInfo(y, lineHeight) {
        // Show the font's name and how many different characters (glyphs) it contains.
        // C_DIM_GRAY - 1 = 8. That means palette[1 + 8] = palette[9] = C_DIM_GRAY = dim gray.
        BT.printFont(
            this.font,
            new Vector2i(10, y),
            `Font: ${this.font.name} (${this.font.glyphCount} glyphs)`,
            C_DIM_GRAY - 1,
        );

        y += lineHeight;

        // Show the current FPS and total ticks.
        // C_DARKER_GRAY - 1 = 9. That means palette[1 + 9] = palette[10] = C_DARKER_GRAY.
        BT.printFont(this.font, new Vector2i(10, y), `FPS: ${BT.fps()} | Ticks: ${BT.ticks()}`, C_DARKER_GRAY - 1);
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Hand the Demo class to Blit-Tech to start the demo loop.
bootstrap(Demo);

// #endregion
