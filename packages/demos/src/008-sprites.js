// Demo 008 - Sprites: how to draw images (sprites) on screen using Blit-Tech.
//
// Prerequisites: 001-Basics (https://blit-tech-demos.vancura.dev/001-basics),
// 002-Primitives (https://vancura.dev/articles/blit-tech-primitives),
// 003-Colors (https://vancura.dev/articles/blit-tech-colors).
// Live article: https://vancura.dev/articles/blit-tech-sprites
//
// A "sprite" is a 2D image used in a game - like a character, a coin, or an enemy.
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
//   BT.drawSprite(sheet, src, pos, 0)           - uses original colors
//   BT.drawSprite(sheet, src, pos, colorCount)  - shifts ALL pixel indices up by colorCount
//
// If the original stone colors are at palette[10..14], offset=5 shifts every pixel
// to use palette[15..19] - a completely different color theme!
// This is how retro games did "team colors" and environmental lighting.
//
// We learned about palette setup in Demo 015-Palette-Presets:
// https://vancura.dev/articles/blit-tech-palette-presets

import { bootstrap, BT, Color32, SpriteSheet, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

// Where in the palette the sprite's original colors start.
// Everything before this (index 1..9) is used for UI colors.
const SPRITE_BASE = 10;

// Path to the sprite PNG. Defined once so every load call (color extraction,
// GPU upload, and dimension lookup) references the exact same file.
const SPRITE_PATH = '/sprites/test.png';

// UI color slot indices written by palette.applyHUD() in init().
// The preset fills six contiguous slots in this order: white(1), bg(2),
// label(3), header(4), dim(5), code(6). See Palette.applyHUD() docs.
const C_WHITE = 1;
const C_BG = 2;
const C_LABEL = 3;
const C_CODE = 6; // Code snippet text (blue-gray). (hud_dim at 5 is used by the engine overlay.)

// #endregion

// #region Main Logic

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
     * Enables the engine timing chart so you can compare update() vs render() cost
     * while switching sprite palette themes.
     *
     * @returns {{ overlayTimingChart: boolean, overlayStyle: { barPaletteIndex: number, textPaletteIndex: number, gapPaletteIndex: number }, overlayTimingChartStyle: { updateBarPaletteIndex: number, renderBarPaletteIndex: number, warningPaletteIndex: number, errorPaletteIndex: number, tagPaletteIndex: number } }}
     */
    configure() {
        return {
            overlayTimingChart: true,
            overlayStyle: {
                barPaletteIndex: C_BG,
                textPaletteIndex: C_LABEL,
                gapPaletteIndex: C_BG,
            },
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_LABEL,
                renderBarPaletteIndex: C_CODE,
                warningPaletteIndex: C_CODE,
                errorPaletteIndex: C_WHITE,
                tagPaletteIndex: C_LABEL,
            },
        };
    }

    /**
     * Sets up the palette, loads the sprite from a file, and links pixels to palette slots.
     *
     * IMPORTANT ORDER:
     *   1. Create palette with static UI colors.
     *   2. Extract unique colors from the sprite image.
     *   3. Register those colors + theme blocks in the palette.
     *   4. SpriteSheet.loadIndexed() - load, register, and indexize in one call.
     *   5. BT.paletteSet() - activate the palette.
     *
     * @returns {Promise<boolean>} Returns true when everything is ready.
     */
    async init() {
        console.log('[SpriteDemo] Initializing...');

        // Step 1: Create palette and fill the built-in HUD UI colors
        // BT.paletteCreate(256) makes a blank 256-slot color table for us to fill.
        // palette.applyHUD(1) writes six standard UI colors into slots 1-6 and
        // registers named aliases so you could also look them up by name:
        //   this.palette.getNamed('hud_header') returns 4.
        this.palette = BT.paletteCreate(256);
        this.palette.applyHUD(1);

        // Step 2: Extract sprite colors and register them in the palette
        // Ask the engine to scan the PNG and add every unique color it finds into our palette,
        // starting at SPRITE_BASE. The returned array is the same colors in palette-write order
        // (sorted darkest-first by brightness, just like the manual version we used to have).
        // Think of it as reading a painting and writing down every paint color used,
        // then putting those paints in your numbered slots for later reference.
        this.baseColors = await SpriteSheet.loadColorsIntoPalette(SPRITE_PATH, this.palette, SPRITE_BASE);

        const colorCount = this.baseColors.length;
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

            // Void: shrink all channels to 25% - very dark.
            this.palette.set(
                SPRITE_BASE + colorCount * 3 + i,
                new Color32(Math.floor(base.r * 0.25), Math.floor(base.g * 0.25), Math.floor(base.b * 0.25)),
            );

            // Pulse block is filled by update() with the same colors but animating alpha.
            // Pre-fill with the base color so the first frame is not blank.
            this.palette.set(SPRITE_BASE + colorCount * 4 + i, new Color32(base.r, base.g, base.b, 255));
        }

        // Step 3: Load and indexize the sprite
        // loadIndexed() combines loadColorsIntoPalette + load + indexize. We already called
        // loadColorsIntoPalette above so we pass sort:'none' here to avoid reshuffling colors.
        // This call still gives us a reliable full-image source rectangle from sheet.size.
        try {
            const indexed = await SpriteSheet.loadIndexed(SPRITE_PATH, this.palette, SPRITE_BASE, { sort: 'none' });
            this.spriteSheet = indexed.sheet;
            this.charSprite = this.spriteSheet.fullRect();

            // Activate palette after all setup is done.
            BT.paletteSet(this.palette);
            console.log(
                `[SpriteDemo] Loaded sprite: ${this.charSprite.width}x${this.charSprite.height}px, ${colorCount} unique colors`,
            );
        } catch (error) {
            console.error('[SpriteDemo] Failed to load sprite:', error);
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
        this.animTime += BT.deltaSeconds;

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
     * Notice: NO Color32 objects appear in draw calls - only palette indices and offsets.
     */
    render() {
        BT.clear(C_BG);

        if (!this.spriteSheet || !this.charSprite) {
            BT.systemPrint(new Vector2i(10, 10), C_WHITE, 'Loading...');
            return;
        }

        // Row 1: Four color themes using palette offsets
        const N = this.spriteColorCount;
        const row1Y = 40;
        const spacing = 50;

        // Original colors: offset 0 (uses palette[SPRITE_BASE..SPRITE_BASE+N-1]).
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15, row1Y), 0);
        BT.systemPrint(new Vector2i(10, row1Y + 36), C_LABEL, 'Original');

        // Fire theme: offset N shifts all pixel indices by N into the fire color block.
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15 + spacing, row1Y), N);
        BT.systemPrint(new Vector2i(10 + spacing, row1Y + 36), C_LABEL, 'Fire');

        // Ice theme: offset 2*N shifts into the ice color block.
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15 + spacing * 2, row1Y), N * 2);
        BT.systemPrint(new Vector2i(10 + spacing * 2, row1Y + 36), C_LABEL, 'Ice');

        // Void theme: offset 3*N shifts into the dark near-black block.
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15 + spacing * 3, row1Y), N * 3);
        BT.systemPrint(new Vector2i(10 + spacing * 3, row1Y + 36), C_LABEL, 'Void');

        // Row 2: Alpha pulsing (transparency animation)
        // The pulse block is updated every tick in update() with animating alpha values.
        // Offset 4*N shifts into that block.
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(15, 120), N * 4);
        BT.systemPrint(new Vector2i(10, 158), C_LABEL, 'Alpha Pulse');
        BT.systemPrint(new Vector2i(75, 123), C_LABEL, 'Transparency changes in');
        BT.systemPrint(new Vector2i(75, 135), C_LABEL, 'update() via palette slots.');
        BT.systemPrint(new Vector2i(75, 147), C_LABEL, 'render() just draws the index.');

        // Right panel: code snippet
        this.renderCodeSnippet();
    }

    // #endregion

    // #region Helpers

    /**
     * Draws a short code snippet on the right side showing how to load a sprite and indexize it.
     */
    renderCodeSnippet() {
        BT.systemPrint(new Vector2i(170, 165), C_LABEL, 'Load from file:');
        BT.systemPrint(new Vector2i(170, 178), C_CODE, 'const indexed =');
        BT.systemPrint(new Vector2i(170, 190), C_CODE, '  await SpriteSheet');
        BT.systemPrint(new Vector2i(170, 202), C_CODE, '  .loadIndexed(');
        BT.systemPrint(new Vector2i(170, 214), C_CODE, "   'rock.png',");
        BT.systemPrint(new Vector2i(170, 226), C_CODE, '   palette, 10);');
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Hand the Demo class to Blit-Tech to start the demo loop.
bootstrap(Demo);

// #endregion
