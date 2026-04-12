// Demo 008 -- Sprites: how to draw images (sprites) on screen using Blit-Tech.
//
// Prerequisites: 001-Basics (https://vancura.dev/articles/blit-tech-basics),
// 002-Primitives (https://vancura.dev/articles/blit-tech-primitives),
// 003-Colors (https://vancura.dev/articles/blit-tech-colors).
// Live article: https://vancura.dev/articles/blit-tech-sprites
//
// A "sprite" is a 2D image used in a game -- like a character, a coin, or an enemy.
// In Blit-Tech, sprites are stored in a "sprite sheet": one big image file that
// contains many small sprites arranged in a grid. You then draw individual
// sprites by telling the engine which rectangular region of the sheet to use.
//
// This demo loads a real sprite image from a file, registers its colors in the palette,
// then shows the same sprite displayed with different color "themes" using palette offsets.
//
// HOW PALETTE OFFSETS WORK FOR SPRITES:
//
// After calling spriteSheet.indexize(palette), each pixel in the sprite is stored
// as a palette index number. When you draw the sprite:
//
//   BT.drawSprite(sheet, src, pos, 0)           -- uses original colors
//   BT.drawSprite(sheet, src, pos, colorCount)  -- shifts ALL pixel indices up by colorCount
//
// If the original stone colors are at palette[10..14], offset=5 shifts every pixel
// to use palette[15..19] -- a completely different color theme!
// This is how retro games did "team colors" and environmental lighting.
//
// We learned about palette setup in Demo 015-Palette-Presets:
// https://vancura.dev/articles/blit-tech-palette-presets

import { BitmapFont, bootstrap, BT, Color32, Rect2i, SpriteSheet, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

// Where in the palette the sprite's original colors start.
// Everything before this (index 1..9) is used for UI colors.
const SPRITE_BASE = 10;

// UI color slots.
const C_WHITE = 1;
const C_BG = 2; // Dark purple background.
const C_LABEL = 3; // Section labels ("Original", "Fire", etc.).
const C_CODE = 4; // Code snippet text (blue-gray).
const C_DIM = 5; // Dimmer gray for FPS.
const C_HEADER = 6; // Golden header text.

// #endregion

// #region Demo Class

/**
 * Demonstrates sprite rendering using a file-loaded sprite sheet, palette indexization,
 * and palette offsets for color theme switching.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    // The palette holds all colors we are allowed to draw with.
    palette = null;

    // The sprite sheet loaded from /sprites/test.png.
    spriteSheet = null;

    // font is the loaded bitmap font for drawing labels.
    font = null;

    // The rectangular region within the sheet that defines our sprite.
    // Set after loading the image so we know its actual dimensions.
    charSprite = null;

    // How many unique colors were extracted from the sprite.
    // Each color theme block is this many entries wide in the palette.
    spriteColorCount = 0;

    // The original Color32 objects for the sprite's base colors.
    // We keep them so update() can create pulsing variants with different alpha.
    baseColors = [];

    // animTime advances each tick to drive the alpha pulse animation.
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
            displaySize: new Vector2i(320, 240),
            canvasDisplaySize: new Vector2i(640, 480),
            targetFPS: 60,
        };
    }

    /**
     * Sets up the palette, loads the sprite from a file, and loads the font.
     *
     * IMPORTANT ORDER:
     *   1. Create palette with static UI colors.
     *   2. Extract unique colors from the sprite image.
     *   3. Register those colors + theme blocks in the palette.
     *   4. BT.paletteSet() -- activate the palette.
     *   5. SpriteSheet.load() -- load the image as a GPU texture.
     *   6. spriteSheet.indexize() -- link sprite pixels to palette slots.
     *   7. BitmapFont.load() + indexize() -- same for the font.
     *
     * @returns {Promise<boolean>} Returns true when everything is ready.
     */
    async initialize() {
        console.log('[SpriteDemo] Initializing...');

        // --- Step 1: Create palette and register static UI colors ---
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_WHITE, new Color32(255, 255, 255));
        this.palette.set(C_BG, new Color32(30, 20, 40));
        this.palette.set(C_LABEL, new Color32(200, 200, 200));
        this.palette.set(C_CODE, new Color32(100, 150, 200));
        this.palette.set(C_DIM, new Color32(100, 100, 100));
        this.palette.set(C_HEADER, new Color32(255, 220, 100));

        // --- Steps 2 & 3: Extract sprite colors and build theme blocks ---
        // This reads the sprite's pixels, finds unique colors, and fills the palette.
        const colorCount = await this.buildSpritepalette('/sprites/test.png', SPRITE_BASE);

        this.spriteColorCount = colorCount;

        // Build three color theme blocks from the extracted base colors:
        //   Fire theme (offset = N): warm reds and oranges.
        //   Ice theme (offset = 2N): cool blues.
        //   Void theme (offset = 3N): very dark, near-black.
        //   Pulse theme (offset = 4N): same hue as original, but with animated alpha.
        for (let i = 0; i < colorCount; i++) {
            const base = this.baseColors[i];

            // Fire: push red channel up, pull blue channel down.
            this.palette.set(
                SPRITE_BASE + colorCount + i,
                new Color32(Math.min(255, base.r + 80), base.g, Math.max(0, base.b - 80)),
            );

            // Ice: pull red down, push blue up.
            this.palette.set(
                SPRITE_BASE + colorCount * 2 + i,
                new Color32(Math.max(0, base.r - 60), base.g, Math.min(255, base.b + 80)),
            );

            // Void: shrink all channels to 25% -- very dark.
            this.palette.set(
                SPRITE_BASE + colorCount * 3 + i,
                new Color32(Math.floor(base.r * 0.25), Math.floor(base.g * 0.25), Math.floor(base.b * 0.25)),
            );

            // Pulse block is filled by update() with the same colors but animating alpha.
            // Pre-fill with the base color so the first frame is not blank.
            this.palette.set(SPRITE_BASE + colorCount * 4 + i, new Color32(base.r, base.g, base.b, 255));
        }

        // --- Step 4: Activate the palette ---
        BT.paletteSet(this.palette);

        // --- Steps 5 & 6: Load and indexize the sprite ---
        // SpriteSheet.load reads a PNG file from the public folder.
        // indexize() scans each pixel and matches its color to a palette slot.
        try {
            this.spriteSheet = await SpriteSheet.load('/sprites/test.png');

            // Get the sprite's pixel dimensions so we know the src rectangle.
            const img = new Image();
            img.src = '/sprites/test.png';
            await new Promise((resolve) => {
                img.onload = () => resolve();
            });
            this.charSprite = new Rect2i(0, 0, img.naturalWidth, img.naturalHeight);

            // After indexize, each pixel stores its matching palette index number.
            this.spriteSheet.indexize(this.palette);
            console.log(
                `[SpriteDemo] Loaded sprite: ${img.naturalWidth}x${img.naturalHeight}px, ${colorCount} unique colors`,
            );
        } catch (error) {
            console.error('[SpriteDemo] Failed to load sprite:', error);
            return false;
        }

        // --- Step 7: Load and indexize the font ---
        try {
            this.font = await BitmapFont.load('/fonts/PragmataPro14.btfont');
            this.font.getSpriteSheet().indexize(this.palette);
            console.log(`[SpriteDemo] Loaded font: ${this.font.name}`);
        } catch (error) {
            console.error('[SpriteDemo] Failed to load font:', error);
            return false;
        }

        console.log('[SpriteDemo] Initialization complete!');
        return true;
    }

    /**
     * Runs at a fixed rate (60 times per second) to update the alpha-pulse block.
     * The pulse block is the same colors as the original but with changing transparency.
     */
    update() {
        this.animTime += 1 / 60;

        if (!this.spriteColorCount) {
            return;
        }

        // Math.sin(angle) returns a smooth wave from -1 to +1.
        // We shift and scale it to get alpha in the range 60..255.
        const pulse = Math.sin(this.animTime * 3) * 0.5 + 0.5; // 0..1
        const alpha = Math.floor(60 + pulse * 195); // 60..255

        // Update every color in the pulse block with the new alpha value.
        for (let i = 0; i < this.spriteColorCount; i++) {
            const base = this.baseColors[i];
            this.palette.set(SPRITE_BASE + this.spriteColorCount * 4 + i, new Color32(base.r, base.g, base.b, alpha));
        }
    }

    /**
     * Runs once per screen refresh to draw all the sprite demonstrations.
     * Notice: NO Color32 objects appear in draw calls -- only palette indices and offsets.
     */
    render() {
        BT.clear(C_BG);

        if (!this.font || !this.spriteSheet || !this.charSprite) {
            BT.print(new Vector2i(10, 10), C_WHITE, 'Loading...');
            return;
        }

        // Title header. printFont offset 5 = palette[1+5] = palette[6] = C_HEADER = golden.
        BT.printFont(this.font, new Vector2i(10, 8), 'BLIT-TECH SPRITE DEMO', C_HEADER - 1);

        // --- Row 1: Four color themes using palette offsets ---
        const N = this.spriteColorCount;
        const row1Y = 40;
        const spacing = 50;

        // Original colors: offset 0 (uses palette[SPRITE_BASE..SPRITE_BASE+N-1]).
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15, row1Y), 0);
        BT.printFont(this.font, new Vector2i(10, row1Y + 36), 'Original', C_LABEL - 1);

        // Fire theme: offset N shifts all pixel indices by N into the fire color block.
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15 + spacing, row1Y), N);
        BT.printFont(this.font, new Vector2i(10 + spacing, row1Y + 36), 'Fire', C_LABEL - 1);

        // Ice theme: offset 2*N shifts into the ice color block.
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15 + spacing * 2, row1Y), N * 2);
        BT.printFont(this.font, new Vector2i(10 + spacing * 2, row1Y + 36), 'Ice', C_LABEL - 1);

        // Void theme: offset 3*N shifts into the dark near-black block.
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15 + spacing * 3, row1Y), N * 3);
        BT.printFont(this.font, new Vector2i(10 + spacing * 3, row1Y + 36), 'Void', C_LABEL - 1);

        // --- Row 2: Alpha pulsing (transparency animation) ---
        // The pulse block is updated every tick in update() with animating alpha values.
        // Offset 4*N shifts into that block.
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15, 120), N * 4);
        BT.printFont(this.font, new Vector2i(10, 158), 'Alpha Pulse', C_LABEL - 1);
        BT.printFont(this.font, new Vector2i(75, 123), 'Transparency changes in', C_LABEL - 1);
        BT.printFont(this.font, new Vector2i(75, 135), 'update() via palette slots.', C_LABEL - 1);
        BT.printFont(this.font, new Vector2i(75, 147), 'render() just draws the index.', C_LABEL - 1);

        // --- Right panel: code snippet ---
        this.renderCodeSnippet();

        // FPS counter. printFont offset C_DIM-1 = 4 = palette[5] = C_DIM.
        BT.printFont(this.font, new Vector2i(250, 225), `FPS: ${BT.fps()}`, C_DIM - 1);
    }

    // #endregion

    // #region Helpers

    /**
     * Draws a short code snippet on the right side showing how to load a sprite and indexize it.
     */
    renderCodeSnippet() {
        if (!this.font) {
            return;
        }

        // printFont offset C_LABEL-1 = 2 (dim white for headers)
        // printFont offset C_CODE-1 = 3 (blue for code)
        const codeOffset = C_CODE - 1;
        const labelOffset = C_LABEL - 1;

        BT.printFont(this.font, new Vector2i(170, 165), 'Load from file:', labelOffset);
        BT.printFont(this.font, new Vector2i(170, 178), 'const sheet =', codeOffset);
        BT.printFont(this.font, new Vector2i(170, 190), '  await SpriteSheet', codeOffset);
        BT.printFont(this.font, new Vector2i(170, 202), "  .load('rock.png');", codeOffset);
        BT.printFont(this.font, new Vector2i(170, 214), 'sheet.indexize(', codeOffset);
        BT.printFont(this.font, new Vector2i(170, 226), '  palette);', codeOffset);
    }

    /**
     * Loads a PNG image, extracts its unique non-transparent pixel colors,
     * sorts them by brightness (darkest first), and registers them in the palette
     * starting at `startSlot`. Stores the Color32 objects in `this.baseColors`.
     *
     * Returns the number of unique colors found.
     *
     * Think of this as reading a painting and writing down every paint color used,
     * then putting those paints in your numbered slots for later reference.
     *
     * @param {string} imageUrl - URL to a PNG file in the public folder.
     * @param {number} startSlot - First palette slot to use.
     * @returns {Promise<number>} Number of unique colors registered.
     */
    async buildSpritepalette(imageUrl, startSlot) {
        // Load the image into a hidden canvas so we can read its pixel data.
        const img = new Image();
        img.src = imageUrl;
        await new Promise((resolve) => {
            img.onload = () => resolve();
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // data is a flat array of bytes: [R, G, B, A, R, G, B, A, ...] for each pixel.
        const { data } = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);

        // Collect unique RGBA combinations (skip fully transparent pixels).
        const seen = new Map();
        const unique = [];

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a === 0) {
                continue; // Transparent pixels have no color to register.
            }

            // Build a single string key so we can detect duplicates.
            const key = `${r},${g},${b},${a}`;

            if (!seen.has(key)) {
                seen.set(key, true);
                unique.push(new Color32(r, g, b, a));
            }
        }

        // Sort darkest first: brightness = weighted average of channels.
        // The formula (0.299*r + 0.587*g + 0.114*b) matches how the human eye perceives brightness.
        unique.sort((a, b) => {
            const brightnessA = a.r * 0.299 + a.g * 0.587 + a.b * 0.114;
            const brightnessB = b.r * 0.299 + b.g * 0.587 + b.b * 0.114;
            return brightnessA - brightnessB;
        });

        // Register each unique color in the palette and save it in baseColors.
        for (let i = 0; i < unique.length; i++) {
            this.palette.set(startSlot + i, unique[i]);
            this.baseColors.push(unique[i]);
        }

        return unique.length;
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Hand the Demo class to Blit-Tech to start the demo loop.
bootstrap(Demo);

// #endregion
