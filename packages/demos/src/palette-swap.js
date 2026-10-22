/*

Palette Swap: change the active palette at runtime to switch color themes.
@description Switch the active palette at runtime to recolor an entire scene without touching the drawing code.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives
  - Sprites: https://demos.blit386.dev/sprites
  - Palette Animation: https://demos.blit386.dev/palette-animation

Live version: https://demos.blit386.dev/palette-swap

Guides:
  - Palette: https://blit386.dev/docs/guides/palette#layout-swap-vs-value-swap
  - Index sprites: https://blit386.dev/docs/guides/palette#index-sprites-preferred-and-manual-flows
  - Overlay: https://blit386.dev/docs/guides/overlay#colors-and-hud-palette-slots

Reference:
  - Sprites: https://blit386.dev/docs/api/rendering#sprites
  - Sprite refresh: https://blit386.dev/docs/api/rendering#refreshing-after-a-palette-layout-swap
  - Active palette: https://blit386.dev/docs/api/palette#active-palette
  - Fill a block: https://blit386.dev/docs/api/palette#fill-a-block-of-slots
  - Overlay: https://blit386.dev/docs/api/overlay#event-tags

---

WHAT YOU WILL SEE
-----------------

Three UI kit panels on a 320x240 screen. Themes, in the top-left corner, lists the four
themes - Stone, Fire, Ice, Void - each with a small color square and its name; the active
one has a green frame around its square and a bright name, and a meter under the list
fills up toward the next swap. Sprite, beside it, shows public/sprites/test.png at 3
times its size, with the current theme, the palette slots it reads, and its palette
offset listed to its right. How it works, across the bottom, shows the calls the demo
makes, each under a comment saying when it runs.

Every 2 seconds the demo activates the next theme palette. The sprite changes color
instantly; the legend squares, the text, and the engine overlay keep their colors because
every theme palette carries the same values in those slots.

WHAT YOU WILL LEARN
-------------------

- Building several Palette objects with the same slot layout but different colors, and
  switching between them with BT.paletteSet(palette).
- SpriteSheet.loadColorsIntoPalette(url, palette, startSlot) to read a PNG's unique
  colors before the sheet itself is loaded, and palette.fillBlock(start, colors,
  transform) to write a tinted copy of them into a block of slots.
- SpriteSheet.load(url) and sheet.indexize(palette) to turn RGBA pixels into palette
  indices.
- Value swap vs. layout swap: when BT.spritesRefresh() is needed and when it is not.
- Color32.luminance and simple channel math for tinting colors.
- A tick-based Timer and timing-chart tags via BT.assignTag().

WHAT IS PALETTE SWAP?
---------------------

In the Palette Animation demo we changed the VALUES in palette slots while keeping the
same Palette object. A palette swap goes further: you build several Palette objects, one
per color theme, and at runtime you switch WHICH one is active.

Imagine painting with a box of paints. Instead of mixing new colors one at a time, you
grab a completely different paint box. Every slot gets replaced at once.

HOW DOES THE ENGINE STAY IN SYNC?
---------------------------------

When you call BT.paletteSet(newPalette):

  1. The engine uploads the new palette to the GPU.
  2. All drawing calls now look up colors from the new palette.

Sprites store palette indices, not colors. When the new palette keeps every color at
the same slot number and only changes the color values (a "value swap"), the sprites
are already correct, and the sheet stays as indexize() wrote it. BT.spritesRefresh()
is the other case, a "layout swap", where the same colors move to different slot
numbers. That call re-matches every sprite's original RGBA pixels against the new
palette, the same way indexize() did the first time.

This demo is a value swap. Every theme palette keeps the sprite colors at the same slot
numbers and only tints the values, so update() calls BT.paletteSet() and leaves the
sheet alone.

TRY THIS
--------

- Press the backquote key (`) to open the engine overlay. The timing chart gets a tag
  with the theme name at every swap, and the overlay's own colors (slots 40-44) stay put
  because all four palettes hold the same values there.

*/

import { bootstrap, BT, Color32, Rect2i, SpriteSheet, Timer, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').SpriteSheet} SpriteSheet */
/** @typedef {import('blit386').Rect2i} Rect2i */

// How many ticks to hold each theme before switching. A tick is one fixed update; at 60
// ticks per second, 120 ticks is 2 seconds.
const SWAP_PERIOD_TICKS = 120;

// First palette slot of the sprite's colors.
const COLOR_BASE = 10;

// One fixed swatch color per theme, for the legend on the left. These slots hold the same
// colors in ALL four theme palettes, so the legend never changes.
const SWATCH_STONE = 30;
const SWATCH_FIRE = 31;
const SWATCH_ICE = 32;
const SWATCH_VOID = 33;

// Layout of the three kit panels on the 320x240 screen, 4 pixels from the edges: Themes
// (top left) and Sprite (top right) side by side and equally tall, then How it works
// across the full width below them. The bottom 13 pixels stay clear for the overlay's
// toggle hint.
const EDGE = 4;
const PANEL_GAP = 4;
const TOP_PANELS_Y = EDGE;
const THEMES_PANEL_W = 88;
const SPRITE_PANEL_X = EDGE + THEMES_PANEL_W + PANEL_GAP;
const SPRITE_PANEL_W = 320 - EDGE - SPRITE_PANEL_X;
const CODE_PANEL_W = 320 - 2 * EDGE;

// A kit panel with a title starts its content 22 pixels below its top edge and ends 11
// pixels below the last row (the rim and the title strip). Text inside starts 10 pixels
// in from the panel edge.
const PANEL_CONTENT_TOP = 22;
const PANEL_BOTTOM = 11;
const PANEL_TEXT_INSET = 10;

// The sprite is drawn 3 times its size. Its visible pixels cover x = 4 to 38 and
// y = 7 to 35 of the 44x44 frame, a 35x29 block that becomes 105x87 at 3x.
const SPRITE_SCALE = 3;
const ART_LEFT = 4;
const ART_TOP = 7;
const ART_W = 35 * SPRITE_SCALE;
const ART_H = 29 * SPRITE_SCALE;

// Both top panels reserve the same content height (the 87-pixel artwork plus 1 pixel
// above and below), so they end on the same line.
const TOP_CONTENT_H = ART_H + 2;
const TOP_PANELS_H = PANEL_CONTENT_TOP + TOP_CONTENT_H + PANEL_BOTTOM;
const CODE_PANEL_Y = TOP_PANELS_Y + TOP_PANELS_H + PANEL_GAP;

// Legend rows inside the Themes panel: a 10x10 swatch and the name, 14 pixels apart.
const LEGEND_ROW_H = 14;
const LEGEND_SWATCH = 10;

// Engine overlay color slots (the same in every theme palette). The overlay style is
// declared in configure(), which runs BEFORE init(), so it needs fixed slot NUMBERS known
// ahead of time. buildTheme() writes the same colors into these slots in all four
// palettes so the overlay never shifts color when the theme swaps.
const C_OVERLAY_BAR = 40; // dark navy bar behind overlay text rows
const C_OVERLAY_GOLD = 41; // golden overlay text and update-timing bars
const C_OVERLAY_BLUE = 42; // blue-gray render-timing bars and chart tags
const C_OVERLAY_DIM = 43; // dim purple-gray chart warnings
const C_OVERLAY_GRAY = 44; // light gray chart error bars

// Builds four theme palettes with the same slot layout and switches between them at
// runtime with BT.paletteSet(), recoloring one sprite without changing a draw call.
class Demo {
    // The sprite sheet loaded from test.png.
    /** @type {SpriteSheet | null} */
    sheet = null;

    // The rectangle covering the whole sprite within the sheet.
    /** @type {Rect2i | null} */
    charSprite = null;

    // How many unique colors the sprite image contains.
    colorCount = 0;

    // The sprite's original Color32 values, used to build every theme palette.
    baseColors = [];

    // The four theme palettes, switched in update(): 0 stone, 1 fire, 2 ice, 3 void.
    themes = [];

    // Display name for each theme, shown in the legend.
    themeNames = ['Stone', 'Fire', 'Ice', 'Void'];

    // Index of the active theme (0-3).
    currentTheme = 0;

    // Fires every 120 ticks (2 seconds) to switch to the next theme.
    swapTimer = new Timer(SWAP_PERIOD_TICKS);

    // Slot map for the shared UI kit theme, filled in init() by applyTheme(). Maps
    // friendly names (bg, text, dim, header, accent, info, ...) to slot numbers.
    /** @type {ReturnType<typeof applyTheme> | null} */
    theme = null;

    // Reused for every rectangle and sprite position drawn in render(), so drawing
    // allocates no new objects. spriteParams draws the sprite 3 times its size.
    tempRect = new Rect2i(0, 0, 0, 0);
    spritePos = new Vector2i(0, 0);
    spriteParams = { scale: SPRITE_SCALE };

    // The timing chart helps compare CPU cost while palettes swap on a timer. Its colors
    // come from the fixed overlay slots above.
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

    // Loads the sprite, builds the four theme palettes, and indexizes the sheet. The
    // ORDER matters:
    //   1. Read the sprite PNG's unique colors.
    //   2. Build the stone (base) palette with those colors.
    //   3. Build the fire, ice, and void palettes by tinting the base colors.
    //   4. BT.paletteSet(stonePalette) - activate the starting palette.
    //   5. SpriteSheet.load() + indexize() - link pixels to slot numbers.
    // Returns true when everything is ready, false if the sprite failed to load.
    async init() {
        console.log('[PaletteSwapDemo] Initializing...');

        // Step 1: read the sprite colors. We read the PNG ahead of time so we know the
        // exact RGBA values every theme palette has to hold. The engine helper
        // SpriteSheet.loadColorsIntoPalette() writes the colors into a palette AND
        // returns them as an array. We only need the array, so we hand it a throwaway
        // "scratch" palette and keep the returned colors for buildTheme().
        const scratchPalette = BT.paletteCreate(256);
        this.baseColors = await SpriteSheet.loadColorsIntoPalette('/sprites/test.png', scratchPalette, COLOR_BASE);
        this.colorCount = this.baseColors.length;
        console.log(`[PaletteSwapDemo] Found ${this.colorCount} unique sprite colors`);

        // Steps 2 and 3: build all four theme palettes. buildTheme() also installs the
        // shared UI kit colors (slots 240-251) into EVERY palette and stores the returned
        // slot map in this.theme, so the kit keeps its colors no matter which theme is
        // active.
        this.themes = [
            this.buildTheme('stone'), // the original rock colors
            this.buildTheme('fire'), // warm reds and oranges
            this.buildTheme('ice'), // cool blues and whites
            this.buildTheme('void'), // dark, washed-out greens
        ];

        // Step 4: activate the starting palette (stone). This must happen BEFORE
        // indexize() so the sprite's pixels are matched against the right palette.
        BT.paletteSet(this.themes[0]);

        // Step 5: load and indexize the sprite. SpriteSheet.load() fetches the PNG from
        // the public folder. indexize() looks up every pixel's color in the given
        // palette, so afterwards each pixel stores a palette slot number instead of an
        // RGBA value.
        try {
            this.sheet = await SpriteSheet.load('/sprites/test.png');

            // A source rectangle covering the whole sheet.
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

    // Runs once per tick. When SWAP_PERIOD_TICKS have passed, switches to the next theme.
    update() {
        const tick = BT.ticks;

        if (this.swapTimer.fireIfElapsed(tick)) {
            // Move to the next theme; `%` wraps the index back to 0 after void (index 3).
            this.currentTheme = (this.currentTheme + 1) % this.themes.length;

            // The palette swap. BT.paletteSet() uploads the new palette to the GPU, and
            // every draw call uses the new colors from now on. Because each theme palette
            // keeps the sprite colors at the SAME slot numbers (COLOR_BASE and up), the
            // sprite's stored indices are still correct.
            BT.paletteSet(this.themes[this.currentTheme]);
            BT.assignTag(`Theme: ${this.themeNames[this.currentTheme]}`);
        }
    }

    // Draws the theme legend, the sprite, and the code column. No Color32 appears in a
    // draw call - only palette indices.
    render() {
        // Clear to the shared UI theme background (the same slot in all theme palettes).
        BT.clear(this.theme.bg);

        // The three sections.
        this.renderThemeLegend();
        this.renderCyclingSprite();
        this.renderCodePanel();
    }

    // Draws the Themes panel in the top-left corner: one row per theme with a color
    // square and the name, the active one marked, and a meter filling up toward the next
    // swap. The squares use this demo's own scene slots (30-33), which hold the same
    // colors in every theme palette, so the legend never changes when the theme swaps.
    renderThemeLegend() {
        // The kit flows the rows top to bottom: an empty band for the four legend rows
        // (drawn after ui.end(), so they land on top of the panel), a small gap, then the
        // countdown. Its rows add up to TOP_CONTENT_H, so this panel ends exactly where
        // the Sprite panel beside it ends.
        const rowsH = this.themes.length * LEGEND_ROW_H;

        // remainingTicks() says how long until the timer fires next; dividing by the
        // period turns that into a fraction from 1 (just swapped) down to 0, and 1 minus
        // that is how far along the wait is - the meter fills up toward the next swap.
        const progress = 1 - this.swapTimer.remainingTicks(BT.ticks) / SWAP_PERIOD_TICKS;

        ui.begin(UI_ANCHORS.TOP_LEFT, { x: EDGE, y: TOP_PANELS_Y, width: THEMES_PANEL_W });
        ui.panel('Themes');
        ui.spacer(rowsH);
        ui.spacer(9);
        ui.label('Next swap', { color: 'dim' });
        ui.meter(null, progress, { width: THEMES_PANEL_W - 2 * PANEL_TEXT_INSET });
        ui.spacer(TOP_CONTENT_H - rowsH - 9 - 10 - 13);
        ui.end();

        for (let i = 0; i < this.themes.length; i++) {
            const rowY = TOP_PANELS_Y + PANEL_CONTENT_TOP + i * LEGEND_ROW_H;
            const swatchX = EDGE + PANEL_TEXT_INSET;
            const swatchY = rowY + 2;
            const isActive = i === this.currentTheme;

            // The color square, drawn with ui.drawRectFill(): kit panels are sprites, and
            // the engine draws every BT.drawRectFill() before any sprite - so a plain one
            // would hide under the panel. The active theme also gets a 1-pixel green
            // frame around its square, one pixel out.
            this.tempRect.set(swatchX, swatchY, LEGEND_SWATCH, LEGEND_SWATCH);
            ui.drawRectFill(this.tempRect, SWATCH_STONE + i);

            if (isActive) {
                this.tempRect.set(swatchX - 2, swatchY - 2, LEGEND_SWATCH + 4, LEGEND_SWATCH + 4);
                ui.drawRect(this.tempRect, this.theme.accent);
            }

            // The theme name, bright for the active theme and dim for the others. A
            // caption's capital letters cover 7 rows starting 1 row above the y it is
            // given, so swatchY + 3 centers them on the 10-pixel square.
            ui.caption(swatchX + LEGEND_SWATCH + 6, swatchY + 3, this.themeNames[i], {
                color: isActive ? 'text' : 'dim',
            });
        }
    }

    // Draws the Sprite panel in the top-right corner: the sprite 3 times its size on the
    // left, and beside it the active theme, the slots the sprite reads, and its palette
    // offset. It is drawn with palette offset 0, so it reads slots COLOR_BASE and up -
    // whichever colors the active theme put there.
    renderCyclingSprite() {
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: SPRITE_PANEL_X, y: TOP_PANELS_Y, width: SPRITE_PANEL_W });
        ui.panel('Sprite - one sheet, four looks');
        ui.spacer(TOP_CONTENT_H);
        ui.end();

        // Place the frame so its visible pixels (not its transparent border) start 10
        // pixels in and 1 pixel below the title strip. The params object scales the
        // sprite; with no paletteOffset in it, the offset is 0.
        const artX = SPRITE_PANEL_X + PANEL_TEXT_INSET;
        const artY = TOP_PANELS_Y + PANEL_CONTENT_TOP + 1;

        this.spritePos.set(artX - ART_LEFT * SPRITE_SCALE, artY - ART_TOP * SPRITE_SCALE);
        BT.drawSprite(this.sheet, this.charSprite, this.spritePos, this.spriteParams);

        // Three key-value lines right of the artwork: a dim key, then the value 7
        // characters further right.
        const keyX = artX + ART_W + 12;
        const valueX = keyX + 7 * 6;
        // The three rows of capitals span 31 pixels (rows firstY - 1 to firstY + 29), so
        // starting 14 above the artwork's middle centers the block on it.
        const firstY = artY + Math.floor(ART_H / 2) - 14;
        const slots = `${COLOR_BASE}-${COLOR_BASE + this.colorCount - 1}`;

        ui.caption(keyX, firstY, 'Theme', { color: 'dim' });
        ui.caption(valueX, firstY, this.themeNames[this.currentTheme], { color: 'header' });
        ui.caption(keyX, firstY + 12, 'Slots', { color: 'dim' });
        ui.caption(valueX, firstY + 12, slots, { color: 'info' });
        ui.caption(keyX, firstY + 24, 'Offset', { color: 'dim' });
        ui.caption(valueX, firstY + 24, '0', { color: 'info' });
    }

    // Draws the How it works panel across the bottom: the calls this demo really makes,
    // each under a dim comment saying when it runs.
    renderCodePanel() {
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: EDGE, y: CODE_PANEL_Y, width: CODE_PANEL_W });
        ui.panel('How it works - a value swap');
        ui.label('// Each theme: same slots, tinted colors', { color: 'dim' });
        ui.label('palette.fillBlock(10, colors, tint)', { color: 'info' });
        ui.label('// Every 2 seconds', { color: 'dim' });
        ui.label('BT.paletteSet(this.themes[next])', { color: 'info' });
        ui.end();
    }

    // Builds a complete Palette for one theme. Every palette has the SAME slot layout:
    //   - slots 10 and up: the sprite colors for this theme (different RGBA per theme),
    //   - slots 30-33: one swatch color per theme (identical in all palettes),
    //   - slots 40-44: engine overlay colors (identical in all palettes),
    //   - slots 240-251: shared UI kit theme colors (identical in all palettes).
    // Because the sprite slot NUMBERS are the same in every palette, the sprite sheet
    // does not need re-indexing when the theme swaps - only the colors in those slots
    // differ.
    // `themeName` is 'stone', 'fire', 'ice', or 'void'.
    buildTheme(themeName) {
        const palette = BT.paletteCreate(256);

        // Shared UI kit colors (the same in every palette). applyTheme() writes the
        // twelve kit colors into high slots (240-251), far above this demo's scene slots,
        // and returns a map of slot numbers. This is CRITICAL here: BT.paletteSet()
        // replaces the ENTIRE palette, so if only one theme palette carried the UI
        // colors, all the text and panels would turn black after the first swap. The same
        // colors at the same slots in all four palettes keep the UI rock-steady across
        // swaps.
        this.theme = applyTheme(palette);

        // Engine overlay colors (the same in every palette). These must match the slot
        // numbers used in configure() above.
        palette.set(C_OVERLAY_BAR, new Color32(16, 18, 28)); // dark navy bar background
        palette.set(C_OVERLAY_GOLD, new Color32(255, 210, 80)); // golden overlay text
        palette.set(C_OVERLAY_BLUE, new Color32(100, 155, 210)); // blue-gray chart bars
        palette.set(C_OVERLAY_DIM, new Color32(80, 80, 100)); // dim chart warnings
        palette.set(C_OVERLAY_GRAY, new Color32(180, 180, 180)); // gray chart error bars

        // The sprite colors for this theme. We take the original stone RGBA values from
        // baseColors and apply a tint; tintColor() below picks the recipe for the theme
        // name. palette.fillBlock() writes one tinted color per base color starting at
        // COLOR_BASE, so every theme registers its colors at the SAME slot numbers.
        palette.fillBlock(COLOR_BASE, this.baseColors, (base) => this.tintColor(base, themeName));

        // The legend swatch colors (the same in every palette). They do NOT change with
        // the theme, so the legend always shows all four options.
        palette.set(SWATCH_STONE, new Color32(130, 120, 110)); // warm gray for stone
        palette.set(SWATCH_FIRE, new Color32(220, 80, 20)); // orange-red for fire
        palette.set(SWATCH_ICE, new Color32(80, 160, 220)); // sky blue for ice
        palette.set(SWATCH_VOID, new Color32(40, 90, 50)); // dim green for void

        return palette;
    }

    // Applies one theme's tint to a single base color. A "tint" is a simple recipe: nudge
    // the red, green, and blue channels up or down, clamped to the valid 0-255 range so
    // the math never overflows. `base` is the original stone color from the sprite,
    // `themeName` is 'stone', 'fire', 'ice', or 'void'.
    tintColor(base, themeName) {
        if (themeName === 'stone') {
            return base; // original colors - no tint
        }

        if (themeName === 'fire') {
            // Warm: boost red, reduce green a little, reduce blue a lot.
            return new Color32(Math.min(255, base.r + 70), Math.max(0, base.g - 20), Math.max(0, base.b - 90));
        }

        if (themeName === 'ice') {
            // Cool: reduce red, boost green a little, boost blue a lot.
            return new Color32(Math.max(0, base.r - 70), Math.min(255, base.g + 20), Math.min(255, base.b + 90));
        }

        // Void: desaturate and shift toward green. Color32.luminance is the color's
        // perceived brightness as one number.
        const luma = Math.floor(base.luminance);

        return new Color32(Math.floor(luma * 0.4), Math.min(255, Math.floor(luma * 0.8 + 20)), Math.floor(luma * 0.4));
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
