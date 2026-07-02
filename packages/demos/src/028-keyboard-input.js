/**
 * Keyboard Input Demo - face buttons, raw keys, and typed text.
 *
 * Demo 028 in the BLIT386 demo series.
 * Prerequisites:
 *   001-Basics        https://demos.blit386.dev/001-basics
 *   025-Pointer Basics https://demos.blit386.dev/025-pointer-basics
 *
 * Live version: https://demos.blit386.dev/028-keyboard-input
 *
 * This page shows three layers of keyboard support:
 * - Face buttons (BT.BTN_UP through BT.BTN_SELECT) for players 0 and 1. Each
 *   button can map to one or more physical keys. The engine uses
 *   KeyboardEvent.code strings (like KeyW, ArrowUp) so labels stay the
 *   same even when the OS keyboard layout changes (unlike event.key, which
 *   might print different letters).
 * - Raw keys (BT.isKeyDown, BT.isKeyPressed, BT.isKeyReleased) when you need
 *   a specific key, optional fixed-tick repeats with BT.isKeyPressed(code, rate),
 *   and release edges.
 * - Text input (BT.inputString) for characters in one frame. The buffer
 *   clears after each frame, so read it during update() or render() in that
 *   same frame.
 *
 * Try this:
 * - Hold W, A, S, D and Space / N on player 1; arrow keys and ; ' on player 2.
 * - Tap the same letter repeatedly and watch the press counter climb (edge-only
 *   BT.isKeyPressed, no repeat rate). Press a different key and the counter resets.
 * - Hold Q to see isKeyDown; tap F and watch the release line.
 * - Type letters into the buffer line at the bottom.
 * - If keys stop responding, click the canvas - focus may have moved to another
 *   part of the page after you tabbed away.
 */

// @pageTitle BLIT386 Demo 028 - Keyboard Input

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// Palette indices. Slot 0 stays transparent for indexed draws we do not use here.
const C_WHITE = 1;
const C_BG = 2;
const C_AMBER = 3;
const C_DIM = 4;
const C_LIT = 5;
const C_PANEL = 6;
const C_PANEL_BORDER = 7;
const C_ACCENT = 8;

// How many characters we keep in the typed-text demo line (rolling window).
const TYPED_BUFFER_MAX = 80;

// Keys the press counter listens to (KeyboardEvent.code strings).
const PRESS_COUNTER_KEYS = [
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `Key${letter}`),
    'Space',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
];

// Horizontal spacing for face-button pips so four fit inside each 148px-wide panel.
const FACE_SLOT_WIDTH = 34;

/**
 * Turns `KeyH` into `H`, `Digit5` into `5`, and leaves other codes readable.
 *
 * @param {string} code - KeyboardEvent.code value.
 * @returns {string}
 */
function formatKeyCode(code) {
    if (code.startsWith('Key')) {
        return code.slice(3);
    }

    if (code.startsWith('Digit')) {
        return code.slice(5);
    }

    return code;
}

/**
 * Shows keyboard face-button maps, low-level key queries, and `inputString`.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Set when `BT.isKeyReleased('KeyF')` is true this frame (plain English message).
    lastFReleaseMessage = 'Tap F to see isKeyReleased';

    /** @type {string | null} KeyboardEvent.code for the key we are counting presses on. */
    activePressKey = null;

    // How many edge-only `BT.isKeyPressed` events fired for `activePressKey` this run.
    keyPressCount = 0;

    // Text built from `BT.inputString` over time (capped).
    typedBuffer = '';

    /**
     * Timing chart on so key-release milestones show on the overlay HUD.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_DIM,
                renderBarPaletteIndex: C_WHITE,
                tagPaletteIndex: C_ACCENT,
            },
        };
    }

    /**
     * Allocate palette colours once at startup.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        // inputMapReset() restores the engine's default player-1 / player-2 key bindings.
        // Other demos (for example input-map remapping) may change those maps; we reset here
        // so W/A/S/D and arrow keys always match what this page describes.
        BT.inputMapReset();

        this.palette = BT.paletteCreate(256);

        this.palette.set(C_WHITE, new Color32(255, 255, 255));
        this.palette.set(C_BG, new Color32(18, 22, 38));
        this.palette.set(C_AMBER, new Color32(255, 200, 120));
        this.palette.set(C_DIM, new Color32(130, 140, 160));
        this.palette.set(C_LIT, new Color32(120, 255, 160));
        this.palette.set(C_PANEL, new Color32(35, 42, 62));
        this.palette.set(C_PANEL_BORDER, new Color32(90, 98, 120));
        this.palette.set(C_ACCENT, new Color32(255, 140, 90));

        BT.paletteSet(this.palette);
        return true;
    }

    /**
     * Read keyboard state after the engine has updated input for this tick.
     */
    update() {
        // --- Raw keys (KeyboardEvent.code strings, layout-independent) ---
        //
        // BT.isKeyDown(code)     = true EVERY tick while the key is held (like holding a door shut).
        // BT.isKeyPressed(code)  = true only on the FIRST tick the key goes down (one-shot "tap").
        // BT.isKeyPressed(code, repeatTicks) = first tick down, then again every repeatTicks fixed
        //     engine ticks while still held (repeat on the game clock, not the OS key-repeat rate).
        // BT.isKeyReleased(code) = true only on the FIRST tick the key comes up (one-shot "let go").
        //
        // Face buttons (BT.BTN_UP, BT.isDown, …) are separate: they go through the input map.
        // Use raw keys when you need a specific key regardless of player slot or remapping.

        // Release edge for F: fires once when you let go of F.
        if (BT.isKeyReleased('KeyF')) {
            const tick = BT.ticks;
            this.lastFReleaseMessage = `isKeyReleased(KeyF) at tick ${tick}`;
            BT.assignTag('Key F released');
        }

        // Q held: we only read isKeyDown in render() for a live true/false label (no state here).

        // Edge-only press counter: tap the same key to climb; another key resets to 1.
        for (let i = 0; i < PRESS_COUNTER_KEYS.length; i++) {
            const code = PRESS_COUNTER_KEYS[i];

            if (!BT.isKeyPressed(code)) {
                continue;
            }

            if (this.activePressKey === code) {
                this.keyPressCount += 1;
            } else {
                this.activePressKey = code;
                this.keyPressCount = 1;
            }

            break;
        }

        // Text buffer
        // Characters arrive for this frame only; concat now or they are gone next frame.
        const chunk = BT.inputString;

        if (chunk.length > 0) {
            this.typedBuffer += chunk;

            if (this.typedBuffer.length > TYPED_BUFFER_MAX) {
                // Keep the most recent characters so long paste tests still show the tail.
                this.typedBuffer = this.typedBuffer.slice(-TYPED_BUFFER_MAX);
            }
        }
    }

    /**
     * Clear the frame and draw every panel.
     */
    render() {
        BT.clear(C_BG);

        BT.systemPrint(new Vector2i(8, 18), C_DIM, 'Codes use KeyboardEvent.code (KeyW, Space, …).');

        this.renderPlayerFacePanel(0, 8, 36);
        this.renderPlayerFacePanel(1, 168, 36);

        this.renderPressCounter(8, 118);
        this.renderRawKeyPanel(8, 162);
        this.renderTypedLine(8, 218);
    }

    /**
     * Draws one player's mapped face buttons as a row of lit/dim pips.
     *
     * @param {number} player - 0 or 1 (`BT.isDown` player index).
     * @param {number} originX - Left edge of the panel in display pixels.
     * @param {number} originY - Top edge of the panel.
     */
    renderPlayerFacePanel(player, originX, originY) {
        const title = player === 0 ? 'Player 0 (P1 map)' : 'Player 1 (P2 map)';
        const hints =
            player === 0
                ? 'W, A, S, D, Space or B=A, N=B, 5=Start, Esc=Select'
                : 'Arrows, ; or 1=A, quote or 2=B, Backspace or /=Start';

        // Which buttons have at least one key in the default map (skip empty slots).
        /** @type {Array<{label: string, code: number}>} */
        const buttons =
            player === 0
                ? [
                      { label: 'Up', code: BT.BTN_UP },
                      { label: 'Dn', code: BT.BTN_DOWN },
                      { label: 'Lf', code: BT.BTN_LEFT },
                      { label: 'Rt', code: BT.BTN_RIGHT },
                      { label: 'A', code: BT.BTN_A },
                      { label: 'B', code: BT.BTN_B },
                      { label: 'St', code: BT.BTN_START },
                      { label: 'Sl', code: BT.BTN_SELECT },
                  ]
                : [
                      { label: 'Up', code: BT.BTN_UP },
                      { label: 'Dn', code: BT.BTN_DOWN },
                      { label: 'Lf', code: BT.BTN_LEFT },
                      { label: 'Rt', code: BT.BTN_RIGHT },
                      { label: 'A', code: BT.BTN_A },
                      { label: 'B', code: BT.BTN_B },
                      { label: 'St', code: BT.BTN_START },
                  ];

        const map = player === 0 ? BT.DEFAULT_KEYBOARD_PLAYER1 : BT.DEFAULT_KEYBOARD_PLAYER2;
        const filtered = buttons.filter((b) => (map[b.code] ?? []).length > 0);

        BT.drawRectFill(new Rect2i(originX, originY, 148, 74), C_PANEL);
        BT.drawRect(new Rect2i(originX, originY, 148, 74), C_PANEL_BORDER);

        BT.systemPrint(new Vector2i(originX + 4, originY + 4), C_AMBER, title);
        BT.systemPrint(new Vector2i(originX + 4, originY + 16), C_DIM, hints);

        // Two rows of indicators: first half, second half.
        const mid = Math.ceil(filtered.length / 2);
        const row1 = filtered.slice(0, mid);
        const row2 = filtered.slice(mid);

        this.renderFaceButtonRow(row1, player, originX + 4, originY + 30);
        this.renderFaceButtonRow(row2, player, originX + 4, originY + 52);
    }

    /**
     * @param {Array<{label: string, code: number}>} row
     * @param {number} player
     * @param {number} x
     * @param {number} y
     */
    renderFaceButtonRow(row, player, x, y) {
        let cx = x;

        for (let i = 0; i < row.length; i++) {
            const { label, code } = row[i];
            const held = BT.isDown(code, player);
            const pip = new Rect2i(cx, y, 8, 8);

            if (held) {
                BT.drawRectFill(pip, C_LIT);
            } else {
                BT.drawRect(pip, C_PANEL_BORDER);
            }

            BT.systemPrint(new Vector2i(cx + 12, y - 2), held ? C_LIT : C_DIM, label);
            cx += FACE_SLOT_WIDTH;
        }
    }

    /**
     * Large readout for edge-only press counting on one key at a time.
     *
     * @param {number} x
     * @param {number} y
     */
    renderPressCounter(x, y) {
        BT.drawRectFill(new Rect2i(x, y, 304, 40), C_PANEL);
        BT.drawRect(new Rect2i(x, y, 304, 40), C_PANEL_BORDER);

        BT.systemPrint(new Vector2i(x + 4, y + 4), C_AMBER, 'BT.isKeyPressed(code) — press count');

        const keyLabel = this.activePressKey === null ? 'none yet' : formatKeyCode(this.activePressKey);
        const countLabel = this.activePressKey === null ? '—' : String(this.keyPressCount);

        BT.systemPrint(new Vector2i(x + 4, y + 18), C_DIM, 'Key:');
        BT.systemPrint(new Vector2i(x + 36, y + 18), this.activePressKey === null ? C_DIM : C_WHITE, keyLabel);

        BT.systemPrint(new Vector2i(x + 120, y + 18), C_DIM, 'Count:');
        BT.systemPrint(new Vector2i(x + 168, y + 18), this.keyPressCount > 0 ? C_ACCENT : C_DIM, countLabel);

        BT.systemPrint(new Vector2i(x + 4, y + 32), C_DIM, 'Tap same key to add 1. Different key resets to 1.');
    }

    /**
     * Small panel for Q down and last F release.
     *
     * @param {number} x
     * @param {number} y
     */
    renderRawKeyPanel(x, y) {
        BT.drawRectFill(new Rect2i(x, y, 304, 48), C_PANEL);
        BT.drawRect(new Rect2i(x, y, 304, 48), C_PANEL_BORDER);

        BT.systemPrint(new Vector2i(x + 4, y + 4), C_AMBER, 'Raw keys (separate from face buttons)');

        const qHeld = BT.isKeyDown('KeyQ');
        BT.systemPrint(new Vector2i(x + 4, y + 18), C_WHITE, 'BT.isKeyDown(KeyQ) - hold:');
        BT.systemPrint(new Vector2i(x + 148, y + 18), qHeld ? C_LIT : C_DIM, qHeld ? 'true (held)' : 'false');

        BT.systemPrint(new Vector2i(x + 4, y + 32), C_WHITE, 'BT.isKeyReleased(KeyF) - tap F:');
        BT.systemPrint(new Vector2i(x + 148, y + 32), C_DIM, this.lastFReleaseMessage);
    }

    /**
     * Shows text accumulated from `BT.inputString`.
     *
     * @param {number} x
     * @param {number} y
     */
    renderTypedLine(x, y) {
        BT.drawRectFill(new Rect2i(x, y, 304, 22), C_PANEL);
        BT.drawRect(new Rect2i(x, y, 304, 22), C_PANEL_BORDER);

        BT.systemPrint(new Vector2i(x + 4, y + 4), C_AMBER, 'BT.inputString (typed this session)');
        BT.systemPrint(new Vector2i(x + 4, y + 12), C_WHITE, this.typedBuffer.length > 0 ? this.typedBuffer : '…');
    }
}

bootstrap(Demo);
