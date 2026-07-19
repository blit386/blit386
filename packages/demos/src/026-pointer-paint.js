/**
 * Pointer Paint Demo - multi-touch finger painting with mouse + up to 3 touches.
 *
 * Demo 026 in the BLIT386 demo series.
 * Prerequisites: 025-Pointer Basics - https://demos.blit386.dev/025-pointer-basics
 *
 * Live version: https://demos.blit386.dev/026-pointer-paint
 *
 * This demo shows how all four pointer slots work side by side. Each slot
 * paints in its own color:
 *   slot 0 = mouse        (white)
 *   slot 1 = first touch  (red)
 *   slot 2 = second touch (green)
 *   slot 3 = third touch  (blue)
 *
 * Mouse: hold the left button (BTN_POINTER_A) to paint. Right-click
 * (BTN_POINTER_B) clears the canvas. Middle-click (BTN_POINTER_C) cycles the
 * brush size between three preset thicknesses.
 *
 * Touch: each finger paints automatically while in contact. Up to three touches
 * are tracked at once; a fourth simultaneous touch is dropped silently. Because
 * touch devices have no right or middle button, the shared UI kit
 * (src/shared/ui.js) draws a small panel with a Clear button and a Brush button
 * that do exactly the same thing as the mouse shortcuts - so the whole demo
 * works with fingers alone.
 *
 * What this demonstrates:
 *   - BT.isPressed() for one-shot mouse actions (clear canvas, cycle brush size)
 *   - BT.isDown(BT.BTN_POINTER_A) while BT.isPointerActive(0) for mouse painting
 *   - BT.isPointerActive(slot) / BT.pointerPos(slot) for per-slot touch painting
 *   - lastPosX / lastPosY per-slot stamping: draws from the previous frame's
 *     position to the current one so fast strokes look continuous instead of dotted
 *   - ui.overWidget() to keep brush strokes from landing underneath the UI panel
 *
 * The painting happens on an offscreen palette layer (a 2D array of palette
 * indices) so brush strokes persist across frames even though render() clears
 * to a background color first.
 */

import { bootstrap, BT, Color32, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

const DISPLAY_W = 320;
const DISPLAY_H = 240;

// One paint color per pointer slot. The slot index is the same as the array
// index here so update() can write SLOT_PAINT[slot] directly. These are scene
// colors (the artwork itself); the UI panel colors come from the shared theme,
// which lives far away in slots 240-251.
const SLOT_PAINT = [
    10, // slot 0 (mouse)
    11, // slot 1 (first touch)
    12, // slot 2 (second touch)
    13, // slot 3 (third touch)
];

// Friendly names for the panel rows: which slot is which input device.
const SLOT_LABELS = ['Mouse', 'Touch 1', 'Touch 2', 'Touch 3'];

// Brush sizes that middle-click (or the Brush button) cycles through. Values
// are radii in pixels; a radius of 0 paints a single pixel.
const BRUSH_SIZES = [0, 2, 4];

// Human-readable names for the same brushes, shown on the Brush button and in
// the panel's Brush row. Same order as BRUSH_SIZES.
const BRUSH_NAMES = ['Thin', 'Medium', 'Thick'];

/**
 * Multi-touch / mouse paint demo.
 *
 * The "canvas" we paint onto is a flat array of palette indices, one entry per
 * display pixel. Each frame, render() copies that array onto the screen with
 * BT.drawPixel() so strokes persist between frames. Stroke input comes from
 * checking BT.isPointerActive() / BT.isDown() / BT.pointerPos() on each
 * of the four slots in update().
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slot map for the shared UI theme, filled in by applyTheme() in
    // init(). Gives us named slots like this.theme.bg for our own drawing.
    theme = null;

    // Painting layer: one palette index per display pixel. 0 means "blank"
    // (the background color shows through). Length = DISPLAY_W * DISPLAY_H.
    /** @type {Uint8Array | null} */
    layer = null;

    // Index into BRUSH_SIZES; cycled by middle-click or the Brush button.
    brushIndex = 1;

    // Last known position per slot, recorded the frame the pointer became
    // active or last had its button pressed. Used to draw a stroke from the
    // previous frame's position to the current one, which fills gaps when the
    // pointer moves faster than one pixel per frame.
    lastPosX = [0, 0, 0, 0];
    lastPosY = [0, 0, 0, 0];

    // True while we should be painting from this slot. For mouse this is
    // BTN_POINTER_A held. For touch this is "slot is valid" (contact down).
    painting = [false, false, false, false];

    /**
     * Finger painting can spike render() when strokes are long; the chart makes that visible.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            isOverlayTimingChartEnabled: true,
            overlayTimingChartDiagnostics: 'rich',
            isOverlayRendererDiagnosticsBarEnabled: true,
            // The engine overlay bars reuse the shared UI theme colors so
            // everything on screen matches. applyTheme() puts the panel color
            // in slot 242 and the text color in slot 244 (its default start
            // slot is 240 - see init() below); configure() runs before init(),
            // so the numbers are written out here.
            overlayStyle: {
                barPaletteIndex: 242,
                textPaletteIndex: 244,
                gapPaletteIndex: 242,
            },
            overlayTimingChartStyle: {
                updateBarPaletteIndex: SLOT_PAINT[0],
                renderBarPaletteIndex: SLOT_PAINT[1],
                warningPaletteIndex: SLOT_PAINT[2],
                errorPaletteIndex: SLOT_PAINT[3],
                tagPaletteIndex: 244,
            },
        };
    }

    /**
     * Sets up the palette (shared UI theme + scene paint colors) and allocates
     * the offscreen paint layer.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        this.palette = BT.paletteCreate(256);

        // Install the shared UI colors (slots 240-251) that the kit's panel,
        // pips, and buttons draw with. Must happen before BT.paletteSet() so
        // the colors actually reach the GPU.
        this.theme = applyTheme(this.palette);

        // One paint color per slot. Slot 0 (mouse) gets a soft white; the
        // three touch slots get bold primary colors so multiple fingers are
        // easy to tell apart.
        this.palette.set(SLOT_PAINT[0], new Color32(240, 240, 240));
        this.palette.set(SLOT_PAINT[1], new Color32(255, 100, 100));
        this.palette.set(SLOT_PAINT[2], new Color32(100, 220, 120));
        this.palette.set(SLOT_PAINT[3], new Color32(100, 160, 255));

        BT.paletteSet(this.palette);

        // Hide the native OS cursor so the drawn crosshair is the only cursor
        // visible while the pointer is over the canvas.
        BT.hideCursor();

        // Allocate the paint layer. `fill(0)` makes every pixel start blank
        // (transparent) so the background color shows through.
        this.layer = new Uint8Array(DISPLAY_W * DISPLAY_H);
        return true;
    }

    /**
     * Per-tick: read input from each slot and write strokes into layer.
     */
    update() {
        // Let the UI kit do its per-tick housekeeping (touch tracking) before
        // we read any input ourselves. Always the first line of update().
        ui.tick();

        // Mouse shortcuts: right-click (button B) clears the canvas and
        // middle-click (button C) cycles the brush size. The Clear and Brush
        // buttons in the kit panel (see renderPanel()) call the exact same
        // helper methods, so mouse and touch users get identical features.
        // We use isPressed (edge) so a single click triggers exactly once.
        if (BT.isPressed(BT.BTN_POINTER_B, 0)) {
            this.clearCanvas();
        }

        if (BT.isPressed(BT.BTN_POINTER_C, 0)) {
            this.cycleBrush();
        }

        // Walk the four slots. Slot 0 paints while BTN_POINTER_A is held;
        // slots 1-3 paint while their touch is in contact (slot is valid).
        for (let slot = 0; slot < 4; slot++) {
            const valid = BT.isPointerActive(slot);

            // For slot 0 (mouse) painting is gated on the left button. For
            // touch slots there is only one button (A); the mere presence of
            // a contact is enough.
            const wantPaint = slot === 0 ? BT.isDown(BT.BTN_POINTER_A, 0) && valid : valid;

            if (!wantPaint) {
                this.painting[slot] = false;
                continue;
            }

            const pos = BT.pointerPos(slot);

            // Never paint underneath the UI. Without this check, tapping the
            // Clear button would also drop a dot of paint under the button,
            // because a tap is a pointer contact like any other. Marking the
            // slot as "not painting" also re-seeds the stroke start when the
            // pointer leaves the widget again, so no straight line gets drawn
            // through the area the panel covers.
            if (ui.overWidget(pos.x, pos.y)) {
                this.painting[slot] = false;
                continue;
            }

            if (!this.painting[slot]) {
                // Just started painting - seed last position so the first
                // stamp doesn't draw a line all the way from (0, 0).
                this.lastPosX[slot] = pos.x;
                this.lastPosY[slot] = pos.y;
                this.painting[slot] = true;
            }

            // Stamp from previous position to current one. This is what
            // makes fast strokes look continuous instead of dotted.
            this.stamp(this.lastPosX[slot], this.lastPosY[slot], pos.x, pos.y, SLOT_PAINT[slot]);

            this.lastPosX[slot] = pos.x;
            this.lastPosY[slot] = pos.y;
        }
    }

    /**
     * Per-frame render: paint layer first, then live overlays (cursors and the
     * kit control panel).
     */
    render() {
        // Clear to the shared theme's background color so the canvas matches
        // the UI panel and the engine overlay.
        BT.clear(this.theme.bg);

        this.renderLayer();
        this.renderCursors();
        this.renderPanel();
    }

    /**
     * Wipes every painted pixel back to blank. Shared by right-click and the
     * Clear button so both inputs behave identically.
     */
    clearCanvas() {
        this.layer.fill(0);
    }

    /**
     * Steps to the next brush size. Shared by middle-click and the Brush
     * button so both inputs behave identically.
     */
    cycleBrush() {
        // The % (remainder) operator wraps the index around: after the last
        // brush it lands back on 0, like a clock rolling over from 12 to 1.
        this.brushIndex = (this.brushIndex + 1) % BRUSH_SIZES.length;
    }

    /**
     * Stamps the current brush along the line segment from (x0,y0) to (x1,y1),
     * writing palette index `color` into the paint layer at every covered
     * pixel.
     *
     * Uses a simple step-by-distance walker (good enough for small distances).
     * For each step, paint a filled disc whose radius is the current brush.
     */
    stamp(x0, y0, x1, y1, color) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const distance = Math.max(1, Math.ceil(Math.hypot(dx, dy)));

        for (let i = 0; i <= distance; i++) {
            const t = i / distance;
            const x = Math.round(x0 + dx * t);
            const y = Math.round(y0 + dy * t);
            this.stampAt(x, y, color);
        }
    }

    /**
     * Paints a filled disc of the current brush radius centered on (cx, cy).
     */
    stampAt(cx, cy, color) {
        const radius = BRUSH_SIZES[this.brushIndex];

        if (radius === 0) {
            this.setPixel(cx, cy, color);
            return;
        }

        const r2 = radius * radius;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dy * dy <= r2) {
                    this.setPixel(cx + dx, cy + dy, color);
                }
            }
        }
    }

    /**
     * Writes a palette index into layer, ignoring out-of-bounds writes.
     */
    setPixel(x, y, color) {
        if (x < 0 || x >= DISPLAY_W || y < 0 || y >= DISPLAY_H) {
            return;
        }
        this.layer[y * DISPLAY_W + x] = color;
    }

    /**
     * Copies the persistent paint layer onto the screen. Pixels with palette
     * index 0 are skipped so the background color shows through.
     */
    renderLayer() {
        for (let y = 0; y < DISPLAY_H; y++) {
            const row = y * DISPLAY_W;
            for (let x = 0; x < DISPLAY_W; x++) {
                const c = this.layer[row + x];
                if (c !== 0) {
                    BT.drawPixel(new Vector2i(x, y), c);
                }
            }
        }
    }

    /**
     * Draws a small ring around each active pointer so the user can see where
     * each finger / mouse is, even when not currently painting.
     */
    renderCursors() {
        for (let slot = 0; slot < 4; slot++) {
            if (!BT.isPointerActive(slot)) {
                continue;
            }

            const pos = BT.pointerPos(slot);
            const color = SLOT_PAINT[slot];

            // Crosshair that doesn't depend on a circle primitive.
            BT.drawLine(new Vector2i(pos.x - 5, pos.y), new Vector2i(pos.x + 5, pos.y), color);
            BT.drawLine(new Vector2i(pos.x, pos.y - 5), new Vector2i(pos.x, pos.y + 5), color);
        }
    }

    /**
     * The kit control panel: per-slot activity pips, the current brush, and
     * two touch-friendly buttons. Anchored bottom-right so it stays clear of
     * the engine overlay's toggle corner (the bottom-left 17x13 pixels are
     * reserved for that).
     */
    renderPanel() {
        ui.begin('bottomRight');
        ui.panel('Paint');

        // One pip per pointer slot: lit while that mouse / finger is active.
        // This is the same per-slot status the old hand-drawn panel showed.
        for (let slot = 0; slot < 4; slot++) {
            ui.pip(SLOT_LABELS[slot], BT.isPointerActive(slot));
        }

        ui.separator();

        // Which brush is selected right now, as a readable name.
        const name = BRUSH_NAMES[this.brushIndex];
        ui.kv('Brush', name);

        // The Brush button cycles the size - the touch equivalent of the
        // middle-click shortcut in update(). Its label changes with the brush,
        // and the kit normally recognizes a widget by its label, so we give it
        // a stable id to keep it the "same" button across frames.
        if (ui.button(`Brush: ${name}`, { id: 'brush' })) {
            this.cycleBrush();
        }

        // The Clear button wipes the canvas - the touch equivalent of the
        // right-click shortcut in update(). Both paths call clearCanvas().
        if (ui.button('Clear')) {
            this.clearCanvas();
        }

        ui.end();
    }
}

bootstrap(Demo);
