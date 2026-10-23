/*

Palette Presets: six built-in color sets you can load instantly.
@description Six built-in color sets, including VGA, CGA, and C64, you can load into the active palette instantly.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives
  - Colors: https://demos.blit386.dev/colors

Live version: https://demos.blit386.dev/palette-presets

Guides:
  - Palette Presets: https://blit386.dev/docs/guides/palette-presets
  - Game Boy preset: https://blit386.dev/docs/guides/palette-presets#game-boy-4-slots
  - CGA preset: https://blit386.dev/docs/guides/palette-presets#cga-16-slots
  - C64 preset: https://blit386.dev/docs/guides/palette-presets#c64-16-slots
  - PICO-8 preset: https://blit386.dev/docs/guides/palette-presets#pico8-16-slots
  - NES preset: https://blit386.dev/docs/guides/palette-presets#nes-64-slots
  - VGA preset: https://blit386.dev/docs/guides/palette-presets#vga-256-slots
  - Palette: https://blit386.dev/docs/guides/palette#create-and-activate-a-palette
  - Overlay: https://blit386.dev/docs/guides/overlay#custom-rows

Reference:
  - Built-in presets: https://blit386.dev/docs/api/palette#built-in-presets
  - Named slots: https://blit386.dev/docs/api/palette#named-slot-aliases
  - Overlay: https://blit386.dev/docs/api/overlay#event-tags

---

WHAT YOU WILL SEE
-----------------

A 520 by 390 pixel screen with the engine overlay open, and two UI kit panels stacked in
the space between its top and bottom strips.

The "Built-in presets" panel has one row per preset, in this order: Game Boy, CGA, C64,
PICO-8, NES, VGA. Each row starts with the preset name and its slot count in a left
column, then the preset's slots as small 9 by 12 pixel swatches, all rows starting at the
same x. Rows stop at 32 swatches; the NES and VGA rows end with a dim "+32" or "+224" for
the slots not shown. The first swatch of every row is slot 0, the engine's reserved
transparent slot, drawn as a hollow outline because filling it would draw nothing. The
name of the preset the live view is showing is lit in green.

The "Live view" panel below names the current preset and shows 16 large swatches. Every 2
seconds it moves on to the next preset and copies that preset's first 16 slots into
palette slots 200-215, so the big swatches change color while the drawing code stays
exactly the same. Two dim lines in the panel show the setNamed() and getNamed() calls
from init().

The engine overlay also gets a custom row naming the current live-view preset and its
slot count, and its timing chart gets a tag at every switch.

WHAT YOU WILL LEARN
-------------------

- The six preset factories: Palette.gameboy(), Palette.cga(), Palette.c64(),
  Palette.pico8(), Palette.nes(), and Palette.vga(). Each returns a ready-made Palette.
- palette.size tells you how many slots a palette has; palette.get(index) reads one slot.
- Copying colors from one Palette into another with palette.set(), so one active palette
  can show samples of six presets at once.
- Naming a slot with palette.setNamed(name, index) and reading it back with
  palette.getNamed(name).
- A custom overlay row via overlayRows() and timing-chart tags via BT.assignTag().

WHAT IS A PALETTE PRESET?
-------------------------

In the earlier demos we built a palette by hand, one palette.set() call per color.
BLIT386 also ships six ready-made palettes based on real hardware from video game
history:

  - Game Boy    4 slots   (1989 Nintendo handheld - shades of green)
  - CGA        16 slots   (1981 IBM PC graphics card - loud, iconic)
  - C64        16 slots   (1982 Commodore 64 - earthy, distinctive)
  - PICO-8     16 slots   (2015 fantasy console - soft, retro feel)
  - NES        64 slots   (1983 Nintendo console - 56 colors defined, the rest black)
  - VGA       256 slots   (1987 IBM PC graphics standard - rich range)

Slot 0 of every palette is reserved for transparency, so a preset's colors start at
slot 1. A preset palette gives you an authentic retro look in one call.

You can also NAME slots with setNamed() and getNamed() - like writing a label on a paint
can instead of only numbering it. "live-swatch-0" is easier to remember than 200.

TRY THIS
--------

- Press the backquote key (`) to open the engine overlay. The custom row near the bottom
  names the live-view preset, and the timing chart gets a tag each time it switches.
- The overlay's palette grid is turned on with 64 columns. Find slots 200-215 in it: they
  change every 2 seconds, while the swatch copies in slots 10-181 never move.

*/

import { bootstrap, BT, Color32, Palette, Rect2i, Vector2i } from 'blit386';

import { applyTheme, FONT_W, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// How many ticks the live view shows each preset. A tick is one fixed update; at 60 ticks
// per second, 120 ticks is 2 seconds.
const LIVE_SWITCH_TICKS = 120;

// Maximum number of swatches per row, so the 64-slot NES and 256-slot VGA rows do not run
// off the screen.
const MAX_SWATCHES_PER_ROW = 32;

// Where the two kit panels sit. The overlay starts visible and covers the top 64 and the
// bottom 100 pixels of the 390-pixel screen, so the panels stack in the band between:
// Built-in presets on top, Live view below it, both nearly full width.
const PANEL_X = 6;
const PANEL_W = 508;
const PRESETS_PANEL_Y = 69;
const PANEL_GAP = 6;

// A kit panel with a title starts its content 22 pixels below its top edge and ends 11
// pixels below the last row (the rim and the title strip).
const PANEL_CONTENT_TOP = 22;
const PANEL_BOTTOM = 11;

// Inside the presets panel each row is a name column, then the swatches. The text starts
// 10 pixels in from the panel edge (the same inset as the panel title); the swatches all
// start at one shared x, 14 characters further right, so every row lines up.
const ROW_TEXT_X = PANEL_X + 10;
const SWATCH_X = ROW_TEXT_X + 14 * FONT_W;
const ROW_PITCH = 15;

// Swatch size in pixels, and the distance from one swatch to the next (a 2-pixel gap).
const SWATCH_W = 9;
const SWATCH_H = 12;
const SWATCH_STEP = SWATCH_W + 2;

// The presets panel is tall enough for six rows; the last row needs no gap under it.
const PRESETS_PANEL_H = PANEL_CONTENT_TOP + 6 * ROW_PITCH - (ROW_PITCH - SWATCH_H) + PANEL_BOTTOM;
const LIVE_PANEL_Y = PRESETS_PANEL_Y + PRESETS_PANEL_H + PANEL_GAP;

// The 16 live-view swatches: 28 pixels wide with a 2-pixel gap, centered in the panel.
const LIVE_SWATCH_COUNT = 16;
const LIVE_SWATCH_W = 28;
const LIVE_SWATCH_H = 20;
const LIVE_SWATCH_STEP = LIVE_SWATCH_W + 2;
const LIVE_SWATCH_X = PANEL_X + (PANEL_W - (LIVE_SWATCH_COUNT * LIVE_SWATCH_STEP - 2)) / 2;

// First palette slot of the 16 live-view swatches (slots 200-215).
const LIVE_SWATCH_SLOT = 200;

// Shared UI theme slots used by configure(). applyTheme() (see init()) writes the twelve
// shared UI colors into palette slots 240-251 - its default start slot, safely above this
// demo's swatch slots (10-181) and live-view slots (200-215). configure() runs BEFORE
// init(), so the overlay styles below have to name those slots as plain numbers instead
// of reading this.theme.
const THEME_BG = 240; // deep navy screen background
const THEME_HEADER = 246; // warm amber header text
const THEME_ACCENT = 247; // phosphor green accent
const THEME_WARM = 248; // warm orange (warnings)
const THEME_INFO = 249; // info blue

// Shows the six built-in palette presets side by side, plus a live view that cycles
// through them and a named palette slot.
class Demo {
    // The main palette: holds the swatch copies, the live-view slots, and the UI theme.
    /** @type {Palette | null} */
    palette = null;

    // Palette slot map for the shared UI kit theme, filled in init() by applyTheme().
    theme = null;

    // The six preset Palette objects, loaded in init().
    presets = [];

    // Display name for each preset, in the same order as `presets`.
    presetNames = ['Game Boy', 'CGA', 'C64', 'PICO-8', 'NES', 'VGA'];

    // Which preset (0-5) the live view currently shows.
    currentPresetIndex = 0;

    // Tick when the live view last switched presets.
    lastSwitchTick = 0;

    // First palette slot of each preset's swatch row, filled in init().
    swatchOffsets = [];

    // Reused for every swatch rectangle in render(), so drawing allocates no new Rect2i.
    swatchRect = new Rect2i(0, 0, 0, 0);

    // Reused every frame for the overlay row, so no new array or object is allocated.
    overlayRowData = [{ leftText: 'Current Game Boy - 4 slots', textPaletteIndex: THEME_HEADER }];

    // A wider canvas, the overlay's palette grid (64 columns), and overlay colors. The
    // overlay bar, text, and timing chart all borrow shared UI theme slots (240-251,
    // written by applyTheme() in init()) so the whole demo uses one color scheme.
    configure() {
        return {
            displaySize: new Vector2i(520, 390),
            maxCanvasSize: new Vector2i(520 * 2, 390 * 2),
            isOverlayPaletteEnabled: true,
            isOverlayVisibleAtStart: true,
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

    // Loads the six presets, copies their colors into one palette, installs the shared UI
    // theme, names a live-view slot, and activates the palette.
    async init() {
        console.log('[PalettePresetsDemo] Initializing...');

        // Load all six preset palettes. These are static factory methods that return a
        // ready-made Palette object - think of them as pre-sorted boxes of paint.
        this.presets = [
            Palette.gameboy(), // 4 slots: shades of green
            Palette.cga(), // 16 loud IBM PC colors
            Palette.c64(), // 16 Commodore 64 colors
            Palette.pico8(), // 16 soft fantasy console colors
            Palette.nes(), // 64 slots, 56 of them defined
            Palette.vga(), // 256 VGA standard colors
        ];

        // Build the main palette. It holds the swatch copies plus the shared UI colors.
        // We keep it separate from the preset palettes so the UI is always readable.
        this.palette = BT.paletteCreate(256);

        // applyTheme() installs the twelve shared UI colors into slots 240-251 and
        // returns a map of where each color landed (this.theme.bg, .text, .dim, ...).
        // Every kit panel and label below draws with these colors automatically.
        this.theme = applyTheme(this.palette);

        // Slots 10-181 hold the swatch colors for the six static rows. We copy each
        // preset's colors into this palette so we can draw swatches without switching the
        // active palette. Layout: preset 0 at 10-13 (4 slots), preset 1 at 20-35 (16),
        // and so on; the NES and VGA rows are capped at 32 slots each.
        const swatchOffsets = [10, 20, 40, 60, 80, 150];

        for (let p = 0; p < this.presets.length; p++) {
            const preset = this.presets[p];
            const maxColors = Math.min(preset.size, MAX_SWATCHES_PER_ROW);
            const offset = swatchOffsets[p];

            for (let c = 0; c < maxColors; c++) {
                // palette.get(index) returns a copy of the Color32 stored at that slot.
                const color = preset.get(c);

                if (color) {
                    this.palette.set(offset + c, color);
                }
            }
        }

        // Keep the offsets for render().
        this.swatchOffsets = swatchOffsets;

        // Slots 200-215 are the live-view swatches. Start them black;
        // updateLiveSwatches() fills them with the current preset's colors.
        for (let i = 0; i < LIVE_SWATCH_COUNT; i++) {
            this.palette.set(LIVE_SWATCH_SLOT + i, new Color32(0, 0, 0));
        }

        // setNamed() lets you refer to a slot by a descriptive name instead of a number -
        // like writing "live-swatch-0" on a label instead of "slot 200". (applyTheme()
        // above did the same for its UI colors: palette.getNamed('ui_bg') answers 240.)
        this.palette.setNamed('live-swatch-0', LIVE_SWATCH_SLOT);

        // Make this palette the one the engine draws with.
        BT.paletteSet(this.palette);

        // Fill the live view with the first preset.
        this.updateLiveSwatches();

        console.log('[PalettePresetsDemo] Initialized');

        return true;
    }

    // Advances the live view: every LIVE_SWITCH_TICKS ticks, move on to the next preset.
    update() {
        const tick = BT.ticks;

        if (tick - this.lastSwitchTick >= LIVE_SWITCH_TICKS) {
            // Move to the next preset. `%` is the remainder after division, so the index
            // wraps back to 0 after the last preset.
            this.currentPresetIndex = (this.currentPresetIndex + 1) % this.presets.length;
            this.lastSwitchTick = tick;
            BT.assignTag(`Preset: ${this.presetNames[this.currentPresetIndex]}`);

            // Copy the new preset's colors into the live-view slots (200-215).
            this.updateLiveSwatches();
        }
    }

    // Draws the title strip, the six swatch rows with captions, and the live-view panel.
    // No Color32 appears in a draw call here - only palette slot numbers (and the kit,
    // which uses its own theme slots).
    render() {
        // Background: the shared theme's deep navy, so every demo looks alike.
        BT.clear(this.theme.bg);

        // One row of swatches per preset.
        this.renderSwatchRows();

        // The live cycling preview.
        this.renderLivePreview();
    }

    // Names the current live-view preset and its slot count for the engine overlay.
    overlayRows() {
        // The overlay can ask for rows before init() has filled the six presets; until
        // then we answer with the prepared default row. After init(), update() keeps
        // currentPresetIndex in range with %, so no other check is needed.
        if (this.presets.length === 0) {
            return this.overlayRowData;
        }

        const name = this.presetNames[this.currentPresetIndex];
        const size = this.presets[this.currentPresetIndex].size;
        this.overlayRowData[0].leftText = `Current ${name} - ${size} slots`;

        return this.overlayRowData;
    }

    // Copies the current preset's first 16 slots into the live-view slots (200-215). Any
    // slot past the preset's size turns black. render() shows the new colors on the next
    // frame without changing a single draw call.
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

    // Draws one swatch inside a panel. Slot 0 of every palette is the reserved
    // transparent slot, so filling it would draw nothing; it gets a hollow outline in the
    // theme's border color instead, so you can see where it is. Both use the kit's
    // ui.drawRectFill() / ui.drawRect(): kit panels are sprites, and the engine draws
    // every BT.drawRectFill() before any sprite - so a plain one would hide under the
    // panel. The kit versions take the same rectangle and slot but draw sprites, which
    // land on top in the order we call them.
    renderSwatch(x, y, width, height, slot, isTransparentSlot) {
        this.swatchRect.set(x, y, width, height);

        if (isTransparentSlot) {
            ui.drawRect(this.swatchRect, this.theme.border);
        } else {
            ui.drawRectFill(this.swatchRect, slot);
        }
    }

    // Draws the Built-in presets panel: one row per preset with its name and slot count
    // in a left column, then its swatches from the copies made in init(). The row that
    // the live view is showing right now has its name lit in the accent color.
    renderSwatchRows() {
        // The panel frame, with an empty body tall enough for six rows. Everything inside
        // is drawn after ui.end(), so it lands on top of the panel.
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: PANEL_X, y: PRESETS_PANEL_Y, width: PANEL_W });
        ui.panel('Built-in presets - Palette.gameboy(), .cga(), ...');
        ui.spacer(PRESETS_PANEL_H - PANEL_CONTENT_TOP - PANEL_BOTTOM);
        ui.end();

        for (let p = 0; p < this.presets.length; p++) {
            const y = PRESETS_PANEL_Y + PANEL_CONTENT_TOP + p * ROW_PITCH;
            const size = this.presets[p].size;

            // Same math as init(): the preset's real slot count, capped at the row limit.
            const count = Math.min(size, MAX_SWATCHES_PER_ROW);
            const offset = this.swatchOffsets[p];

            // Name on the left, slot count right-aligned just before the swatches. Every
            // character of the system font is FONT_W (6) pixels wide, so the count is
            // text.length * FONT_W wide, and starting it that far left of SWATCH_X - 8
            // makes it end exactly there.
            //
            // Vertical centering: a caption's letters start 1 pixel above the y it is
            // given (the kit lifts its text 4 pixels, and capital letters begin 3 rows
            // into the 14-pixel font cell). Passing labelY = y + 3 puts the 7-pixel-tall
            // capitals on rows y + 2 to y + 8, the middle of the 12-pixel swatch.
            const labelY = y + 3;
            const isLive = p === this.currentPresetIndex;
            const sizeText = String(size);

            ui.caption(ROW_TEXT_X, labelY, this.presetNames[p], { color: isLive ? 'accent' : 'text' });
            ui.caption(SWATCH_X - 8 - sizeText.length * FONT_W, labelY, sizeText, { color: 'dim' });

            for (let c = 0; c < count; c++) {
                this.renderSwatch(SWATCH_X + c * SWATCH_STEP, y, SWATCH_W, SWATCH_H, offset + c, c === 0);
            }

            // The NES and VGA rows stop at 32 swatches; say how many slots are not shown.
            if (size > count) {
                ui.caption(SWATCH_X + count * SWATCH_STEP + 4, labelY, `+${size - count}`, { color: 'dim' });
            }
        }
    }

    // Draws the Live view panel: the current preset's name, 16 large swatches from the
    // live slots (200-215), and the two named-slot calls from init(). The swatches never
    // change their slot numbers - only the colors stored in those slots change.
    renderLivePreview() {
        const name = this.presetNames[this.currentPresetIndex];
        const size = this.presets[this.currentPresetIndex].size;

        // The kit flows the rows top to bottom: the preset name, then a ui.spacer()
        // reserves an empty band for the swatches, then the two code lines. These code
        // lines show real calls from init(), not decoration.
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: PANEL_X, y: LIVE_PANEL_Y, width: PANEL_W });
        ui.panel('Live view - slots 200-215, next preset every 2 seconds');
        // Game Boy has only 4 slots, so "first 16" would be wrong for it.
        const shown = size > LIVE_SWATCH_COUNT ? `first ${LIVE_SWATCH_COUNT} of ${size}` : `all ${size}`;

        ui.label(`${name} - ${shown} slots`, { color: 'accent' });
        ui.spacer(LIVE_SWATCH_H + 6);
        ui.label("palette.setNamed('live-swatch-0', 200)", { color: 'dim' });
        ui.label("palette.getNamed('live-swatch-0') => 200", { color: 'dim' });
        ui.end();

        // The swatches sit in the band the spacer reserved: below the title and the name
        // row (PANEL_CONTENT_TOP + 10), plus 3 pixels of breathing room.
        const swatchY = LIVE_PANEL_Y + PANEL_CONTENT_TOP + 10 + 3;

        for (let i = 0; i < LIVE_SWATCH_COUNT; i++) {
            const x = LIVE_SWATCH_X + i * LIVE_SWATCH_STEP;

            this.renderSwatch(x, swatchY, LIVE_SWATCH_W, LIVE_SWATCH_H, LIVE_SWATCH_SLOT + i, i === 0);
        }
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
