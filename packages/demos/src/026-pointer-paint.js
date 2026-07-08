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
 * are tracked at once; a fourth simultaneous touch is dropped silently.
 *
 * What this demonstrates:
 *   - BT.isPressed() for one-shot mouse actions (clear canvas, cycle brush size)
 *   - BT.isDown(BT.BTN_POINTER_A) while BT.isPointerActive(0) for mouse painting
 *   - BT.isPointerActive(slot) / BT.pointerPos(slot) for per-slot touch painting
 *   - lastPosX / lastPosY per-slot stamping: draws from the previous frame's
 *     position to the current one so fast strokes look continuous instead of dotted
 *
 * The painting happens on an offscreen palette layer (a 2D array of palette
 * indices) so brush strokes persist across frames even though render() clears
 * to a background color first.
 */

// @pageTitle BLIT386 Demo 026 - Pointer Paint

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

const DISPLAY_W = 320;
const DISPLAY_H = 240;

// Palette slots. Index 0 is always transparent.
const C_BG = 1; // dark background revealed by the clear button
const C_TEXT = 2; // overlay text color
const C_DIM = 3; // dim hint text
const C_PANEL = 4; // overlay panel background
const C_PANEL_BORDER = 5; // overlay panel border

// One paint color per pointer slot. The slot index is the same as the array
// index here so renderStrokes() can write SLOT_PAINT[slot] directly.
const SLOT_PAINT = [
    10, // slot 0 (mouse)
    11, // slot 1 (first touch)
    12, // slot 2 (second touch)
    13, // slot 3 (third touch)
];

// Brush sizes the middle mouse button cycles through. Values are radii in
// pixels; a radius of 0 paints a single pixel.
const BRUSH_SIZES = [0, 2, 4];

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

    // Painting layer: one palette index per display pixel. 0 means "blank"
    // (the background color shows through). Length = DISPLAY_W * DISPLAY_H.
    /** @type {Uint8Array | null} */
    layer = null;

    // Index into BRUSH_SIZES; cycled by middle-click on the mouse.
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
            overlayStyle: {
                barPaletteIndex: C_PANEL,
                textPaletteIndex: C_TEXT,
                gapPaletteIndex: C_PANEL,
            },
            overlayTimingChartStyle: {
                updateBarPaletteIndex: SLOT_PAINT[0],
                renderBarPaletteIndex: SLOT_PAINT[1],
                warningPaletteIndex: SLOT_PAINT[2],
                errorPaletteIndex: SLOT_PAINT[3],
                tagPaletteIndex: C_TEXT,
            },
        };
    }

    /**
     * Sets up the palette and allocates the offscreen paint layer.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_BG, new Color32(20, 25, 35));
        this.palette.set(C_TEXT, new Color32(255, 255, 255));
        this.palette.set(C_DIM, new Color32(160, 170, 190));
        this.palette.set(C_PANEL, new Color32(40, 50, 70));
        this.palette.set(C_PANEL_BORDER, new Color32(110, 120, 140));

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
        // Mouse-only controls: B clears the canvas, C cycles the brush size.
        // We use isPressed (edge) so a single click triggers exactly once.
        if (BT.isPressed(BT.BTN_POINTER_B, 0)) {
            this.layer.fill(0);
        }

        if (BT.isPressed(BT.BTN_POINTER_C, 0)) {
            this.brushIndex = (this.brushIndex + 1) % BRUSH_SIZES.length;
        }

        // Walk the four slots. Slot 0 paints while BTN_POINTER_A is held;
        // slots 1-3 paint while their touch is in contact (slot is valid).
        for (let slot = 0; slot < 4; slot++) {
            const valid = BT.isPointerActive(slot);

            // For slot 0 (mouse) painting is gated on the left button. For
            // touch slots there is only one button (A); the mere presence of
            // a contact is enough.
            const wantPaint = slot === 0 ? BT.isDown(BT.BTN_POINTER_A, 0) && valid : valid;

            if (wantPaint) {
                const pos = BT.pointerPos(slot);

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
            } else {
                this.painting[slot] = false;
            }
        }
    }

    /**
     * Per-frame render: paint layer first, then live overlays (cursors and HUD).
     */
    render() {
        BT.clear(C_BG);

        this.renderLayer();
        this.renderCursors();
        this.renderHUD();
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
     * Heads-up display: title plus per-slot status panel and brush hint.
     */
    renderHUD() {
        // Bottom status panel.
        const panelY = DISPLAY_H - 36;
        BT.drawRectFill(new Rect2i(0, panelY, DISPLAY_W, 36), C_PANEL);
        BT.drawRect(new Rect2i(0, panelY, DISPLAY_W, 36), C_PANEL_BORDER);

        // Per-slot active indicators across the bottom row.
        for (let slot = 0; slot < 4; slot++) {
            const x = 4 + slot * 78;
            const valid = BT.isPointerActive(slot);
            const label = ['Mouse', 'Touch 1', 'Touch 2', 'Touch 3'][slot];

            BT.drawRectFill(new Rect2i(x, panelY + 4, 8, 8), valid ? SLOT_PAINT[slot] : C_PANEL_BORDER);
            BT.systemPrint(new Vector2i(x + 12, panelY + 4), valid ? C_TEXT : C_DIM, label);
        }

        // Brush size + clear hint.
        const radius = BRUSH_SIZES[this.brushIndex];
        BT.systemPrint(
            new Vector2i(4, panelY + 18),
            C_DIM,
            `brush r=${radius} (middle-click to cycle)  |  right-click to clear`,
        );
    }
}

bootstrap(Demo);
