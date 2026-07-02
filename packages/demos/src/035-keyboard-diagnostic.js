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

const C_BG = 1;
const C_PANEL = 2;
const C_BORDER = 3;
const C_WHITE = 4;
const C_AMBER = 5;
const C_DIM = 6;
const C_LIT_HELD = 7;
const C_LIT_PRESS = 8;
const C_LIT_RELEASE = 9;

/** How many fixed ticks a press or release flash stays visible. */
const FLASH_TICKS = 12;

const KEY_WIDTH = 18;
const KEY_HEIGHT = 18;
const KEY_GAP = 2;
const KEY_PITCH = KEY_WIDTH + KEY_GAP;

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

    /** Builds the on-screen key cap list (positions only; state lives on each KeyDef). */
    initKeyboardLayout() {
        this.keys.push({
            code: 'Escape',
            label: 'Esc',
            x: 10,
            y: 50,
            w: 22,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });

        const fKeys = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];

        for (let i = 0; i < fKeys.length; i++) {
            let offset = 0;

            if (i >= 4) {
                offset += 6;
            }

            if (i >= 8) {
                offset += 6;
            }

            this.keys.push({
                code: fKeys[i],
                label: fKeys[i],
                x: 38 + i * KEY_PITCH + offset,
                y: 50,
                w: KEY_WIDTH,
                h: KEY_HEIGHT,
                pressTimer: 0,
                releaseTimer: 0,
            });
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
            this.keys.push({
                code: numberRow[i].code,
                label: numberRow[i].label,
                x: 10 + i * KEY_PITCH,
                y: 72,
                w: KEY_WIDTH,
                h: KEY_HEIGHT,
                pressTimer: 0,
                releaseTimer: 0,
            });
        }

        this.keys.push({
            code: 'Backspace',
            label: 'Back',
            x: 10 + numberRow.length * KEY_PITCH,
            y: 72,
            w: 38,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });

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

        this.keys.push({
            code: 'Tab',
            label: 'Tab',
            x: 10,
            y: 92,
            w: 27,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });

        for (let i = 0; i < qwerty.length; i++) {
            this.keys.push({
                code: qwerty[i].code,
                label: qwerty[i].label,
                x: 39 + i * KEY_PITCH,
                y: 92,
                w: qwerty[i].code === 'Backslash' ? 29 : KEY_WIDTH,
                h: KEY_HEIGHT,
                pressTimer: 0,
                releaseTimer: 0,
            });
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

        this.keys.push({
            code: 'CapsLock',
            label: 'Caps',
            x: 10,
            y: 112,
            w: 32,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });

        for (let i = 0; i < asdf.length; i++) {
            this.keys.push({
                code: asdf[i].code,
                label: asdf[i].label,
                x: 44 + i * KEY_PITCH,
                y: 112,
                w: KEY_WIDTH,
                h: KEY_HEIGHT,
                pressTimer: 0,
                releaseTimer: 0,
            });
        }

        this.keys.push({
            code: 'Enter',
            label: 'Enter',
            x: 44 + asdf.length * KEY_PITCH,
            y: 112,
            w: 44,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });

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

        this.keys.push({
            code: 'ShiftLeft',
            label: 'Shift',
            x: 10,
            y: 132,
            w: 42,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });

        for (let i = 0; i < bottomRowKeys.length; i++) {
            this.keys.push({
                code: bottomRowKeys[i].code,
                label: bottomRowKeys[i].label,
                x: 54 + i * KEY_PITCH,
                y: 132,
                w: KEY_WIDTH,
                h: KEY_HEIGHT,
                pressTimer: 0,
                releaseTimer: 0,
            });
        }

        this.keys.push({
            code: 'ShiftRight',
            label: 'Shift',
            x: 54 + bottomRowKeys.length * KEY_PITCH,
            y: 132,
            w: 14,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });

        this.keys.push({
            code: 'ArrowUp',
            label: '^',
            x: 268,
            y: 132,
            w: KEY_WIDTH,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });

        this.keys.push({
            code: 'ControlLeft',
            label: 'Ctrl',
            x: 10,
            y: 152,
            w: 24,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });
        this.keys.push({
            code: 'MetaLeft',
            label: 'Win',
            x: 36,
            y: 152,
            w: 18,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });
        this.keys.push({
            code: 'AltLeft',
            label: 'Alt',
            x: 56,
            y: 152,
            w: 18,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });
        this.keys.push({
            code: 'Space',
            label: 'Space',
            x: 76,
            y: 152,
            w: 96,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });
        this.keys.push({
            code: 'AltRight',
            label: 'Alt',
            x: 174,
            y: 152,
            w: 18,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });
        this.keys.push({
            code: 'MetaRight',
            label: 'Win',
            x: 194,
            y: 152,
            w: 18,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });
        this.keys.push({
            code: 'ControlRight',
            label: 'Ctrl',
            x: 214,
            y: 152,
            w: 24,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });
        this.keys.push({
            code: 'ArrowLeft',
            label: '<',
            x: 248,
            y: 152,
            w: KEY_WIDTH,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });
        this.keys.push({
            code: 'ArrowDown',
            label: 'v',
            x: 268,
            y: 152,
            w: KEY_WIDTH,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });
        this.keys.push({
            code: 'ArrowRight',
            label: '>',
            x: 288,
            y: 152,
            w: KEY_WIDTH,
            h: KEY_HEIGHT,
            pressTimer: 0,
            releaseTimer: 0,
        });
    }

    update() {
        for (let i = 0; i < this.keys.length; i++) {
            const key = this.keys[i];

            if (BT.isKeyPressed(key.code)) {
                key.pressTimer = FLASH_TICKS;
                this.lastActionMessage = `[PRESSED] code: "${key.code}" at tick ${BT.ticks}`;
            }

            if (BT.isKeyReleased(key.code)) {
                key.releaseTimer = FLASH_TICKS;
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
}

bootstrap(Demo);
