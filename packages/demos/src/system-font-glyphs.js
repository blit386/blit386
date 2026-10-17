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

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').BitmapFont} BitmapFont */

// Every color used for drawing is stored in a numbered palette slot.
// Index 0 is always transparent. Custom colors start at 1.
const C_WHITE = 1; // Glyph pixels and tooltip text
const C_CELL_BORDER = 2; // Thin border drawn around every grid cell
const C_CELL_HOVER_BG = 3; // Fill behind the cell the pointer is currently over
const C_COPIED_BORDER = 4; // Border color shown briefly after a successful copy
const C_FAILED_BORDER = 5; // Border color shown briefly after a failed copy
const C_TOOLTIP_BG = 6; // Tooltip background box
const C_TOOLTIP_BORDER = 7; // Tooltip border

// The grid layout. GRID_COLS=16 deliberately matches the built-in font's own texture
// atlas layout (16 glyphs per row), so the demo's grid echoes how the font stores its
// pixels internally. Rows are NOT fixed - see gridRows below, computed from however many
// glyphs the font actually reports.

// The grid layout. GRID_COLS = 16 deliberately matches the font's own texture atlas (16
// glyphs per row), so the grid echoes how the font stores its pixels. The row count is
// not fixed - see gridRows below, computed from however many glyphs the font reports.
const GRID_COLS = 16;
const CELL_SIZE = 16; // Each cell is 16x16 pixels - comfortable click/tap padding around a small glyph
const CELL_GAP = 2; // Gap between cells, so borders don't touch
const CELL_PITCH = CELL_SIZE + CELL_GAP; // Distance from one cell's corner to the next
const GRID_ORIGIN_Y = 26; // Top of the grid, just below the title bar

// How long the "Copied" / "Copy failed" message stays up before the tooltip goes back to
// following the pointer.
const COPY_STATUS_SECONDS = 0.75;

/**
 * Tests whether a display-pixel position lands inside a real, defined grid cell.
 * Returns the glyph index at that position, or -1 if the position is outside every cell
 * (including the thin gaps between cells, and the couple of empty cells past the last
 * real glyph in an unfinished final row).
 *
 * @param {number} localX - Pointer X, already offset so 0 is the grid's left edge.
 * @param {number} localY - Pointer Y, already offset so 0 is the grid's top edge.
 * @param {number} glyphCount - How many real glyphs the grid holds.
 * @returns {number}
 */
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

    // X position of the grid's top-left corner, computed in init() so the grid is
    // centered on the screen no matter how wide the display is configured to be.
    gridOriginX = 0;

    // Pixel size of one glyph, measured in init() with BT.systemPrintMeasure('M') instead
    // of being hardcoded here - this way the demo can never drift out of sync with the
    // font's real dimensions.
    glyphWidth = 6;
    glyphHeight = 14;

    // A running clock in seconds, used to time how long the "Copied" / "Copy failed"
    // message stays up. BT.deltaSeconds is the time one fixed update covers - adding it
    // up every tick gives a stopwatch.
    elapsed = 0;

    // Tracks whether we just tried to copy a glyph, and whether it worked.
    // 'idle' means nothing was copied recently, so tooltips just show whatever is hovered.
    copyStatus = 'idle'; // 'idle' | 'copied' | 'failed'
    copyStatusIndex = -1; // Which glyph index the status message is about
    copyStatusExpiry = 0; // this.elapsed value at which the status message should clear

    /**
     * Sets up the palette and reads BT.systemFont's glyph list.
     * Screen size and FPS use engine defaultConfig() (no configure() in this demo).
     *
     * @returns {Promise<boolean>}
     */

    // Sets up the palette and reads BT.systemFont's glyph list.
    async init() {
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_WHITE, new Color32(255, 255, 255));
        this.palette.set(C_CELL_BORDER, new Color32(60, 70, 90));
        this.palette.set(C_CELL_HOVER_BG, new Color32(50, 90, 140));
        this.palette.set(C_COPIED_BORDER, new Color32(120, 255, 140));
        this.palette.set(C_FAILED_BORDER, new Color32(255, 110, 110));
        this.palette.set(C_TOOLTIP_BG, new Color32(15, 20, 30));
        this.palette.set(C_TOOLTIP_BORDER, new Color32(200, 200, 200));

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

        // Center the grid horizontally on the display. Subtracting one CELL_GAP accounts
        // for the fact that the last column has no trailing gap after it.
        const gridWidth = GRID_COLS * CELL_PITCH - CELL_GAP;
        this.gridOriginX = Math.floor((BT.displaySize.x - gridWidth) / 2);

        return true;
    }

    // Runs at a fixed rate (60 times per second). Advances the copy-status clock and
    // handles clicks and taps. Reading the press edge here, not in render(), matches how
    // every other pointer demo in the series handles clicks.
    update() {
        this.elapsed += BT.deltaSeconds;

        // Once the "Copied" / "Copy failed" message has been up long enough, clear it so
        // the tooltip goes back to showing whatever the pointer is currently hovering.
        if (this.copyStatus !== 'idle' && this.elapsed >= this.copyStatusExpiry) {
            this.copyStatus = 'idle';
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
            this.setCopyStatus('copied', index);
        } catch {
            // Browsers can also refuse this call outright (for example, if the page was
            // never focused, or the user denied clipboard permission).
            this.setCopyStatus('failed', index);
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
        ui.panel(`${this.codePoints.length} glyphs - click one to copy it to your clipboard`);
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

        // While a copy status message is active, the tooltip talks about THAT glyph
        // (the one just clicked) instead of whatever the pointer happens to be over now.
        const tooltipIndex = this.copyStatus === 'idle' ? hoveredIndex : this.copyStatusIndex;
        const tooltip = tooltipIndex !== -1 ? this.layoutTooltip(tooltipIndex) : null;

        // Figuring out the tooltip's box BEFORE drawing the grid lets drawGrid() skip any
        // glyph the box is about to sit on top of - see the comment inside drawGrid() for
        // why that skip is necessary, not just tidy.
        this.drawGrid(hoveredIndex, tooltip ? tooltip.rect : null);

        if (tooltip) {
            this.drawTooltip(tooltip);
        }
    }

    /**
     * Draws every glyph cell: a border, a highlighted background for the hovered cell,
     * and the glyph itself using BT.printFont() with the font BT.systemFont handed us.
     *
     * @param {number} hoveredIndex - Index of the cell under the pointer, or -1 for none.
     * @param {import('blit386').Rect2i | null} tooltipRect - The tooltip's box this frame,
     *   if one is showing, so its glyph cell(s) can be skipped (see below).
     */
    drawGrid(hoveredIndex, tooltipRect) {
        for (let index = 0; index < this.codePoints.length; index++) {
            const col = index % GRID_COLS;
            const row = Math.floor(index / GRID_COLS);
            const cellX = this.gridOriginX + col * CELL_PITCH;
            const cellY = GRID_ORIGIN_Y + row * CELL_PITCH;
            const cellRect = new Rect2i(cellX, cellY, CELL_SIZE, CELL_SIZE);

            // Paint the highlight behind the hovered cell before drawing its border and
            // glyph, so nothing else covers it up.
            if (index === hoveredIndex) {
                BT.drawRectFill(cellRect, C_CELL_HOVER_BG);
            }

            // The border briefly changes color right after a copy attempt, so clicking a
            // glyph gives visible feedback even without reading the tooltip text.
            let borderColor = C_CELL_BORDER;

            if (index === this.copyStatusIndex) {
                borderColor = this.copyStatus === 'copied' ? C_COPIED_BORDER : C_FAILED_BORDER;
            }

            BT.drawRect(cellRect, borderColor);

            // BLIT386 draws every shape (rects, lines) for the whole frame first, THEN
            // every piece of text/sprite for the whole frame on top of that - regardless
            // of which order your own code called them in. That means a rect can never
            // cover up text just by being drawn "later": text always wins. So instead of
            // trying to paint over a glyph, we skip drawing the glyph in the first place
            // for any cell the tooltip box is about to occupy this frame - the tooltip's
            // OWN rect and text still layer correctly, since that's all decided together.
            if (tooltipRect && cellRect.isIntersecting(tooltipRect)) {
                continue;
            }

            // BT.printFont(font, position, text, paletteOffset) draws with any BitmapFont
            // we hand it - here that's BT.systemFont, the same font BT.systemPrint() uses
            // internally. Centering math: a 16x16 cell minus a smaller glyph, halved,
            // rounds down to whole pixels on each side.
            const char = String.fromCodePoint(this.codePoints[index]);
            const glyphX = cellX + Math.floor((CELL_SIZE - this.glyphWidth) / 2);
            const glyphY = cellY + Math.floor((CELL_SIZE - this.glyphHeight) / 2);

            BT.printFont(this.font, new Vector2i(glyphX, glyphY), char, 0);
        }
    }

    /**
     * Works out where a tooltip for the given glyph should sit: a small box docked above
     * its cell, clamped so it never runs off any edge of the display AND never rises into
     * the title panel at the top of the screen. Kept separate from drawTooltip() so
     * render() can know the box's position before the grid is drawn (see drawGrid()).
     *
     * @param {number} index - Which glyph the tooltip is about.
     * @returns {{ rect: import('blit386').Rect2i, label: string }}
     */
    layoutTooltip(index) {
        const codePoint = this.codePoints[index];
        const char = String.fromCodePoint(codePoint);

        // toString(16) turns the number into hexadecimal (base 16) digits, the way Unicode
        // code points are normally written. padStart(4, '0') pads short values with
        // leading zeros so "U+00E9" lines up the same width as "U+2013".
        const hex = codePoint.toString(16).toUpperCase().padStart(4, '0');
        let label = `U+${hex} (${codePoint}) ${char}`;

        if (this.copyStatus === 'copied' && this.copyStatusIndex === index) {
            label = `Copied ${char}`;
        } else if (this.copyStatus === 'failed' && this.copyStatusIndex === index) {
            label = 'Copy failed';
        }

        // BT.systemPrintMeasure tells us exactly how wide this text will be, so the
        // tooltip box always fits its label with a little padding - no guessing.
        const textSize = BT.systemPrintMeasure(label);
        const width = textSize.x + 6;
        const height = textSize.y + 4;

        const col = index % GRID_COLS;
        const row = Math.floor(index / GRID_COLS);
        const cellX = this.gridOriginX + col * CELL_PITCH;
        const cellY = GRID_ORIGIN_Y + row * CELL_PITCH;
        const cellCenterX = cellX + Math.floor(CELL_SIZE / 2);

        // Center the tooltip above the cell, then clamp it so it can never be drawn
        // partly off the edge of the screen, or above GRID_ORIGIN_Y - if there's no room
        // above the top row, this pushes the tooltip back down over the grid instead of
        // letting it climb into the title panel above.
        let x = cellCenterX - Math.floor(width / 2);
        let y = cellY - height - 2;

        x = Math.max(0, Math.min(x, BT.displaySize.x - width));
        y = Math.max(GRID_ORIGIN_Y, Math.min(y, BT.displaySize.y - height));

        return { rect: new Rect2i(x, y, width, height), label };
    }

    /**
     * Paints a tooltip box already worked out by layoutTooltip().
     *
     * @param {{ rect: import('blit386').Rect2i, label: string }} tooltip
     */
    drawTooltip(tooltip) {
        const { rect, label } = tooltip;

        BT.drawRectFill(rect, C_TOOLTIP_BG);
        BT.drawRect(rect, C_TOOLTIP_BORDER);
        BT.systemPrint(new Vector2i(rect.x + 3, rect.y + 2), C_WHITE, label);
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
