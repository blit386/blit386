/**
 * Keyboard Diagnostic - visual keyboard with press / hold / release feedback.
 *
 * Demo 035 in the BLIT386 demo series.
 * Prerequisites: 028-Keyboard-Input (https://demos.blit386.dev/028-keyboard-input)
 *
 * Port of a standalone blit-tech keyboard test: every key is drawn on screen and
 * lights up green while held, yellow on `BT.isKeyPressed` (edge), red on
 * `BT.isKeyReleased`. Use this page to verify that fast repeated taps are not
 * dropped on high-refresh displays (120 Hz monitor with `targetFPS: 60`).
 *
 * Live version: https://demos.blit386.dev/035-keyboard-diagnostic
 */

// @pageTitle BLIT386 Demo 035 - Keyboard Diagnostic

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

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

const C_BG = 1; // Screen background color.
const C_PANEL = 2; // Resting key-cap color (not held, pressed, or released).
const C_BORDER = 3; // Outline color for keys and panels.
const C_WHITE = 4; // Bright text, also used for the "released" key label.
const C_AMBER = 5; // Last-action status line color.
const C_DIM = 6; // Resting key label color.
const C_LIT_HELD = 7; // Key-cap color while BT.isKeyDown is true (green).
const C_LIT_PRESS = 8; // Key-cap color during the press flash (yellow).
const C_LIT_RELEASE = 9; // Key-cap color during the release flash (red).

/** How many fixed ticks a press or release flash stays visible. */
const FLASH_TICKS = 12;

const KEY_WIDTH = 18; // Width of a standard 1u key cap, in pixels.
const KEY_HEIGHT = 18; // Height of a standard key cap, in pixels.
const KEY_GAP = 2; // Empty space between adjacent key caps, in pixels.
const KEY_PITCH = KEY_WIDTH + KEY_GAP; // Center-to-center spacing for a row of standard keys.

/**
 * Full keyboard layout diagnostic for edge-trigger testing.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    /** @type {KeyDef[]} */
    keys = [];

    lastActionMessage = 'Press any key to test...';

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
        this.palette.set(C_BG, new Color32(10, 12, 18, 255));
        this.palette.set(C_PANEL, new Color32(24, 28, 38, 255));
        this.palette.set(C_BORDER, new Color32(60, 68, 88, 255));
        this.palette.set(C_WHITE, new Color32(230, 235, 245, 255));
        this.palette.set(C_AMBER, new Color32(245, 180, 80, 255));
        this.palette.set(C_DIM, new Color32(110, 120, 140, 255));
        this.palette.set(C_LIT_HELD, new Color32(75, 210, 120, 255));
        this.palette.set(C_LIT_PRESS, new Color32(255, 230, 80, 255));
        this.palette.set(C_LIT_RELEASE, new Color32(240, 80, 80, 255));

        BT.paletteSet(this.palette);
        this.initKeyboardLayout();
        return true;
    }

    update() {
        for (let i = 0; i < this.keys.length; i++) {
            const key = this.keys[i];

            // Whichever edge fires most recently owns the flash: starting one flash
            // cancels the other, so a fast tap cannot let two competing countdowns
            // reach zero together and skip the release color entirely.
            if (BT.isKeyPressed(key.code)) {
                key.pressTimer = FLASH_TICKS;
                key.releaseTimer = 0;
                this.lastActionMessage = `[PRESSED] code: "${key.code}" at tick ${BT.ticks}`;
            }

            if (BT.isKeyReleased(key.code)) {
                key.releaseTimer = FLASH_TICKS;
                key.pressTimer = 0;
                this.lastActionMessage = `[RELEASED] code: "${key.code}" at tick ${BT.ticks}`;
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
        BT.clear(C_BG);

        BT.systemPrint(new Vector2i(10, 10), C_WHITE, 'BLIT386 KEYBOARD DIAGNOSTIC');
        BT.systemPrint(new Vector2i(10, 20), C_DIM, 'Tap fast on 120 Hz — yellow flash must not skip');

        BT.systemPrint(new Vector2i(10, 185), C_LIT_HELD, 'HELD (Green)');
        BT.systemPrint(new Vector2i(110, 185), C_LIT_PRESS, 'TRANS_PRESS (Yellow)');
        BT.systemPrint(new Vector2i(230, 185), C_LIT_RELEASE, 'TRANS_RELEASE (Red)');

        BT.drawRectFill(new Rect2i(10, 205, 300, 20), C_PANEL);
        BT.drawRect(new Rect2i(10, 205, 300, 20), C_BORDER);
        BT.systemPrint(new Vector2i(16, 211), C_AMBER, this.lastActionMessage);

        for (let i = 0; i < this.keys.length; i++) {
            this.renderKey(this.keys[i]);
        }
    }

    /**
     * @param {KeyDef} key
     */
    renderKey(key) {
        const isDown = BT.isKeyDown(key.code);
        const isPressed = key.pressTimer > 0;
        const isReleased = key.releaseTimer > 0;

        let color = C_PANEL;
        let textColor = C_DIM;

        if (isDown) {
            color = C_LIT_HELD;
            textColor = C_BG;
        } else if (isPressed) {
            color = C_LIT_PRESS;
            textColor = C_BG;
        } else if (isReleased) {
            color = C_LIT_RELEASE;
            textColor = C_WHITE;
        }

        const rect = new Rect2i(key.x, key.y, key.w, key.h);
        BT.drawRectFill(rect, color);
        BT.drawRect(rect, C_BORDER);

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

    /** Builds the on-screen key cap list (positions only; state lives on each KeyDef). */
    initKeyboardLayout() {
        this.addKey('Escape', 'Esc', 10, 50, 22, KEY_HEIGHT);

        const fKeys = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];

        for (let i = 0; i < fKeys.length; i++) {
            let offset = 0;

            if (i >= 4) {
                offset += 6;
            }

            if (i >= 8) {
                offset += 6;
            }

            this.addKey(fKeys[i], fKeys[i], 38 + i * KEY_PITCH + offset, 50, KEY_WIDTH, KEY_HEIGHT);
        }

        const numberRow = [
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
        ];

        for (let i = 0; i < numberRow.length; i++) {
            this.addKey(numberRow[i].code, numberRow[i].label, 10 + i * KEY_PITCH, 72, KEY_WIDTH, KEY_HEIGHT);
        }

        this.addKey('Backspace', 'Back', 10 + numberRow.length * KEY_PITCH, 72, 38, KEY_HEIGHT);

        const qwerty = [
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
            { code: 'Backslash', label: '\\' },
        ];

        this.addKey('Tab', 'Tab', 10, 92, 27, KEY_HEIGHT);

        for (let i = 0; i < qwerty.length; i++) {
            const w = qwerty[i].code === 'Backslash' ? 29 : KEY_WIDTH;
            this.addKey(qwerty[i].code, qwerty[i].label, 39 + i * KEY_PITCH, 92, w, KEY_HEIGHT);
        }

        const asdf = [
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
        ];

        this.addKey('CapsLock', 'Caps', 10, 112, 32, KEY_HEIGHT);

        for (let i = 0; i < asdf.length; i++) {
            this.addKey(asdf[i].code, asdf[i].label, 44 + i * KEY_PITCH, 112, KEY_WIDTH, KEY_HEIGHT);
        }

        this.addKey('Enter', 'Enter', 44 + asdf.length * KEY_PITCH, 112, 44, KEY_HEIGHT);

        const bottomRowKeys = [
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
        ];

        this.addKey('ShiftLeft', 'Shift', 10, 132, 42, KEY_HEIGHT);

        for (let i = 0; i < bottomRowKeys.length; i++) {
            this.addKey(bottomRowKeys[i].code, bottomRowKeys[i].label, 54 + i * KEY_PITCH, 132, KEY_WIDTH, KEY_HEIGHT);
        }

        this.addKey('ShiftRight', 'Shift', 54 + bottomRowKeys.length * KEY_PITCH, 132, 14, KEY_HEIGHT);
        this.addKey('ArrowUp', '^', 268, 132, KEY_WIDTH, KEY_HEIGHT);

        this.addKey('ControlLeft', 'Ctrl', 10, 152, 24, KEY_HEIGHT);
        this.addKey('MetaLeft', 'Win', 36, 152, 18, KEY_HEIGHT);
        this.addKey('AltLeft', 'Alt', 56, 152, 18, KEY_HEIGHT);
        this.addKey('Space', 'Space', 76, 152, 96, KEY_HEIGHT);
        this.addKey('AltRight', 'Alt', 174, 152, 18, KEY_HEIGHT);
        this.addKey('MetaRight', 'Win', 194, 152, 18, KEY_HEIGHT);
        this.addKey('ControlRight', 'Ctrl', 214, 152, 24, KEY_HEIGHT);
        this.addKey('ArrowLeft', '<', 248, 152, KEY_WIDTH, KEY_HEIGHT);
        this.addKey('ArrowDown', 'v', 268, 152, KEY_WIDTH, KEY_HEIGHT);
        this.addKey('ArrowRight', '>', 288, 152, KEY_WIDTH, KEY_HEIGHT);
    }
}

bootstrap(Demo);
