// Demo 017 -- Palette Swap: change the active palette at runtime to switch color themes.
//
// Demo 017 in the Blit-Tech series (written for readers about 12 years old).
//
// Prerequisites:
//   001-Basics     https://vancura.dev/articles/blit-tech-basics
//   008-Sprites    https://vancura.dev/articles/blit-tech-sprites
//   015-Palette Presets  https://vancura.dev/articles/blit-tech-palette-presets
//   016-Palette Animation https://vancura.dev/articles/blit-tech-palette-animation
//
// Live article: https://vancura.dev/articles/blit-tech-palette-swap
//
// WHAT IS PALETTE SWAP?
//
// In Demo 016 we changed palette SLOT VALUES while keeping the same Palette object.
// "Palette swap" goes further: you have MULTIPLE Palette objects (one per color theme),
// and at runtime you switch WHICH palette is active.
//
// Imagine painting with a box of paints. Instead of mixing new colors one at a time,
// you grab a completely different paint box. Every slot gets replaced at once.
//
// HOW DOES THE ENGINE STAY IN SYNC?
//
// When you call BT.paletteSet(newPalette):
//   1. The engine uploads the new palette to the GPU.
//   2. All drawing calls now look up colors from the new palette.
//
// If you also want loaded sprite sheets to find their colors in the new palette
// (because the new palette reorganizes WHICH SLOT holds each color), you can call
// BT.spritesRefresh(). That re-maps every sprite's pixels against the new palette
// using the same RGBA matching that indexize() does the first time.
//
// In this demo, each theme palette keeps the sprite colors at the SAME SLOT NUMBERS
// (just with different color values), so BT.spritesRefresh() is not needed.
// We demonstrate it as a call with no visual side-effect and explain when it matters.
//
// WHAT YOU WILL SEE:
//   Left column: four theme buttons showing each theme's color set.
//   Center: one large sprite that changes theme every 2 seconds.
//   Right: code snippet showing how to build and swap palettes.

import { bootstrap, BT, Color32, Rect2i, SpriteSheet, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

// How many ticks to hold each theme before switching (2 seconds at 60 FPS).
const SWAP_PERIOD_TICKS = 120;

// Where in the palette the sprite's base colors begin.
const SPRITE_BASE = 10;

// Static representative swatches for each theme (one color each, for the theme buttons).
// These stay the same across ALL theme palettes so the buttons look stable.
const SWATCH_STONE = 30;
const SWATCH_FIRE = 31;
const SWATCH_ICE = 32;
const SWATCH_VOID = 33;

// UI color slots (same in every theme palette).
const C_WHITE = 1;
const C_BG = 2;
const C_LABEL = 3;
const C_HEADER = 4;
const C_CODE = 5;
const C_DIM = 6;

// #endregion

// #region Demo Class

/**
 * Demonstrates palette swap: building multiple palettes and switching between them
 * at runtime using BT.paletteSet() and BT.spritesRefresh().
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    // The sprite sheet loaded from test.png.
    spriteSheet = null;

    // The rectangular region of the sprite within the sheet.
    charSprite = null;

    // How many unique colors were extracted from the sprite image.
    spriteColorCount = 0;

    // Original Color32 objects for the sprite's base colors (used to build theme palettes).
    baseColors = [];

    // The four theme palettes. We switch between them in update().
    // 0 = stone, 1 = fire, 2 = ice, 3 = void.
    themepalettes = [];

    // Display names for each theme (shown in the left column).
    themeNames = ['Stone', 'Fire', 'Ice', 'Void'];

    // Index of the currently active theme (0..3).
    currentTheme = 0;

    // Tick number when we last switched themes.
    lastSwapTick = 0;

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
     * Loads the sprite, builds four theme palettes, then loads the font.
     *
     * ORDER MATTERS:
     *   1. Extract unique colors from the sprite PNG.
     *   2. Build the stone (base) palette with those colors.
     *   3. Build fire, ice, void palettes by tinting the base colors.
     *   4. BT.paletteSet(stonePalette) -- activate the starting palette.
     *   5. SpriteSheet.load() + indexize() -- link pixels to slot numbers.
     *   6. BitmapFont.load() + indexize() -- same for the font.
     *
     * @returns {Promise<boolean>} True when everything is ready.
     */
    async initialize() {
        console.log('[PaletteSwapDemo] Initializing...');

        // --- Step 1: Extract sprite colors ---
        // We read the sprite PNG ahead of time so we know the exact RGBA values
        // that need to be registered in each palette.
        const colorCount = await this.extractSpriteColors('/sprites/test.png');
        this.spriteColorCount = colorCount;
        console.log(`[PaletteSwapDemo] Found ${colorCount} unique sprite colors`);

        // --- Steps 2 & 3: Build all four theme palettes ---
        this.themepalettes = [
            this.buildPalette('stone'), // Original rock colors.
            this.buildPalette('fire'), // Warm reds and oranges.
            this.buildPalette('ice'), // Cool blues and whites.
            this.buildPalette('void'), // Dark desaturated greens.
        ];

        // --- Step 4: Activate the starting palette (stone theme) ---
        // This must happen BEFORE indexize() so the sprite's pixels are mapped
        // against the correct starting palette.
        BT.paletteSet(this.themepalettes[0]);

        // --- Step 5: Load and indexize the sprite ---
        // SpriteSheet.load() fetches the PNG from the public folder.
        // indexize() scans every pixel and finds its color in the active palette.
        // After this, every pixel stores a palette slot number instead of an RGBA value.
        try {
            this.spriteSheet = await SpriteSheet.load('/sprites/test.png');

            // Read the image size so we know the full sprite rectangle.
            const img = new Image();
            img.src = '/sprites/test.png';
            await new Promise((resolve) => {
                img.onload = () => resolve();
            });
            this.charSprite = new Rect2i(0, 0, img.naturalWidth, img.naturalHeight);

            // Link pixels to palette slots.
            this.spriteSheet.indexize(this.themepalettes[0]);
            console.log(`[PaletteSwapDemo] Sprite loaded: ${img.naturalWidth}x${img.naturalHeight}px`);
        } catch (error) {
            console.error('[PaletteSwapDemo] Failed to load sprite:', error);
            return false;
        }

        console.log('[PaletteSwapDemo] Initialization complete!');
        return true;
    }

    /**
     * Runs 60 times per second to advance the theme cycling.
     * When SWAP_PERIOD_TICKS have passed, switch to the next theme palette.
     */
    update() {
        const tick = BT.ticks();

        if (tick - this.lastSwapTick >= SWAP_PERIOD_TICKS) {
            // Move to the next theme; wrap around after void (index 3).
            this.currentTheme = (this.currentTheme + 1) % this.themepalettes.length;
            this.lastSwapTick = tick;

            // --- Palette swap! ---
            // BT.paletteSet() uploads the new palette to the GPU.
            // All drawing calls immediately use the new colors.
            // Because every theme palette keeps the sprite colors at the SAME SLOT NUMBERS
            // (SPRITE_BASE..SPRITE_BASE+N-1), the sprite's stored indices are still correct.
            BT.paletteSet(this.themepalettes[this.currentTheme]);

            // BT.spritesRefresh() is needed when the new palette REORGANIZES slots --
            // i.e., the same RGBA colors appear at different slot NUMBERS than before.
            // In this demo the slot layout is identical across all palettes, so
            // spritesRefresh() is a no-op here, but we call it to show the pattern.
            BT.spritesRefresh();
        }
    }

    /**
     * Draws the theme buttons, cycling sprite, and code panel.
     * NO Color32 objects appear in draw calls -- only palette indices and offsets.
     */
    render() {
        // Clear to the background color (slot 2 = dark bg, same in all theme palettes).
        BT.clear(C_BG);

        if (!this.spriteSheet || !this.charSprite) {
            BT.systemPrint(new Vector2i(10, 10), C_WHITE, 'Loading...');
            return;
        }

        // Title. systemPrint takes (position, paletteIndex, text). C_HEADER = golden.
        BT.systemPrint(new Vector2i(6, 4), C_HEADER, 'Blit-Tech - Palette Swap');

        // Draw the three main sections.
        this.renderThemeButtons();
        this.renderCyclingSprite();
        this.renderCodePanel();

        // FPS counter.
        BT.systemPrint(new Vector2i(250, 225), C_DIM, `FPS: ${BT.fps()}`);
    }

    // #endregion

    // #region Render Helpers

    /**
     * Draws four labeled theme buttons on the left side of the screen.
     * Each button shows a color swatch (from a stable static slot) and the theme name.
     * A highlight box shows which theme is currently active.
     */
    renderThemeButtons() {
        const startY = 20;
        const btnH = 20;
        const btnW = 70;
        const gap = 4;

        for (let i = 0; i < this.themepalettes.length; i++) {
            const btnY = startY + i * (btnH + gap);

            // Highlight box around the active theme.
            if (i === this.currentTheme) {
                BT.drawRect(new Rect2i(4, btnY - 1, btnW, btnH + 2), C_LABEL);
            }

            // Color swatch dot: a small filled square using the representative swatch slot.
            // These slots (30..33) are the SAME in every theme palette, so the dots never change.
            BT.drawRectFill(new Rect2i(8, btnY + 4, 12, 12), SWATCH_STONE + i);

            // Theme name. systemPrint takes (position, paletteIndex, text).
            BT.systemPrint(new Vector2i(24, btnY + 4), C_LABEL, this.themeNames[i]);
        }

        // Section heading below the buttons.
        BT.systemPrint(new Vector2i(6, 120), C_LABEL, 'Themes:');
        BT.systemPrint(new Vector2i(6, 132), C_DIM, '2 s each');
    }

    /**
     * Draws the large cycling sprite in the center of the screen.
     * The sprite uses offset 0 -- it draws from SPRITE_BASE..SPRITE_BASE+N-1,
     * which contains the current theme's colors in whichever palette is active.
     */
    renderCyclingSprite() {
        if (!this.spriteSheet || !this.charSprite) {
            return;
        }

        const spriteX = 90;
        const spriteY = 30;

        // Draw the sprite at its natural size.
        // Offset 0 means: draw using palette slots starting at the sprite's base index.
        BT.drawSprite(this.spriteSheet, this.charSprite, new Vector2i(spriteX, spriteY), 0);

        // Label below the sprite. systemPrint takes (position, paletteIndex, text).
        BT.systemPrint(
            new Vector2i(spriteX, spriteY + this.charSprite.height + 8),
            C_HEADER,
            `Theme: ${this.themeNames[this.currentTheme]}`,
        );

        // Explain offset 0.
        BT.systemPrint(new Vector2i(spriteX, spriteY + this.charSprite.height + 20), C_CODE, 'drawSprite offset = 0');
        BT.systemPrint(
            new Vector2i(spriteX, spriteY + this.charSprite.height + 32),
            C_CODE,
            `slots ${SPRITE_BASE}..${SPRITE_BASE + this.spriteColorCount - 1}`,
        );
    }

    /**
     * Draws a code snippet on the right side showing how palette swap works.
     */
    renderCodePanel() {
        const x = 200;
        const startY = 20;

        BT.systemPrint(new Vector2i(x, startY), C_LABEL, 'How it works:');
        BT.systemPrint(new Vector2i(x, startY + 14), C_CODE, '// Build palettes');
        BT.systemPrint(new Vector2i(x, startY + 26), C_CODE, 'stone = clone()');
        BT.systemPrint(new Vector2i(x, startY + 38), C_CODE, 'fire = clone()');
        BT.systemPrint(new Vector2i(x, startY + 50), C_CODE, 'fire.set(10, red)');

        BT.systemPrint(new Vector2i(x, startY + 70), C_LABEL, '// Swap theme');
        BT.systemPrint(new Vector2i(x, startY + 82), C_CODE, 'BT.paletteSet(');
        BT.systemPrint(new Vector2i(x, startY + 94), C_CODE, '  firePalette)');

        BT.systemPrint(new Vector2i(x, startY + 114), C_LABEL, '// Sync sprites');
        BT.systemPrint(new Vector2i(x, startY + 126), C_CODE, '// (when layout');
        BT.systemPrint(new Vector2i(x, startY + 138), C_CODE, '// changes)');
        BT.systemPrint(new Vector2i(x, startY + 150), C_CODE, 'BT.spritesRefresh()');

        BT.systemPrint(new Vector2i(x, startY + 170), C_LABEL, '// Snapshot:');
        BT.systemPrint(new Vector2i(x, startY + 182), C_CODE, 'copy = pal.clone()');
    }

    // #endregion

    // #region Palette Builders

    /**
     * Reads a sprite PNG into an offscreen canvas, finds every unique non-transparent
     * pixel color, sorts them by brightness (dark to bright), and saves them in
     * this.baseColors for theme palette construction.
     *
     * Think of it as inspecting your paint box pixel by pixel to record which paints
     * were used, before you create new paint boxes with different color sets.
     *
     * @param {string} imageUrl - URL to a PNG file in the public folder.
     * @returns {Promise<number>} Number of unique colors found.
     */
    async extractSpriteColors(imageUrl) {
        // Load the image into a hidden browser canvas so we can read pixel values.
        const img = new Image();
        img.src = imageUrl;
        await new Promise((resolve) => {
            img.onload = () => resolve();
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // ctx.getImageData gives us the raw pixel bytes as a flat array [R, G, B, A, R, G, B, A, ...].
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);

        // Walk through the pixel data four bytes at a time (R, G, B, A per pixel).
        const seen = new Map();
        const unique = [];

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            // Skip fully transparent pixels -- they don't need a palette slot.
            if (a === 0) {
                continue;
            }

            // Build a string key to detect duplicates quickly.
            const key = `${r},${g},${b}`;

            if (!seen.has(key)) {
                seen.set(key, true);
                unique.push(new Color32(r, g, b, 255));
            }
        }

        // Sort darkest to brightest using perceptual brightness.
        // The formula 0.299*R + 0.587*G + 0.114*B matches how the human eye sees brightness.
        unique.sort((a, b) => a.r * 0.299 + a.g * 0.587 + a.b * 0.114 - (b.r * 0.299 + b.g * 0.587 + b.b * 0.114));

        // Store for later use in buildPalette().
        this.baseColors = unique;

        return unique.length;
    }

    /**
     * Builds a complete Palette for the given theme name.
     *
     * Every palette has the SAME slot layout:
     *   Slots 1..9:    UI colors (white, background, labels -- identical in all palettes).
     *   Slots 10..N:   Sprite colors for this theme (different RGBA per theme).
     *   Slots 30..33:  Representative swatch color per theme (identical in all palettes).
     *
     * Because the sprite slot NUMBERS (10..N) are the same in every palette,
     * the sprite sheet does not need re-indexization when we swap themes.
     * The sprite's stored indices already point to the right slots -- just the colors
     * in those slots differ.
     *
     * @param {'stone'|'fire'|'ice'|'void'} themeName - Which tint to apply.
     * @returns {import('blit-tech').Palette} Ready-to-use Palette object.
     */
    buildPalette(themeName) {
        const palette = BT.paletteCreate(256);

        // --- Static UI colors (same in every palette) ---
        // These must not change so that font rendering, labels, and FPS text
        // look the same regardless of which theme is active.
        palette.set(C_WHITE, new Color32(255, 255, 255)); // Font base.
        palette.set(C_BG, new Color32(16, 18, 28)); // Dark navy background.
        palette.set(C_LABEL, new Color32(180, 180, 180)); // Gray labels.
        palette.set(C_HEADER, new Color32(255, 210, 80)); // Golden header.
        palette.set(C_CODE, new Color32(100, 155, 210)); // Blue-gray code.
        palette.set(C_DIM, new Color32(80, 80, 100)); // Dim FPS text.

        // --- Sprite colors for this theme ---
        // We take the original stone RGBA values from baseColors and apply a tint.
        // The tint depends on the theme name.
        for (let i = 0; i < this.baseColors.length; i++) {
            const base = this.baseColors[i];
            let tinted;

            if (themeName === 'stone') {
                // Original colors -- no tint.
                tinted = base;
            } else if (themeName === 'fire') {
                // Warm: boost red, reduce blue.
                tinted = new Color32(Math.min(255, base.r + 70), Math.max(0, base.g - 20), Math.max(0, base.b - 90));
            } else if (themeName === 'ice') {
                // Cool: boost blue, reduce red.
                tinted = new Color32(Math.max(0, base.r - 70), Math.min(255, base.g + 20), Math.min(255, base.b + 90));
            } else {
                // void: desaturate and shift toward green.
                const luma = Math.floor(base.r * 0.299 + base.g * 0.587 + base.b * 0.114);
                tinted = new Color32(
                    Math.floor(luma * 0.4),
                    Math.min(255, Math.floor(luma * 0.8 + 20)),
                    Math.floor(luma * 0.4),
                );
            }

            // Register the tinted color at the SAME slot number regardless of theme.
            palette.set(SPRITE_BASE + i, tinted);
        }

        // --- Representative swatch colors (same in every palette) ---
        // These are used for the theme buttons on the left side.
        // They do NOT change with the theme so the buttons always show all four options.
        palette.set(SWATCH_STONE, new Color32(130, 120, 110)); // Warm gray for stone.
        palette.set(SWATCH_FIRE, new Color32(220, 80, 20)); // Orange-red for fire.
        palette.set(SWATCH_ICE, new Color32(80, 160, 220)); // Sky blue for ice.
        palette.set(SWATCH_VOID, new Color32(40, 90, 50)); // Dim green for void.

        return palette;
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Hand the Demo class to Blit-Tech to start the demo loop.
bootstrap(Demo);

// #endregion
