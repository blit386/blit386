/*

Pointer Paint: multi-touch finger painting with a mouse plus up to three fingers.
@description Multi-touch finger painting across all four pointer slots: a mouse plus up to three fingers at once.

Part of the BLIT386 demo series.

Prerequisites:
  - Primitives: https://demos.blit386.dev/primitives
  - Pointer Basics: https://demos.blit386.dev/pointer-basics

Live version: https://demos.blit386.dev/pointer-paint

Guides:
  - Input: https://blit386.dev/docs/guides/input#pointer-slot-model
  - Overlay: https://blit386.dev/docs/guides/overlay#colors-and-hud-palette-slots

Reference:
  - Core: https://blit386.dev/docs/api/core#hardware-settings

---

WHAT YOU WILL SEE
-----------------

An empty canvas in the shared theme's background color, with a small "Paint" panel in the
bottom-right corner. Until something is painted, two dim lines in the middle of the
canvas say how to start. Every active pointer shows a crosshair in its own color, drawn
on top of the panel too, and painting leaves strokes behind in that color:

  - slot 0 = mouse        (white)
  - slot 1 = first touch  (red)
  - slot 2 = second touch (green)
  - slot 3 = third touch  (blue)

The panel has one pip per slot (lit while that mouse or finger is over the canvas) with a
swatch of that slot's paint color at the end of the row, and two full-width buttons:
"Brush: Thin/Medium/Thick" names and cycles the size, and "Clear" wipes the canvas.

WHAT YOU WILL LEARN
-------------------

- How all four pointer slots work side by side: BT.isPointerActive(slot) and
  BT.pointerPos(slot) for each of them.
- BT.isDown(BT.BTN_POINTER_A, 0) gates mouse painting on the left button. Touch slots
  have no separate button, so being in contact is enough.
- BT.isPressed(BT.BTN_POINTER_B, 0) and BT.isPressed(BT.BTN_POINTER_C, 0) as one-shot
  edges: right-click clears, middle-click cycles the brush, each exactly once per click.
- Stamping from the previous tick's position to the current one, so fast strokes look
  continuous instead of dotted.
- ui.overWidget(x, y) keeps brush strokes from landing underneath the UI panel.
- A persistent paint layer: one palette index per display pixel in a Uint8Array, redrawn
  every frame as runs of same-colored pixels, so strokes survive the per-frame BT.clear().
- Reusing the shared UI theme slots for the engine overlay bars via overlayStyle.

TRY THIS
--------

- Hold the left mouse button and move to paint in white.
- Right-click to clear the canvas; middle-click to cycle the brush size.
- On a touchscreen, paint with one, two, or three fingers at once - each gets its own
  color. A fourth finger is ignored. Use the "Brush" and "Clear" buttons instead of the
  mouse shortcuts.
- Press the backquote key (`) to open the engine overlay: long strokes make the render
  bars in the timing chart spike, and the GPU diagnostics row sits below the metrics.

*/

import { bootstrap, BT, Color32, Rect2i } from 'blit386';

import { applyTheme, FONT_W, PIP_SIZE, THEME_DEFAULT_START_SLOT, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

const DISPLAY_W = 320;
const DISPLAY_H = 240;

// One paint color per pointer slot. The slot index is the same as the array index here so
// update() can write SLOT_PAINT[slot] directly. These are scene colors (the artwork
// itself); the UI panel colors come from the shared theme, which lives far away in slots
// 240-251.
const SLOT_PAINT = [
    10, // slot 0 (mouse)
    11, // slot 1 (first touch)
    12, // slot 2 (second touch)
    13, // slot 3 (third touch)
];

// Friendly names for the panel rows: which slot is which input device.
const SLOT_LABELS = ['Mouse', 'Touch 1', 'Touch 2', 'Touch 3'];

// Brush sizes that middle-click (or the Brush button) cycles through. Values are radii in
// pixels; a radius of 0 paints a single pixel.
const BRUSH_SIZES = [0, 2, 4];

// Human-readable names for the same brushes, shown on the Brush button and in the panel's
// Brush row. Same order as BRUSH_SIZES.
const BRUSH_NAMES = ['Thin', 'Medium', 'Thick'];

// The Paint panel sits in the bottom-right corner, 4 pixels from the edges. Its height
// comes from the rows it stacks: the 22-pixel title strip, four 10-pixel pip rows, a
// 5-pixel gap, two 27-pixel button rows, and the 11-pixel bottom rim. Placing it
// from these numbers (instead of letting the kit anchor it) lets the slot color swatches
// line up exactly with the pip rows.
const PANEL_W = 112;
const PANEL_H = 22 + 4 * 10 + 5 + 2 * 27 + 11;
const PANEL_X = DISPLAY_W - 4 - PANEL_W;
const PANEL_Y = DISPLAY_H - 4 - PANEL_H;

// Kit panel content starts 9 pixels in from the panel edge, and the first row starts 22
// pixels below its top.
const PANEL_PAD = 9;
const PANEL_CONTENT_TOP = 22;

// Half the length of each cursor crosshair arm, in pixels.
const CURSOR_ARM = 5;

// Multi-touch and mouse paint demo. The "canvas" we paint onto is a flat array of palette
// indices, one entry per display pixel. Each frame, render() copies that array onto the
// screen as thin filled rectangles so strokes persist between frames. Stroke input comes
// from checking BT.isPointerActive() / BT.isDown() / BT.pointerPos() on each of the four
// slots in update().
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slot map for the shared UI theme, filled in by applyTheme() in init().
    // Gives us named slots like this.theme.bg for our own drawing.
    theme = null;

    // Painting layer: one palette index per display pixel. 0 means "blank" (the
    // background color shows through). Length = DISPLAY_W * DISPLAY_H.
    /** @type {Uint8Array | null} */
    layer = null;

    // Index into BRUSH_SIZES; cycled by middle-click or the Brush button.
    brushIndex = 1;

    // One reusable rectangle for renderLayer(), so drawing a run allocates nothing per
    // frame.
    runRect = new Rect2i(0, 0, 1, 1);

    // Another reusable rectangle for the cursors and the panel's color swatches.
    uiRect = new Rect2i(0, 0, 1, 1);

    // True once anything has been painted, so the "how to paint" hint can step aside.
    // clearCanvas() sets it back to false.
    hasPaint = false;

    // Last known position per slot, recorded the tick the pointer started painting and
    // after every stamp since. Used to draw a stroke from the previous tick's position to
    // the current one, which fills gaps when the pointer moves faster than one pixel per
    // tick.
    lastPosX = [0, 0, 0, 0];
    lastPosY = [0, 0, 0, 0];

    // True while we should be painting from this slot. For the mouse this is
    // BTN_POINTER_A held. For touch this is "slot is active" (contact down).
    painting = [false, false, false, false];

    // Finger painting can spike render() when strokes are long; the chart makes that
    // visible.
    configure() {
        return {
            // Phones and tablets dim, then lock, the screen after 30-60 seconds without a
            // touch - easy to hit during a slow, careful painting session. This asks the
            // browser to keep the screen on while you paint; unsupported browsers just
            // ignore the request.
            isWakeLockEnabled: true,

            isOverlayTimingChartEnabled: true,
            overlayTimingChartDiagnostics: 'rich',
            isOverlayRendererDiagnosticsBarEnabled: true,

            // The engine overlay bars reuse the shared UI theme colors so everything on
            // screen matches. applyTheme() writes panel at THEME_DEFAULT_START_SLOT + 2
            // and text at + 4; configure() runs before init(), so we derive those slot
            // numbers here.
            overlayStyle: {
                barPaletteIndex: THEME_DEFAULT_START_SLOT + 2,
                textPaletteIndex: THEME_DEFAULT_START_SLOT + 4,
                gapPaletteIndex: THEME_DEFAULT_START_SLOT + 2,
            },

            overlayTimingChartStyle: {
                updateBarPaletteIndex: SLOT_PAINT[0],
                renderBarPaletteIndex: SLOT_PAINT[1],
                warningPaletteIndex: SLOT_PAINT[2],
                errorPaletteIndex: SLOT_PAINT[3],
                tagPaletteIndex: THEME_DEFAULT_START_SLOT + 4,
            },
        };
    }

    // Sets up the palette (shared UI theme plus scene paint colors) and allocates the
    // offscreen paint layer.
    async init() {
        this.palette = BT.paletteCreate(256);

        // Install the shared UI colors (slots 240-251) that the kit's panel, pips, and
        // buttons draw with. Must happen before BT.paletteSet() so the colors actually
        // reach the GPU.
        this.theme = applyTheme(this.palette);

        // One paint color per slot. Slot 0 (mouse) gets a soft white; the three touch
        // slots get bold primary colors so multiple fingers are easy to tell apart.
        this.palette.set(SLOT_PAINT[0], new Color32(240, 240, 240));
        this.palette.set(SLOT_PAINT[1], new Color32(255, 100, 100));
        this.palette.set(SLOT_PAINT[2], new Color32(100, 220, 120));
        this.palette.set(SLOT_PAINT[3], new Color32(100, 160, 255));

        BT.paletteSet(this.palette);

        // Hide the native OS cursor so the drawn crosshair is the only cursor visible
        // while the pointer is over the canvas.
        BT.hideCursor();

        // Allocate the paint layer. A new Uint8Array starts out all zeros, so every pixel
        // begins blank and the background color shows through.
        this.layer = new Uint8Array(DISPLAY_W * DISPLAY_H);

        return true;
    }

    // Per-tick: read input from each slot and write strokes into the layer.
    update() {
        // Let the UI kit do its per-tick housekeeping (touch tracking) before we read any
        // input ourselves. Always the first line of update().
        ui.tick();

        // Mouse shortcuts: right-click (button B) clears the canvas and middle-click
        // (button C) cycles the brush size. The Clear and Brush buttons in the kit panel
        // (see renderPanel()) call the exact same helper methods, so mouse and touch
        // users get identical features. We use isPressed (an edge) so a single click
        // triggers exactly once.
        if (BT.isPressed(BT.BTN_POINTER_B, 0)) {
            this.clearCanvas();
        }

        if (BT.isPressed(BT.BTN_POINTER_C, 0)) {
            this.cycleBrush();
        }

        // Walk the four slots. Slot 0 paints while BTN_POINTER_A is held; slots 1-3 paint
        // while their touch is in contact (slot is active).
        for (let slot = 0; slot < 4; slot++) {
            const valid = BT.isPointerActive(slot);

            // For slot 0 (mouse) painting is gated on the left button. For touch slots
            // there is only one button (A); the mere presence of a contact is enough.
            const wantPaint = slot === 0 ? BT.isDown(BT.BTN_POINTER_A, 0) && valid : valid;

            if (!wantPaint) {
                this.painting[slot] = false;
                continue;
            }

            const pos = BT.pointerPos(slot);

            // Never paint underneath the UI. Without this check, tapping the Clear button
            // would also drop a dot of paint under the button, because a tap is a pointer
            // contact like any other. Marking the slot as "not painting" also re-seeds
            // the stroke start when the pointer leaves the widget again, so no straight
            // line gets drawn through the area the panel covers.
            if (ui.overWidget(pos.x, pos.y)) {
                this.painting[slot] = false;
                continue;
            }

            if (!this.painting[slot]) {
                // Just started painting - seed the last position so the first stamp does
                // not draw a line all the way from (0, 0).
                this.lastPosX[slot] = pos.x;
                this.lastPosY[slot] = pos.y;
                this.painting[slot] = true;
            }

            // Stamp from the previous position to the current one. This is what makes
            // fast strokes look continuous instead of dotted.
            this.stamp(this.lastPosX[slot], this.lastPosY[slot], pos.x, pos.y, SLOT_PAINT[slot]);

            this.lastPosX[slot] = pos.x;
            this.lastPosY[slot] = pos.y;
        }
    }

    // Per-frame render: paint layer first, then the kit control panel, the hint, and
    // the cursors last, so a cursor is never hidden behind the panel.
    render() {
        // Clear to the shared theme's background color so the canvas matches the UI panel
        // and the engine overlay.
        BT.clear(this.theme.bg);

        this.renderLayer();
        this.renderPanel();
        this.renderHint();
        this.renderCursors();
    }

    // Wipes every painted pixel back to blank. Shared by right-click and the Clear button
    // so both inputs behave identically.
    clearCanvas() {
        this.layer.fill(0);
        this.hasPaint = false;
    }

    // Steps to the next brush size. Shared by middle-click and the Brush button so both
    // inputs behave identically.
    cycleBrush() {
        // The % (remainder) operator wraps the index around: after the last brush it
        // lands back on 0, like a clock rolling over from 12 to 1.
        this.brushIndex = (this.brushIndex + 1) % BRUSH_SIZES.length;
    }

    // Stamps the current brush along the line segment from (x0, y0) to (x1, y1), writing
    // palette index `color` into the paint layer at every covered pixel. Uses a simple
    // step-by-distance walker (good enough for small distances): for each step, paint a
    // filled disc whose radius is the current brush.
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

    // Paints a filled disc of the current brush radius centered on (cx, cy).
    stampAt(cx, cy, color) {
        const radius = BRUSH_SIZES[this.brushIndex];

        if (radius === 0) {
            this.setPixel(cx, cy, color);
            return;
        }

        // A pixel is inside the disc when its squared distance from the center is at most
        // the squared radius - comparing squares avoids a square root per pixel.
        const r2 = radius * radius;

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dy * dy <= r2) {
                    this.setPixel(cx + dx, cy + dy, color);
                }
            }
        }
    }

    // Writes a palette index into the layer, ignoring out-of-bounds writes.
    setPixel(x, y, color) {
        if (x < 0 || x >= DISPLAY_W || y < 0 || y >= DISPLAY_H) {
            return;
        }

        this.layer[y * DISPLAY_W + x] = color;
        this.hasPaint = true;
    }

    // Copies the persistent paint layer onto the screen. Pixels with palette index 0 are
    // skipped so the background color shows through. Drawing one pixel at a time would
    // use up the engine's per-frame drawing budget once a lot of the canvas is painted.
    // Instead we walk each row and draw every run of same-colored pixels as ONE thin
    // rectangle, which costs the same no matter how long the run is.
    renderLayer() {
        for (let y = 0; y < DISPLAY_H; y++) {
            const row = y * DISPLAY_W;
            let x = 0;

            while (x < DISPLAY_W) {
                const c = this.layer[row + x];

                // Blank pixel: nothing to draw, move on.
                if (c === 0) {
                    x++;
                    continue;
                }

                // Find where this run of identical colors ends.
                const start = x;

                while (x < DISPLAY_W && this.layer[row + x] === c) {
                    x++;
                }

                BT.drawRectFill(this.runRect.set(start, y, x - start, 1), c);
            }
        }
    }

    // Draws a small crosshair at each active pointer so the user can see where each
    // finger or the mouse is, even when not currently painting.
    renderCursors() {
        const span = CURSOR_ARM * 2 + 1;

        for (let slot = 0; slot < 4; slot++) {
            if (!BT.isPointerActive(slot)) {
                continue;
            }

            const pos = BT.pointerPos(slot);
            const color = SLOT_PAINT[slot];

            // Two 1-pixel-thick arms through the pointer position, in the slot's paint
            // color. They are drawn with ui.drawRectFill(), the sprite version of
            // BT.drawRectFill(): the engine draws every BT.drawLine() and
            // BT.drawRectFill() before any sprite, and the kit panel is a sprite, so a
            // plain line would vanish whenever the pointer moved over the panel.
            ui.drawRectFill(this.uiRect.set(pos.x - CURSOR_ARM, pos.y, span, 1), color);
            ui.drawRectFill(this.uiRect.set(pos.x, pos.y - CURSOR_ARM, 1, span), color);
        }
    }

    // Two dim lines in the middle of the open canvas saying how to paint. Shown only
    // while nothing is painted, so a new visitor is not left facing an empty screen.
    renderHint() {
        if (this.hasPaint) {
            return;
        }

        // The open canvas is everything left of the panel. Every character of the system
        // font is FONT_W (6) pixels wide, so starting a line half its width left of the
        // middle centers it.
        const centerX = Math.floor(PANEL_X / 2);
        const centerY = Math.floor(DISPLAY_H / 2);
        const lines = ['Hold the left mouse button', 'or touch the screen to paint'];

        for (let i = 0; i < lines.length; i++) {
            ui.caption(centerX - (lines[i].length * FONT_W) / 2, centerY - 8 + i * 12, lines[i], { color: 'dim' });
        }
    }

    // The kit control panel: per-slot activity pips with each slot's paint color, and
    // two touch-friendly buttons. It sits in the bottom-right corner so it stays clear of
    // the engine overlay's toggle corner (the bottom-left 17x13 pixels are reserved for
    // that).
    renderPanel() {
        const buttonW = PANEL_W - 2 * PANEL_PAD;

        ui.begin(UI_ANCHORS.TOP_LEFT, { x: PANEL_X, y: PANEL_Y, width: PANEL_W });
        ui.panel('Paint');

        // One pip per pointer slot: lit while that mouse or finger is active.
        for (let slot = 0; slot < 4; slot++) {
            ui.pip(SLOT_LABELS[slot], BT.isPointerActive(slot));
        }

        // A small gap between the pips and the buttons.
        ui.spacer(5);

        // The current brush, as a readable name on the Brush button itself.
        const name = BRUSH_NAMES[this.brushIndex];

        // The Brush button cycles the size - the touch equivalent of the middle-click
        // shortcut in update(). Its label changes with the brush, and the kit normally
        // recognizes a widget by its label, so we give it a stable id to keep it the
        // "same" button across frames.
        if (ui.button(`Brush: ${name}`, { id: 'brush', width: buttonW })) {
            this.cycleBrush();
        }

        // The Clear button wipes the canvas - the touch equivalent of the right-click
        // shortcut in update(). Both paths call clearCanvas().
        if (ui.button('Clear', { width: buttonW })) {
            this.clearCanvas();
        }

        ui.end();

        // A swatch of each slot's paint color at the right end of its pip row, so you
        // can see which color each finger paints in. Each swatch mirrors the pip box on
        // the left: the kit draws that box PIP_SIZE (10) pixels square with a border
        // outline, 3 pixels below the top of its row, PANEL_PAD pixels in from the panel
        // edge - so the swatch is the same outline the same distance in from the right
        // edge, on the same rows, with the color filling its inside. Drawn after ui.end()
        // with the kit's sprite drawing so it lands on top of the panel.
        const swatchX = PANEL_X + PANEL_W - PANEL_PAD - PIP_SIZE;

        for (let slot = 0; slot < 4; slot++) {
            const boxY = PANEL_Y + PANEL_CONTENT_TOP + slot * 10 + 3;

            ui.drawRect(this.uiRect.set(swatchX, boxY, PIP_SIZE, PIP_SIZE), this.theme.border);
            ui.drawRectFill(this.uiRect.set(swatchX + 1, boxY + 1, PIP_SIZE - 2, PIP_SIZE - 2), SLOT_PAINT[slot]);
        }
    }
}

bootstrap(Demo);
