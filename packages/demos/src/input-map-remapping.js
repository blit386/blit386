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

A wide 640x480 screen with the engine overlay open from the start: its title and timing
chart across the top, its bar along the bottom. Everything the demo draws sits in the
space between, clear of both, so the chart and the panels are visible together.

Two dim lines of intro text come first. Below them, two equal panels sit side by side:
"Player 0" on the left and "Player 1" on the right, each a column of eight pips, one per
face button (Up, Down, Left, Right, A, B, Start, Select). A pip fills while its button is
held, and next to it are the keys that feed that button right now - in green when the
active preset changed them from the defaults, "none" in orange when it cleared them.

Along the bottom, a "Presets" panel holds four kit buttons that switch between key maps,
with an "Active" row naming the map in use, and a "Calls made" panel beside it lists the
exact BT.inputMapReset() and BT.inputMap() calls that preset ran. Each switch also drops a
tag on the engine overlay's timing chart.

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

import { keyLabel } from './shared/key-names.js';
import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// A 640x480 logical screen (set in configure(); wider than the engine default) so two
// panels of key maps fit comfortably side by side.
const DISPLAY_W = 640;
const DISPLAY_H = 480;

// The engine overlay is visible from the start and draws on top of everything: its title
// rows and timing chart cover the top 65 pixels, and its bottom bar the last 14 (measured
// from a capture of this demo). Everything below is laid out in the band between, so
// nothing of ours hides under the overlay.
const OVERLAY_TOP_H = 65;
const OVERLAY_BOTTOM_H = 14;
const FREE_TOP = OVERLAY_TOP_H;
const FREE_H = DISPLAY_H - OVERLAY_TOP_H - OVERLAY_BOTTOM_H;

// Panels sit 8 pixels from the screen sides and 8 apart, in two equal columns:
// 8 + 308 + 8 + 308 + 8 = 640.
const EDGE = 8;
const GAP = 8;
const PANEL_W = (DISPLAY_W - 2 * EDGE - GAP) / 2;
const LEFT_X = EDGE;
const RIGHT_X = EDGE + PANEL_W + GAP;

// A kit panel with a title starts its content 22 pixels below its top edge and ends 11
// pixels below the last row; text inside starts 9 pixels in from the panel edge.
const PANEL_CONTENT_TOP = 22;
const PANEL_BOTTOM = 11;
const PANEL_PAD = 9;

// Player panels: eight 10-pixel pip rows, 4 pixels apart.
const PIP_ROW_GAP = 4;
const PIP_ROW_PITCH = 10 + PIP_ROW_GAP;
const PLAYER_PANEL_H = PANEL_CONTENT_TOP + 8 * 10 + 7 * PIP_ROW_GAP + PANEL_BOTTOM;

// The keys column starts after the pip (14 pixels) and the longest label ("Select", 6
// characters of 6 pixels) plus one character of space.
const KEYS_X_OFFSET = PANEL_PAD + 14 + 7 * 6;

// Bottom row: the Presets panel holds four 27-pixel button rows, a 4-pixel gap, and the
// 10-pixel Active row; the Calls made panel beside it is made exactly as tall.
const PRESETS_PANEL_H = PANEL_CONTENT_TOP + 4 * 27 + 4 + 10 + PANEL_BOTTOM;
const PRESET_BUTTON_W = PANEL_W - 2 * PANEL_PAD;

// The whole block - two intro lines (20 pixels), the player panels, and the bottom row,
// 8 pixels apart - is centered in the free band.
const INTRO_H = 20;
const BLOCK_H = INTRO_H + GAP + PLAYER_PANEL_H + GAP + PRESETS_PANEL_H;
const INTRO_Y = FREE_TOP + Math.floor((FREE_H - BLOCK_H) / 2);
const PANEL_TOP_Y = INTRO_Y + INTRO_H + GAP;
const BOTTOM_ROW_Y = PANEL_TOP_Y + PLAYER_PANEL_H + GAP;

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
// label with the engine's button constant and that constant's name (for the Calls made
// panel).
/** @type {Array<{ label: string, code: number, name: string }>} */
const FACE_BUTTONS = [
    { label: 'Up', code: BT.BTN_UP, name: 'BTN_UP' },
    { label: 'Down', code: BT.BTN_DOWN, name: 'BTN_DOWN' },
    { label: 'Left', code: BT.BTN_LEFT, name: 'BTN_LEFT' },
    { label: 'Right', code: BT.BTN_RIGHT, name: 'BTN_RIGHT' },
    { label: 'A', code: BT.BTN_A, name: 'BTN_A' },
    { label: 'B', code: BT.BTN_B, name: 'BTN_B' },
    { label: 'Start', code: BT.BTN_START, name: 'BTN_START' },
    { label: 'Select', code: BT.BTN_SELECT, name: 'BTN_SELECT' },
];

// The engine's shipped default tables, one per player, in player order.
const DEFAULT_MAPS = [BT.DEFAULT_KEYBOARD_PLAYER1, BT.DEFAULT_KEYBOARD_PLAYER2];

// Copies one keyboard table so editing the copy never touches the original.
// Object.entries() lists [button, keys] pairs, [...keys] copies each key list, and
// Object.fromEntries() builds a new table from the pairs.
function copyMap(map) {
    return Object.fromEntries(Object.entries(map).map(([button, keys]) => [button, [...keys]]));
}

// True when two key lists hold the same keys in the same order.
function sameKeys(a, b) {
    return a.length === b.length && a.every((key, i) => key === b[i]);
}

// Cycles keyboard face-button maps with BT.inputMap and BT.inputMapReset.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slot map returned by applyTheme() - theme.bg, theme.text, and friends.
    /** @type {ReturnType<typeof applyTheme> | null} */
    theme = null;

    // Human-readable name for the active preset.
    presetLabel = 'Defaults';

    // Our own copy of both players' keyboard tables, kept in step with every
    // BT.inputMap() / BT.inputMapReset() call - the engine does not expose a "get current
    // map" API, so this is how the panels can show which keys feed each button.
    keyMaps = [{}, {}];

    // What the player panels print for each button, rebuilt whenever the map changes
    // (not every frame): the key text and its color role. Index [player][button].
    /** @type {Array<Array<{ text: string, color: string }>>} */
    keyRows = [[], []];

    // The calls the active preset made, in order, for the Calls made panel.
    /** @type {string[]} */
    calls = [];

    // A wider logical screen than the engine default so two panels of key maps fit. No
    // post-process effects, so we upscale 2x in the browser (maxCanvasSize) instead of
    // allocating a larger drawing buffer (drawingBufferSize).
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            maxCanvasSize: new Vector2i(DISPLAY_W * 2, DISPLAY_H * 2),
            targetFPS: 60,

            isOverlayVisibleAtStart: true,

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
        this.resetMaps();
        this.presetLabel = 'Defaults';

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

    // Draws the intro text, both player panels, the preset buttons, and the calls list.
    render() {
        // Wipe the whole screen with the theme's deep-navy background color.
        BT.clear(this.theme.bg);

        // Full-width 22-pixel title strip across the top. The overlay covers it while
        // it is open; press the backquote key (`) to hide the overlay and see it.
        ui.begin(UI_ANCHORS.TOP_BAR);
        ui.panel('Input Map Remapping - BT.inputMap / BT.inputMapReset');
        ui.end();

        // Two dim intro lines, lined up with the text inside the panels below them. A
        // caption's text starts 4 pixels above the y it is given.
        const textX = LEFT_X + PANEL_PAD;

        ui.caption(
            textX,
            INTRO_Y + 4,
            'Face buttons use BT.isDown(BTN_*, player). Remap them at runtime with BT.inputMap.',
            {
                color: 'dim',
            },
        );
        ui.caption(textX, INTRO_Y + 14, 'Tap a preset button or press its number key. Click the canvas if keys stop.', {
            color: 'dim',
        });

        // One panel of live face-button pips per player, side by side.
        this.renderPlayerPanel(0, LEFT_X);
        this.renderPlayerPanel(1, RIGHT_X);

        // The bottom row: the preset buttons on the left, the calls they made on the
        // right.
        this.renderPresetsPanel();
        this.renderCallsPanel();
    }

    // Restores the shipped tables, both in the engine and in our own copy.
    resetMaps() {
        BT.inputMapReset();
        this.keyMaps = DEFAULT_MAPS.map(copyMap);
        this.calls = ['BT.inputMapReset()'];
        this.refreshKeyRows();
    }

    // Replaces the key list of one button, both in the engine and in our own copy, and
    // records the call for the Calls made panel. Passing no keys clears the button.
    remap(player, code, ...keys) {
        BT.inputMap(player, code, ...keys);
        this.keyMaps[player][code] = keys;

        // Build the call as it would be written in code: the button constant's name,
        // then every key in quotes. .find() returns the first FACE_BUTTONS entry with
        // this code.
        const name = FACE_BUTTONS.find((button) => button.code === code).name;
        const keyArgs = keys.map((key) => `, '${key}'`).join('');

        this.calls.push(`BT.inputMap(${player}, BT.${name}${keyArgs})`);
        this.refreshKeyRows();
    }

    // Rebuilds what the player panels print for every button: the key labels joined
    // with " or ", green when they differ from the shipped defaults, and an orange
    // "none" when the button has no keys at all.
    refreshKeyRows() {
        this.keyRows = this.keyMaps.map((map, player) =>
            FACE_BUTTONS.map(({ code }) => {
                const keys = map[code] ?? [];
                const defaults = DEFAULT_MAPS[player][code] ?? [];

                if (keys.length === 0) {
                    return { text: 'none', color: defaults.length === 0 ? 'dim' : 'warm' };
                }

                return { text: keys.map(keyLabel).join(' or '), color: sameKeys(keys, defaults) ? 'dim' : 'accent' };
            }),
        );
    }

    // Restores the shipped tables (copies of BT.DEFAULT_KEYBOARD_PLAYER1 / PLAYER2).
    applyPresetDefaults() {
        this.resetMaps();
        this.presetLabel = 'Defaults';
        BT.assignTag('Map: defaults');
    }

    // Custom layout: remaps a few buttons, and gives TWO keys to one direction so either
    // key counts (OR) - hold Q or E and player 0's Left pip should light.
    applyPresetCustom() {
        // Start from known defaults, then layer edits (order matters only for clarity).
        this.resetMaps();

        // Player 0: A is Z only for this preset (Space and B no longer map here until
        // reset).
        this.remap(0, BT.BTN_A, 'KeyZ');

        // Player 0: Left listens to TWO keys at once - either one held counts.
        this.remap(0, BT.BTN_LEFT, 'KeyQ', 'KeyE');

        // Player 1: move Up to I so the up arrow no longer drives it for this preset
        // until we reset (we replace the whole key list for that button).
        this.remap(1, BT.BTN_UP, 'KeyI');

        this.presetLabel = 'Custom';
        BT.assignTag('Map: custom');
    }

    // Defaults everywhere, then REMOVES the keyboard bindings for player 0's A button.
    // Passing no key strings clears that slot until you map again.
    applyPresetClearPlayer0A() {
        this.resetMaps();

        // No keys after the button means an empty list is stored, so no key lights BTN_A
        // for player 0.
        this.remap(0, BT.BTN_A);
        this.presetLabel = 'Cleared P0 A';
        BT.assignTag('Map: cleared A');
    }

    // Draws one player's panel: a column of live face-button pips, each with the keys
    // that feed it right now. `player` is 0 or 1; `originX` is the panel's left edge.
    renderPlayerPanel(player, originX) {
        // Pin the group at an exact position and force both panels to the same width so
        // the two columns line up.
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: originX, y: PANEL_TOP_Y, width: PANEL_W });
        ui.panel(player === 0 ? 'Player 0' : 'Player 1');

        // One read-only pip per logical face button. The pip lights up while the button
        // is held. `code` is a BT.BTN_* constant (Up, A, Start, ...), not a raw key
        // string - the runtime map (changed by BT.inputMap) decides which physical keys
        // feed it. BT.isDown reads held state (not a press edge), so it is safe here in
        // render(). A small spacer after each row spreads the column out.
        for (let i = 0; i < FACE_BUTTONS.length; i++) {
            const { label, code } = FACE_BUTTONS[i];

            ui.pip(label, BT.isDown(code, player));

            if (i < FACE_BUTTONS.length - 1) {
                ui.spacer(PIP_ROW_GAP);
            }
        }

        ui.end();

        // The keys column, on the same rows as the pip labels. The kit prints a pip's
        // label 1 pixel below the top of its row, and a caption 4 pixels above the y it
        // is given, so y = rowTop + 5 puts both texts on the same line.
        for (let i = 0; i < FACE_BUTTONS.length; i++) {
            const { text, color } = this.keyRows[player][i];
            const rowTop = PANEL_TOP_Y + PANEL_CONTENT_TOP + i * PIP_ROW_PITCH;

            ui.caption(originX + KEYS_X_OFFSET, rowTop + 5, text, { color });
        }
    }

    // The preset switcher. Each ui.button() returns true on the one frame it is clicked,
    // tapped, or its bound key goes down - all three inputs behave exactly the same.
    renderPresetsPanel() {
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: LEFT_X, y: BOTTOM_ROW_Y, width: PANEL_W });
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

        // A small gap, then the name of whichever preset is active right now.
        ui.spacer(4);
        ui.kv('Active', this.presetLabel);
        ui.end();
    }

    // Lists the calls the active preset made, as code, with a dim note on what the green
    // and orange key text in the player panels means. A spacer pads the panel to the
    // Presets panel's height, so the two end on the same line.
    renderCallsPanel() {
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: RIGHT_X, y: BOTTOM_ROW_Y, width: PANEL_W });
        ui.panel('Calls made');

        for (const call of this.calls) {
            ui.label(call, { color: 'info' });
        }

        const contentH = PRESETS_PANEL_H - PANEL_CONTENT_TOP - PANEL_BOTTOM;

        ui.spacer(contentH - (this.calls.length + 2) * 10);
        ui.label('Green keys: changed from the defaults', { color: 'dim' });
        ui.label('Orange "none": the button has no keys', { color: 'dim' });
        ui.end();
    }
}

bootstrap(Demo);
