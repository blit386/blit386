/**
 * Keyboard Diagnostic - visual keyboard with press / hold / release feedback.
 *
 * Demo 035 in the BLIT386 demo series.
 * Prerequisites: 028-Keyboard-Input (https://demos.blit386.dev/028-keyboard-input)
 *
 * Port of a standalone blit386 keyboard test: every key is drawn on screen and
 * lights up green while held, yellow on `BT.isKeyPressed` (edge), red on
 * `BT.isKeyReleased`. Use this page to verify that fast repeated taps are not
 * dropped on high-refresh displays (120 Hz monitor with `targetFPS: 60`).
 *
 * The title strip and the status readouts (last event, tick, press/release
 * counts) come from the shared UI kit; the keyboard drawing itself stays
 * hand-rolled. On touch devices the kit shows a warm notice that this demo
 * needs a physical keyboard.
 *
 * Live version: https://demos.blit386.dev/035-keyboard-diagnostic
 */

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

/**
 * @typedef {Object} KeyDef
 * @property {string} code KeyboardEvent.code string.
 * @property {string} label Short label drawn on the key cap.
 * @property {number} x Left edge in display pixels.
 * @property {number} y Top edge in display pixels.
 * @property {number} w Width in pixels.
 * @property {number} h Height in pixels.
 * @property {number} pressTimer Frames left to show the press flash.
 * @property {number} releaseTimer Frames left to show the release flash.
 */

/**
 * One key inside a row descriptor. Most keys are standard-sized and sit one key width
 * plus one KEY_GAP apart, so each entry only spells out its quirks (a wider cap, an extra gap, a jump
 * to a fixed column) and everything else falls back to the standard measurements.
 *
 * @typedef {Object} KeyRowEntry
 * @property {string} code KeyboardEvent.code string.
 * @property {string} label Short label drawn on the key cap.
 * @property {number} [w] Width in pixels, when the cap is wider or narrower than standard.
 * @property {number} [gapBefore] Extra empty pixels before this key (for cluster gaps).
 * @property {number} [x] Absolute left edge, when the key jumps to a fixed column.
 */

/**
 * One horizontal row of the on-screen keyboard picture.
 *
 * @typedef {Object} KeyRow
 * @property {number} startX Left edge of the first key in the row, in display pixels.
 * @property {number} y Top edge of every key in the row, in display pixels.
 * @property {KeyRowEntry[]} keys The keys, left to right.
 */

// Scene palette slots for the three key-cap flash states. These stay demo-owned
// (not shared UI theme colors) because the legend and the key caps must show the
// exact same green / yellow / red the diagnostic is about. Everything else (panel
// fills, borders, text) now comes from the shared UI theme installed in init().
const C_LIT_HELD = 1; // Key-cap color while BT.isKeyDown is true (green).
const C_LIT_PRESS = 2; // Key-cap color during the press flash (yellow).
const C_LIT_RELEASE = 3; // Key-cap color during the release flash (red).

/** How many fixed ticks a press or release flash stays visible. */
const FLASH_TICKS = 12;

const KEY_WIDTH = 18; // Width of a standard 1u key cap, in pixels.
const KEY_HEIGHT = 18; // Height of a standard key cap, in pixels.
const KEY_GAP = 2; // Empty space between adjacent key caps, in pixels.

/**
 * The whole keyboard picture as data: six rows of key descriptors, top to bottom.
 * addKeyRow() walks each row like laying tiles on a shelf - it keeps a running x
 * position, places a key, then moves right by the key's width plus KEY_GAP. A key
 * only needs extra fields when it breaks the pattern: `w` for wide caps (Backspace,
 * Enter, Space), `gapBefore` for the small gaps between F-key clusters, and `x`
 * when a key jumps to a fixed column (the arrow cluster on the right).
 *
 * @type {KeyRow[]}
 */
const KEYBOARD_ROWS = [
    // Function row: Esc is a little wider, and the twelve F-keys sit in three
    // clusters of four with a 6-pixel breather between clusters (F4|F5 and F8|F9).
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
    // Bottom letter row: wide left Shift, standard keys, a narrow right Shift, and
    // the up arrow pinned to its own column on the right edge.
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
            { code: 'ShiftRight', label: 'Shift', w: 14 },
            { code: 'ArrowUp', label: '^', x: 268 },
        ],
    },
    // Modifier row: every cap has its own width, and the left/down/right arrows jump
    // to a fixed column so they line up under the up arrow above.
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

/**
 * Full keyboard layout diagnostic for edge-trigger testing.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slots of the shared UI theme colors, filled by applyTheme() in init().
    /** @type {ReturnType<typeof applyTheme> | null} */
    theme = null;

    /** @type {KeyDef[]} */
    keys = [];

    /** Human-readable description of the most recent key edge, shown in the status panel. */
    lastEvent = 'press any key';

    /** Engine tick of the most recent key edge, or null before the first one. */
    lastTick = null;

    /** How many press edges we have seen in total. Fast-tap test: this must match releases. */
    pressCount = 0;

    /** How many release edges we have seen in total. */
    releaseCount = 0;

    /**
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            displaySize: new Vector2i(320, 240),
            drawingBufferSize: new Vector2i(960, 720),
            maxCanvasSize: new Vector2i(960, 720),
            outputUpscaleFilter: 'nearest',
            targetFPS: 60,
        };
    }

    /**
     * @returns {Promise<boolean>}
     */
    async init() {
        this.palette = BT.paletteCreate(256);

        // The three flash colors live in low scene slots; the legend and the key
        // caps both draw with them so the colors always match.
        this.palette.set(C_LIT_HELD, new Color32(75, 210, 120, 255));
        this.palette.set(C_LIT_PRESS, new Color32(255, 230, 80, 255));
        this.palette.set(C_LIT_RELEASE, new Color32(240, 80, 80, 255));

        // applyTheme() installs the twelve shared UI colors (background, panel,
        // border, text, ...) high in the palette and reports their slots, so the
        // key caps and the kit widgets all draw from one consistent theme.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);
        this.initKeyboardLayout();
        return true;
    }

    update() {
        // Let the UI kit track touch contacts first - ui.hasTouch() in render()
        // relies on this housekeeping running every update tick.
        ui.tick();

        for (let i = 0; i < this.keys.length; i++) {
            const key = this.keys[i];

            // Whichever edge fires most recently owns the flash: starting one flash
            // cancels the other, so a fast tap cannot let two competing countdowns
            // reach zero together and skip the release color entirely.
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

            if (key.pressTimer > 0) {
                key.pressTimer -= 1;
            }

            if (key.releaseTimer > 0) {
                key.releaseTimer -= 1;
            }
        }
    }

    render() {
        BT.clear(this.theme.bg);

        // Draw every key cap first, so the kit panels below layer on top of nothing.
        for (let i = 0; i < this.keys.length; i++) {
            this.renderKey(this.keys[i]);
        }

        // The color legend stays hand-drawn: each word is printed in the actual
        // scene flash color it describes, which the kit's fixed theme roles cannot do.
        BT.systemPrint(new Vector2i(10, 173), C_LIT_HELD, 'HELD (green)');
        BT.systemPrint(new Vector2i(104, 173), C_LIT_PRESS, 'PRESS (yellow)');
        BT.systemPrint(new Vector2i(210, 173), C_LIT_RELEASE, 'RELEASE (red)');

        // Full-width title strip. The second row is contextual: touch devices get a
        // warning that the demo is pointless without a keyboard, everyone else gets
        // the fast-tap testing hint.
        ui.begin('topBar');
        ui.panel('BLIT386 Keyboard Diagnostic');

        if (ui.hasTouch()) {
            ui.label('This demo needs a keyboard', { color: 'warm' });
        } else {
            ui.label('Tap fast on 120 Hz - yellow flash must not skip', { color: 'dim' });
        }

        ui.end();

        // Status readout: which edge fired last, and on which engine tick.
        ui.begin('bottomLeft');
        ui.panel();
        ui.kv('Last', this.lastEvent);
        ui.kv('Tick', this.lastTick === null ? '-' : this.lastTick);
        ui.end();

        // Edge counters: after a burst of fast taps both numbers must match - a
        // mismatch means an edge was dropped somewhere.
        ui.begin('bottomRight');
        ui.panel();
        ui.kv('Presses', this.pressCount);
        ui.kv('Releases', this.releaseCount);
        ui.end();
    }

    /**
     * @param {KeyDef} key
     */
    renderKey(key) {
        const isDown = BT.isKeyDown(key.code);
        const isPressed = key.pressTimer > 0;
        const isReleased = key.releaseTimer > 0;

        // Resting keys use the shared theme's panel / dim-text colors; lit keys
        // switch to the scene flash colors with a contrasting label.
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

        const labelSize = BT.systemPrintMeasure(key.label);
        const lx = key.x + Math.floor((key.w - labelSize.x) / 2);
        const ly = key.y + Math.floor((key.h - labelSize.y) / 2) + 1;

        BT.systemPrint(new Vector2i(lx, ly), textColor, key.label);
    }

    /**
     * Appends one key definition to `this.keys` with its flash timers reset to zero.
     *
     * @param {string} code KeyboardEvent.code string.
     * @param {string} label Short label drawn on the key cap.
     * @param {number} x Left edge in display pixels.
     * @param {number} y Top edge in display pixels.
     * @param {number} w Width in pixels.
     * @param {number} h Height in pixels.
     */
    addKey(code, label, x, y, w, h) {
        this.keys.push({ code, label, x, y, w, h, pressTimer: 0, releaseTimer: 0 });
    }

    /**
     * Lays out one row of key caps from its descriptor, left to right.
     *
     * The running x position starts at the row's startX. For each key we first honor
     * its quirks - jump to an absolute column (`x`) or skip a few extra pixels
     * (`gapBefore`) - then place the cap and step right by its width plus the
     * standard KEY_GAP, ready for the next key.
     *
     * @param {KeyRow} row One entry of KEYBOARD_ROWS.
     */
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

    /** Builds the on-screen key cap list (positions only; state lives on each KeyDef). */
    initKeyboardLayout() {
        // The layout itself lives in KEYBOARD_ROWS near the top of the file; here we
        // just walk the six rows and let addKeyRow() place every cap.
        for (const row of KEYBOARD_ROWS) {
            this.addKeyRow(row);
        }
    }
}

bootstrap(Demo);
