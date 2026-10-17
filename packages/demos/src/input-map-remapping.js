/*

Input Map Remapping: rebind face buttons at runtime with BT.inputMap and BT.inputMapReset.
@description Remap face buttons at runtime with BT.inputMap: defaults, custom OR keys, and clearing a binding.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Keyboard Input: https://demos.blit386.dev/keyboard-input

Live version: https://demos.blit386.dev/input-map-remapping

Guides:
  - Input: https://blit386.dev/docs/guides/input#keyboard
  - Overlay: https://blit386.dev/docs/guides/overlay#colors-and-hud-palette-slots

Reference:
  - Overlay: https://blit386.dev/docs/api/overlay#event-tags

---

WHAT YOU WILL SEE
-----------------

A wide 640x480 screen with a title strip and two dim lines of intro text at the top. Below
them, two equal panels sit side by side: "Player 0" on the left and "Player 1" on the
right. Each lists that player's default keys, then a column of eight pips, one per face
button (Up, Down, Left, Right, A, B, Start, Select). A pip fills while its button is held.

In the bottom-left corner, a "Presets" panel holds four kit buttons that switch between
key maps, and an "Active" row names the map in use right now. Each switch also drops a tag
on the engine overlay's timing chart.

WHAT YOU WILL LEARN
-------------------

- The engine keeps two runtime keyboard tables, one for player 0 and one for player 1.
  Each face button (BT.BTN_UP through BT.BTN_SELECT) lists zero or more KeyboardEvent.code
  strings; if any listed key is held, the button counts as down (OR).
- BT.inputMap(player, button, ...keys) replaces the key list for one button. Passing
  several keys makes either one count; passing none clears the binding.
- BT.inputMapReset() restores the shipped defaults (copies of BT.DEFAULT_KEYBOARD_PLAYER1
  and BT.DEFAULT_KEYBOARD_PLAYER2) for both players.
- BT.isDown(BT.BTN_*, player) reads through the map; BT.isKeyDown('KeyW') does not.
  Changing the map does not rename keys - it changes which keys feed face buttons.
- UI kit buttons with a { key } binding, so one click, tap, or key press all do the same
  thing, and BT.isKeyPressed('KeyR') as an extra alias read in update().
- overlayStyle and overlayTimingChartStyle in configure() take literal palette slot
  numbers, because configure() runs before applyTheme() in init().

TRY THIS
--------

- Press 1 (or tap the button) for the built-in defaults (BT.inputMapReset()).
- Press 2 for the custom map: player 0's A moves to Z, player 0's Left listens to Q or E,
  and player 1's Up moves to I. Hold Q or E and watch player 0's Left pip light either
  way (the A key no longer does); the up arrow no longer lights player 1's Up pip, but I
  does.
- Press 3 to clear player 0's A button until you pick another preset - Space and B stop
  lighting the A pip.
- Press 0 or R anytime to restore defaults (same idea as 1).
- Press the backquote key (`) to open the engine overlay and see a tag on the timing
  chart for each preset switch.
- Click the canvas if the preset keys stop responding (focus left the page).

*/

import { bootstrap, BT, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// Layout for a 640x480 logical screen (set in configure(); wider than the engine default)
// so two panels of key maps fit comfortably side by side.
const DISPLAY_W = 640;
const DISPLAY_H = 480;
const MARGIN_X = 24;
const GAP_PANELS = 24;

// Two equal columns: margin + panel + gap + panel + margin == DISPLAY_W.
const PANEL_W = Math.floor((DISPLAY_W - 2 * MARGIN_X - GAP_PANELS) / 2);
const PANEL0_X = MARGIN_X;
const PANEL1_X = MARGIN_X + PANEL_W + GAP_PANELS;

// Where the intro text and the two player panels start, measured from the top of the
// screen in pixels. The top bar strip drawn by the kit is 22 pixels tall, so 28 clears
// it.
const INTRO_Y = 28;
const PANEL_TOP_Y = 88;

// All four preset buttons share one width so the column reads as a tidy block.
const PRESET_BUTTON_W = 200;

// The engine overlay (configured below) needs palette slot numbers, but configure() runs
// BEFORE init(), where applyTheme() installs the shared UI colors. applyTheme() always
// writes its twelve colors into slots 240-251 (its default start slot), so we can write
// the slot numbers out here as named constants instead of magic numbers.
const THEME_SLOT_PANEL = 242; // panel fill (dark blue)
const THEME_SLOT_TEXT = 244; // primary text (off-white)
const THEME_SLOT_HEADER = 246; // panel titles (warm amber)
const THEME_SLOT_ACCENT = 247; // lit / active (phosphor green)
const THEME_SLOT_WARM = 248; // warnings (warm orange)

// The eight face buttons in the order the panels list them, each pairing an on-screen
// label with the engine's button constant.
/** @type {Array<{ label: string, code: number }>} */
const FACE_BUTTONS = [
    { label: 'Up', code: BT.BTN_UP },
    { label: 'Down', code: BT.BTN_DOWN },
    { label: 'Left', code: BT.BTN_LEFT },
    { label: 'Right', code: BT.BTN_RIGHT },
    { label: 'A', code: BT.BTN_A },
    { label: 'B', code: BT.BTN_B },
    { label: 'Start', code: BT.BTN_START },
    { label: 'Select', code: BT.BTN_SELECT },
];

// Cycles keyboard face-button maps with BT.inputMap and BT.inputMapReset.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slot map returned by applyTheme() - theme.bg, theme.text, and friends.
    /** @type {ReturnType<typeof applyTheme> | null} */
    theme = null;

    // Human-readable name for the active preset. We track it ourselves - the engine does
    // not expose a "get current map" API.
    presetLabel = '1 Defaults (engine tables)';

    // A wider logical screen than the engine default so two panels of key maps fit. No
    // post-process effects, so we upscale 2x in the browser (maxCanvasSize) instead of
    // allocating a larger drawing buffer (drawingBufferSize).
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            maxCanvasSize: new Vector2i(DISPLAY_W * 2, DISPLAY_H * 2),
            targetFPS: 60,

            overlayStyle: {
                barPaletteIndex: THEME_SLOT_PANEL,
                textPaletteIndex: THEME_SLOT_TEXT,
                gapPaletteIndex: THEME_SLOT_PANEL,
            },

            isOverlayTimingChartEnabled: true,

            overlayTimingChartStyle: {
                updateBarPaletteIndex: THEME_SLOT_ACCENT,
                renderBarPaletteIndex: THEME_SLOT_HEADER,
                warningPaletteIndex: THEME_SLOT_WARM,
                errorPaletteIndex: THEME_SLOT_WARM,
                tagPaletteIndex: THEME_SLOT_ACCENT,
            },

            // Arrow keys and Space scroll the host page by default. This demo maps those
            // keys (player 1 uses arrows), so opt in so pressing them does not move the
            // page.
            isCapturingKeyboardScroll: true,
        };
    }

    // Palette setup and a clean slate for the keyboard maps when the page loads.
    async init() {
        this.palette = BT.paletteCreate(256);

        // Install the shared UI theme (twelve colors in slots 240-251) before handing the
        // palette to the engine. Every panel, button, and pip below draws with these.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        // Copy fresh maps from BT.DEFAULT_KEYBOARD_PLAYER1 / ...PLAYER2 so hot reload or
        // revisiting this URL does not inherit another demo's edits.
        BT.inputMapReset();
        this.presetLabel = '1 Defaults (engine tables)';

        return true;
    }

    // Update-side housekeeping for the UI kit, plus one extra keyboard alias.
    update() {
        // Let the kit latch keyboard shortcuts and touch contacts for this frame's
        // buttons. This must be the first line of update() when buttons use { key }.
        ui.tick();

        // The reset button below is bound to Digit0, but this demo also accepts R as a
        // second reset key. A kit button can only carry one key binding, so this alias
        // stays here in update() (keyboard edges are safe to read here - never in
        // render()). isKeyPressed without a repeat rate only fires once per press.
        if (BT.isKeyPressed('KeyR')) {
            this.applyPresetDefaults();
        }
    }

    // Draws the intro text, the preset buttons, and both player panels.
    render() {
        // Wipe the whole screen with the theme's deep-navy background color.
        BT.clear(this.theme.bg);

        // Full-width 22-pixel title strip across the top of the screen.
        ui.begin(UI_ANCHORS.TOP_BAR);
        ui.panel('Input Map Remapping - BT.inputMap / BT.inputMapReset');
        ui.end();

        // A borderless text group under the title: what the demo is about, plus the
        // classic "click the canvas" focus tip. No ui.panel() call means no box is drawn.
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: MARGIN_X, y: INTRO_Y });
        ui.label('Face buttons use BT.isDown(BTN_*, player). Remap at runtime with BT.inputMap.', { color: 'dim' });
        ui.label('Tap a preset button or press its number key. Click the canvas if keys stop.', { color: 'dim' });
        ui.end();

        // One panel of live face-button pips per player, side by side.
        this.renderPlayerPanel(0, PANEL0_X, PANEL_TOP_Y);
        this.renderPlayerPanel(1, PANEL1_X, PANEL_TOP_Y);

        // The preset switcher lives in its own panel in the bottom-left corner. Each
        // ui.button() returns true on the one frame it is clicked, tapped, or its bound
        // key goes down - all three inputs behave exactly the same.
        ui.begin(UI_ANCHORS.BOTTOM_LEFT);
        ui.panel('Presets');

        if (ui.button('1 - Defaults (inputMapReset)', { key: 'Digit1', width: PRESET_BUTTON_W })) {
            this.applyPresetDefaults();
        }

        if (ui.button('2 - Custom map (Z, Q/E, I)', { key: 'Digit2', width: PRESET_BUTTON_W })) {
            this.applyPresetCustom();
        }

        if (ui.button('3 - Clear P0 A button', { key: 'Digit3', width: PRESET_BUTTON_W })) {
            this.applyPresetClearPlayer0A();
        }

        if (ui.button('0 - Reset (also R key)', { key: 'Digit0', width: PRESET_BUTTON_W })) {
            this.applyPresetDefaults();
        }

        // A thin rule, then the name of whichever preset is active right now.
        ui.separator();
        ui.kv('Active', this.presetLabel);
        ui.end();
    }

    // Restores the shipped tables (copies of BT.DEFAULT_KEYBOARD_PLAYER1 / PLAYER2).
    applyPresetDefaults() {
        BT.inputMapReset();
        this.presetLabel = '1 Defaults (BT.inputMapReset)';
        BT.assignTag('Map: defaults');
    }

    // Custom layout: remaps a few buttons, and gives TWO keys to one direction so either
    // key counts (OR) - hold Q or E and player 0's Left pip should light.
    applyPresetCustom() {
        // Start from known defaults, then layer edits (order matters only for clarity).
        BT.inputMapReset();

        // Player 0: A is Z only for this preset (Space and B no longer map here until
        // reset).
        BT.inputMap(0, BT.BTN_A, 'KeyZ');

        // Player 1: move Up to I so the up arrow no longer drives it for this preset
        // until we reset (we replace the whole key list for that button).
        BT.inputMap(1, BT.BTN_UP, 'KeyI');

        // Player 0: Left listens to TWO keys at once - either one held counts.
        BT.inputMap(0, BT.BTN_LEFT, 'KeyQ', 'KeyE');

        this.presetLabel = '2 Custom (P0: Z=A, Q|E=Lft | P1: I=Up)';
        BT.assignTag('Map: custom');
    }

    // Defaults everywhere, then REMOVES the keyboard bindings for player 0's A button.
    // Passing no key strings clears that slot until you map again.
    applyPresetClearPlayer0A() {
        BT.inputMapReset();

        // No keys after the button means an empty list is stored, so no key lights BTN_A
        // for player 0.
        BT.inputMap(0, BT.BTN_A);
        this.presetLabel = '3 Cleared P0 A (BT.inputMap(0, BTN_A) with no keys)';
        BT.assignTag('Map: cleared A');
    }

    // Draws one player's panel: title, default-key hints, and a column of live
    // face-button pips. `player` is 0 or 1; `originX` and `originY` are the panel's
    // top-left corner in pixels.
    renderPlayerPanel(player, originX, originY) {
        // Pin the group at an exact position and force both panels to the same width so
        // the two columns line up regardless of how long each panel's text rows are.
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: originX, y: originY, width: PANEL_W });
        ui.panel(player === 0 ? 'Player 0' : 'Player 1');

        // Which physical keys feed this player's face buttons out of the box. The custom
        // preset changes some of these - that is the whole point of the demo.
        if (player === 0) {
            ui.label('Default keys: W, A, S, D move', { color: 'dim' });
            ui.label('Space or B=A, N=B, 5=Start, Esc=Select', { color: 'dim' });
        } else {
            ui.label('Default keys: arrows move', { color: 'dim' });
            ui.label('; or 1=A, quote or 2=B', { color: 'dim' });
            ui.label('Backspace or Numpad / = Start', { color: 'dim' });
        }

        ui.separator();

        // One read-only pip per logical face button. The pip lights up while the button
        // is held. `code` is a BT.BTN_* constant (Up, A, Start, ...), not a raw key
        // string - the runtime map (changed by BT.inputMap) decides which physical keys
        // feed it. BT.isDown reads held state (not a press edge), so it is safe here in
        // render().
        for (let i = 0; i < FACE_BUTTONS.length; i++) {
            const { label, code } = FACE_BUTTONS[i];

            ui.pip(label, BT.isDown(code, player));
        }

        ui.end();
    }
}

bootstrap(Demo);
