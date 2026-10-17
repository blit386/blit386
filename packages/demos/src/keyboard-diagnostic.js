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

A 320x240 picture of a full keyboard: six rows of key caps from the function row down to
the modifier row, with an arrow cluster on the right. Each cap is a filled rectangle with
a border and a centered label. A cap turns green while its key is held, flashes yellow for
12 ticks on the press edge, and flashes red for 12 ticks on the release edge. A legend
under the keyboard prints the three colors.

A title strip runs across the top with a one-line hint under it (a warm "This demo needs
a keyboard" notice on touch devices). Two small panels sit in the bottom corners: on the
left the most recent edge and the engine tick it fired on, on the right the running press
and release counts.

WHAT YOU WILL LEARN
-------------------

- BT.isKeyDown(code) is held state and can be read from render(); BT.isKeyPressed(code)
  and BT.isKeyReleased(code) are one-tick edges that clear at the end of every fixed
  update, so they are read in update() and remembered in per-key flash timers.
- Keyboard edges are buffered on the DOM events and consumed by the next fixed update, so
  a tap shorter than one tick still produces one press and one release.
- KeyboardEvent.code strings (KeyQ, ShiftLeft, ArrowUp) name physical keys independent of
  the OS layout.
- A keyboard layout described as data: a row table that addKeyRow() walks to place caps,
  with per-key overrides for width, extra gaps, and fixed columns.
- Hardware settings: a 320x240 display drawn into a 960x720 drawing buffer with
  outputUpscaleFilter 'nearest' and targetFPS 60, plus isCapturingKeyboardScroll.
- BT.systemPrint and BT.systemPrintMeasure for centering a label on a cap.

TRY THIS
--------

- Tap a key as fast as you can, several times in a row. Every tap must show a yellow
  flash followed by a red one, and the "Presses" and "Releases" counts in the bottom-right
  panel must stay equal. A mismatch means an edge was dropped.
- Run the page on a high-refresh display (120 Hz or more). targetFPS is 60, so some drawn
  frames run no update at all; the edge buffering keeps fast taps from falling into those
  frames.
- Hold a key and watch it stay green; the yellow flash ends after 12 ticks while the key
  is still held.
- Press Shift, Ctrl, Alt, and the OS key on both sides to see that left and right have
  separate codes.
- Click the canvas if keys stop responding - focus has moved elsewhere on the page.

*/

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {{ code: string, label: string, x: number, y: number, w: number, h: number, pressTimer: number, releaseTimer: number }} KeyDef */
/** @typedef {{ code: string, label: string, w?: number, gapBefore?: number, x?: number }} KeyRowEntry */
/** @typedef {{ startX: number, y: number, keys: KeyRowEntry[] }} KeyRow */

// Scene palette slots for the three key-cap flash states. These stay demo-owned (not
// shared UI theme colors) because the legend and the key caps must show the exact same
// green / yellow / red the diagnostic is about. Everything else (panel fills, borders,
// text) comes from the shared UI theme installed in init().
const C_LIT_HELD = 1; // key-cap color while BT.isKeyDown is true (green)
const C_LIT_PRESS = 2; // key-cap color during the press flash (yellow)
const C_LIT_RELEASE = 3; // key-cap color during the release flash (red)

// How many fixed ticks a press or release flash stays visible.
const FLASH_TICKS = 12;

const KEY_WIDTH = 18; // width of a standard key cap, in pixels
const KEY_HEIGHT = 18; // height of a standard key cap, in pixels
const KEY_GAP = 2; // empty space between adjacent key caps, in pixels

// The whole keyboard picture as data: six rows, top to bottom. Each row has a `startX`
// (left edge of its first key), a `y` (top edge of every key in the row), and a `keys`
// list. Each key has a `code` (KeyboardEvent.code string) and a `label` drawn on the cap.
// addKeyRow() walks each row like laying tiles on a shelf: it keeps a running x position,
// places a key, then moves right by the key's width plus KEY_GAP. A key only needs extra
// fields when it breaks the pattern: `w` for wide or narrow caps (Backspace, Enter,
// Space), `gapBefore` for the small gaps between F-key clusters, and `x` when a key jumps
// to a fixed column (the arrow cluster on the right).
/** @type {KeyRow[]} */
const KEYBOARD_ROWS = [
    // Function row: Esc is a little wider, and the twelve F-keys sit in three clusters of
    // four with a 6-pixel breather between clusters (F4|F5 and F8|F9).
    {
        startX: 10,
        y: 50,
        keys: [
            { code: 'Escape', label: 'Esc', w: 22 },
            { code: 'F1', label: 'F1', gapBefore: 4 },
            { code: 'F2', label: 'F2' },
            { code: 'F3', label: 'F3' },
            { code: 'F4', label: 'F4' },
            { code: 'F5', label: 'F5', gapBefore: 6 },
            { code: 'F6', label: 'F6' },
            { code: 'F7', label: 'F7' },
            { code: 'F8', label: 'F8' },
            { code: 'F9', label: 'F9', gapBefore: 6 },
            { code: 'F10', label: 'F10' },
            { code: 'F11', label: 'F11' },
            { code: 'F12', label: 'F12' },
        ],
    },
    // Number row: thirteen standard keys, then a wide Backspace at the end.
    {
        startX: 10,
        y: 72,
        keys: [
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
            { code: 'Backspace', label: 'Back', w: 38 },
        ],
    },
    // QWERTY row: a wider Tab first, then standard keys, with a wider backslash cap.
    {
        startX: 10,
        y: 92,
        keys: [
            { code: 'Tab', label: 'Tab', w: 27 },
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
            { code: 'Backslash', label: '\\', w: 29 },
        ],
    },
    // Home row: a wide Caps Lock, standard letter keys, and a wide Enter at the end.
    {
        startX: 10,
        y: 112,
        keys: [
            { code: 'CapsLock', label: 'Caps', w: 32 },
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
            { code: 'Enter', label: 'Enter', w: 44 },
        ],
    },
    // Bottom letter row: wide left Shift, standard keys, a narrow right Shift, and the up
    // arrow pinned to its own column on the right edge.
    {
        startX: 10,
        y: 132,
        keys: [
            { code: 'ShiftLeft', label: 'Shift', w: 42 },
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
            // 32 px fits the 30 px "Shift" label; the up arrow is pinned at x=268, so a
            // cap that starts at the flowing x (about 234) still clears it.
            { code: 'ShiftRight', label: 'Shift', w: 32 },
            { code: 'ArrowUp', label: '^', x: 268 },
        ],
    },
    // Modifier row: every cap has its own width, and the left/down/right arrows jump to a
    // fixed column so they line up under the up arrow above.
    {
        startX: 10,
        y: 152,
        keys: [
            { code: 'ControlLeft', label: 'Ctrl', w: 24 },
            { code: 'MetaLeft', label: 'Win', w: 18 },
            { code: 'AltLeft', label: 'Alt', w: 18 },
            { code: 'Space', label: 'Space', w: 96 },
            { code: 'AltRight', label: 'Alt', w: 18 },
            { code: 'MetaRight', label: 'Win', w: 18 },
            { code: 'ControlRight', label: 'Ctrl', w: 24 },
            { code: 'ArrowLeft', label: '<', x: 248 },
            { code: 'ArrowDown', label: 'v' },
            { code: 'ArrowRight', label: '>' },
        ],
    },
];

// Full keyboard layout diagnostic for edge-trigger testing.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slots of the shared UI theme colors, filled by applyTheme() in init().
    /** @type {ReturnType<typeof applyTheme> | null} */
    theme = null;

    // One entry per on-screen key cap, built by initKeyboardLayout(): `code`, `label`,
    // the cap rectangle (`x`, `y`, `w`, `h`), and two countdowns in ticks, `pressTimer`
    // and `releaseTimer`, for the press and release flashes.
    /** @type {KeyDef[]} */
    keys = [];

    // Human-readable description of the most recent key edge, shown in the status panel.
    lastEvent = 'press any key';

    // Engine tick of the most recent key edge, or null before the first one.
    lastTick = null;

    // How many press edges we have seen in total. Fast-tap test: this must match
    // releases.
    pressCount = 0;

    // How many release edges we have seen in total.
    releaseCount = 0;

    // A 320x240 display rendered into a 960x720 buffer with nearest-neighbor upscaling,
    // locked to 60 ticks per second so the display refresh rate and the tick rate differ
    // on fast monitors.
    configure() {
        return {
            displaySize: new Vector2i(320, 240),
            drawingBufferSize: new Vector2i(960, 720),
            maxCanvasSize: new Vector2i(960, 720),
            outputUpscaleFilter: 'nearest',
            targetFPS: 60,

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

        // applyTheme() installs the twelve shared UI colors (background, panel, border,
        // text, ...) high in the palette and reports their slots, so the key caps and the
        // kit widgets all draw from one consistent theme.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);
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
                this.lastEvent = `PRESSED ${key.code}`;
                this.lastTick = BT.ticks;
                this.pressCount += 1;
            }

            if (BT.isKeyReleased(key.code)) {
                key.releaseTimer = FLASH_TICKS;
                key.pressTimer = 0;
                this.lastEvent = `RELEASED ${key.code}`;
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

    // Draws the key caps, the legend, and the kit panels.
    render() {
        BT.clear(this.theme.bg);

        // Draw every key cap first, so the kit panels below layer on top of nothing.
        for (let i = 0; i < this.keys.length; i++) {
            this.renderKey(this.keys[i]);
        }

        // The color legend stays hand-drawn: each word is printed in the actual scene
        // flash color it describes, which the kit's fixed theme roles cannot do.
        BT.systemPrint(new Vector2i(10, 173), C_LIT_HELD, 'HELD (green)');
        BT.systemPrint(new Vector2i(104, 173), C_LIT_PRESS, 'PRESS (yellow)');
        BT.systemPrint(new Vector2i(210, 173), C_LIT_RELEASE, 'RELEASE (red)');

        // Full-width title strip. The second row is contextual: touch devices get a
        // warning that the demo is pointless without a keyboard, everyone else gets the
        // fast-tap testing hint.
        ui.begin(UI_ANCHORS.TOP_BAR);
        ui.panel('BLIT386 Keyboard Diagnostic');

        if (ui.hasTouch()) {
            ui.label('This demo needs a keyboard', { color: 'warm' });
        } else {
            ui.label('Tap fast on 120 Hz - yellow flash must not skip', { color: 'dim' });
        }

        ui.end();

        // Status readout: which edge fired last, and on which engine tick.
        ui.begin(UI_ANCHORS.BOTTOM_LEFT);
        ui.panel();
        ui.kv('Last', this.lastEvent);
        ui.kv('Tick', this.lastTick === null ? '-' : this.lastTick);
        ui.end();

        // Edge counters: after a burst of fast taps both numbers must match - a mismatch
        // means an edge was dropped somewhere.
        ui.begin(UI_ANCHORS.BOTTOM_RIGHT);
        ui.panel();
        ui.kv('Presses', this.pressCount);
        ui.kv('Releases', this.releaseCount);
        ui.end();
    }

    // Draws one key cap in its current state: held wins over the press flash, which wins
    // over the release flash.
    renderKey(key) {
        const isDown = BT.isKeyDown(key.code);
        const isPressed = key.pressTimer > 0;
        const isReleased = key.releaseTimer > 0;

        // Resting keys use the shared theme's panel / dim-text colors; lit keys switch to
        // the scene flash colors with a contrasting label.
        let color = this.theme.panel;
        let textColor = this.theme.dim;

        if (isDown) {
            color = C_LIT_HELD;
            textColor = this.theme.bg;
        } else if (isPressed) {
            color = C_LIT_PRESS;
            textColor = this.theme.bg;
        } else if (isReleased) {
            color = C_LIT_RELEASE;
            textColor = this.theme.text;
        }

        const rect = new Rect2i(key.x, key.y, key.w, key.h);

        BT.drawRectFill(rect, color);
        BT.drawRect(rect, this.theme.border);

        // Center the label on the cap; the +1 nudges it down to sit optically centered.
        const labelSize = BT.systemPrintMeasure(key.label);
        const lx = key.x + Math.floor((key.w - labelSize.x) / 2);
        const ly = key.y + Math.floor((key.h - labelSize.y) / 2) + 1;

        BT.systemPrint(new Vector2i(lx, ly), textColor, key.label);
    }

    // Appends one key definition to `this.keys` with its flash timers reset to zero.
    // `x`, `y`, `w`, `h` are the cap rectangle in display pixels.
    addKey(code, label, x, y, w, h) {
        this.keys.push({ code, label, x, y, w, h, pressTimer: 0, releaseTimer: 0 });
    }

    // Lays out one row of KEYBOARD_ROWS, left to right. The running x position starts at
    // the row's startX. For each key we first honor its quirks - jump to an absolute
    // column (`x`) or skip a few extra pixels (`gapBefore`) - then place the cap and step
    // right by its width plus the standard KEY_GAP, ready for the next key.
    addKeyRow(row) {
        let x = row.startX;

        for (const key of row.keys) {
            // A fixed column wins over the flowing position (used by the arrow cluster).
            if (typeof key.x === 'number') {
                x = key.x;
            }

            // Extra breathing room before this key, like the gap between F-key clusters.
            // The ?? operator means "use the left value unless it is missing, then 0".
            x += key.gapBefore ?? 0;

            // Wide and narrow caps say so; everyone else gets the standard width.
            const w = key.w ?? KEY_WIDTH;

            this.addKey(key.code, key.label, x, row.y, w, KEY_HEIGHT);

            // Step past this cap and the standard gap so the next key lands beside it.
            x += w + KEY_GAP;
        }
    }

    // Builds the on-screen key cap list (positions only; state lives on each entry).
    initKeyboardLayout() {
        // The layout itself lives in KEYBOARD_ROWS near the top of the file; here we just
        // walk the six rows and let addKeyRow() place every cap.
        for (const row of KEYBOARD_ROWS) {
            this.addKeyRow(row);
        }
    }
}

bootstrap(Demo);
