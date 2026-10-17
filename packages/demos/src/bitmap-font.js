/*

Bitmap Font: load a .btfont file and compare it to the built-in system font.
@description Load a .btfont bitmap font and draw rainbow, alpha-pulsing, and measured text with it.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Colors: https://demos.blit386.dev/colors
  - Fonts: https://demos.blit386.dev/fonts

Live version: https://demos.blit386.dev/bitmap-font

Guides:
  - Bitmap Fonts: https://blit386.dev/docs/guides/bitmap-fonts#custom-bitmap-fonts-btfont
  - Palette: https://blit386.dev/docs/guides/palette#per-draw-palette-offsets-zero-cost-color-variants

Reference:
  - Assets: https://blit386.dev/docs/api/assets#bitmap-fonts
  - Rendering: https://blit386.dev/docs/api/rendering#bitmap-fonts
  - Core Types: https://blit386.dev/docs/api/core-types#color32

---

WHAT YOU WILL SEE
-----------------

A dark screen with a column of text down the left side. The first two lines are the same
title drawn twice: "A:" marks the loaded .btfont (PragmataPro at 14 pt), "B:" marks the
built-in 6x14 system font, so you can compare the two shapes directly. Below them come
four lines in red, green, blue, and yellow, then "Rainbow Animation!" with every letter in
its own color and the colors sliding left over time, then "Pulsing Text" fading in and out
three times a second, then "Special: 3 × 4 = 12" using a real multiplication sign, and
finally "Measured Width" in light gray with an orange underline exactly as wide as the
text.

A small "Font Info" panel in the bottom-right corner lists the font's name, point size,
and glyph count, read straight from the loaded font object.

WHAT YOU WILL LEARN
-------------------

- BitmapFont.load(url) downloads a .btfont file - a JSON glyph table plus a PNG atlas -
  and init() awaits it before the demo loop starts.
- font.getSpriteSheet().indexize(palette) must run before the first draw: the atlas holds
  white pixels, and indexize swaps each one for the palette slot that holds white (slot 1
  here).
- BT.printFont(font, pos, text, paletteOffset) adds the offset to every glyph pixel's
  slot, so offset 0 draws slot 1, offset 2 draws slot 3, and so on. BT.systemPrint(pos,
  slot, text) takes the slot number directly instead.
- font.getGlyph(char).advance says how far to step right after a character. PragmataPro is
  monospaced, so every glyph here advances 7 pixels; a proportional font would return a
  different advance per letter, and the same loop would still work.
- font.measureText(text) returns the pixel width of a string before you draw it. The
  system font has the same idea in BT.systemPrintMeasure(text).
- font.name, font.size, font.lineHeight, and font.glyphCount describe the loaded font.
- Text color animates by rewriting palette slots in update() - Color32.fromHSL() for the
  rainbow, an alpha value for the pulse - while render() keeps passing the same offsets.

WHY LOAD A FONT AT ALL?
-----------------------

A bitmap font is a font where every letter is a small pre-drawn picture, not a set of
curves. That is what gives pixel-art text its crisp look. The built-in system font is one
too, and BT.systemPrint() needs no file, which makes it the right pick for quick labels
and debug readouts.

Load a .btfont instead when you want a different size or style, a glyph set you choose
yourself, or proportional spacing. The loading step is the only extra cost: one await in
init(), and a short wait before the first frame.

*/

import { BitmapFont, bootstrap, BT, Color32, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').BitmapFont} BitmapFont */

// The x position where the rainbow text row starts. update() (hue calculation) and
// renderRainbowText() (glyph drawing) both use it so the two stay in sync.
const RAINBOW_ORIGIN_X = 10;

// Every color used for drawing lives in a numbered palette slot. Slot 0 is always
// transparent, so custom colors start at 1. The screen background and the Font Info panel
// use the shared UI theme instead (installed by applyTheme() in init()), so there are no
// background slots here. Slot 2 is simply left unused.
const C_WHITE = 1; // pure white: title, special characters, 'A' / 'B' labels
const C_RED_TEXT = 3; // soft red: "Red Text" sample line
const C_GREEN_TEXT = 4; // soft green: "Green Text" sample line
const C_BLUE_TEXT = 5; // soft blue: "Blue Text" sample line
const C_YELLOW_TEXT = 6; // yellow: "Yellow Text" sample line
const C_GRAY_TEXT = 7; // light gray: "Measured Width" text
const C_ORANGE_LINE = 8; // orange: underline below the measured-width text

// The rainbow text string comes before the slot constants that depend on it, so C_PULSE
// can be derived from its length. Change the string and update() computes the right
// number of palette colors automatically.
const RAINBOW_TEXT = 'Rainbow Animation!';

// Dynamic slots: each character in RAINBOW_TEXT gets its own animated color slot,
// starting at C_RAINBOW_BASE. update() computes each character's current hue and stores
// it there; render() only passes the slot offset, so no Color32 math happens while
// drawing.
const C_RAINBOW_BASE = 20; // first slot for the rainbow characters

// Dynamic slot for the pulsing-text color. It sits right after the rainbow slots, so it
// can never overlap them even if RAINBOW_TEXT changes length (20 + 18 = slot 38 today).
const C_PULSE = C_RAINBOW_BASE + RAINBOW_TEXT.length;

// Left margin for the "A: " / "B: " labels and the sample text below them.
const LABEL_X = 10;

// Loads a bitmap font and draws text with it in several ways: static colors, an animated
// rainbow, alpha pulsing, text measurement, and a font metadata panel. Compare it with
// BT.systemPrint() in the Fonts demo.
class Demo {
    // The loaded bitmap font. Starts as null because nothing is loaded yet.
    /** @type {BitmapFont | null} */
    font = null;

    // All the colors this demo uses.
    /** @type {Palette | null} */
    palette = null;

    // Palette slot numbers of the shared UI kit colors, filled in by applyTheme() in
    // init(). theme.bg clears the screen so this demo's background matches the rest of
    // the series.
    theme = null;

    // A timer that counts up in seconds. It drives the speed of the color animations.
    animTime = 0;

    // Size of one system-font glyph, measured in init() with BT.systemPrintMeasure('M').
    // The built-in font is 6x14, but measuring keeps the demo honest if that ever
    // changes.
    systemCharWidth = 6;
    systemLineHeight = 14;

    // Pixel width of the "A: " prefix, so the title text lines up after the label.
    labelPrefixWidth = 18;

    // Sets up the palette and downloads the bitmap font. Screen size and FPS come from
    // the engine's defaultConfig(), since this demo has no configure(). Returns true when
    // the font loaded and false when it did not - the engine only starts the demo loop on
    // true.
    async init() {
        console.log('[BitmapFontDemo] Initializing...');

        // Set up the color palette. Every color is picked before anything is drawn, like
        // an artist mixing paint first.
        this.palette = BT.paletteCreate(256);

        // Static colors that never change from frame to frame.
        this.palette.set(C_WHITE, new Color32(255, 255, 255)); // pure white
        this.palette.set(C_RED_TEXT, new Color32(255, 100, 100)); // soft red
        this.palette.set(C_GREEN_TEXT, new Color32(100, 255, 100)); // soft green
        this.palette.set(C_BLUE_TEXT, new Color32(100, 100, 255)); // soft blue
        this.palette.set(C_YELLOW_TEXT, new Color32(255, 255, 100)); // yellow
        this.palette.set(C_GRAY_TEXT, new Color32(200, 200, 200)); // light gray
        this.palette.set(C_ORANGE_LINE, new Color32(255, 200, 100)); // orange underline

        // Pre-fill the dynamic rainbow slots with gray so they are not empty on the first
        // frame.
        for (let i = 0; i < RAINBOW_TEXT.length; i++) {
            this.palette.set(C_RAINBOW_BASE + i, new Color32(128, 128, 128));
        }

        // Pre-fill the pulse slot too.
        this.palette.set(C_PULSE, new Color32(100, 100, 255));

        // Install the shared UI kit colors. They land in slots 240-251, well above this
        // demo's highest slot (C_PULSE = 38), so the two can never collide. The returned
        // map remembers which slot each UI color went to (theme.bg, theme.text, ...).
        this.theme = applyTheme(this.palette);

        // Tell the engine to use this palette for all drawing.
        BT.paletteSet(this.palette);

        // Measure the built-in system font once, the same way the Fonts demo does.
        const glyphSize = BT.systemPrintMeasure('M');
        this.systemCharWidth = glyphSize.x;
        this.systemLineHeight = glyphSize.y;
        this.labelPrefixWidth = BT.systemPrintMeasure('A: ').x;

        // Load the font file from the server. A .btfont is a JSON glyph table next to a
        // PNG atlas of the glyph images. This is the step BT.systemPrint() skips - the
        // system font is built in. `await` pauses here until the download finishes.
        try {
            this.font = await BitmapFont.load('/fonts/PragmataPro14.btfont');

            // The font object exposes metadata you can read and display.
            console.log(`[BitmapFontDemo] Loaded font: ${this.font.name}`);
            console.log(`  Size: ${this.font.size}pt`);
            console.log(`  Line height: ${this.font.lineHeight}px`);
            console.log(`  Glyphs: ${this.font.glyphCount}`);
        } catch (error) {
            console.error('[BitmapFontDemo] Failed to load font:', error);
            return false;
        }

        // Tell the font about the palette. Glyphs are stored as white pixels in the
        // font's sprite sheet; indexize() replaces each one with the slot that holds
        // white, C_WHITE (1). After this call BT.printFont() can recolor the glyphs by
        // shifting that index.
        this.font.getSpriteSheet().indexize(this.palette);

        console.log('[BitmapFontDemo] Font loaded successfully!');

        return true;
    }

    // Runs at a fixed rate (60 times per second, as the Basics demo explains). Advances
    // the animation timer and rewrites the dynamic palette colors.
    update() {
        // Move the animation clock forward by one fixed update step, in seconds.
        this.animTime += BT.deltaSeconds;

        // The pulse: Math.sin returns a wave that swings smoothly between -1 and +1. The
        // "2 * Math.PI * frequency" part converts seconds into radians, which is what
        // Math.sin expects; with frequency 3 the wave completes three full cycles per
        // second. Multiplying by 0.5 and adding 0.5 moves the output from [-1, 1] to [0,
        // 1].
        const pulse = Math.sin(2 * Math.PI * 3 * this.animTime) * 0.5 + 0.5;

        // The alpha channel controls how opaque the text is. At pulse 0 the text
        // disappears; at pulse 1 it is solid. RGB stays fixed at (100, 100, 255), a
        // medium blue, so only the opacity changes.
        this.palette.set(C_PULSE, new Color32(100, 100, 255, Math.floor(pulse * 255)));

        // The rainbow: compute a hue (a position on the color wheel) for each character
        // from its x position and animTime. The font is always loaded here, because the
        // demo loop only starts after init() returned true. HSL colors were introduced in
        // the Colors demo: https://demos.blit386.dev/colors
        let charX = RAINBOW_ORIGIN_X; // same x where render() draws the rainbow text

        for (let i = 0; i < RAINBOW_TEXT.length; i++) {
            // hue is a position on the color wheel: 0 is red, 120 green, 240 blue, 360
            // back to red. Using the character's real x position gives the rainbow its
            // spacing; adding animTime * 100 scrolls it left over time. `%` is the
            // remainder after division, so `% 360` keeps hue in 0-359 and the wheel
            // cycles instead of growing forever.
            const hue = (charX * 3 + this.animTime * 100) % 360;
            this.palette.set(C_RAINBOW_BASE + i, Color32.fromHSL(hue, 100, 60));

            // Step charX by this character's advance from the font. PragmataPro is
            // monospaced, so this is always 7 here; a proportional font would vary.
            const glyph = this.font.getGlyph(RAINBOW_TEXT[i]);
            charX += glyph ? glyph.advance : 7;
        }
    }

    // Runs once per screen refresh and draws every text sample.
    render() {
        // Fill the screen with the shared UI theme's deep navy background.
        BT.clear(this.theme.bg);

        // Start drawing near the top of the screen.
        let y = 10;

        // Where the title text starts after the "A: " / "B: " labels (measured in
        // init()).
        const textX = LABEL_X + this.labelPrefixWidth;

        // How many pixels tall one line of text is, plus a little breathing room. The
        // bitmap font's line height comes from the .btfont file; the system font's was
        // measured.
        const bitmapLineHeight = this.font.lineHeight + 2;
        const systemLineHeight = this.systemLineHeight + 2;

        // BT.printFont() takes (font, position, text, paletteOffset). The offset is added
        // to the slot the glyph pixels were indexized to (slot 1), so offset 0 draws slot
        // 1 (C_WHITE), offset 2 draws slot 3 (C_RED_TEXT), and so on. BT.systemPrint()
        // takes the palette slot number directly instead.

        // Draw the title in both fonts, one below the other. "A:" marks the bitmap font
        // (7 pixels per character at 14 pt), "B:" the built-in system font (a fixed 6x14
        // block per character).
        BT.systemPrint(new Vector2i(LABEL_X, y), C_WHITE, 'A:');
        BT.printFont(this.font, new Vector2i(textX, y), 'BLIT386 Bitmap Font Demo', 0);
        y += bitmapLineHeight;

        // The same title in the system font, so the difference is easy to see.
        BT.systemPrint(new Vector2i(LABEL_X, y), C_WHITE, 'B:');
        BT.systemPrint(new Vector2i(textX, y), C_WHITE, 'BLIT386 Bitmap Font Demo');

        // Move down past both title lines, with a little extra gap before the next
        // section.
        y += systemLineHeight + 4;

        // Draw each section in order, updating y as we go so nothing overlaps.
        y = this.renderColoredText(y, bitmapLineHeight);
        y = this.renderRainbowText(y, bitmapLineHeight);
        y = this.renderPulsingText(y, bitmapLineHeight);
        y = this.renderSpecialCharacters(y, bitmapLineHeight);
        this.renderTextMeasurement(y, bitmapLineHeight);

        // The font metadata panel in the bottom-right corner. FPS and the demo title are
        // drawn by the engine overlay, not here.
        this.renderFontInfo();
    }

    // Draws four sample lines, each in a different color, to show how the palette offset
    // picks the color. `y` is where the first line starts and `lineHeight` how far to
    // move down between lines. Returns the y position after the last line.
    renderColoredText(y, lineHeight) {
        // A local copy, so the parameter itself is never modified - readers expect a
        // parameter to keep its value throughout the function.
        let currentY = y;

        // Each color is reached by offset: slot = 1 + offset, so offset = slot - 1. For
        // C_RED_TEXT (slot 3) that is offset 2. With BT.systemPrint() you would simply
        // pass C_RED_TEXT.
        BT.printFont(this.font, new Vector2i(10, currentY), 'Red Text', C_RED_TEXT - 1);
        currentY += lineHeight;

        BT.printFont(this.font, new Vector2i(10, currentY), 'Green Text', C_GREEN_TEXT - 1);
        currentY += lineHeight;

        BT.printFont(this.font, new Vector2i(10, currentY), 'Blue Text', C_BLUE_TEXT - 1);
        currentY += lineHeight;

        BT.printFont(this.font, new Vector2i(10, currentY), 'Yellow Text', C_YELLOW_TEXT - 1);

        // Extra space after this section.
        currentY += lineHeight + 4;

        return currentY;
    }

    // Draws text where every character has its own color, pre-computed in update() and
    // stored in slots C_RAINBOW_BASE + i. Drawing one character per BT.printFont() call
    // lets each glyph take a different palette offset. Returns the y position after the
    // text.
    renderRainbowText(y, lineHeight) {
        // Start at the left margin (must match RAINBOW_ORIGIN_X used in update()).
        let x = RAINBOW_ORIGIN_X;
        let slotIndex = 0;

        // Loop through the string one character at a time.
        for (const char of RAINBOW_TEXT) {
            // The offset for character i is C_RAINBOW_BASE + i - 1, because offset N
            // draws slot 1 + N and we want slot C_RAINBOW_BASE + i.
            BT.printFont(this.font, new Vector2i(x, y), char, C_RAINBOW_BASE - 1 + slotIndex);

            // Look up how wide this character is. "advance" is how many pixels to move
            // right before drawing the next one - 7 for every glyph in this monospaced
            // font, but a proportional font would give each letter its own value. The
            // system font always advances systemCharWidth (6).
            const glyph = this.font.getGlyph(char);

            // If the glyph exists use its advance, otherwise fall back to 7 pixels.
            x += glyph ? glyph.advance : 7;
            slotIndex++;
        }

        return y + lineHeight + 4;
    }

    // Draws text that fades in and out. The alpha was pre-computed in update() with
    // Math.sin and stored in slot C_PULSE; the same palette trick works with
    // BT.systemPrint(). Returns the y position after the text.
    renderPulsingText(y, lineHeight) {
        // C_PULSE - 1 = 37, so the glyphs draw slot 1 + 37 = 38, the animated color.
        BT.printFont(this.font, new Vector2i(10, y), 'Pulsing Text', C_PULSE - 1);

        return y + lineHeight + 4;
    }

    // Shows that the font can draw characters outside plain ASCII. Returns the y position
    // after the text.
    renderSpecialCharacters(y, lineHeight) {
        // Offset 0 draws slot 1 (C_WHITE). '\u00D7' is the Unicode multiplication sign
        // (×), a non-ASCII character, so this line only shows the sign if the
        // .btfont includes a glyph for it.
        BT.printFont(this.font, new Vector2i(10, y), 'Special: 3 \u00D7 4 = 12', 0);

        return y + lineHeight;
    }

    // Shows font.measureText(): the exact pixel width of a string before you draw it. The
    // width is used for an underline that ends exactly under the last letter. The system
    // font has the same idea in BT.systemPrintMeasure(). Returns the y position after the
    // text and underline.
    renderTextMeasurement(y, lineHeight) {
        const measureText = 'Measured Width';

        // Ask the font how many pixels wide this string will be.
        const textWidth = this.font.measureText(measureText);

        // Draw the text in light gray: C_GRAY_TEXT - 1 = 6, so the glyphs draw slot 7.
        BT.printFont(this.font, new Vector2i(10, y), measureText, C_GRAY_TEXT - 1);

        // Draw an orange underline exactly as wide as the measured text, 2 pixels above
        // the bottom of the line. BT.drawLine() takes a start point, an end point, and a
        // palette slot number (not an offset).
        BT.drawLine(
            new Vector2i(10, y + lineHeight - 2),
            new Vector2i(10 + textWidth, y + lineHeight - 2),
            C_ORANGE_LINE,
        );

        return y + lineHeight + 4;
    }

    // Draws a small panel of font metadata: name, point size, and glyph count, all read
    // from the loaded BitmapFont. (The built-in font is a BitmapFont too, reachable as
    // BT.systemFont, so the same fields exist there.) The panel uses the shared UI kit:
    // everything between ui.begin() and ui.end() stacks into one bordered group that the
    // kit sizes and anchors.
    renderFontInfo() {
        // Anchor the group to the bottom-right corner, away from the sample text on the
        // left and the engine overlay's toggle hint in the bottom-left corner.
        ui.begin(UI_ANCHORS.BOTTOM_RIGHT);

        // Give the group a background, a border, and an amber title.
        ui.panel('Font Info');

        // ui.kv() draws an aligned "KEY: value" row - the key dim, the value bright.
        ui.kv('FONT', this.font.name);
        ui.kv('SIZE', `${this.font.size}pt`);
        ui.kv('GLYPHS', this.font.glyphCount);

        // end() closes the group: the kit measures the rows, places the panel, and draws
        // it.
        ui.end();
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
