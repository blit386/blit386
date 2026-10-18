/*

Keyboard Input: face buttons, raw keys, and typed text.
@description Face buttons for two players, raw key state with optional tick repeat, and text from BT.inputString.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Pointer Basics: https://demos.blit386.dev/pointer-basics

Live version: https://demos.blit386.dev/keyboard-input

Guides:
  - Input: https://blit386.dev/docs/guides/input#keyboard
  - Input: https://blit386.dev/docs/guides/input#frame-timing-semantics

---

WHAT YOU WILL SEE
-----------------

A title strip across the top. On the left, two panels sit side by side like two little
gamepads: "Player 0" and "Player 1", each with the same eight face buttons in the same
order - a pip that fills while the button is held, its short name, and on the right the
key it is mapped to (arrow characters for player 1's arrow keys). Player 1 has no
Select key by default, so its last row shows a dash and never lights.

To the right of them is a column of two panels, ending level with the gamepads.
"isKeyPressed counter" shows which key you tapped last and how many times in a row. "Raw
keys" has a pip for Q, the engine tick of the last F release, a pip that lights while any
key at all is held, and the tick when the last key came up. Along the bottom, a wide
panel shows the last 48 characters you typed (on a touch screen it says "This demo needs
a keyboard" instead).

Every panel and pip is drawn with the shared UI kit (src/shared/ui.js). The inputs stay
deliberately keyboard-only: there is no touch stand-in for a physical keyboard.

WHAT YOU WILL LEARN
-------------------

- Face buttons BT.BTN_UP through BT.BTN_SELECT, read with BT.isDown(button, player) for
  players 0 and 1. Each button maps to one or more physical keys through the keyboard
  map; the defaults live in BT.DEFAULT_KEYBOARD_PLAYER1 and BT.DEFAULT_KEYBOARD_PLAYER2,
  and BT.inputMapReset() restores them.
- Raw keys by KeyboardEvent.code string: BT.isKeyDown(code) for held state,
  BT.isKeyPressed(code) for the press edge, BT.isKeyPressed(code, repeatTicks) for a
  fixed-tick repeat, and BT.isKeyReleased(code) for the release edge.
- Whole-keyboard checks: BT.isAnyKeyDown() and BT.isAnyKeyReleased().
- BT.inputString, the characters typed since the last update tick.
- Edges (pressed, released, inputString) are read in update(); held state is safe to
  read in render().
- isCapturingKeyboardScroll keeps arrow keys and Space from scrolling the page.

THREE LAYERS OF KEYBOARD SUPPORT
--------------------------------

- Face buttons (BT.BTN_UP through BT.BTN_SELECT) for players 0 and 1. Each button can map
  to one or more physical keys. The engine uses KeyboardEvent.code strings (like KeyW,
  ArrowUp) so labels stay the same even when the OS keyboard layout changes (unlike
  event.key, which might print different letters).
- Raw keys (BT.isKeyDown, BT.isKeyPressed, BT.isKeyReleased) when you need a specific key,
  optional fixed-tick repeats with BT.isKeyPressed(code, rate), and release edges. When
  you do NOT care which key, BT.isAnyKeyDown and BT.isAnyKeyReleased ask about the whole
  keyboard instead.
- Text input (BT.inputString) for characters typed since the last tick. The buffer clears
  once per fixed-update tick, and that tick always finishes before render() runs, so read
  it in update(), not render(), or you can miss characters.

TRY THIS
--------

- Hold W, A, S, D, Space (or B), N, 5, and Esc for player 0; the arrow keys, ; (or
  Numpad 1), ' (or Numpad 2), and Backspace (or Numpad /) for player 1. Each panel shows
  the first key of every button's mapping.
- Tap the same letter repeatedly and watch the press counter climb (edge-only
  BT.isKeyPressed, no repeat rate). Tap a different key and the counter resets to 1. The
  counter listens to letters, Space, and the arrow keys.
- Hold Q to see isKeyDown; tap F and watch the "F rel" readout.
- Hold two keys, then let go of one: "Any key held" stays lit. Let go of the last one and
  the "All up" tick updates - isAnyKeyReleased means EVERYTHING is up.
- Type letters into the buffer line at the bottom.
- If keys stop responding, click the canvas - focus may have moved to another part of the
  page after you tabbed away.

*/

import { bootstrap, BT } from 'blit386';

import { keyLabel } from './shared/key-names.js';
import { applyTheme, FONT_W, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// How many characters the typed-text line keeps (a rolling window). The line lives in a
// 308-pixel-wide panel and the system font is 6 pixels per character, so 48 characters
// fill the panel without spilling over its border.
const TYPED_BUFFER_MAX = 48;

// Keys the press counter listens to (KeyboardEvent.code strings): every letter, Space,
// and the four arrow keys.
const PRESS_COUNTER_KEYS = [
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `Key${letter}`),
    'Space',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
];

// Fixed layout, in display pixels, on a 4-pixel grid: 4 pixels from the screen edges and
// 4 between panels. The kit normally stacks panels on its own, but this page places
// several groups side by side, so each one gets a pinned x/y.
//
//   - Two 76-pixel gamepad panels on the left, a 152-pixel column on the right
//     (4 + 76 + 4 + 76 + 4 + 152 + 4 = 320).
//   - The right column holds two 73-pixel panels (22 title + 4 rows of 10 + 11 bottom),
//     150 pixels with the gap between them, and the gamepad panels are made exactly
//     that tall too, so every bottom edge lines up.
//   - The typed-text panel spans the full width under them.
const EDGE = 4;
const GAP = 4;
const PANEL_TOP_Y = 32;
const PAD_PANEL_W = 76;
const PLAYER0_PANEL_X = EDGE;
const PLAYER1_PANEL_X = PLAYER0_PANEL_X + PAD_PANEL_W + GAP;
const READOUT_COLUMN_X = PLAYER1_PANEL_X + PAD_PANEL_W + GAP;
const READOUT_COLUMN_W = 320 - EDGE - READOUT_COLUMN_X;
const READOUT_PANEL_H = 22 + 4 * 10 + 11;
const RAW_PANEL_Y = PANEL_TOP_Y + READOUT_PANEL_H + GAP;
const COLUMN_H = 2 * READOUT_PANEL_H + GAP;
const TYPED_PANEL_Y = PANEL_TOP_Y + COLUMN_H + GAP;
const TYPED_PANEL_W = 320 - 2 * EDGE;

// Inside a gamepad panel: eight 10-pixel pip rows with a 5-pixel gap after each of the
// first seven, plus 2 pixels at the end, fill the 117 pixels between the 22-pixel title
// strip and the 11-pixel bottom rim (8 x 10 + 7 x 5 + 2 = 117 = 150 - 22 - 11).
const PAD_ROW_GAP = 5;
const PAD_ROW_PITCH = 10 + PAD_ROW_GAP;
const PAD_END_SPACER = COLUMN_H - 22 - 11 - (8 * 10 + 7 * PAD_ROW_GAP);

// Kit panel content starts 9 pixels in from the panel edge and 22 pixels below its top.
const PANEL_PAD = 9;
const PANEL_CONTENT_TOP = 22;

// Shows keyboard face-button maps, raw key queries, and BT.inputString side by side.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slots of the shared UI theme colors, filled by applyTheme() in init().
    /** @type {ReturnType<typeof applyTheme> | null} */
    theme = null;

    // The eight face buttons for each player, built once in init(): the on-screen label,
    // the engine's button constant, and the short name of the first key mapped to it
    // ('-' when the player has no key for that button). Index 0 is player 0's list,
    // index 1 is player 1's.
    /** @type {Array<Array<{ label: string, code: number, key: string }>>} */
    faceButtons = [];

    // Engine tick when BT.isKeyReleased('KeyF') last fired.
    /** @type {number | null} */
    lastFReleaseTick = null;

    // Engine tick when BT.isAnyKeyReleased() last fired (every key up).
    /** @type {number | null} */
    lastAllUpTick = null;

    // KeyboardEvent.code of the key we are counting presses on.
    /** @type {string | null} */
    activePressKey = null;

    // How many edge-only BT.isKeyPressed events fired for activePressKey in a row.
    keyPressCount = 0;

    // Text built from BT.inputString over time (capped at TYPED_BUFFER_MAX).
    typedBuffer = '';

    // Keeps the arrow keys and Space from scrolling the page, and turns the engine
    // overlay off - the panels already show everything this page is about.
    configure() {
        return {
            // Arrow keys and Space scroll the host page by default. This demo maps those
            // keys (player 1 uses arrows), so opt in so pressing them does not move the
            // page.
            isCapturingKeyboardScroll: true,

            isOverlayEnabled: false,
        };
    }

    // Installs the shared UI theme and builds the face-button lists once at startup.
    async init() {
        // inputMapReset() restores the engine's default player 0 / player 1 key bindings.
        // Other demos (for example Input Map Remapping) may change those maps; we reset
        // here so W/A/S/D and the arrow keys always match what this page describes.
        BT.inputMapReset();

        this.palette = BT.paletteCreate(256);

        // applyTheme() installs the twelve shared UI colors (into high palette slots, far
        // above where scene art normally lives) and reports their slots, so render() can
        // clear the screen with the theme's background color. Every panel, pip, and text
        // row on this page draws with these colors - no hand-picked HUD slots needed.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        // The full face-button roster, in the order the panels list them. Each entry
        // pairs a short on-screen label with the engine's button constant.
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

        // Give every button the short name of the first key in each player's default map
        // (keyLabel() from src/shared/key-names.js turns KeyW into W and the arrow keys
        // into arrow characters).
        // Both players keep all eight rows, so their panels line up row for row; a button
        // with no key (player 1's Select, for example) shows a dash and never lights.
        // .map() walks the two default maps, and the inner .map() the eight buttons.
        this.faceButtons = [BT.DEFAULT_KEYBOARD_PLAYER1, BT.DEFAULT_KEYBOARD_PLAYER2].map((map) =>
            allButtons.map((button) => {
                const keys = map[button.code] ?? [];

                return { ...button, key: keys.length > 0 ? keyLabel(keys[0]) : '-' };
            }),
        );

        return true;
    }

    // Reads keyboard state after the engine has updated input for this tick.
    update() {
        // The UI kit's once-per-tick housekeeping. This demo has no kit buttons, but
        // ui.tick() is also where the kit notices touch contacts - ui.hasTouch() in
        // render() relies on it to know when to show the "needs a keyboard" notice.
        ui.tick();

        // Raw keys (KeyboardEvent.code strings, layout-independent):
        //
        // BT.isKeyDown(code) is true EVERY tick while the key is held (like holding a
        // door shut). BT.isKeyPressed(code) is true only on the FIRST tick the key goes
        // down (a one-shot "tap"). BT.isKeyPressed(code, repeatTicks) is true on that
        // first tick and then again every repeatTicks fixed engine ticks while still held
        // (repeat on the game clock, not the OS key-repeat rate). BT.isKeyReleased(code)
        // is true only on the FIRST tick the key comes up (a one-shot "let go").
        //
        // Face buttons (BT.BTN_UP, BT.isDown, ...) are separate: they go through the
        // input map. Use raw keys when you need a specific key regardless of player slot
        // or remapping.

        // Release edge for F: fires once when you let go of F. We remember the engine
        // tick it happened on so the raw-key panel can show it.
        if (BT.isKeyReleased('KeyF')) {
            this.lastFReleaseTick = BT.ticks;
        }

        // Every key up: unlike isKeyReleased('KeyF') above, this does NOT fire when you
        // let go of one key while another is still down - only when nothing is held any
        // more. Like the other edges it must be read here in update(), so we remember the
        // tick for render().
        if (BT.isAnyKeyReleased()) {
            this.lastAllUpTick = BT.ticks;
        }

        // Q held: we only read isKeyDown in render() for a live lit/unlit pip (no state
        // here).

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

        // Text buffer: the characters typed since the last tick arrive here once, so add
        // them to our own string now or they are gone next tick.
        const chunk = BT.inputString;

        if (chunk.length > 0) {
            this.typedBuffer += chunk;

            if (this.typedBuffer.length > TYPED_BUFFER_MAX) {
                // Keep the most recent characters so long paste tests still show the
                // tail.
                this.typedBuffer = this.typedBuffer.slice(-TYPED_BUFFER_MAX);
            }
        }
    }

    // Clears the frame and declares every kit panel.
    render() {
        // Paint the whole screen with the theme's deep navy background.
        BT.clear(this.theme.bg);

        // Full-width title strip across the top, in the classic 22-pixel top-bar style.
        ui.begin(UI_ANCHORS.TOP_BAR);
        ui.panel('Keyboard Input (KeyboardEvent.code)');
        ui.end();

        // The two face-button panels sit side by side, like two little gamepads.
        this.renderFacePanel(0, PLAYER0_PANEL_X);
        this.renderFacePanel(1, PLAYER1_PANEL_X);

        // The right-hand column: press counter on top, raw-key readouts below.
        this.renderPressCounter();
        this.renderRawKeyPanel();

        // The typed-text line spans the full width under the other panels.
        this.renderTypedLine();
    }

    // Draws one player's face buttons as a panel of lit/unlit pip rows, each with the key
    // it is mapped to on the right. `player` is 0 or 1 (the BT.isDown player index), `x`
    // the panel's left edge in display pixels.
    renderFacePanel(player, x) {
        // Pin the panel to its column; both player panels share the same top edge.
        ui.begin(UI_ANCHORS.TOP_LEFT, { x, y: PANEL_TOP_Y, width: PAD_PANEL_W });
        ui.panel(player === 0 ? 'Player 0' : 'Player 1');

        const buttons = this.faceButtons[player];

        // One read-only pip per button: filled while the button is held, hollow when it
        // is up. BT.isDown() reports held state (not a press edge), so reading it here in
        // render() is safe - only press/release EDGES must stay in update(). A small
        // spacer after each row (except the last) spreads the rows out so the panel ends
        // level with the column beside it.
        for (let i = 0; i < buttons.length; i++) {
            const { label, code } = buttons[i];

            ui.pip(label, BT.isDown(code, player));

            if (i < buttons.length - 1) {
                ui.spacer(PAD_ROW_GAP);
            }
        }

        ui.spacer(PAD_END_SPACER);
        ui.end();

        // The mapped keys, right-aligned against the panel's right edge, on the same rows
        // as the pip labels. Every character of the system font is FONT_W (6) pixels
        // wide. The kit prints a pip's label 1 pixel below the top of its row, and a
        // caption 4 pixels above the y it is given, so y = rowTop + 5 puts both texts on
        // the same line.
        const rightEdge = x + PAD_PANEL_W - PANEL_PAD;

        for (let i = 0; i < buttons.length; i++) {
            const { key } = buttons[i];
            const rowTop = PANEL_TOP_Y + PANEL_CONTENT_TOP + i * PAD_ROW_PITCH;

            ui.caption(rightEdge - key.length * FONT_W, rowTop + 5, key, { color: 'dim' });
        }
    }

    // Draws the readout for edge-only press counting on one key at a time.
    renderPressCounter() {
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: READOUT_COLUMN_X, y: PANEL_TOP_Y, width: READOUT_COLUMN_W });
        ui.panel('isKeyPressed counter');

        // Before any counted key is tapped there is nothing to show, so both rows fall
        // back to placeholder text.
        const hasKey = this.activePressKey !== null;

        ui.kv('Key', hasKey ? keyLabel(this.activePressKey) : 'none yet');
        ui.kv('Count', hasKey ? this.keyPressCount : '-');
        ui.label('Same key: +1', { color: 'dim' });
        ui.label('New key: reset', { color: 'dim' });
        ui.end();
    }

    // Draws the panel for Q held state, the last F release, and the whole-keyboard
    // checks.
    renderRawKeyPanel() {
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: READOUT_COLUMN_X, y: RAW_PANEL_Y, width: READOUT_COLUMN_W });
        ui.panel('Raw keys');

        // Held state is safe to read in render() (see renderFacePanel above).
        ui.pip('Q (isKeyDown)', BT.isKeyDown('KeyQ'));

        // The release EDGE was caught in update(); here we only display the remembered
        // tick.
        ui.kv('F rel', this.lastFReleaseTick === null ? 'tap F' : `tick ${this.lastFReleaseTick}`);

        // Held state again, but for the whole keyboard: lit while ANY key is down.
        ui.pip('Any (isAnyKeyDown)', BT.isAnyKeyDown());

        // The "all keys up" edge was caught in update(); here we only show the remembered
        // tick.
        ui.kv('All up', this.lastAllUpTick === null ? 'press, release' : `tick ${this.lastAllUpTick}`);
        ui.end();
    }

    // Draws the text accumulated from BT.inputString. On a touch device it shows a
    // warning instead - this page has no on-screen substitute for a physical keyboard.
    renderTypedLine() {
        // A fixed width keeps the panel spanning the screen even while the buffer is
        // short.
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: EDGE, y: TYPED_PANEL_Y, width: TYPED_PANEL_W });
        ui.panel('BT.inputString (typed this session)');

        const hasText = this.typedBuffer.length > 0;

        if (ui.hasTouch()) {
            ui.label('This demo needs a keyboard', { color: 'warm' });
        } else {
            ui.label(hasText ? this.typedBuffer : '...', { color: hasText ? 'text' : 'dim' });
        }

        ui.end();
    }
}

bootstrap(Demo);
