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
 * - Text input (BT.inputString) for characters in one frame. The buffer clears
 *   once per fixed-update tick, and that tick always finishes before render()
 *   runs, so read it in update(), not render(), or you can miss characters.
 *
 * The panels and readouts are drawn with the shared demo UI kit (src/shared/ui.js),
 * so this page looks like every other demo in the series. The inputs themselves stay
 * deliberately keyboard-only - there is no touch stand-in for a physical keyboard,
 * so on a touch device the page shows a "needs a keyboard" notice instead.
 *
 * Try this:
 * - Hold W, A, S, D and Space / N on player 1; arrow keys and ; ' on player 2.
 * - Tap the same letter repeatedly and watch the press counter climb (edge-only
 *   BT.isKeyPressed, no repeat rate). Press a different key and the counter resets.
 * - Hold Q to see isKeyDown; tap F and watch the release readout.
 * - Type letters into the buffer line at the bottom.
 * - If keys stop responding, click the canvas - focus may have moved to another
 *   part of the page after you tabbed away.
 */

import { bootstrap, BT } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// How many characters we keep in the typed-text demo line (rolling window). The line
// lives in a 308-pixel-wide panel and the system font is 6 pixels per character, so
// 48 characters fill the panel without spilling over its border.
const TYPED_BUFFER_MAX = 48;

// Keys the press counter listens to (KeyboardEvent.code strings).
const PRESS_COUNTER_KEYS = [
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `Key${letter}`),
    'Space',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
];

// Palette slots of three shared UI theme colors, for the overlay timing chart below.
// applyTheme() in init() writes the twelve theme colors into slots 240-251 (its default
// start slot), but configure() runs BEFORE init(), so the chart style cannot read
// this.theme yet - we spell out where the colors will land: 244 = text, 245 = dim gray,
// 247 = accent green.
const THEME_TEXT_SLOT = 244;
const THEME_DIM_SLOT = 245;
const THEME_ACCENT_SLOT = 247;

// Fixed vertical layout, in display pixels. The kit normally stacks panels on its own,
// but this page places several groups side by side, so each one gets a pinned x/y.
const NOTICE_Y = 24; // The hint / touch-notice line right under the title strip.
const PANEL_TOP_Y = 42; // Top edge of the face-button panels and the press counter.
const RAW_PANEL_Y = 134; // Top edge of the raw-key panel (below the press counter).
const PLAYER0_PANEL_X = 6; // Left edge of the player 0 panel.
const PLAYER1_PANEL_X = 68; // Left edge of the player 1 panel (next to player 0).
const READOUT_COLUMN_X = 130; // Left edge of the press-counter / raw-key column.
const TYPED_PANEL_WIDTH = 308; // The typed-text panel spans almost the full screen.

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

    // Palette slots of the shared UI theme colors, filled by applyTheme() in init().
    /** @type {ReturnType<typeof applyTheme> | null} */
    theme = null;

    /**
     * Face buttons that have at least one key in each player's default map, built once
     * in init(). Index 0 is player 0's list, index 1 is player 1's.
     *
     * @type {Array<Array<{ label: string, code: number }>>}
     */
    faceButtons = [];

    /** @type {number | null} Engine tick when `BT.isKeyReleased('KeyF')` last fired. */
    lastFReleaseTick = null;

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
                updateBarPaletteIndex: THEME_DIM_SLOT,
                renderBarPaletteIndex: THEME_TEXT_SLOT,
                tagPaletteIndex: THEME_ACCENT_SLOT,
            },
        };
    }

    /**
     * Install the shared UI theme and build the face-button lists once at startup.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        // inputMapReset() restores the engine's default player-1 / player-2 key bindings.
        // Other demos (for example input-map remapping) may change those maps; we reset here
        // so W/A/S/D and arrow keys always match what this page describes.
        BT.inputMapReset();

        this.palette = BT.paletteCreate(256);

        // applyTheme() installs the twelve shared UI colors (into high palette slots, far
        // above where scene art normally lives) and reports their slots, so render() can
        // clear the screen with the theme's background color. Every panel, pip, and text
        // row on this page draws with these colors - no hand-picked HUD slots needed.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        // The full face-button roster, in the order the panels list them. Each entry pairs
        // a short on-screen label with the engine's button constant.
        const allButtons = [
            { label: 'Up', code: BT.BTN_UP },
            { label: 'Dn', code: BT.BTN_DOWN },
            { label: 'Lf', code: BT.BTN_LEFT },
            { label: 'Rt', code: BT.BTN_RIGHT },
            { label: 'A', code: BT.BTN_A },
            { label: 'B', code: BT.BTN_B },
            { label: 'St', code: BT.BTN_START },
            { label: 'Sl', code: BT.BTN_SELECT },
        ];

        // Keep only the buttons that actually have keys in each player's default map
        // (player 2's Select slot is empty, for example, so its row would never light).
        // .map() walks the two default maps and .filter() drops the empty slots.
        this.faceButtons = [BT.DEFAULT_KEYBOARD_PLAYER1, BT.DEFAULT_KEYBOARD_PLAYER2].map((map) =>
            allButtons.filter((button) => (map[button.code] ?? []).length > 0),
        );

        return true;
    }

    /**
     * Read keyboard state after the engine has updated input for this tick.
     */
    update() {
        // The UI kit's once-per-tick housekeeping. This demo has no kit buttons, but
        // ui.tick() is also where the kit notices touch contacts - ui.hasTouch() in
        // render() relies on it to know when to show the "needs a keyboard" notice.
        ui.tick();

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

        // Release edge for F: fires once when you let go of F. We remember the engine tick
        // it happened on so the raw-key panel can show it.
        if (BT.isKeyReleased('KeyF')) {
            this.lastFReleaseTick = BT.ticks;
            BT.assignTag('Key F released');
        }

        // Q held: we only read isKeyDown in render() for a live lit/unlit pip (no state here).

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
     * Clear the frame and declare every kit panel.
     */
    render() {
        // Paint the whole screen with the theme's deep navy background.
        BT.clear(this.theme.bg);

        // Full-width title strip across the top, in the classic 22-pixel top-bar style.
        ui.begin('topBar');
        ui.panel('Keyboard Input (KeyboardEvent.code)');
        ui.end();

        // One borderless line right under the title. On a touch device it becomes a
        // warning - this page has no on-screen substitute for a physical keyboard - and
        // otherwise it lists the default key maps as a quick reference. pad: 0 removes
        // the group's inner padding so the single line sits snug against its y position.
        ui.begin('topLeft', { y: NOTICE_Y, pad: 0 });

        if (ui.hasTouch()) {
            ui.label('This demo needs a keyboard', { color: 'warm' });
        } else {
            ui.label('P0: W A S D Space N 5 Esc - P1: arrows ; quote /', { color: 'dim' });
        }

        ui.end();

        // The two face-button panels sit side by side, like two little gamepads.
        this.renderFacePanel(0, PLAYER0_PANEL_X);
        this.renderFacePanel(1, PLAYER1_PANEL_X);

        // The right-hand column: press counter on top, raw-key readouts below.
        this.renderPressCounter();
        this.renderRawKeyPanel();

        // The typed-text line hugs the bottom edge of the screen.
        this.renderTypedLine();
    }

    /**
     * One player's mapped face buttons as a panel of lit/unlit pip rows.
     *
     * @param {number} player - 0 or 1 (`BT.isDown` player index).
     * @param {number} x - Left edge of the panel in display pixels.
     */
    renderFacePanel(player, x) {
        // Pin the panel to its column; both player panels share the same top edge.
        ui.begin('topLeft', { x, y: PANEL_TOP_Y });
        ui.panel(player === 0 ? 'Player 0' : 'Player 1');

        const buttons = this.faceButtons[player];

        // One read-only pip per button: filled while the button is held, hollow when it
        // is up. BT.isDown() reports held state (not a press edge), so reading it here
        // in render() is safe - only press/release EDGES must stay in update().
        for (let i = 0; i < buttons.length; i++) {
            const { label, code } = buttons[i];

            ui.pip(label, BT.isDown(code, player));
        }

        ui.end();
    }

    /**
     * Readout for edge-only press counting on one key at a time.
     */
    renderPressCounter() {
        ui.begin('topLeft', { x: READOUT_COLUMN_X, y: PANEL_TOP_Y });
        ui.panel('isKeyPressed counter');

        // Before any counted key is tapped there is nothing to show, so both rows fall
        // back to placeholder text.
        const hasKey = this.activePressKey !== null;

        ui.kv('Key', hasKey ? formatKeyCode(this.activePressKey) : 'none yet');
        ui.kv('Count', hasKey ? this.keyPressCount : '-');
        ui.label('Same key: +1', { color: 'dim' });
        ui.label('New key: reset', { color: 'dim' });
        ui.end();
    }

    /**
     * Panel for Q held state and the last F release.
     */
    renderRawKeyPanel() {
        ui.begin('topLeft', { x: READOUT_COLUMN_X, y: RAW_PANEL_Y });
        ui.panel('Raw keys');

        // Held state is safe to read in render() (see renderFacePanel above).
        ui.pip('Q held (isKeyDown)', BT.isKeyDown('KeyQ'));

        // The release EDGE was caught in update(); here we only display the remembered tick.
        ui.kv('F rel', this.lastFReleaseTick === null ? 'tap F' : `tick ${this.lastFReleaseTick}`);
        ui.end();
    }

    /**
     * Shows text accumulated from `BT.inputString`.
     */
    renderTypedLine() {
        // A fixed width keeps the panel spanning the screen even while the buffer is
        // short; bottomLeft anchors it just above the bottom edge.
        ui.begin('bottomLeft', { width: TYPED_PANEL_WIDTH });
        ui.panel('BT.inputString (typed this session)');

        const hasText = this.typedBuffer.length > 0;

        ui.label(hasText ? this.typedBuffer : '...', { color: hasText ? 'text' : 'dim' });
        ui.end();
    }
}

bootstrap(Demo);
