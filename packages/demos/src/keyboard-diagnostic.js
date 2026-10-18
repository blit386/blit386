/*

Keyboard Diagnostic: a visual keyboard with press, hold, and release feedback.
@description A full on-screen keyboard with press, hold, and release feedback, to verify fast taps on any display.

Part of the BLIT386 demo series.

Prerequisites:
  - Keyboard Input: https://demos.blit386.dev/keyboard-input

Live version: https://demos.blit386.dev/keyboard-diagnostic

Guides:
  - Input: https://blit386.dev/docs/guides/input#keyboard
  - Input: https://blit386.dev/docs/guides/input#frame-timing-semantics

---

WHAT YOU WILL SEE
-----------------

A 600x315 picture of a full keyboard: six rows of key caps from the function row down to
the modifier row, with an arrow cluster on the right. Every cap is the same rounded block
the System Font Glyphs demo uses for its cells (a UI kit button face), with a centered
label; the arrow keys are labeled with the system font's arrow characters. The whole cap
turns green while its key is held, flashes yellow for 12 ticks on the press edge, and
flashes red for 12 ticks on the release edge, with a lighter rim in the same color and
its label in the dark background color. A legend under the keyboard names the three
colors next to small solid squares.

A title strip runs across the top with a one-line hint under it (a warm "This demo needs
a keyboard" notice on touch devices). Two equal panels sit under the legend, lined up
with the keyboard's edges: "Last edge" shows the most recent edge, its key code, and the
engine tick it fired on; "Edge counts" shows the running press and release counts and a
"Counts match" pip that stays lit while the two are equal.

WHAT YOU WILL LEARN
-------------------

- BT.isKeyDown(code) is held state and can be read from render(); BT.isKeyPressed(code)
  and BT.isKeyReleased(code) are one-tick edges that clear at the end of every fixed
  update, so they are read in update() and remembered in per-key flash timers.
- Keyboard edges are buffered on the DOM events and consumed by the next fixed update, so
  a tap shorter than one tick still produces one press and one release.
- KeyboardEvent.code strings (KeyQ, ShiftLeft, ArrowUp) name physical keys independent of
  the OS layout.
- A keyboard layout described as data: a row table measured in key widths ("units"),
  which addKeyRow() walks to place caps, with per-key overrides for width, extra gaps,
  and fixed columns.
- Hardware settings: a 600x315 display drawn into a 1200x630 drawing buffer with
  outputUpscaleFilter 'nearest' and targetFPS 60, plus isCapturingKeyboardScroll.
- The shared UI kit's ui.drawButtonFace() and ui.drawButtonFill() for the caps, and
  BT.systemPrint with BT.systemPrintMeasure for centering a label on a cap.

TRY THIS
--------

- Tap a key as fast as you can, several times in a row. Every tap must show a yellow
  flash followed by a red one, and the "Presses" and "Releases" counts must stay equal -
  the "Counts match" pip goes dark the moment they differ. A mismatch means an edge was
  dropped.
- Run the page on a high-refresh display (120 Hz or more). targetFPS is 60, so some drawn
  frames run no update at all; the edge buffering keeps fast taps from falling into those
  frames.
- Hold a key and watch it stay green; the yellow flash ends after 12 ticks while the key
  is still held.
- Press Shift, Ctrl, Alt, and the OS key on both sides to see that left and right have
  separate codes.
- Click the canvas if keys stop responding - focus has moved elsewhere on the page.

WHY 600 BY 315?
---------------

That is exactly half of the 1200x630 social card the demo site generates, so the card
shows the screen at a clean 2x scale with no blurry resampling - the same size the System
Font Glyphs demo uses, so the two pages' key-cap blocks match pixel for pixel.

*/

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, BUTTON_LOOK, FONT_W, litRimColor, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {{ code: string, label: string, x: number, y: number, w: number, pressTimer: number, releaseTimer: number }} KeyDef */
/** @typedef {{ code: string, label: string, w?: number, gapBefore?: number, at?: number }} KeyRowEntry */

// The screen is 600x315 display pixels: exactly half of the 1200x630 social card, and the
// same size as the System Font Glyphs demo whose cells the key caps match.
const DISPLAY_W = 600;
const DISPLAY_H = 315;

// Scene palette slots for the three key-cap flash states. These stay demo-owned (not
// shared UI theme colors) because the legend and the key caps must show the exact same
// green / yellow / red the diagnostic is about. Everything else (cap faces, panels, text)
// comes from the shared UI theme installed in init().
const C_LIT_HELD = 1; // key-cap fill while BT.isKeyDown is true (green)
const C_LIT_PRESS = 2; // key-cap fill during the press flash (yellow)
const C_LIT_RELEASE = 3; // key-cap fill during the release flash (red)

// A lighter shade of each flash color for the lit cap's rim, written in init(). Each is
// the flash color brightened by exactly the step between the theme's resting button fill
// and its border, so a lit cap's rim stands out from its fill as much as a resting cap's
// does.
const C_RIM_HELD = 4;
const C_RIM_PRESS = 5;
const C_RIM_RELEASE = 6;

// The three flash colors, each with the slot of its lighter rim.
const FLASH_RIMS = [
    { fill: C_LIT_HELD, rim: C_RIM_HELD },
    { fill: C_LIT_PRESS, rim: C_RIM_PRESS },
    { fill: C_LIT_RELEASE, rim: C_RIM_RELEASE },
];

// How many fixed ticks a press or release flash stays visible.
const FLASH_TICKS = 12;

// Key caps match the System Font Glyphs demo's cells: 23 pixels square with a 2-pixel
// gap, so one "unit" (the width of a standard key) is 25 pixels from one cap's left edge
// to the next. A key that is w units wide is w x 25 - 2 pixels wide, so its right edge
// still leaves the 2-pixel gap before the next cap.
const KEY_SIZE = 23;
const KEY_GAP = 2;
const UNIT = KEY_SIZE + KEY_GAP;

// The whole keyboard picture as data: six rows, top to bottom, measured in units. Each
// key has a `code` (KeyboardEvent.code string) and a `label` drawn on the cap.
// addKeyRow() walks each row like laying tiles on a shelf: it keeps a running position,
// places a key, then moves right by the key's width. A key only needs extra fields when
// it breaks the pattern: `w` for wide or narrow caps (Backspace, Enter, Space),
// `gapBefore` for the half-unit gaps between F-key clusters, and `at` when a key jumps to
// a fixed column (the arrow cluster on the right). Every row of the main block is 15
// units wide, the standard keyboard proportions; the arrows sit half a unit to its right.
/** @type {KeyRowEntry[][]} */
const KEYBOARD_ROWS = [
    // Function row: Esc, then the twelve F-keys in three clusters of four, half a unit
    // apart.
    [
        { code: 'Escape', label: 'Esc' },
        { code: 'F1', label: 'F1', gapBefore: 1 },
        { code: 'F2', label: 'F2' },
        { code: 'F3', label: 'F3' },
        { code: 'F4', label: 'F4' },
        { code: 'F5', label: 'F5', gapBefore: 0.5 },
        { code: 'F6', label: 'F6' },
        { code: 'F7', label: 'F7' },
        { code: 'F8', label: 'F8' },
        { code: 'F9', label: 'F9', gapBefore: 0.5 },
        { code: 'F10', label: 'F10' },
        { code: 'F11', label: 'F11' },
        { code: 'F12', label: 'F12' },
    ],
    // Number row: thirteen standard keys, then a 2-unit Backspace.
    [
        { code: 'Backquote', label: '`' },
        { code: 'Digit1', label: '1' },
        { code: 'Digit2', label: '2' },
        { code: 'Digit3', label: '3' },
        { code: 'Digit4', label: '4' },
        { code: 'Digit5', label: '5' },
        { code: 'Digit6', label: '6' },
        { code: 'Digit7', label: '7' },
        { code: 'Digit8', label: '8' },
        { code: 'Digit9', label: '9' },
        { code: 'Digit0', label: '0' },
        { code: 'Minus', label: '-' },
        { code: 'Equal', label: '=' },
        { code: 'Backspace', label: 'Back', w: 2 },
    ],
    // QWERTY row: a 1.5-unit Tab, standard keys, and a 1.5-unit backslash.
    [
        { code: 'Tab', label: 'Tab', w: 1.5 },
        { code: 'KeyQ', label: 'Q' },
        { code: 'KeyW', label: 'W' },
        { code: 'KeyE', label: 'E' },
        { code: 'KeyR', label: 'R' },
        { code: 'KeyT', label: 'T' },
        { code: 'KeyY', label: 'Y' },
        { code: 'KeyU', label: 'U' },
        { code: 'KeyI', label: 'I' },
        { code: 'KeyO', label: 'O' },
        { code: 'KeyP', label: 'P' },
        { code: 'BracketLeft', label: '[' },
        { code: 'BracketRight', label: ']' },
        { code: 'Backslash', label: '\\', w: 1.5 },
    ],
    // Home row: a 1.75-unit Caps Lock, standard letter keys, and a 2.25-unit Enter.
    [
        { code: 'CapsLock', label: 'Caps', w: 1.75 },
        { code: 'KeyA', label: 'A' },
        { code: 'KeyS', label: 'S' },
        { code: 'KeyD', label: 'D' },
        { code: 'KeyF', label: 'F' },
        { code: 'KeyG', label: 'G' },
        { code: 'KeyH', label: 'H' },
        { code: 'KeyJ', label: 'J' },
        { code: 'KeyK', label: 'K' },
        { code: 'KeyL', label: 'L' },
        { code: 'Semicolon', label: ';' },
        { code: 'Quote', label: "'" },
        { code: 'Enter', label: 'Enter', w: 2.25 },
    ],
    // Bottom letter row: a 2.25-unit left Shift, standard keys, a 2.75-unit right Shift,
    // and the up arrow pinned to the middle column of the arrow cluster.
    [
        { code: 'ShiftLeft', label: 'Shift', w: 2.25 },
        { code: 'KeyZ', label: 'Z' },
        { code: 'KeyX', label: 'X' },
        { code: 'KeyC', label: 'C' },
        { code: 'KeyV', label: 'V' },
        { code: 'KeyB', label: 'B' },
        { code: 'KeyN', label: 'N' },
        { code: 'KeyM', label: 'M' },
        { code: 'Comma', label: ',' },
        { code: 'Period', label: '.' },
        { code: 'Slash', label: '/' },
        { code: 'ShiftRight', label: 'Shift', w: 2.75 },
        { code: 'ArrowUp', label: '\u2191', at: 16.5 },
    ],
    // Modifier row: six 1.5-unit modifiers around a 6-unit Space, filling the same 15
    // units as every other row (6 x 1.5 + 6 = 15), then the left, down, and right arrows
    // starting half a unit past the main block, under the up arrow.
    [
        { code: 'ControlLeft', label: 'Ctrl', w: 1.5 },
        { code: 'MetaLeft', label: 'Win', w: 1.5 },
        { code: 'AltLeft', label: 'Alt', w: 1.5 },
        { code: 'Space', label: 'Space', w: 6 },
        { code: 'AltRight', label: 'Alt', w: 1.5 },
        { code: 'MetaRight', label: 'Win', w: 1.5 },
        { code: 'ControlRight', label: 'Ctrl', w: 1.5 },
        { code: 'ArrowLeft', label: '\u2190', at: 15.5 },
        { code: 'ArrowDown', label: '\u2193' },
        { code: 'ArrowRight', label: '\u2192' },
    ],
];

// The keyboard is 18.5 units wide (15 for the main block, half a unit of gap, 3 for the
// arrows) and 6 rows tall, with an extra 6 pixels between the function row and the rest.
const KEYBOARD_UNITS_W = 18.5;
const KEYBOARD_W = KEYBOARD_UNITS_W * UNIT - KEY_GAP;
const FN_ROW_GAP = 6;
const KEYBOARD_H = KEYBOARD_ROWS.length * UNIT - KEY_GAP + FN_ROW_GAP;

// Vertical layout under the 32-pixel title strip (a 22-pixel strip that grows by its hint
// row): the keyboard, a 10-pixel gap, the 12-pixel legend row, another 10-pixel gap, and
// the two 63-pixel status panels (22 title + 3 rows of 10 + 11 bottom). The whole block
// is centered in the space below the strip, and everything is centered across the
// screen.
const TITLE_STRIP_H = 32;
const LEGEND_H = 12;
const STATUS_PANEL_H = 22 + 3 * 10 + 11;
const BLOCK_H = KEYBOARD_H + 10 + LEGEND_H + 10 + STATUS_PANEL_H;
const KEYBOARD_X = Math.floor((DISPLAY_W - KEYBOARD_W) / 2);
const KEYBOARD_Y = TITLE_STRIP_H + Math.floor((DISPLAY_H - TITLE_STRIP_H - BLOCK_H) / 2);
const LEGEND_Y = KEYBOARD_Y + KEYBOARD_H + 10;
const STATUS_PANEL_Y = LEGEND_Y + LEGEND_H + 10;

// The two status panels share the keyboard's width, 4 pixels apart.
const STATUS_PANEL_W = (KEYBOARD_W - 4) / 2;

// The legend: one small block per flash color and a dim label after it.
const LEGEND_ITEMS = [
    { slot: C_LIT_HELD, label: 'Held' },
    { slot: C_LIT_PRESS, label: 'Press flash' },
    { slot: C_LIT_RELEASE, label: 'Release flash' },
];
const LEGEND_BLOCK = 8;

// Full keyboard layout diagnostic for edge-trigger testing.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slots of the shared UI theme colors, filled by applyTheme() in init().
    /** @type {ReturnType<typeof applyTheme> | null} */
    theme = null;

    // One entry per on-screen key cap, built by initKeyboardLayout(): `code`, `label`,
    // the cap's left edge, top edge, and width (`x`, `y`, `w`; every cap is KEY_SIZE
    // tall), and two countdowns in ticks, `pressTimer` and `releaseTimer`, for the press
    // and release flashes.
    /** @type {KeyDef[]} */
    keys = [];

    // The most recent key edge for the Last edge panel: which kind it was, the key code,
    // and the engine tick it fired on (null before the first one).
    lastEdge = '-';
    lastCode = 'press any key';
    lastTick = null;

    // How many press edges we have seen in total. Fast-tap test: this must match
    // releases.
    pressCount = 0;

    // How many release edges we have seen in total.
    releaseCount = 0;

    // Reused for every rectangle and label position drawn in render(), so drawing
    // allocates no new objects.
    tempRect = new Rect2i(0, 0, 0, 0);
    tempVec = new Vector2i(0, 0);

    // Glyph height of the system font, measured in init() for centering labels.
    glyphHeight = 14;

    // A 600x315 display rendered into a 1200x630 buffer with nearest-neighbor upscaling,
    // locked to 60 ticks per second so the display refresh rate and the tick rate differ
    // on fast monitors.
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            drawingBufferSize: new Vector2i(DISPLAY_W * 2, DISPLAY_H * 2),
            maxCanvasSize: new Vector2i(DISPLAY_W * 2, DISPLAY_H * 2),
            outputUpscaleFilter: 'nearest',
            targetFPS: 60,
            isOverlayEnabled: false,

            // This page lights up arrow keys and Space on the on-screen keyboard. Opt in
            // so those keys do not scroll the demo page while you are testing them.
            isCapturingKeyboardScroll: true,
        };
    }

    // Palette setup, shared UI theme, and the key cap layout.
    async init() {
        this.palette = BT.paletteCreate(256);

        // The three flash colors live in low scene slots; the legend and the key caps
        // both draw with them so the colors always match.
        this.palette.set(C_LIT_HELD, new Color32(75, 210, 120, 255));
        this.palette.set(C_LIT_PRESS, new Color32(255, 230, 80, 255));
        this.palette.set(C_LIT_RELEASE, new Color32(240, 80, 80, 255));

        // applyTheme() installs the twelve shared UI colors (background, button faces,
        // text, ...) high in the palette and reports their slots, so the key caps and the
        // kit widgets all draw from one consistent theme.
        this.theme = applyTheme(this.palette);

        // The lit caps' rims: each flash color brightened by the step from the theme's
        // resting button fill to its border. litRimColor() reads both from the palette,
        // so the two always match. palette.get() returns a copy of the color in a slot.
        for (const { fill, rim } of FLASH_RIMS) {
            this.palette.set(rim, litRimColor(this.palette, this.palette.get(fill)));
        }

        BT.paletteSet(this.palette);

        // Measure the system font once so every label can be centered on its cap.
        this.glyphHeight = BT.systemPrintMeasure('M').y;

        // Start every run from a clean slate. init() runs again whenever BT.renderAt()
        // replays the demo from the start (the /shots page and the social card do that),
        // and fields keep their old values across that replay - so the counters and the
        // last edge are reset here, and the key list is rebuilt rather than added to.
        // Without this, every key would sit in the list twice and each press would count
        // twice.
        this.lastEdge = '-';
        this.lastCode = 'press any key';
        this.lastTick = null;
        this.pressCount = 0;
        this.releaseCount = 0;
        this.initKeyboardLayout();

        return true;
    }

    // Reads the press and release edges for every key and runs the flash countdowns.
    update() {
        // Let the UI kit track touch contacts first - ui.hasTouch() in render() relies on
        // this housekeeping running every update tick.
        ui.tick();

        for (let i = 0; i < this.keys.length; i++) {
            const key = this.keys[i];

            // Whichever edge fires most recently owns the flash: starting one flash
            // cancels the other, so a fast tap cannot let two competing countdowns reach
            // zero together and skip the release color entirely.
            if (BT.isKeyPressed(key.code)) {
                key.pressTimer = FLASH_TICKS;
                key.releaseTimer = 0;
                this.lastEdge = 'pressed';
                this.lastCode = key.code;
                this.lastTick = BT.ticks;
                this.pressCount += 1;
            }

            if (BT.isKeyReleased(key.code)) {
                key.releaseTimer = FLASH_TICKS;
                key.pressTimer = 0;
                this.lastEdge = 'released';
                this.lastCode = key.code;
                this.lastTick = BT.ticks;
                this.releaseCount += 1;
            }

            // Count both flashes down by one tick.
            if (key.pressTimer > 0) {
                key.pressTimer -= 1;
            }

            if (key.releaseTimer > 0) {
                key.releaseTimer -= 1;
            }
        }
    }

    // Draws the title strip, the key caps, the legend, and the two status panels.
    render() {
        BT.clear(this.theme.bg);

        // Full-width title strip. The second row is contextual: touch devices get a
        // warning that the demo is pointless without a keyboard, everyone else gets the
        // fast-tap testing hint.
        ui.begin(UI_ANCHORS.TOP_BAR);
        ui.panel('BLIT386 Keyboard Diagnostic');

        if (ui.hasTouch()) {
            ui.label('This demo needs a keyboard', { color: 'warm' });
        } else {
            ui.label('Tap fast on a 120 Hz display - every press flash needs a release flash', { color: 'dim' });
        }

        ui.end();

        for (let i = 0; i < this.keys.length; i++) {
            this.renderKey(this.keys[i]);
        }

        this.renderLegend();
        this.renderStatusPanels();
    }

    // Draws one key cap in its current state: held wins over the press flash, which wins
    // over the release flash.
    renderKey(key) {
        const isDown = BT.isKeyDown(key.code);
        const isPressed = key.pressTimer > 0;
        const isReleased = key.releaseTimer > 0;

        // Which flash color the cap wears right now (0 for none), and its lighter rim.
        let fillSlot = 0;
        let rimSlot = 0;

        if (isDown) {
            fillSlot = C_LIT_HELD;
            rimSlot = C_RIM_HELD;
        } else if (isPressed) {
            fillSlot = C_LIT_PRESS;
            rimSlot = C_RIM_PRESS;
        } else if (isReleased) {
            fillSlot = C_LIT_RELEASE;
            rimSlot = C_RIM_RELEASE;
        }

        // The cap is the same rounded block the System Font Glyphs demo draws its cells
        // with: a kit button face. A resting cap uses the plain face and a dim label. A
        // lit cap uses ui.drawButtonFill() - the same face, filled with the scene flash
        // color and rimmed with its lighter shade - and prints its label in the dark
        // background color, so it reads clearly on the bright yellow, green, or red.
        this.tempRect.set(key.x, key.y, key.w, KEY_SIZE);

        if (fillSlot === 0) {
            ui.drawButtonFace(this.tempRect, BUTTON_LOOK.REST);
        } else {
            ui.drawButtonFill(this.tempRect, fillSlot, rimSlot);
        }

        const textSlot = fillSlot === 0 ? this.theme.dim : this.theme.bg;

        // Center the label on the cap. Every character of the system font is FONT_W (6)
        // pixels wide, but its pixels fill only the first 5 columns - the 6th is the gap
        // before the next character - so the visible text is one pixel narrower than
        // length x 6, and centering on that keeps it truly in the middle. Vertically, the
        // glyph cell sits one pixel below plain centering, which balances the capital
        // letters between the cap's top edge and its slightly heavier bottom rim.
        // BT.systemPrint() draws text as sprites too, so it lands on top of the face.
        const textW = key.label.length * FONT_W - 1;

        this.tempVec.set(
            key.x + Math.floor((key.w - textW) / 2),
            key.y + Math.floor((KEY_SIZE - this.glyphHeight) / 2) + 1,
        );
        BT.systemPrint(this.tempVec, textSlot, key.label);
    }

    // Draws the legend under the keyboard: for each flash color, a small solid square of
    // that color and a dim label, the row centered across the screen.
    renderLegend() {
        // Work out the row's width first: block, 4 pixels, label, then 16 pixels before
        // the next item.
        let rowW = 0;

        for (let i = 0; i < LEGEND_ITEMS.length; i++) {
            rowW += LEGEND_BLOCK + 4 + LEGEND_ITEMS[i].label.length * FONT_W + (i > 0 ? 16 : 0);
        }

        let x = Math.floor((DISPLAY_W - rowW) / 2);

        for (const item of LEGEND_ITEMS) {
            // The square covers rows LEGEND_Y + 2 to LEGEND_Y + 9 of the 12-pixel row.
            this.tempRect.set(x, LEGEND_Y + 2, LEGEND_BLOCK, LEGEND_BLOCK);
            BT.drawRectFill(this.tempRect, item.slot);

            // A caption's capital letters cover 7 rows starting 1 row above the y it is
            // given, so LEGEND_Y + 4 puts them on rows LEGEND_Y + 3 to LEGEND_Y + 9,
            // level with the square.
            ui.caption(x + LEGEND_BLOCK + 4, LEGEND_Y + 4, item.label, { color: 'dim' });
            x += LEGEND_BLOCK + 4 + item.label.length * FONT_W + 16;
        }
    }

    // The two status panels under the legend, lined up with the keyboard's edges.
    renderStatusPanels() {
        // Which edge fired last, on which key, and on which engine tick.
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: KEYBOARD_X, y: STATUS_PANEL_Y, width: STATUS_PANEL_W });
        ui.panel('Last edge');
        ui.kv('Edge', this.lastEdge);
        ui.kv('Code', this.lastCode);
        ui.kv('Tick', this.lastTick === null ? '-' : this.lastTick);
        ui.end();

        // Edge counters: after a burst of fast taps both numbers must match - a mismatch
        // means an edge was dropped somewhere. The pip makes that visible at a glance.
        ui.begin(UI_ANCHORS.TOP_LEFT, {
            x: KEYBOARD_X + STATUS_PANEL_W + 4,
            y: STATUS_PANEL_Y,
            width: STATUS_PANEL_W,
        });
        ui.panel('Edge counts');
        ui.kv('Presses', this.pressCount);
        ui.kv('Releases', this.releaseCount);
        ui.pip('Counts match', this.pressCount === this.releaseCount);
        ui.end();
    }

    // Appends one key definition to `this.keys` with its flash timers reset to zero.
    // `x`, `y`, `w` are the cap's left edge, top edge, and width in display pixels.
    addKey(code, label, x, y, w) {
        this.keys.push({ code, label, x, y, w, pressTimer: 0, releaseTimer: 0 });
    }

    // Lays out one row of KEYBOARD_ROWS, left to right, at the top edge `y`. The running
    // position `u` (in units) starts at 0, the keyboard's left edge. For each key we
    // first honor its quirks - jump to an absolute column (`at`) or skip extra space
    // (`gapBefore`) - then place the cap and step right by its width, ready for the next
    // key. Units become pixels by multiplying by UNIT; Math.round keeps every edge on a
    // whole pixel for the quarter-unit widths.
    addKeyRow(row, y) {
        let u = 0;

        for (const key of row) {
            // A fixed column wins over the flowing position (used by the arrow cluster).
            if (typeof key.at === 'number') {
                u = key.at;
            }

            // Extra breathing room before this key, like the gap between F-key clusters.
            // The ?? operator means "use the left value unless it is missing, then 0".
            u += key.gapBefore ?? 0;

            // Wide and narrow caps say so; everyone else is one unit wide.
            const w = key.w ?? 1;
            const x = KEYBOARD_X + Math.round(u * UNIT);
            const right = KEYBOARD_X + Math.round((u + w) * UNIT) - KEY_GAP;

            this.addKey(key.code, key.label, x, y, right - x);

            u += w;
        }
    }

    // Builds the on-screen key cap list (positions only; state lives on each entry).
    initKeyboardLayout() {
        // A fresh, empty list every time, so a second init() replaces the caps instead of
        // adding a second copy of each.
        this.keys = [];

        // The layout itself lives in KEYBOARD_ROWS near the top of the file; here we just
        // walk the six rows and let addKeyRow() place every cap. Every row after the
        // function row sits FN_ROW_GAP pixels lower, like a real keyboard.
        for (let i = 0; i < KEYBOARD_ROWS.length; i++) {
            const y = KEYBOARD_Y + i * UNIT + (i > 0 ? FN_ROW_GAP : 0);

            this.addKeyRow(KEYBOARD_ROWS[i], y);
        }
    }
}

bootstrap(Demo);
