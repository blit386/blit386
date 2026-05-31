// Pointer Basics Demo - shows how to read mouse, touch, and scroll-wheel input.
//
// Demo 025 in the Blit-Tech demo series.
// Prerequisites: 001-Basics
//
// This demo is the simplest introduction to BT's pointer API. It draws a
// crosshair that follows your mouse, lights up indicator boxes when you press
// mouse buttons, and shows a moving bar that follows the scroll wheel.
//
// Try this:
// - Move the mouse over the demo to see the crosshair track your cursor.
// - Click left, right, or middle to light up the A, B, or C button indicator.
// - Spin the scroll wheel to nudge the scroll bar up or down.
// - On a touchscreen: tap and drag to move the crosshair on slot 0. (See
//   demo 026 for the full multi-touch paint version with all four slots.)

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

// Palette slots. Index 0 is always transparent.
const C_WHITE = 1; // text and crosshair
const C_BG = 2; // dark blue-gray background
const C_AMBER = 3; // section headers
const C_DIM = 4; // dim labels (FPS, hint text)
const C_RED = 5; // BTN_POINTER_A indicator (left mouse)
const C_GREEN = 6; // BTN_POINTER_B indicator (right mouse)
const C_BLUE = 7; // BTN_POINTER_C indicator (middle mouse)
const C_YELLOW = 8; // BTN_POINTER_D indicator (back / forward extra mouse buttons)
const C_PANEL = 9; // box backgrounds
const C_PANEL_BORDER = 10; // box borders
const C_TRAIL = 11; // crosshair trail line

// Number of past positions remembered for the cursor trail.
// Each frame we shift in the latest position and draw a line through them.
const TRAIL_LENGTH = 24;

// Vertical pixels travelled per "click" of the scroll wheel.
// We clamp the scroll bar position to [0, displayHeight] so it stays on screen.
const SCROLL_SENSITIVITY = 0.25;

// #endregion

// #region Main Logic

/**
 * Demonstrates the basic pointer API: position, delta, scroll wheel, and the
 * four pointer buttons (A, B, C, D) on slot 0 (the mouse).
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    palette = null;

    // Ring-buffer of recent positions (oldest first). We push the current
    // position each frame and drop the oldest, so the trail shows the cursor's
    // recent path. Each entry is [x, y].
    trail = [];

    // Vertical position of the on-screen scroll-bar handle (in display pixels).
    // Starts in the middle. BT.pointerScrollDelta pushes it up or down.
    scrollBarY = 120;

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Enables the timing chart so pointer milestones appear on the overlay HUD.
     *
     * @returns {{ overlayTimingChart: boolean, overlayTimingChartStyle: { tagPaletteIndex: number } }}
     */
    configure() {
        return {
            overlayTimingChart: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_DIM,
                renderBarPaletteIndex: C_WHITE,
                tagPaletteIndex: C_WHITE,
            },
        };
    }

    /**
     * Runs once at startup. Sets up the palette and prefills the trail.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_WHITE, new Color32(255, 255, 255));
        this.palette.set(C_BG, new Color32(20, 30, 50));
        this.palette.set(C_AMBER, new Color32(255, 200, 100));
        this.palette.set(C_DIM, new Color32(150, 150, 150));
        this.palette.set(C_RED, new Color32(255, 100, 100));
        this.palette.set(C_GREEN, new Color32(100, 255, 100));
        this.palette.set(C_BLUE, new Color32(100, 150, 255));
        this.palette.set(C_YELLOW, new Color32(255, 255, 100));
        this.palette.set(C_PANEL, new Color32(40, 50, 70));
        this.palette.set(C_PANEL_BORDER, new Color32(100, 110, 130));
        this.palette.set(C_TRAIL, new Color32(80, 200, 255));

        BT.paletteSet(this.palette);

        // Hide the native OS cursor so the drawn crosshair is the only cursor
        // visible while the pointer is over the canvas.
        BT.hideCursor();

        // Prefill the trail with the centre point so the very first frame has
        // something to draw without a special-case "no history yet" path.
        for (let i = 0; i < TRAIL_LENGTH; i++) {
            this.trail.push([160, 120]);
        }
        return true;
    }

    /**
     * Per-tick update: push the current pointer position into the trail and
     * apply the scroll-wheel delta to the scroll-bar handle.
     */
    update() {
        // Only record the trail when the pointer is over the canvas. If it
        // isn't (mouse left the canvas, or no input yet), keep the previous
        // trail intact so the line doesn't snap to (0, 0).
        if (BT.isPointerActive(0)) {
            const pos = BT.pointerPos(0);

            // Drop the oldest sample and append the new one.
            this.trail.shift();
            this.trail.push([pos.x, pos.y]);
        }

        // Convert scroll delta (pixels of CSS scroll) into a small bar movement.
        // Multiplying by a fraction makes one wheel-click move the bar a few pixels
        // instead of jumping a full screen height.
        this.scrollBarY += BT.pointerScrollDelta * SCROLL_SENSITIVITY;

        // Keep the scroll bar inside the visible area.
        if (this.scrollBarY < 0) {
            this.scrollBarY = 0;
        } else if (this.scrollBarY > 240) {
            this.scrollBarY = 240;
        }
    }

    /**
     * Per-frame render: clear, draw labels, indicators, the cursor trail,
     * the crosshair, and the scroll-wheel bar.
     */
    render() {
        BT.clear(C_BG);

        BT.systemPrint(new Vector2i(8, 22), C_DIM, 'Move the mouse, click, spin the wheel.');

        this.renderReadouts();
        this.renderButtonIndicators();
        this.renderScrollBar();
        this.renderTrail();
        this.renderCrosshair();
    }

    // #endregion

    // #region Rendering Helpers

    /**
     * Numeric readouts in the top-left: pointer position, delta, scroll delta,
     * and whether slot 0 is currently valid.
     */
    renderReadouts() {
        const valid = BT.isPointerActive(0);
        const scroll = BT.pointerScrollDelta;

        // Background panel so text is readable over any colour.
        BT.drawRectFill(new Rect2i(8, 40, 140, 64), C_PANEL);
        BT.drawRect(new Rect2i(8, 40, 140, 64), C_PANEL_BORDER);

        BT.systemPrint(new Vector2i(12, 44), C_AMBER, 'Slot 0 (mouse):');
        BT.systemPrint(new Vector2i(12, 58), valid ? C_WHITE : C_DIM, `valid: ${valid}`);

        // Only read position and delta when the pointer is over the canvas.
        // BT.pointerPos / BT.pointerDelta may hold stale data when not valid.
        if (valid) {
            const pos = BT.pointerPos(0);
            const delta = BT.pointerDelta(0);
            BT.systemPrint(new Vector2i(12, 70), C_WHITE, `pos:   ${pos.x},${pos.y}`);
            BT.systemPrint(new Vector2i(12, 82), C_WHITE, `delta: ${delta.x},${delta.y}`);
        } else {
            BT.systemPrint(new Vector2i(12, 70), C_DIM, 'pos:   --,--');
            BT.systemPrint(new Vector2i(12, 82), C_DIM, 'delta: --,--');
        }

        BT.systemPrint(new Vector2i(12, 94), C_WHITE, `wheel: ${scroll.toFixed(1)}`);
    }

    /**
     * Four small boxes showing which mouse buttons are currently held.
     * A box lights up while its button is down and dims when released.
     */
    renderButtonIndicators() {
        // Each entry: [label, palette colour when held, BT.BTN_POINTER_* code].
        const buttons = [
            ['A (left)', C_RED, BT.BTN_POINTER_A],
            ['B (right)', C_GREEN, BT.BTN_POINTER_B],
            ['C (middle)', C_BLUE, BT.BTN_POINTER_C],
            ['D (extra)', C_YELLOW, BT.BTN_POINTER_D],
        ];

        BT.systemPrint(new Vector2i(160, 44), C_AMBER, 'Buttons:');

        for (let i = 0; i < buttons.length; i++) {
            const [label, lit, code] = buttons[i];
            const x = 160;
            const y = 58 + i * 12;
            const held = BT.isDown(code, 0);

            // Indicator pip - filled when the button is held, empty otherwise.
            const pipRect = new Rect2i(x, y, 8, 8);
            if (held) {
                BT.drawRectFill(pipRect, lit);
            } else {
                BT.drawRect(pipRect, C_PANEL_BORDER);
            }

            BT.systemPrint(new Vector2i(x + 12, y), held ? lit : C_DIM, label);
        }
    }

    /**
     * Vertical bar on the right edge that the scroll wheel pushes up and down.
     */
    renderScrollBar() {
        const trackX = 300;
        const trackY = 0;
        const trackH = 240;
        const trackW = 12;
        const handleH = 16;

        BT.drawRectFill(new Rect2i(trackX, trackY, trackW, trackH), C_PANEL);
        BT.drawRect(new Rect2i(trackX, trackY, trackW, trackH), C_PANEL_BORDER);

        // Centre the handle around scrollBarY so it can reach top and bottom.
        const handleY = Math.max(0, Math.min(trackH - handleH, Math.floor(this.scrollBarY) - handleH / 2));
        BT.drawRectFill(new Rect2i(trackX + 2, handleY, trackW - 4, handleH), C_AMBER);

        BT.systemPrint(new Vector2i(trackX - 60, 8), C_AMBER, 'wheel');
    }

    /**
     * Polyline through the recent pointer positions, dimmest at the oldest end.
     */
    renderTrail() {
        if (!BT.isPointerActive(0)) {
            return;
        }

        for (let i = 1; i < this.trail.length; i++) {
            const [ax, ay] = this.trail[i - 1];
            const [bx, by] = this.trail[i];
            BT.drawLine(new Vector2i(ax, ay), new Vector2i(bx, by), C_TRAIL);
        }
    }

    /**
     * Crosshair drawn at the current pointer position. Only shown while the
     * pointer is over the canvas (slot 0 valid).
     */
    renderCrosshair() {
        if (!BT.isPointerActive(0)) {
            // Show a hint in the centre of the screen instead.
            BT.systemPrint(new Vector2i(80, 120), C_DIM, 'Move pointer over canvas');
        } else {
            const pos = BT.pointerPos(0);
            const size = 6;

            // Horizontal arm.
            BT.drawLine(new Vector2i(pos.x - size, pos.y), new Vector2i(pos.x + size, pos.y), C_WHITE);
            // Vertical arm.
            BT.drawLine(new Vector2i(pos.x, pos.y - size), new Vector2i(pos.x, pos.y + size), C_WHITE);
            // Centre dot.
            BT.drawPixel(pos, C_WHITE);
        }

        // The engine overlay (FPS + demo name) draws on top automatically.
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

bootstrap(Demo);

// #endregion
