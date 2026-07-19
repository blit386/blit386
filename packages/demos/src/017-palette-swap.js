// Demo 017 - Palette Swap: change the active palette at runtime to switch color themes.
//
// Demo 017 in the BLIT386 series (written for readers about 12 years old).
//
// Prerequisites:
//   001-Basics            https://demos.blit386.dev/001-basics
//   008-Sprites           https://demos.blit386.dev/008-sprites
//   015-Palette Presets   https://demos.blit386.dev/015-palette-presets
//   016-Palette Animation https://demos.blit386.dev/016-palette-animation
//     (walkthroughs: https://vancura.dev/articles/blit386-sprites,
//      https://vancura.dev/articles/blit386-palette-presets,
//      https://vancura.dev/articles/blit386-palette-animation)
//
// Live version: https://demos.blit386.dev/017-palette-swap
// Live article: https://vancura.dev/articles/blit386-palette-swap
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
//   Left column: a legend of the four themes, each with its own color swatch.
//   Center: one large sprite that changes theme every 2 seconds.
//   Right: code snippet showing how to build and swap palettes.
//
// All captions and the code column are drawn with the shared UI kit (src/shared/ui.js).
// Because this demo swaps the WHOLE palette every 2 seconds, every theme palette must
// carry the same UI kit colors in the same slots - see buildTheme() for the details.

import { bootstrap, BT, Color32, Rect2i, SpriteSheet, Timer, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').SpriteSheet} SpriteSheet */
/** @typedef {import('blit386').Rect2i} Rect2i */

// How many ticks to hold each theme before switching (2 seconds at 60 FPS).
const SWAP_PERIOD_TICKS = 120;

// Where in the palette the sprite's base colors begin.
const COLOR_BASE = 10;

// Static representative swatches for each theme (one color each, for the theme legend).
// These stay the same across ALL theme palettes so the legend looks stable.
const SWATCH_STONE = 30;
const SWATCH_FIRE = 31;
const SWATCH_ICE = 32;
const SWATCH_VOID = 33;

// Engine overlay color slots (same in every theme palette).
// The overlay style is declared in configure(), which runs BEFORE init(), so it
// needs fixed slot NUMBERS known ahead of time. buildTheme() writes the same
// colors into these slots in all four palettes so the overlay never shifts color
// when the theme swaps.
const C_OVERLAY_BAR = 40; // Dark navy bar behind overlay text rows.
const C_OVERLAY_GOLD = 41; // Golden overlay text and update-timing bars.
const C_OVERLAY_BLUE = 42; // Blue-gray render-timing bars and chart tags.
const C_OVERLAY_DIM = 43; // Dim purple-gray chart warnings.
const C_OVERLAY_GRAY = 44; // Light gray chart error bars.

/**
 * Demonstrates palette swap: building multiple palettes and switching between them
 * at runtime using BT.paletteSet() and BT.spritesRefresh().
 *
 * @implements {IBTDemo}
 */
class Demo {
    // The sprite sheet loaded from test.png.
    /** @type {SpriteSheet | null} */
    sheet = null;

    // The rectangular region of the sprite within the sheet.
    /** @type {Rect2i | null} */
    charSprite = null;

    // How many unique colors were extracted from the sprite image.
    colorCount = 0;

    // Original Color32 objects for the sprite's base colors (used to build theme palettes).
    baseColors = [];

    // The four theme palettes. We switch between them in update().
    // 0 = stone, 1 = fire, 2 = ice, 3 = void.
    themes = [];

    // Display names for each theme (shown in the left column).
    themeNames = ['Stone', 'Fire', 'Ice', 'Void'];

    // Index of the currently active theme (0..3).
    currentTheme = 0;

    // Fires every 120 ticks (2 seconds) to switch to the next theme.
    swapTimer = new Timer(SWAP_PERIOD_TICKS);

    // Slot map for the shared UI kit theme, filled in init() by applyTheme().
    // Maps friendly names (bg, text, dim, header, accent, info, ...) to slot numbers.
    /** @type {ReturnType<typeof applyTheme> | null} */
    theme = null;

    /**
     * Timing chart helps compare CPU cost while palettes swap on a timer.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            isOverlayTimingChartEnabled: true,
            overlayStyle: {
                barPaletteIndex: C_OVERLAY_BAR,
                textPaletteIndex: C_OVERLAY_GOLD,
                gapPaletteIndex: C_OVERLAY_BAR,
            },
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_OVERLAY_GOLD,
                renderBarPaletteIndex: C_OVERLAY_BLUE,
                warningPaletteIndex: C_OVERLAY_DIM,
                errorPaletteIndex: C_OVERLAY_GRAY,
                tagPaletteIndex: C_OVERLAY_BLUE,
            },
        };
    }

    /**
     * Loads the sprite, builds four theme palettes, and calls sheet.indexize().
     *
     * ORDER MATTERS:
     *   1. Extract unique colors from the sprite PNG.
     *   2. Build the stone (base) palette with those colors.
     *   3. Build fire, ice, void palettes by tinting the base colors.
     *   4. BT.paletteSet(stonePalette) - activate the starting palette.
     *   5. SpriteSheet.load() + indexize() - link pixels to slot numbers.
     *
     * @returns {Promise<boolean>} True when everything is ready.
     */
    async init() {
        console.log('[PaletteSwapDemo] Initializing...');

        // Step 1: Extract sprite colors
        // We read the sprite PNG ahead of time so we know the exact RGBA values
        // that need to be registered in each theme palette below.
        //
        // The engine's helper (SpriteSheet.loadColorsIntoPalette) writes the colors into
        // a palette AND returns them as an array. Here we only need the array, so we hand
        // it a throwaway "scratch" palette as a sink and keep the returned array for later.
        // Each theme palette gets built from this.baseColors with its own tint applied.
        const scratchPalette = BT.paletteCreate(256);
        this.baseColors = await SpriteSheet.loadColorsIntoPalette('/sprites/test.png', scratchPalette, COLOR_BASE);
        this.colorCount = this.baseColors.length;
        console.log(`[PaletteSwapDemo] Found ${this.colorCount} unique sprite colors`);

        // Steps 2 & 3: Build all four theme palettes
        // buildTheme() also installs the shared UI kit colors (slots 240-251) into
        // EVERY palette and stores the returned slot map in this.theme, so the kit
        // keeps its colors no matter which theme palette is active.
        this.themes = [
            this.buildTheme('stone'), // Original rock colors.
            this.buildTheme('fire'), // Warm reds and oranges.
            this.buildTheme('ice'), // Cool blues and whites.
            this.buildTheme('void'), // Dark desaturated greens.
        ];

        // Step 4: Activate the starting palette (stone theme)
        // This must happen BEFORE indexize() so the sprite's pixels are mapped
        // against the correct starting palette.
        BT.paletteSet(this.themes[0]);

        // Step 5: Load and indexize the sprite
        // SpriteSheet.load() fetches the PNG from the public folder.
        // indexize() scans every pixel and finds its color in the active palette.
        // After this, every pixel stores a palette slot number instead of an RGBA value.
        try {
            this.sheet = await SpriteSheet.load('/sprites/test.png');

            // Grab a source rectangle that covers the whole sprite sheet.
            this.charSprite = this.sheet.fullRect();

            // Link pixels to palette slots.
            this.sheet.indexize(this.themes[0]);
            console.log(`[PaletteSwapDemo] Sprite loaded: ${this.charSprite.width}x${this.charSprite.height}px`);
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
        const tick = BT.ticks;

        if (this.swapTimer.fireIfElapsed(tick)) {
            // Move to the next theme; wrap around after void (index 3).
            this.currentTheme = (this.currentTheme + 1) % this.themes.length;

            // Palette swap!
            // BT.paletteSet() uploads the new palette to the GPU.
            // All drawing calls immediately use the new colors.
            // Because every theme palette keeps the sprite colors at the SAME SLOT NUMBERS
            // (COLOR_BASE..COLOR_BASE+N-1), the sprite's stored indices are still correct.
            BT.paletteSet(this.themes[this.currentTheme]);
            BT.assignTag(`Theme: ${this.themeNames[this.currentTheme]}`);

            // BT.spritesRefresh() is needed when the new palette REORGANIZES slots
            // i.e., the same RGBA colors appear at different slot NUMBERS than before.
            // In this demo the slot layout is identical across all palettes, so
            // spritesRefresh() is a no-op here, but we call it to show the pattern.
            BT.spritesRefresh();
        }
    }

    /**
     * Draws the theme legend, cycling sprite, and code column.
     * NO Color32 objects appear in draw calls - only palette indices and offsets.
     */
    render() {
        // Clear to the shared UI theme background (same slot in all theme palettes).
        BT.clear(this.theme.bg);

        // Draw the three main sections.
        this.renderThemeLegend();
        this.renderCyclingSprite();
        this.renderCodePanel();
    }

    /**
     * Draws the four-entry theme legend on the left side of the screen.
     * Each entry shows a color swatch (from a stable static slot) and the theme name.
     * A highlight box shows which theme is currently active.
     *
     * The swatch squares use this demo's own scene slots (30..33), which the UI kit
     * cannot draw, so the legend rows stay hand-rolled - but their text and outline
     * use the shared theme slots so the colors match the rest of the UI.
     */
    renderThemeLegend() {
        const startY = 20;
        const entryH = 20;
        const entryW = 70;
        const gap = 4;

        for (let i = 0; i < this.themes.length; i++) {
            const entryY = startY + i * (entryH + gap);

            // Highlight box around the active theme, in the kit's "active" green accent.
            if (i === this.currentTheme) {
                BT.drawRect(new Rect2i(4, entryY - 1, entryW, entryH + 2), this.theme.accent);
            }

            // Color swatch dot: a small filled square using the representative swatch slot.
            // These slots (30..33) are the SAME in every theme palette, so the dots never change.
            BT.drawRectFill(new Rect2i(8, entryY + 4, 12, 12), SWATCH_STONE + i);

            // Theme name. systemPrint takes (position, paletteIndex, text).
            // The active theme's name is bright; the other names are dimmed.
            const nameSlot = i === this.currentTheme ? this.theme.text : this.theme.dim;
            BT.systemPrint(new Vector2i(24, entryY + 4), nameSlot, this.themeNames[i]);
        }

        // Section caption below the legend, drawn as a borderless kit group.
        // Passing x and y to ui.begin() pins the group's top-left corner exactly
        // there, so the caption sits right under the last legend entry.
        ui.begin('topLeft', { x: 0, y: 113 });
        ui.label('Themes:', { color: 'header' });
        ui.label('2 s each', { color: 'dim' });
        ui.end();
    }

    /**
     * Draws the large cycling sprite in the center of the screen.
     * The sprite uses offset 0 - it draws from COLOR_BASE..COLOR_BASE+N-1,
     * which contains the current theme's colors in whichever palette is active.
     */
    renderCyclingSprite() {
        const spriteX = 90;
        const spriteY = 30;

        // Draw the sprite at its natural size.
        // Offset 0 means: draw using palette slots starting at the sprite's base index.
        BT.drawSprite(this.sheet, this.charSprite, new Vector2i(spriteX, spriteY), 0);

        // Captions below the sprite, drawn as a borderless kit group pinned right
        // under the artwork. The group's inner padding (6 px) shifts its text right
        // and down a little, so the pin point compensates by starting 6 px to the
        // left of the sprite and just 1 px below it.
        ui.begin('topLeft', { x: spriteX - 6, y: spriteY + this.charSprite.height + 1 });

        // Which theme the sprite is currently drawn with.
        ui.label(`Theme: ${this.themeNames[this.currentTheme]}`, { color: 'header' });

        // Explain the draw call: BT.drawSprite() above passes palette offset 0, so
        // the sprite reads its colors straight from slots COLOR_BASE and up.
        ui.label('offset = 0', { color: 'info' });
        ui.label(`slots ${COLOR_BASE}..${COLOR_BASE + this.colorCount - 1}`, { color: 'info' });

        ui.end();
    }

    /**
     * Draws a code snippet column on the right side showing how palette swap works.
     * A borderless kit group (no ui.panel call) keeps the original loose-text look:
     * dim lines are code comments, blue "info" lines are the code itself.
     */
    renderCodePanel() {
        ui.begin('topRight');

        ui.label('How it works:', { color: 'header' });
        ui.label('// Build palettes', { color: 'dim' });
        ui.label('stone = clone()', { color: 'info' });
        ui.label('fire = clone()', { color: 'info' });
        ui.label('fire.set(10, red)', { color: 'info' });
        ui.spacer();

        ui.label('// Swap theme', { color: 'dim' });
        ui.label('BT.paletteSet(', { color: 'info' });
        ui.label('  firePalette)', { color: 'info' });
        ui.spacer();

        // spritesRefresh() only matters when the new palette moves colors to
        // DIFFERENT slot numbers - see the header comment at the top of this file.
        ui.label('// Sync sprites', { color: 'dim' });
        ui.label('BT.spritesRefresh()', { color: 'info' });
        ui.spacer();

        ui.label('// Snapshot:', { color: 'dim' });
        ui.label('copy = pal.clone()', { color: 'info' });

        ui.end();
    }

    /**
     * Builds a complete Palette for the given theme name.
     *
     * Every palette has the SAME slot layout:
     *   Slots 10..N:    Sprite colors for this theme (different RGBA per theme).
     *   Slots 30..33:   Representative swatch color per theme (identical in all palettes).
     *   Slots 40..44:   Engine overlay colors (identical in all palettes).
     *   Slots 240..251: Shared UI kit theme colors (identical in all palettes).
     *
     * Because the sprite slot NUMBERS (10..N) are the same in every palette,
     * the sprite sheet does not need re-indexization when we swap themes.
     * The sprite's stored indices already point to the right slots - just the colors
     * in those slots differ.
     *
     * @param {'stone'|'fire'|'ice'|'void'} themeName - Which tint to apply.
     * @returns {import('blit386').Palette} Ready-to-use Palette object.
     */
    buildTheme(themeName) {
        const palette = BT.paletteCreate(256);

        // Shared UI kit colors (same in every palette)
        // applyTheme() writes the twelve kit colors into high slots (240-251), far
        // above this demo's scene slots, and returns a map of slot numbers.
        // CRITICAL for this demo: BT.paletteSet() replaces the ENTIRE palette, so
        // if only one theme palette carried the UI colors, all the text and panels
        // would turn black after the first swap. Installing the same colors at the
        // same slots in all four palettes keeps the UI rock-steady across swaps.
        this.theme = applyTheme(palette);

        // Engine overlay colors (same in every palette)
        // These must match the slot numbers used in configure().overlayStyle above.
        palette.set(C_OVERLAY_BAR, new Color32(16, 18, 28)); // Dark navy bar background.
        palette.set(C_OVERLAY_GOLD, new Color32(255, 210, 80)); // Golden overlay text.
        palette.set(C_OVERLAY_BLUE, new Color32(100, 155, 210)); // Blue-gray chart bars.
        palette.set(C_OVERLAY_DIM, new Color32(80, 80, 100)); // Dim chart warnings.
        palette.set(C_OVERLAY_GRAY, new Color32(180, 180, 180)); // Gray chart error bars.

        // Sprite colors for this theme
        // We take the original stone RGBA values from baseColors and apply a tint.
        // tintColor() below picks the right recipe for the theme name.
        for (let i = 0; i < this.baseColors.length; i++) {
            // Register the tinted color at the SAME slot number regardless of theme.
            palette.set(COLOR_BASE + i, this.tintColor(this.baseColors[i], themeName));
        }

        // Representative swatch colors (same in every palette)
        // These are used for the theme legend on the left side.
        // They do NOT change with the theme so the legend always shows all four options.
        palette.set(SWATCH_STONE, new Color32(130, 120, 110)); // Warm gray for stone.
        palette.set(SWATCH_FIRE, new Color32(220, 80, 20)); // Orange-red for fire.
        palette.set(SWATCH_ICE, new Color32(80, 160, 220)); // Sky blue for ice.
        palette.set(SWATCH_VOID, new Color32(40, 90, 50)); // Dim green for void.

        return palette;
    }

    /**
     * Applies one theme's tint to a single base color.
     * A "tint" is a simple recipe: nudge the red, green, and blue channels up or
     * down, clamped to the valid 0..255 range so the math never overflows.
     *
     * @param {Color32} base - The original stone color from the sprite.
     * @param {'stone'|'fire'|'ice'|'void'} themeName - Which tint recipe to apply.
     * @returns {Color32} The tinted color for this theme.
     */
    tintColor(base, themeName) {
        if (themeName === 'stone') {
            // Original colors - no tint.
            return base;
        }

        if (themeName === 'fire') {
            // Warm: boost red, reduce blue.
            return new Color32(Math.min(255, base.r + 70), Math.max(0, base.g - 20), Math.max(0, base.b - 90));
        }

        if (themeName === 'ice') {
            // Cool: boost blue, reduce red.
            return new Color32(Math.max(0, base.r - 70), Math.min(255, base.g + 20), Math.min(255, base.b + 90));
        }

        // void: desaturate and shift toward green.
        const luma = Math.floor(base.luminance);
        return new Color32(Math.floor(luma * 0.4), Math.min(255, Math.floor(luma * 0.8 + 20)), Math.floor(luma * 0.4));
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
