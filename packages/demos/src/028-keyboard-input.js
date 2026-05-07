// Keyboard Input Demo -- face buttons, raw keys, and typed text.
//
// Demo 028 in the Blit-Tech demo series.
// Prerequisites: 001-Basics, 025-Pointer-Basics (pointer vs keyboard).
//
// This page shows three layers of keyboard support:
// - **Face buttons** (`BT.BTN_UP` … `BT.BTN_SELECT`) for players 0 and 1. Each
//   button can map to one or more physical keys. The engine uses
//   `KeyboardEvent.code` strings (like `KeyW`, `ArrowUp`) so labels stay the
//   same even when the OS keyboard layout changes (unlike `event.key`, which
//   might print different letters).
// - **Raw keys** (`BT.keyDown`, `BT.keyPressed`, `BT.keyReleased`) when you need
//   a specific key, optional fixed-tick repeats with `BT.keyPressed(code, rate)`,
//   and release edges.
// - **Text input** (`BT.inputString()`) for characters in one frame. The buffer
//   clears after each frame, so read it during `update()` or `render()` in that
//   same frame.
//
// Try this:
// - Hold W, A, S, D and Space / N on player 1; arrow keys and ; ' on player 2.
// - Hold **Q** to see `keyDown`; tap **F** and watch the release line.
// - Hold **H** to see `keyPressed(..., 15)` fire on an edge and then every 15 ticks.
// - Type letters into the buffer line at the bottom.
// - If keys stop responding, click the canvas — focus may have moved to another
//   part of the page after you tabbed away.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

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

// For `BT.keyPressed('KeyH', repeatRate)`, repeats happen every this many fixed ticks.
const KEY_H_REPEAT_TICKS = 15;

// Horizontal spacing for face-button pips so four fit inside each 148px-wide panel.
const FACE_SLOT_WIDTH = 34;

// #endregion

// #region Demo Class

/**
 * Shows keyboard face-button maps, low-level key queries, and `inputString`.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    palette = null;

    // Set when `BT.keyReleased('KeyF')` is true this frame (plain English message).
    lastFReleaseMessage = 'Tap F to see keyReleased';

    // Running count of how many times `BT.keyPressed('KeyH', …)` was true this run
    // (initial edge plus tick repeats). Resets when H is not pressed for a moment — we
    // just show the count while testing; a simple visual for repeat firing.
    hPressStreak = 0;

    // Text built from `BT.inputString()` over time (capped).
    typedBuffer = '';

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Match other recent demos: low-res frame, 2x canvas, 60 FPS fixed ticks.
     *
     * @returns {{displaySize: Vector2i, canvasDisplaySize: Vector2i, targetFPS: number}}
     */
    queryHardware() {
        return {
            displaySize: new Vector2i(320, 240),
            canvasDisplaySize: new Vector2i(640, 480),
            targetFPS: 60,
        };
    }

    /**
     * Allocate palette colours once at startup.
     *
     * @returns {Promise<boolean>}
     */
    async initialize() {
        // Start from default keyboard maps so this demo does not inherit remaps from others.
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
        // --- Raw key: release edge for F ---
        // `keyReleased` is true only on the frame the key goes up, like a doorbell
        // when you let go.
        if (BT.keyReleased('KeyF')) {
            const tick = BT.ticks();
            this.lastFReleaseMessage = `keyReleased(KeyF) at tick ${tick}`;
        }

        // --- Raw key: Q held ---
        // We only use this boolean inside render for a label; no state needed.

        // --- Raw key: H with fixed tick repeat ---
        // `keyPressed` with a second number repeats every N ticks after the first
        // press (same clock as `BT.ticks()`).
        if (BT.keyPressed('KeyH', KEY_H_REPEAT_TICKS)) {
            this.hPressStreak += 1;
        }

        if (!BT.keyDown('KeyH')) {
            // When H is not held, reset the streak so the number matches a new try.
            this.hPressStreak = 0;
        }

        // --- Text buffer ---
        // Characters arrive for this frame only; concat now or they are gone next frame.
        const chunk = BT.inputString();

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

        BT.systemPrint(new Vector2i(8, 4), C_WHITE, 'Blit-Tech - Keyboard Input');
        BT.systemPrint(new Vector2i(8, 18), C_DIM, 'Codes use KeyboardEvent.code (KeyW, Space, …).');

        this.renderPlayerFacePanel(0, 8, 36);
        this.renderPlayerFacePanel(1, 168, 36);

        this.renderRawKeyPanel(8, 118);
        this.renderTypedLine(8, 198);

        BT.systemPrint(
            new Vector2i(8, 226),
            C_DIM,
            `FPS: ${BT.fps()} | Ticks: ${BT.ticks()} | Click canvas if keys stop.`,
        );
    }

    // #endregion

    // #region Rendering Helpers

    /**
     * Draws one player's mapped face buttons as a row of lit/dim pips.
     *
     * @param {number} player - 0 or 1 (`BT.buttonDown` player index).
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
            const held = BT.buttonDown(code, player);
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
     * Small panel for Q down, H repeat streak, and last F release.
     *
     * @param {number} x
     * @param {number} y
     */
    renderRawKeyPanel(x, y) {
        BT.drawRectFill(new Rect2i(x, y, 304, 72), C_PANEL);
        BT.drawRect(new Rect2i(x, y, 304, 72), C_PANEL_BORDER);

        BT.systemPrint(new Vector2i(x + 4, y + 4), C_AMBER, 'Raw keys (separate from face buttons)');

        const qHeld = BT.keyDown('KeyQ');
        BT.systemPrint(new Vector2i(x + 4, y + 18), C_WHITE, 'BT.keyDown(KeyQ):');
        BT.systemPrint(new Vector2i(x + 120, y + 18), qHeld ? C_LIT : C_DIM, qHeld ? 'true (held)' : 'false');

        BT.systemPrint(new Vector2i(x + 4, y + 32), C_WHITE, `BT.keyPressed(KeyH, ${KEY_H_REPEAT_TICKS}):`);
        BT.systemPrint(
            new Vector2i(x + 4, y + 44),
            C_DIM,
            'fires on first press and every N ticks while held; streak count:',
        );
        BT.systemPrint(new Vector2i(x + 220, y + 44), this.hPressStreak > 0 ? C_ACCENT : C_DIM, `${this.hPressStreak}`);

        BT.systemPrint(new Vector2i(x + 4, y + 58), C_WHITE, this.lastFReleaseMessage);
    }

    /**
     * Shows text accumulated from `BT.inputString()`.
     *
     * @param {number} x
     * @param {number} y
     */
    renderTypedLine(x, y) {
        BT.drawRectFill(new Rect2i(x, y, 304, 22), C_PANEL);
        BT.drawRect(new Rect2i(x, y, 304, 22), C_PANEL_BORDER);

        BT.systemPrint(new Vector2i(x + 4, y + 4), C_AMBER, 'BT.inputString() (typed this session)');
        BT.systemPrint(new Vector2i(x + 4, y + 12), C_WHITE, this.typedBuffer.length > 0 ? this.typedBuffer : '…');
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

bootstrap(Demo);

// #endregion
