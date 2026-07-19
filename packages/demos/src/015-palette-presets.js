// Demo 015 - Palette Presets: six built-in color sets you can load instantly.
//
// Demo 015 in the BLIT386 series (written for readers about 12 years old).
//
// Prerequisites:
//   001-Basics     https://demos.blit386.dev/001-basics
//   002-Primitives https://demos.blit386.dev/002-primitives
//   003-Colors     https://demos.blit386.dev/003-colors
//   004-Fonts      https://demos.blit386.dev/004-fonts
//     (text drawing basics with BT.systemPrint; walkthrough: https://vancura.dev/articles/blit386-fonts)
//
// Live version: https://demos.blit386.dev/015-palette-presets
// Live article: https://vancura.dev/articles/blit386-palette-presets
//
// WHAT IS A PALETTE PRESET?
//
// In all the earlier demos we built our palette by hand:
//   palette.set(1, new Color32(255, 0, 0)); // My red.
//   palette.set(2, new Color32(0, 255, 0)); // My green.
//
// BLIT386 ships with six "preset" palettes - ready-made color sets based on
// real hardware from the history of video games:
//
//   Game Boy    4 colors   (1989 Nintendo handheld - shades of green)
//   CGA        16 colors   (1981 IBM PC graphics card - loud, iconic)
//   C64        16 colors   (1982 Commodore 64 - earthy, distinctive)
//   PICO-8     16 colors   (2015 fantasy console - soft, retro feel)
//   NES        56 colors   (1983 Nintendo console - wide but limited)
//   VGA       256 colors   (1987 IBM PC graphics standard - rich range)
//
// A preset palette gives you instant authentic retro style.
//
// You can also NAME slots using setNamed() / getNamed() - like labeling paint cans
// instead of just numbering them. "live-swatch-0" is easier to remember than slot 200.
//
// The title strip, row captions, and the live-view panel are drawn with the shared demo
// UI kit (src/shared/ui.js); the swatch artwork itself stays plain BT.drawRectFill calls.
//
// WHAT YOU WILL SEE:
//   - A row of colored swatches for each preset.
//   - The preset name and slot count next to each row.
//   - A "live view" panel that auto-cycles through all six presets every 2 seconds.
//   - Named slots: the live view labels its swatch slots with palette.setNamed().
//   - Current preset name and color count = engine overlay row above the FPS bar.

import { bootstrap, BT, Color32, Palette, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// How many ticks to show each preset in the live view (2 seconds at 60 FPS = 120 ticks).
const LIVE_SWITCH_TICKS = 120;

// Maximum number of swatches to show per row (to avoid running off screen).
const MAX_SWATCHES_PER_ROW = 32;

// Swatch size in pixels.
const SWATCH_W = 7;
const SWATCH_H = 14;

// First palette slot of the 16 live-view preview swatches (slots 200..215).
const LIVE_SWATCH_SLOT = 200;

// Where the live-view panel sits on screen, in pixels from the top-left corner.
const LIVE_PANEL_X = 6;
const LIVE_PANEL_Y = 152;

// Shared UI theme slots used by configure().
//
// applyTheme() (see init()) writes the twelve shared UI colors into palette slots
// 240..251 - its default start slot, safely above this demo's swatch slots (10..181)
// and live-view slots (200..215). configure() runs BEFORE init(), so the overlay
// styles below have to name those slots as plain numbers instead of reading this.theme.
const THEME_BG = 240; // Deep navy screen background.
const THEME_HEADER = 246; // Warm amber header text.
const THEME_ACCENT = 247; // Phosphor green accent.
const THEME_WARM = 248; // Warm orange (warnings).
const THEME_INFO = 249; // Info blue.

/**
 * Demonstrates the six built-in palette presets and named palette slots.
 *
 * @implements {IBTDemo}
 */
class Demo {
    // The main palette used for UI and the live preview.
    /** @type {Palette | null} */
    palette = null;

    // Palette slots of the shared UI theme colors, filled by applyTheme() in init().
    theme = null;

    // The six preset palette objects, loaded in init().
    presets = [];

    // Name strings for each preset (for display).
    presetNames = ['Game Boy', 'CGA', 'C64', 'PICO-8', 'NES', 'VGA'];

    // Which preset index (0..5) is currently shown in the live view.
    currentPresetIndex = 0;

    // Tick number when we last switched the live view.
    lastSwitchTick = 0;

    // Palette slot offsets for each preset's swatch row (filled in init()).
    swatchOffsets = [];

    // Reused every frame for the overlay (current live-view preset).
    overlayRowData = [{ leftText: 'Current Game Boy - 4 colors', textPaletteIndex: THEME_HEADER }];

    /**
     * Wider canvas, overlay palette grid (64 columns), and timing chart colors.
     *
     * The overlay bar, text, and timing chart all borrow shared UI theme slots
     * (240..251, written by applyTheme() in init()) so the whole demo uses one
     * consistent color scheme.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            displaySize: new Vector2i(520, 390),
            maxCanvasSize: new Vector2i(520 * 2, 390 * 2),
            isOverlayPaletteEnabled: true,
            overlayPaletteColumns: 64,
            overlayStyle: {
                barPaletteIndex: THEME_BG,
                textPaletteIndex: THEME_HEADER,
                gapPaletteIndex: THEME_BG,
            },
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: THEME_ACCENT,
                renderBarPaletteIndex: THEME_INFO,
                warningPaletteIndex: THEME_HEADER,
                errorPaletteIndex: THEME_WARM,
                tagPaletteIndex: THEME_HEADER,
            },
        };
    }

    /**
     * Loads all six factory presets, copies swatch colors into one UI palette,
     * installs the shared UI theme, and names the live-view swatch slots.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        console.log('[PalettePresetsDemo] Initializing...');

        // Load all six preset palettes
        // These are static factory methods that return a ready-made Palette object.
        // Think of them as pre-sorted boxes of paint for specific retro styles.
        this.presets = [
            Palette.gameboy(), // 4 shades of green-gray.
            Palette.cga(), // 16 loud IBM PC colors.
            Palette.c64(), // 16 Commodore 64 colors.
            Palette.pico8(), // 16 soft fantasy console colors.
            Palette.nes(), // 56 Nintendo console colors.
            Palette.vga(), // 256 VGA standard colors.
        ];

        // Build the main palette
        // This palette holds the swatch copies plus the shared UI colors. We keep it
        // separate from the preset palettes so the UI is always readable.
        this.palette = BT.paletteCreate(256);

        // applyTheme() installs the twelve shared UI colors into slots 240..251 and
        // returns a map of where each color landed (this.theme.bg, .text, .dim, ...).
        // Every kit panel and label below draws with these colors automatically.
        this.theme = applyTheme(this.palette);

        // Slots 10..181 hold the swatch colors for the six static swatch rows.
        // We copy each preset's colors into this palette so we can draw swatches
        // without switching the active palette.
        // Layout: preset 0 at 10..13 (4 colors), preset 1 at 20..35 (16), etc.
        const swatchOffsets = [10, 20, 40, 60, 80, 150];

        for (let p = 0; p < this.presets.length; p++) {
            const preset = this.presets[p];
            const maxColors = Math.min(preset.size, MAX_SWATCHES_PER_ROW);
            const offset = swatchOffsets[p];

            for (let c = 0; c < maxColors; c++) {
                // palette.get(index) returns the Color32 stored at that slot.
                const color = preset.get(c);

                if (color) {
                    this.palette.set(offset + c, color);
                }
            }
        }

        // Store offsets for use in render().
        this.swatchOffsets = swatchOffsets;

        // Slots 200..215 are reserved for the live view preview swatches.
        // These will be updated in update() when the active preset changes.
        for (let i = 0; i < 16; i++) {
            this.palette.set(LIVE_SWATCH_SLOT + i, new Color32(0, 0, 0));
        }

        // Use setNamed() for a semantic slot alias
        // setNamed() lets you refer to a slot by a descriptive word instead of a number.
        // This is like writing "live-swatch-0" on a label instead of "slot 200".
        // (applyTheme() above did the same trick for its UI colors: try
        // palette.getNamed('ui_bg') - it answers 240.)
        this.palette.setNamed('live-swatch-0', LIVE_SWATCH_SLOT);

        // Activate palette
        BT.paletteSet(this.palette);

        // Initialize the live view.
        this.updateLiveSwatches();

        console.log('[PalettePresetsDemo] Initialized');
        return true;
    }

    /**
     * Advances the live view: switches to the next preset every LIVE_SWITCH_TICKS ticks.
     */
    update() {
        const tick = BT.ticks;

        if (tick - this.lastSwitchTick >= LIVE_SWITCH_TICKS) {
            // Move to the next preset; wrap around after the last one.
            this.currentPresetIndex = (this.currentPresetIndex + 1) % this.presets.length;
            this.lastSwitchTick = tick;
            BT.assignTag(`Preset: ${this.presetNames[this.currentPresetIndex]}`);

            // Copy the new preset's colors into the live view swatch slots (200..215).
            this.updateLiveSwatches();
        }
    }

    /**
     * Draws the title strip, the static swatch rows with captions, and the live
     * cycling preview panel. NO Color32 objects appear in draw calls here - only
     * palette index numbers (and the kit, which uses its own theme slots).
     */
    render() {
        // Background - the shared theme's deep navy, so every demo looks alike.
        BT.clear(this.theme.bg);

        // Full-width title strip across the top, drawn by the shared UI kit.
        ui.begin('topBar');
        ui.panel('Palette Presets - six built-in retro color sets');
        ui.end();

        // Draw each preset as a row of colored swatches.
        this.renderSwatchRows();

        // Draw the live cycling preview.
        this.renderLivePreview();
    }

    /**
     * Current live-view preset name and slot count for the engine overlay.
     *
     * @returns {readonly { leftText: string }[]}
     */
    overlayRows() {
        // The overlay can ask for rows before init() has filled the six presets;
        // until then we answer with the prepared default row. After init(),
        // update() keeps currentPresetIndex in range with %, so no other check is needed.
        if (this.presets.length === 0) {
            return this.overlayRowData;
        }

        const name = this.presetNames[this.currentPresetIndex];
        const size = this.presets[this.currentPresetIndex].size;
        this.overlayRowData[0].leftText = `Current ${name} - ${size} colors`;

        return this.overlayRowData;
    }

    /**
     * Copies the current preset's first 16 colors into the live-view palette slots (200..215).
     * When update() calls this, render() automatically shows the new colors next frame.
     */
    updateLiveSwatches() {
        const preset = this.presets[this.currentPresetIndex];
        const maxColors = Math.min(preset.size, 16);

        for (let i = 0; i < 16; i++) {
            if (i < maxColors) {
                const color = preset.get(i);
                this.palette.set(LIVE_SWATCH_SLOT + i, color ?? new Color32(0, 0, 0));
            } else {
                this.palette.set(LIVE_SWATCH_SLOT + i, new Color32(0, 0, 0));
            }
        }
    }

    /**
     * Draws one row of colored rectangles per preset.
     * Each rectangle's color comes directly from the swatch slots we copied in init().
     * The caption next to each row is a tiny borderless kit group, pinned exactly
     * where the row's swatches end.
     */
    renderSwatchRows() {
        // Row positions: six presets spread across the upper portion of the screen.
        // y positions are spaced 20 pixels apart, starting below the 22px title strip.
        const rowY = [30, 50, 70, 90, 110, 130];

        for (let p = 0; p < this.presets.length; p++) {
            const y = rowY[p];
            // Same math as init(): show the preset's real color count, capped at the row limit.
            const count = Math.min(this.presets[p].size, MAX_SWATCHES_PER_ROW);
            const offset = this.swatchOffsets[p];

            // Draw the colored swatches.
            for (let c = 0; c < count; c++) {
                BT.drawRectFill(new Rect2i(6 + c * (SWATCH_W + 1), y, SWATCH_W, SWATCH_H), offset + c);
            }

            // Caption: preset name and actual slot count. A one-label kit group with
            // pad 0 draws nothing but the text, pinned right after the last swatch.
            const label = `${this.presetNames[p]} (${this.presets[p].size})`;

            ui.begin('topLeft', { x: 6 + count * (SWATCH_W + 1) + 4, y: y + 1, pad: 0 });
            ui.label(label, { color: 'dim' });
            ui.end();
        }
    }

    /**
     * Draws the live cycling preview panel in the lower portion of the screen.
     * The panel frame and text come from the shared UI kit; the 16 swatches are
     * plain rectangle fills drawn on top, into space the panel reserves for them.
     */
    renderLivePreview() {
        // The kit panel: a pinned group with a fixed width so the swatches fit.
        // ui.spacer(28) reserves an empty band inside the panel where the 24px-tall
        // swatches will be drawn AFTER ui.end() - the kit paints its panel fill on
        // end(), so anything drawn later lands on top of it.
        ui.begin('topLeft', { x: LIVE_PANEL_X, y: LIVE_PANEL_Y, width: 298 });
        ui.panel('Live view (cycles every 2s)');
        ui.spacer(28);

        // Explain named slots - this is real code from init() above.
        ui.label("palette.setNamed('live-swatch-0', 200)", { color: 'dim' });
        ui.label("palette.getNamed('live-swatch-0') => 200", { color: 'dim' });
        ui.end();

        // Show 16 large swatches from the live slots (200..215), inside the band the
        // spacer reserved: 20px down for the panel title, then 2px of breathing room.
        for (let i = 0; i < 16; i++) {
            BT.drawRectFill(new Rect2i(LIVE_PANEL_X + 6 + i * 18, LIVE_PANEL_Y + 22, 16, 24), LIVE_SWATCH_SLOT + i);
        }

        // Current preset name and color count are shown in overlayRows() above the FPS bar.
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
