// Demo 015 -- Palette Presets: six built-in color sets you can load instantly.
//
// Demo 015 in the Blit-Tech series (written for readers about 12 years old).
//
// Prerequisites:
//   001-Basics     https://vancura.dev/articles/blit-tech-basics
//   002-Primitives https://vancura.dev/articles/blit-tech-primitives
//   003-Colors     https://vancura.dev/articles/blit-tech-colors
//
// We also use fonts from Demo 004:
//   004-Fonts      https://vancura.dev/articles/blit-tech-fonts
//
// Live article: https://vancura.dev/articles/blit-tech-palette-presets
//
// WHAT IS A PALETTE PRESET?
//
// In all the earlier demos we built our palette by hand:
//   palette.set(1, new Color32(255, 0, 0)); // My red.
//   palette.set(2, new Color32(0, 255, 0)); // My green.
//
// Blit-Tech ships with six "preset" palettes -- ready-made color sets based on
// real hardware from the history of video games:
//
//   Game Boy    4 colors   (1989 Nintendo handheld -- shades of green)
//   CGA        16 colors   (1981 IBM PC graphics card -- loud, iconic)
//   C64        16 colors   (1982 Commodore 64 -- earthy, distinctive)
//   PICO-8     16 colors   (2015 fantasy console -- soft, retro feel)
//   NES        56 colors   (1983 Nintendo console -- wide but limited)
//   VGA       256 colors   (1987 IBM PC graphics standard -- rich range)
//
// A preset palette gives you instant authentic retro style.
//
// You can also NAME slots using setNamed() / getNamed() -- like labeling paint cans
// instead of just numbering them. "background" is easier to remember than slot 2.
//
// WHAT YOU WILL SEE:
//   - A row of colored swatches for each preset.
//   - The preset name and slot count next to each row.
//   - A "live view" panel that auto-cycles through all six presets every 2 seconds.
//   - Named slots: the live view uses palette.setNamed() / getNamed() to pick colors.

import { bootstrap, BT, Color32, Palette, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

// How many ticks to show each preset in the live view (2 seconds at 60 FPS = 120 ticks).
const LIVE_SWITCH_TICKS = 120;

// Maximum number of swatches to show per row (to avoid running off screen).
const MAX_SWATCHES_PER_ROW = 32;

// Swatch size in pixels.
const SWATCH_W = 7;
const SWATCH_H = 14;

// #endregion

// #region Main Logic

/**
 * Demonstrates the six built-in palette presets and named palette slots.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    // The main palette used for UI and the live preview.
    palette = null;

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

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Loads all six presets, builds the main UI palette, and loads the font.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        console.log('[PalettePresetsDemo] Initializing...');

        // --- Load all six preset palettes ---
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

        // --- Build the main UI palette ---
        // This palette holds the colors we need to draw labels and the layout.
        // We keep it separate from the preset palettes so the UI is always readable.
        this.palette = BT.paletteCreate(256);

        // Index 0: always transparent (reserved).
        // Index 1: white for font base.
        this.palette.set(1, new Color32(255, 255, 255));

        // Index 2: dark background.
        this.palette.set(2, new Color32(18, 18, 28));

        // Index 3: dim gray for section labels.
        this.palette.set(3, new Color32(180, 180, 180));

        // Index 4: golden header text.
        this.palette.set(4, new Color32(255, 210, 80));

        // Index 5: blue-gray subtitle.
        this.palette.set(5, new Color32(120, 160, 200));

        // Index 6: dim FPS text.
        this.palette.set(6, new Color32(80, 80, 100));

        // Slots 10..265 hold the swatch colors for the six static swatch rows.
        // We copy each preset's colors into this palette so we can draw swatches
        // without switching the active palette.
        // Layout: preset 0 at 10..13 (4 colors), preset 1 at 20..35 (16), etc.
        const swatch_offsets = [10, 20, 40, 60, 80, 150];

        for (let p = 0; p < this.presets.length; p++) {
            const preset = this.presets[p];
            const maxColors = Math.min(preset.size, MAX_SWATCHES_PER_ROW);
            const offset = swatch_offsets[p];

            for (let c = 0; c < maxColors; c++) {
                // palette.get(index) returns the Color32 stored at that slot.
                const color = preset.get(c);

                if (color) {
                    this.palette.set(offset + c, color);
                }
            }
        }

        // Store offsets for use in render().
        this.swatchOffsets = swatch_offsets;

        // --- Use setNamed() for semantic color aliases in the live view ---
        // setNamed() lets you refer to a slot by a descriptive word instead of a number.
        // This is like writing "background" on a label instead of "slot 2".
        this.palette.setNamed('ui-bg', 2); // "ui-bg" = slot 2 = dark background.
        this.palette.setNamed('ui-text', 1); // "ui-text" = slot 1 = white.
        this.palette.setNamed('ui-header', 4); // "ui-header" = slot 4 = golden.

        // Slots 200..215 are reserved for the live view preview swatches.
        // These will be updated in update() when the active preset changes.
        for (let i = 0; i < 16; i++) {
            this.palette.set(200 + i, new Color32(0, 0, 0));
        }
        this.palette.setNamed('live-swatch-0', 200); // Named alias for the first live swatch.

        // --- Activate palette ---
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

            // Copy the new preset's colors into the live view swatch slots (200..215).
            this.updateLiveSwatches();
        }
    }

    /**
     * Draws the static swatch rows, labels, and the live cycling preview panel.
     * NO Color32 objects appear in draw calls here -- only palette index numbers.
     */
    render() {
        // Background. Index 2 = dark navy.
        BT.clear(2);

        // Title. systemPrint takes (position, paletteIndex, text). Slot 4 = golden.
        BT.systemPrint(new Vector2i(6, 4), 4, 'Blit-Tech - Palette Presets');

        // Draw each preset as a row of colored swatches.
        this.renderSwatchRows();

        // Draw the live cycling preview.
        this.renderLivePreview();

        // FPS. Slot 6 = dim gray.
        BT.systemPrint(new Vector2i(250, 225), 6, `FPS: ${BT.targetFPS}`);
    }

    // #endregion

    // #region Helpers

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
                this.palette.set(200 + i, color ?? new Color32(0, 0, 0));
            } else {
                this.palette.set(200 + i, new Color32(0, 0, 0));
            }
        }
    }

    /**
     * Draws one row of colored rectangles per preset.
     * Each rectangle's color comes directly from the swatch slots we copied in init().
     */
    renderSwatchRows() {
        // Row positions: six presets spread across the upper portion of the screen.
        // y positions are spaced 20 pixels apart.
        const rowY = [20, 40, 60, 80, 100, 120];
        const presetColorCounts = [4, 16, 16, 16, 32, 32];

        for (let p = 0; p < this.presets.length; p++) {
            const y = rowY[p];
            const count = Math.min(presetColorCounts[p], MAX_SWATCHES_PER_ROW);
            const offset = this.swatchOffsets[p];

            // Draw the colored swatches.
            for (let c = 0; c < count; c++) {
                BT.drawRectFill(new Rect2i(6 + c * (SWATCH_W + 1), y, SWATCH_W, SWATCH_H), offset + c);
            }

            // Label: preset name and actual slot count. Slot 3 = dim gray.
            const label = `${this.presetNames[p]} (${this.presets[p].size})`;
            BT.systemPrint(new Vector2i(6 + count * (SWATCH_W + 1) + 4, y + 2), 3, label);
        }
    }

    /**
     * Draws the live cycling preview panel in the lower portion of the screen.
     * Shows 16 swatches from the current preset, plus the preset name and a description.
     */
    renderLivePreview() {
        const panelY = 148;

        // Panel background -- index 2 is the dark background color we set in init().
        BT.drawRectFill(new Rect2i(0, panelY - 4, 320, 96), 2);

        // Header. Slot 5 = blue-gray subtitle. systemPrint takes (position, paletteIndex, text).
        BT.systemPrint(new Vector2i(6, panelY - 2), 5, 'Live view (cycles every 2s):');

        // Show 16 large swatches from the live slots (200..215).
        for (let i = 0; i < 16; i++) {
            BT.drawRectFill(new Rect2i(6 + i * 18, panelY + 12, 16, 24), 200 + i);
        }

        // Current preset name below swatches. Slot 4 = golden.
        const name = this.presetNames[this.currentPresetIndex];
        const size = this.presets[this.currentPresetIndex].size;
        BT.systemPrint(new Vector2i(6, panelY + 42), 4, `Current: ${name} -- ${size} colors`);

        // Explain named slots. Slot 3 = dim gray.
        BT.systemPrint(new Vector2i(6, panelY + 56), 3, "palette.setNamed('ui-bg', 2)");
        BT.systemPrint(new Vector2i(6, panelY + 68), 3, "palette.getNamed('ui-bg') => 2");
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Hand the Demo class to Blit-Tech to start the demo loop.
bootstrap(Demo);

// #endregion
