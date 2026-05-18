// Input Map Remapping Demo - runtime `BT.inputMap` and `BT.inputMapReset`.
//
// Demo 030 in the Blit-Tech demo series.
// Prerequisites: 001-Basics, 028-Keyboard-Input (face buttons vs raw keys).
//
// The engine stores **two** runtime keyboard tables (players 0 and 1). Each
// **face button** (`BT.BTN_UP` through `BT.BTN_SELECT`) can list zero or more
// `KeyboardEvent.code` strings. If **any** listed key is held, the logical
// button counts as down (OR). This demo switches **presets** with number keys
// so you can feel defaults, a custom map, and a **cleared** binding.
//
// Important: `BT.keyDown('KeyW')` only watches the real W key. Changing the map
// does not rename keys - it changes which keys feed **face buttons** through
// `BT.buttonDown(BT.BTN_*, player)`.
//
// Try this:
// - Press **1** for built-in defaults (`BT.inputMapReset()`).
// - Press **2** for a custom layout (see on-screen text).
// - Press **3** to clear player 0's A button until you pick another preset.
// - Press **0** or **R** anytime to restore defaults (same idea as **1**).
// - Click the canvas if preset keys stop responding (focus left the page).

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

const C_WHITE = 1;
const C_BG = 2;
const C_AMBER = 3;
const C_DIM = 4;
const C_LIT = 5;
const C_PANEL = 6;
const C_PANEL_BORDER = 7;
const C_ACCENT = 8;

// Layout for a 640x480 logical framebuffer (set in configure(); wider than engine default).
const DISPLAY_W = 640;
const DISPLAY_H = 480;
const MARGIN_X = 24;
const GAP_PANELS = 24;
// Two equal columns: margin + panel + gap + panel + margin == DISPLAY_W.
const PANEL_W = Math.floor((DISPLAY_W - 2 * MARGIN_X - GAP_PANELS) / 2);
const PANEL_H = 118;
const PANEL0_X = MARGIN_X;
const PANEL1_X = MARGIN_X + PANEL_W + GAP_PANELS;

const HEADER_TITLE_Y = 18;
const HEADER_SUB_Y = 36;
const HEADER_PRESET_Y = 56;
const HEADER_KEYS_Y = 76;
const PANEL_TOP_Y = 100;
const FOOTER_Y = DISPLAY_H - 18;

// Horizontal step between face-button labels (eight buttons fit inside `PANEL_W` padding).
const FACE_SLOT_WIDTH = 32;

/** @type {Array<{ label: string, code: number }>} */
const FACE_ROW_ALL = [
    { label: 'Up', code: BT.BTN_UP },
    { label: 'Dn', code: BT.BTN_DOWN },
    { label: 'Lf', code: BT.BTN_LEFT },
    { label: 'Rt', code: BT.BTN_RIGHT },
    { label: 'A', code: BT.BTN_A },
    { label: 'B', code: BT.BTN_B },
    { label: 'St', code: BT.BTN_START },
    { label: 'Sl', code: BT.BTN_SELECT },
];

// #endregion

// #region Demo Class

/**
 * Cycles keyboard face-button maps with `BT.inputMap` / `BT.inputMapReset`.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    palette = null;

    // Human-readable name for the active preset (we track it ourselves - the
    // engine does not expose a "get current map" API).
    presetLabel = '1 Defaults (engine tables)';

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Wider logical canvas than `defaultConfig()` so two panels of key maps fit comfortably.
     *
     * @returns {{displaySize: Vector2i, canvasDisplaySize: Vector2i, targetFPS: number}}
     */
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            canvasDisplaySize: new Vector2i(DISPLAY_W * 2, DISPLAY_H * 2),
            targetFPS: 60,
        };
    }

    /**
     * Palette setup and a clean slate for keyboard maps when the page loads.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
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

        // Copy fresh maps from `BT.DEFAULT_KEYBOARD_PLAYER1` / `...PLAYER2`
        // so hot reload or revisiting this URL does not inherit another demo's edits.
        BT.inputMapReset();
        this.presetLabel = '1 Defaults (engine tables)';

        return true;
    }

    /**
     * Watch for preset keys on the **first frame** each key goes down.
     */
    update() {
        // Each branch calls a small helper so `update()` stays easy to read.
        // `keyPressed` without a repeat rate only fires once per physical press.
        if (BT.keyPressed('Digit1')) {
            this.applyPresetDefaults();
        }

        if (BT.keyPressed('Digit2')) {
            this.applyPresetCustom();
        }

        if (BT.keyPressed('Digit3')) {
            this.applyPresetClearPlayer0A();
        }

        if (BT.keyPressed('Digit0') || BT.keyPressed('KeyR')) {
            this.applyPresetDefaults();
        }
    }

    /**
     * Draw panels and status text.
     */
    render() {
        BT.clear(C_BG);

        BT.systemPrint(new Vector2i(MARGIN_X, HEADER_TITLE_Y), C_WHITE, 'Blit-Tech - Input Map Remapping');
        BT.systemPrint(
            new Vector2i(MARGIN_X, HEADER_SUB_Y),
            C_DIM,
            'Face buttons use BT.buttonDown(BTN_*, player). Remap at runtime with BT.inputMap / BT.inputMapReset.',
        );

        BT.systemPrint(new Vector2i(MARGIN_X, HEADER_PRESET_Y), C_ACCENT, this.presetLabel);

        BT.systemPrint(
            new Vector2i(MARGIN_X, HEADER_KEYS_Y),
            C_DIM,
            'Keys: 1 default | 2 custom | 3 clear P0 A | 0 or R reset | click canvas if keys stop',
        );

        this.renderPlayerPanel(0, PANEL0_X, PANEL_TOP_Y);
        this.renderPlayerPanel(1, PANEL1_X, PANEL_TOP_Y);

        BT.systemPrint(new Vector2i(MARGIN_X, FOOTER_Y), C_DIM, `FPS: ${BT.targetFPS} | Ticks: ${BT.ticks}`);
    }

    // #endregion

    // #region Presets

    /**
     * Restore the shipped tables (`BT.DEFAULT_KEYBOARD_PLAYER1` / PLAYER2 copies).
     */
    applyPresetDefaults() {
        BT.inputMapReset();
        this.presetLabel = '1 Defaults (BT.inputMapReset)';
    }

    /**
     * Custom layout: remap a few buttons, and give **two** keys for one direction
     * so either key counts (OR) - hold Q **or** E and player 0 left should light.
     */
    applyPresetCustom() {
        // Start from known defaults, then layer edits (order matters only for clarity).
        BT.inputMapReset();

        // Player 0: A is **Z** only for this preset (Space no longer maps here until reset).
        BT.inputMap(0, BT.BTN_A, 'KeyZ');

        // Player 1: move **up** to **I** so arrow keys no longer drive UP for this preset
        // until we reset (we replace the whole key list for that button).
        BT.inputMap(1, BT.BTN_UP, 'KeyI');

        // Player 0: LEFT listens to **two** keys at once - first **or** second held counts.
        BT.inputMap(0, BT.BTN_LEFT, 'KeyQ', 'KeyE');

        this.presetLabel = '2 Custom (P0: Z=A, Q|E=Lft | P1: I=Up)';
    }

    /**
     * Defaults everywhere, then **remove** keyboard bindings for player 0's A button.
     * Passing **no** key strings clears that slot until you map again.
     */
    applyPresetClearPlayer0A() {
        BT.inputMapReset();
        // Empty rest arguments -> empty list stored -> no key lights BTN_A for player 0.
        BT.inputMap(0, BT.BTN_A);
        this.presetLabel = '3 Cleared P0 A (BT.inputMap(0, BTN_A) with no keys)';
    }

    // #endregion

    // #region Rendering Helpers

    /**
     * One player's panel: title, hint, two rows of face-button pips.
     *
     * @param {number} player - 0 or 1.
     * @param {number} originX - Left edge (pixels).
     * @param {number} originY - Top edge (pixels).
     */
    renderPlayerPanel(player, originX, originY) {
        const title = player === 0 ? 'Player 0' : 'Player 1';
        const hintLine1 =
            player === 0
                ? 'Default keys: W, A, S, D, Space or B=A, N=B, 5=Start, Esc=Select'
                : 'Default keys: arrows, ; or 1=A, quote or 2=B';
        const hintLine2 = player === 0 ? '' : 'Backspace or Numpad / = Start';

        BT.drawRectFill(new Rect2i(originX, originY, PANEL_W, PANEL_H), C_PANEL);
        BT.drawRect(new Rect2i(originX, originY, PANEL_W, PANEL_H), C_PANEL_BORDER);

        const pad = 8;
        BT.systemPrint(new Vector2i(originX + pad, originY + pad), C_AMBER, title);
        BT.systemPrint(new Vector2i(originX + pad, originY + pad + 14), C_DIM, hintLine1);

        if (hintLine2.length > 0) {
            BT.systemPrint(new Vector2i(originX + pad, originY + pad + 28), C_DIM, hintLine2);
        }

        // One horizontal row of face buttons uses the wider panel cleanly (320-wide layouts needed two rows).
        this.renderFaceRow(FACE_ROW_ALL, player, originX + pad, originY + pad + 52);
    }

    /**
     * @param {Array<{ label: string, code: number }>} row
     * @param {number} player
     * @param {number} x
     * @param {number} y
     */
    renderFaceRow(row, player, x, y) {
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

    // #endregion
}

// #endregion

// #region App Lifecycle

bootstrap(Demo);

// #endregion
