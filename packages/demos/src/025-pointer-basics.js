/**
 * Pointer Basics Demo - read mouse position, buttons, delta, and scroll wheel.
 *
 * Demo 025 in the BLIT386 demo series.
 * Prerequisites: 001-Basics - https://demos.blit386.dev/001-basics
 *
 * Live version: https://demos.blit386.dev/025-pointer-basics
 *
 * This demo is the simplest introduction to BT's pointer API. It draws a
 * crosshair that follows your mouse, lights up indicator pips when you press
 * mouse buttons, and fills a meter that follows the scroll wheel. All the
 * readout panels come from the shared UI kit in src/shared/ui.js; the raw
 * pointer reads (BT.pointerPos, BT.pointerDelta, BT.isDown, and friends) are
 * the lesson and stay hand-written below.
 *
 * Try this:
 * - Move the mouse over the demo to see the crosshair track your cursor.
 * - Click left, right, or middle to light up the A, B, or C button pip.
 * - Spin the scroll wheel to fill or empty the scroll meter.
 * - On a touchscreen: tap and drag to move the crosshair on slot 0. Mouse
 *   buttons B/C/D and the wheel have no touch equivalent, so a note appears
 *   once a touch is detected. (See demo 026 for the full multi-touch paint
 *   version with all four slots.)
 */

import { bootstrap, BT, Color32, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// Scene palette slots. Index 0 is always transparent. All the UI colors
// (panels, text, meter fill) come from the shared theme installed by
// applyTheme() in init(), so the demo only needs slots for its own artwork:
// the crosshair and the cyan trail behind it.
const C_CROSSHAIR = 1; // white crosshair that follows the pointer
const C_TRAIL = 2; // cyan trail line behind the crosshair

// Number of past positions remembered for the cursor trail.
// Each frame we shift in the latest position and draw a line through them.
const TRAIL_LENGTH = 24;

// Multiplier applied to the raw scroll delta (BT.pointerScrollDelta) before it
// is added to the scroll position. The browser reports scrolling in CSS pixels,
// which adds up fast - shrinking each report to a quarter keeps one wheel click
// moving the meter a few pixels instead of a big jump. update() then clamps the
// scroll position to [0, displayHeight] so the meter fill always stays between
// empty and full.
const SCROLL_SENSITIVITY = 0.25;

/**
 * Demonstrates the basic pointer API: position, delta, scroll wheel, and the
 * four pointer buttons (A, B, C, D) on slot 0 (the mouse).
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slot map returned by applyTheme() - theme.bg, theme.dim, and so
    // on. Filled in init(); used for the screen clear and the fallback hint.
    theme = null;

    // Ring-buffer of recent positions (oldest first). We push the current
    // position each frame and drop the oldest, so the trail shows the cursor's
    // recent path. Each entry is [x, y].
    trail = [];

    // Accumulated scroll position (in display pixels). Centered in init() from
    // BT.displaySize. BT.pointerScrollDelta pushes it up or down, and the
    // scroll meter in the readouts panel shows it as a 0..1 fill.
    scrollPos = 0;

    /**
     * Enables the timing chart so pointer milestones appear on the overlay HUD.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            // Opt into canvas wheel capture so BT.pointerScrollDelta works and the
            // page does not scroll while the pointer is over the demo.
            isCapturingPointerScroll: true,
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_TRAIL,
                renderBarPaletteIndex: C_CROSSHAIR,
                tagPaletteIndex: C_CROSSHAIR,
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

        // Scene colors: just the crosshair and its trail. Everything else on
        // screen (panels, labels, the meter) is drawn by the shared UI kit.
        this.palette.set(C_CROSSHAIR, new Color32(255, 255, 255));
        this.palette.set(C_TRAIL, new Color32(80, 200, 255));

        // Install the shared UI colors (slots 240-251) and keep the slot map
        // so we can clear with the theme background and reuse the dim text
        // color for the "move pointer" hint.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        const screen = BT.displaySize;
        this.scrollPos = Math.floor(screen.y / 2);

        // Hide the native OS cursor so the drawn crosshair is the only cursor
        // visible while the pointer is over the canvas.
        BT.hideCursor();

        // Prefill the trail with the center point so the very first frame has
        // something to draw without a special-case "no history yet" path.
        for (let i = 0; i < TRAIL_LENGTH; i++) {
            this.trail.push([Math.floor(screen.x / 2), Math.floor(screen.y / 2)]);
        }
        return true;
    }

    /**
     * Per-tick update: push the current pointer position into the trail and
     * apply the scroll-wheel delta to the accumulated scroll position.
     */
    update() {
        // Let the UI kit do its per-tick housekeeping first. This demo asks
        // the kit whether a touchscreen has been used (ui.hasTouch() in
        // render()), and that answer is kept fresh here.
        ui.tick();

        // Only record the trail when the pointer is over the canvas. If it
        // isn't (mouse left the canvas, or no input yet), keep the previous
        // trail intact so the line doesn't snap to (0, 0).
        if (BT.isPointerActive(0)) {
            const pos = BT.pointerPos(0);

            // Drop the oldest sample and append the new one.
            this.trail.shift();
            this.trail.push([pos.x, pos.y]);
        }

        // Convert scroll delta (pixels of CSS scroll) into a small movement.
        // Multiplying by a fraction makes one wheel-click move the meter a few
        // pixels instead of jumping a full screen height.
        this.scrollPos += BT.pointerScrollDelta * SCROLL_SENSITIVITY;

        // Keep the scroll position inside the visible range (use display height, not a hard-coded 240).
        const maxScrollY = BT.displaySize.y;
        if (this.scrollPos < 0) {
            this.scrollPos = 0;
        } else if (this.scrollPos > maxScrollY) {
            this.scrollPos = maxScrollY;
        }
    }

    /**
     * Per-frame render: clear, draw the UI kit panels (readouts and button
     * pips), then the cursor trail and the crosshair on top so the "cursor"
     * is never hidden behind a panel.
     */
    render() {
        // Clear to the shared theme background so this demo matches the rest
        // of the series.
        BT.clear(this.theme.bg);

        // Full-width title strip with the one-line instructions.
        ui.begin('topBar');
        ui.panel('Pointer Basics - move, click, spin the wheel');
        ui.end();

        this.renderReadouts();
        this.renderButtonPips();
        this.renderTouchNote();
        this.renderTrail();
        this.renderCrosshair();
        this.renderPointerHint();
    }

    /**
     * Readouts panel in the top-left: pointer position, delta, wheel delta,
     * whether slot 0 is active, and a meter showing the accumulated scroll
     * position. The raw BT.pointer* reads here are the whole point of the
     * demo - pointer state (unlike keyboard edges) is safe to read from
     * render().
     */
    renderReadouts() {
        // Is the pointer currently over the canvas (or a finger touching it)?
        const active = BT.isPointerActive(0);

        // How far the wheel moved this frame (positive = scrolling down).
        const scroll = BT.pointerScrollDelta;

        // The panel starts below the title strip (y: 28 skips past it).
        ui.begin('topLeft', { y: 28 });
        ui.panel('Slot 0 (mouse)');

        ui.kv('Active', active ? 'yes' : 'no');

        // Only read position and delta when the pointer is over the canvas.
        // BT.pointerPos / BT.pointerDelta may hold stale data when not active.
        if (active) {
            const pos = BT.pointerPos(0);
            const delta = BT.pointerDelta(0);
            ui.kv('Pos', `${pos.x},${pos.y}`);
            ui.kv('Delta', `${delta.x},${delta.y}`);
        } else {
            ui.kv('Pos', '--,--');
            ui.kv('Delta', '--,--');
        }

        // toFixed(1) turns the number into text with one digit after the
        // decimal point, so the readout does not jitter through long fractions.
        ui.kv('Wheel', scroll.toFixed(1));

        // The meter fills up as you scroll down and empties as you scroll up.
        // Dividing by the display height turns 0..240 pixels into the 0..1
        // fraction the meter expects.
        ui.meter('Scroll pos', this.scrollPos / BT.displaySize.y);

        ui.end();
    }

    /**
     * Buttons panel in the top-right: four read-only pips, one per pointer
     * button. A pip lights up while its button is held and goes hollow when
     * released. BT.isDown() checks held state, which is safe from render().
     */
    renderButtonPips() {
        ui.begin('topRight', { y: 28 });
        ui.panel('Buttons');

        // Each pip pairs a label with the live held-state of one button code.
        ui.pip('A (left)', BT.isDown(BT.BTN_POINTER_A, 0));
        ui.pip('B (right)', BT.isDown(BT.BTN_POINTER_B, 0));
        ui.pip('C (middle)', BT.isDown(BT.BTN_POINTER_C, 0));
        ui.pip('D (extra)', BT.isDown(BT.BTN_POINTER_D, 0));

        ui.end();
    }

    /**
     * A dim one-line note shown only after a touchscreen has been used.
     * Fingers can move the crosshair, but there is no touch equivalent of the
     * scroll wheel or the extra mouse buttons - better to say so than to let
     * touch users hunt for something that cannot happen.
     */
    renderTouchNote() {
        if (!ui.hasTouch()) {
            return;
        }

        // A borderless group (no ui.panel call) is just floating text.
        ui.begin('bottomRight');
        ui.label('Scroll wheel and right-click: desktop only', { color: 'dim' });
        ui.end();
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
     * pointer is over the canvas (slot 0 active).
     */
    renderCrosshair() {
        if (!BT.isPointerActive(0)) {
            return;
        }

        const pos = BT.pointerPos(0);
        const size = 6;

        // Horizontal arm.
        BT.drawLine(new Vector2i(pos.x - size, pos.y), new Vector2i(pos.x + size, pos.y), C_CROSSHAIR);
        // Vertical arm.
        BT.drawLine(new Vector2i(pos.x, pos.y - size), new Vector2i(pos.x, pos.y + size), C_CROSSHAIR);
        // Center dot.
        BT.drawPixel(pos, C_CROSSHAIR);
    }

    /**
     * "Move pointer over canvas" hint in the middle of the screen. Only shown
     * while the pointer is NOT over the canvas, so newcomers know what to do.
     * Uses the theme's dim text color so it matches the rest of the UI.
     */
    renderPointerHint() {
        if (BT.isPointerActive(0)) {
            return;
        }

        // `screen` holds the full display size; halving it below finds the
        // middle, and the small offsets nudge the text so its center (not its
        // top-left corner) sits on that middle point.
        const screen = BT.displaySize;
        BT.systemPrint(
            new Vector2i(Math.floor(screen.x / 2) - 60, Math.floor(screen.y / 2) - 7),
            this.theme.dim,
            'Move pointer over canvas',
        );

        // The engine overlay (FPS + demo name) draws on top automatically.
    }
}

bootstrap(Demo);
