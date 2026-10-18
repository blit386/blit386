/*

System Font Glyphs: browse every glyph the built-in system font covers.
@description Browse every glyph the built-in system font defines, and click one to copy it to your clipboard.

Part of the BLIT386 demo series.

Prerequisites:
  - Fonts: https://demos.blit386.dev/fonts
  - Bitmap Font: https://demos.blit386.dev/bitmap-font

Live version: https://demos.blit386.dev/system-font-glyphs

Guides:
  - Bitmap Fonts: https://blit386.dev/docs/guides/bitmap-fonts#built-in-system-font
  - Input: https://blit386.dev/docs/guides/input#pointer-slot-model
  - Overlay: https://blit386.dev/docs/guides/overlay#visibility-model

Reference:
  - Assets: https://blit386.dev/docs/api/assets#system-font
  - Rendering: https://blit386.dev/docs/api/rendering#system-font
  - Core: https://blit386.dev/docs/api/core#hardware-settings

---

WHAT YOU WILL SEE
-----------------

A 600x315 screen with a title bar across the top that reads "174 glyphs - Click one to
copy to the clipboard" (the number is read from the font, so it follows whatever the
engine ships). Below it sits a grid of 16 columns of small button-shaped cells, each
holding one white glyph of the built-in 6x14 system font, in the order the font lists
them: printable ASCII first, then the extra characters (dashes, accented letters, arrows,
Greek capitals, and so on). The last row is only partly filled.

Move the pointer over a cell and it lights up, with a tooltip above it showing the code
point, like "U+00E9 (233) é". Click it and the tooltip switches to "Copied é" with a
green rim on the cell for three quarters of a second, or to "Copy failed" with an orange
rim when the browser refused. The engine overlay is switched off for this demo.

WHAT YOU WILL LEARN
-------------------

- BT.systemFont is the real BitmapFont object BT.systemPrint() draws with, so everything
  the Bitmap Font demo did with a loaded font works on it too.
- font.codePoints lists every Unicode code point the font has a glyph for, in ascending
  order. The grid is built from that list, so nothing here hardcodes the glyph count.
- BT.printFont(BT.systemFont, pos, char, 0) draws one glyph anywhere. The system font's
  pixels live at palette index 1, so offset 0 draws slot 1 - which is why init() paints
  that slot white.
- BT.systemPrintMeasure('M') gives the glyph size instead of hardcoding 6x14.
- Pointer input across all four slots: BT.isPointerActive(slot), BT.pointerPos(slot), and
  BT.isPressed(BT.BTN_POINTER_A, slot) for the press edge, read in update() rather than
  render().
- navigator.clipboard.writeText() - the browser's own clipboard API, called from an async
  method whose result arrives later and is shown through a short status message.
- The shared UI kit's ui.drawButtonFace(), ui.tooltip(), and ui.overWidget().
- configure() returning displaySize and isOverlayEnabled: false.

WHY 600 BY 315?
---------------

That is exactly half of the 1200x630 social card the demo site generates, so the card
shows the screen at a clean 2x scale with no blurry resampling. It also leaves room for 16
columns of 23-pixel cells with 2-pixel gaps.

TRY THIS
--------

- Hover any cell to read its code point in both hex and decimal.
- Click a cell (or tap it on a touch screen - touches use pointer slots 1-3), then paste
  somewhere: the character itself lands on the clipboard, not its number.
- Click a cell in the top row: the tooltip has no room above, so it drops below the cell
  instead of covering the title bar.
- Copying can fail when the page has not been focused or clipboard permission was denied -
  the cell rim turns orange and the tooltip says "Copy failed".

*/

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, BUTTON_LOOK, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').BitmapFont} BitmapFont */

// The screen is 600x315 display pixels: exactly half of the 1200x630 social card, so the
// card shows it at a clean 2x scale with no blurry resampling.
const DISPLAY_W = 600;
const DISPLAY_H = 315;

// The built-in system font stores every glyph pixel as palette index 1 (see the Fonts
// demo). A fresh palette starts that slot black, so the glyphs would vanish on the dark
// button faces unless it is painted white.
const C_GLYPH = 1;

// The grid layout. GRID_COLS = 16 deliberately matches the font's own texture atlas (16
// glyphs per row), so the grid echoes how the font stores its pixels. The row count is
// not fixed - see gridRows below, computed from however many glyphs the font reports.
const GRID_COLS = 16;
const CELL_SIZE = 23;
const CELL_GAP = 2; // gap between cells, so borders do not touch
const CELL_PITCH = CELL_SIZE + CELL_GAP; // distance from one cell's corner to the next
const GRID_ORIGIN_Y = 28; // top of the grid, just below the title bar

// How long the "Copied" / "Copy failed" message stays up before the tooltip goes back to
// following the pointer.
const COPY_STATUS_SECONDS = 0.75;

// The three states of the copy feedback. Naming them once means a typo in a comparison
// below fails loudly (an undefined property) instead of silently never matching.
const COPY_STATUS = Object.freeze({
    IDLE: 'idle', // nothing copied recently: the tooltip follows the pointer
    COPIED: 'copied', // the last click copied its glyph
    FAILED: 'failed', // the last click could not reach the clipboard
});

// Tests whether a display-pixel position lands inside a real grid cell. `localX` and
// `localY` are already offset so 0 is the grid's top-left corner. Returns the glyph index
// at that position, or -1 when the position is outside every cell - including the thin
// gaps between cells and the empty cells past the last real glyph in the final row.
function hitTestGlyphCell(localX, localY, glyphCount) {
    // A negative position is above or to the left of the grid entirely.
    if (localX < 0 || localY < 0) {
        return -1;
    }

    // Dividing by the pitch and rounding down tells which column and row we landed in,
    // like working out which square of a checkerboard a finger is over.
    const col = Math.floor(localX / CELL_PITCH);
    const row = Math.floor(localY / CELL_PITCH);

    // A column past the last one means we are off the right edge of the grid.
    if (col >= GRID_COLS) {
        return -1;
    }

    // How far into this column's pitch did we land? Past CELL_SIZE means the pointer is
    // in the gap between two cells, not on a cell. Then the same check for the row.
    if (localX - col * CELL_PITCH >= CELL_SIZE) {
        return -1;
    }

    if (localY - row * CELL_PITCH >= CELL_SIZE) {
        return -1;
    }

    // Cells are numbered left to right, top to bottom - the order codePoints lists them.
    const index = row * GRID_COLS + col;

    // The last row may have empty cells past the final real glyph - reject those.
    return index < glyphCount ? index : -1;
}

// Draws every glyph BT.systemFont lists in a grid and mirrors the engine overlay's
// palette-swatch click-to-copy using only public API: BT.pointerPos, BT.isPressed with
// BT.BTN_POINTER_A, BT.printFont, and the browser's navigator.clipboard.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slot numbers of the shared UI kit colors, filled in by applyTheme() in
    // init(). theme.bg clears the screen.
    theme = null;

    // Filled in by init() from BT.systemFont - see there for why.
    /** @type {BitmapFont | null} */
    font = null;

    /** @type {readonly number[]} */
    codePoints = [];

    // How many rows the grid needs to fit every glyph. Computed in init() from
    // codePoints.length, never hardcoded - see the comment on GRID_COLS above.
    gridRows = 0;

    // Pixel size of one glyph, measured in init() with BT.systemPrintMeasure('M') instead
    // of hardcoded, so the demo cannot drift out of sync with the font's real dimensions.
    glyphWidth = 6;
    glyphHeight = 14;

    // A running clock in seconds, used to time how long the "Copied" / "Copy failed"
    // message stays up. BT.deltaSeconds is the time one fixed update covers - adding it
    // up every tick gives a stopwatch.
    elapsed = 0;

    // Whether a glyph was just copied, and whether it worked. IDLE means nothing was
    // copied recently, so the tooltip shows whatever is hovered.
    copyStatus = COPY_STATUS.IDLE;
    copyStatusIndex = -1; // which glyph index the status message is about
    copyStatusExpiry = 0; // this.elapsed value at which the status message clears

    // One rectangle, reused every frame, telling ui.tooltip() which cell to sit above.
    // Building a new one each frame would be wasteful - the widget only reads the
    // numbers.
    tooltipAnchor = new Rect2i(0, 0, CELL_SIZE, CELL_SIZE);

    // Picks a display big enough for the whole glyph grid. Runs before init().
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),

            // Turn the engine's debug overlay off, along with its small corner toggle
            // mark. This demo has no use for it.
            isOverlayEnabled: false,
        };
    }

    // Sets up the palette and reads BT.systemFont's glyph list.
    async init() {
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_GLYPH, new Color32(255, 255, 255));

        // Install the shared UI kit colors (slots 240-251) before BT.paletteSet().
        // ui.tooltip() and the button faces draw with those.
        this.theme = applyTheme(this.palette);
        BT.paletteSet(this.palette);

        // BT.systemFont hands back the exact BitmapFont object BT.systemPrint() draws
        // with - a real object we can ask questions of. codePoints is the point of this
        // demo: it lists every Unicode character the font can draw, live, so the grid
        // stays accurate even if the font's glyph set changes later.
        this.font = BT.systemFont;
        this.codePoints = this.font.codePoints;

        // Math.ceil rounds up: 174 glyphs / 16 columns = 10.875, which becomes 11 rows
        // because the last, partly empty row still needs to exist.
        this.gridRows = Math.ceil(this.codePoints.length / GRID_COLS);

        // Measure one glyph so it can be centered inside its cell, instead of hardcoding
        // the font's pixel dimensions here.
        const glyphSize = BT.systemPrintMeasure('M');
        this.glyphWidth = glyphSize.x;
        this.glyphHeight = glyphSize.y;

        return true;
    }

    // Runs at a fixed rate (60 times per second). Advances the copy-status clock and
    // handles clicks and taps. Reading the press edge here, not in render(), matches how
    // every other pointer demo in the series handles clicks.
    update() {
        this.elapsed += BT.deltaSeconds;

        // Once the "Copied" / "Copy failed" message has been up long enough, clear it so
        // the tooltip goes back to showing whatever the pointer is hovering.
        if (this.copyStatus !== COPY_STATUS.IDLE && this.elapsed >= this.copyStatusExpiry) {
            this.copyStatus = COPY_STATUS.IDLE;
            this.copyStatusIndex = -1;
        }

        // Walk every pointer slot. Slot 0 is the mouse; slots 1-3 are up to three
        // simultaneous touches. BTN_POINTER_A "just pressed" means a mouse click or a
        // touch just landed on any of them.
        for (let slot = 0; slot < 4; slot++) {
            if (BT.isPressed(BT.BTN_POINTER_A, slot)) {
                this.tryCopyAt(slot);
            }
        }
    }

    // If this pointer slot landed on a real glyph cell (and not on the title panel above
    // the grid), starts copying that glyph to the clipboard.
    tryCopyAt(slot) {
        if (!BT.isPointerActive(slot)) {
            return;
        }

        const pos = BT.pointerPos(slot);

        // Do not let a click on the title panel fall through to the grid underneath it.
        if (ui.overWidget(pos.x, pos.y)) {
            return;
        }

        const index = hitTestGlyphCell(pos.x - this.gridOriginX, pos.y - GRID_ORIGIN_Y, this.codePoints.length);

        if (index !== -1) {
            // `void` tells readers (and linters) we are deliberately not waiting for this
            // promise before update() moves on - copyGlyph() updates copyStatus itself
            // once the clipboard write settles.
            void this.copyGlyph(index);
        }
    }

    // Writes one glyph's actual character to the system clipboard. `index` points into
    // this.codePoints.
    async copyGlyph(index) {
        // String.fromCodePoint turns a numeric code point (like 233) back into the real
        // character (like 'é'), so the letter itself lands on the clipboard, not a
        // number.
        const char = String.fromCodePoint(this.codePoints[index]);

        try {
            // Older or unusual browsers may not implement the Clipboard API at all.
            if (!navigator.clipboard?.writeText) {
                throw new Error('Clipboard API unavailable');
            }

            await navigator.clipboard.writeText(char);
            this.setCopyStatus(COPY_STATUS.COPIED, index);
        } catch {
            // Browsers can also refuse the call outright - for example when the page was
            // never focused, or the user denied clipboard permission.
            this.setCopyStatus(COPY_STATUS.FAILED, index);
        }
    }

    // Records the outcome of a copy attempt (COPY_STATUS.COPIED or COPY_STATUS.FAILED)
    // and schedules when its tooltip message disappears.
    setCopyStatus(status, index) {
        this.copyStatus = status;
        this.copyStatusIndex = index;
        this.copyStatusExpiry = this.elapsed + COPY_STATUS_SECONDS;
    }

    // Runs once per screen refresh: clears the screen, draws the title panel, works out
    // which cell (if any) the pointer is over, then draws the grid and its tooltip.
    render() {
        BT.clear(this.theme.bg);

        ui.begin(UI_ANCHORS.TOP_BAR);
        ui.panel(`${this.codePoints.length} glyphs - Click one to copy to the clipboard`);
        ui.end();

        // Reading the pointer position (as opposed to a press edge) is safe from
        // render().
        let hoveredIndex = -1;

        for (let slot = 0; slot < 4; slot++) {
            if (!BT.isPointerActive(slot)) {
                continue;
            }

            const pos = BT.pointerPos(slot);

            if (ui.overWidget(pos.x, pos.y)) {
                continue;
            }

            const index = hitTestGlyphCell(pos.x - this.gridOriginX, pos.y - GRID_ORIGIN_Y, this.codePoints.length);

            if (index !== -1) {
                hoveredIndex = index;
                break; // first active pointer that lands on a cell wins
            }
        }

        this.drawGrid(hoveredIndex);

        // While a copy status message is active, the tooltip talks about that glyph (the
        // one just clicked) instead of whatever the pointer is over now. It is drawn
        // after the grid, so it covers the cells and glyphs underneath it.
        const tooltipIndex = this.copyStatus === COPY_STATUS.IDLE ? hoveredIndex : this.copyStatusIndex;

        if (tooltipIndex !== -1) {
            this.placeTooltipAnchor(tooltipIndex);

            // minY keeps the box out of the title panel. On the top row, where there is
            // no room above the cell, ui.tooltip() drops the box down over the grid
            // instead.
            ui.tooltip(this.tooltipAnchor, this.tooltipLabel(tooltipIndex), { minY: GRID_ORIGIN_Y });
        }
    }

    // X position of the grid's top-left corner, centered on the display. A getter (worked
    // out each time it is read, like a tiny function) rather than a number saved in
    // init(), so it always matches the current CELL_SIZE and display width - even while
    // you tweak those numbers with hot reload, which does not re-run init() for a
    // method-only change.
    get gridOriginX() {
        // Subtracting one CELL_GAP accounts for the last column having no gap after it.
        const gridWidth = GRID_COLS * CELL_PITCH - CELL_GAP;

        return Math.floor((BT.displaySize.x - gridWidth) / 2);
    }

    // Draws every glyph cell: a kit button face (lighter under the pointer, with a
    // colored rim right after a copy) and the glyph itself via BT.printFont() with the
    // font BT.systemFont handed us. `hoveredIndex` is the cell under the pointer, or -1.
    drawGrid(hoveredIndex) {
        for (let index = 0; index < this.codePoints.length; index++) {
            const col = index % GRID_COLS;
            const row = Math.floor(index / GRID_COLS);
            const cellX = this.gridOriginX + col * CELL_PITCH;
            const cellY = GRID_ORIGIN_Y + row * CELL_PITCH;
            const cellRect = new Rect2i(cellX, cellY, CELL_SIZE, CELL_SIZE);

            // Each cell wears the same rounded face as a kit button (ui.drawButtonFace),
            // picked by state. Right after a copy attempt the rim lights up - accent
            // green when it worked, warm orange when it failed - so clicking gives
            // visible feedback even without reading the tooltip. Otherwise the cell under
            // the pointer gets the lighter hover face, and every other cell the resting
            // one.
            let look = BUTTON_LOOK.REST;

            if (index === this.copyStatusIndex) {
                look = this.copyStatus === COPY_STATUS.COPIED ? BUTTON_LOOK.HELD : BUTTON_LOOK.WARN;
            } else if (index === hoveredIndex) {
                look = BUTTON_LOOK.HOVER;
            }

            ui.drawButtonFace(cellRect, look);

            // BT.printFont(font, position, text, paletteOffset) draws with any BitmapFont
            // - here BT.systemFont, the same font BT.systemPrint() uses internally.
            // Centering: the cell size minus the glyph size, halved and rounded down to
            // whole pixels.
            const char = String.fromCodePoint(this.codePoints[index]);
            const glyphX = cellX + Math.floor((CELL_SIZE - this.glyphWidth) / 2);
            const glyphY = cellY + Math.floor((CELL_SIZE - this.glyphHeight) / 2);

            BT.printFont(this.font, new Vector2i(glyphX, glyphY), char, 0);
        }
    }

    // Writes this.tooltipAnchor so it covers the cell for `index`. ui.tooltip() docks its
    // box above whatever rectangle it is given.
    placeTooltipAnchor(index) {
        const col = index % GRID_COLS;
        const row = Math.floor(index / GRID_COLS);

        this.tooltipAnchor.set(
            this.gridOriginX + col * CELL_PITCH,
            GRID_ORIGIN_Y + row * CELL_PITCH,
            CELL_SIZE,
            CELL_SIZE,
        );
    }

    // The words inside the tooltip for one glyph: its code point, or a short note about
    // the copy that just happened.
    tooltipLabel(index) {
        const codePoint = this.codePoints[index];
        const char = String.fromCodePoint(codePoint);

        if (this.copyStatus === COPY_STATUS.COPIED && this.copyStatusIndex === index) {
            return `Copied ${char}`;
        }

        if (this.copyStatus === COPY_STATUS.FAILED && this.copyStatusIndex === index) {
            return 'Copy failed';
        }

        // toString(16) turns the number into hexadecimal (base 16) digits, the way
        // Unicode code points are usually written. padStart(4, '0') adds leading zeros so
        // "U+00E9" is the same width as "U+2013".
        const hex = codePoint.toString(16).toUpperCase().padStart(4, '0');

        return `U+${hex} (${codePoint}) ${char}`;
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
