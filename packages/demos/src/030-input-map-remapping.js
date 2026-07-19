/**
 * Input Map Remapping Demo - runtime `BT.inputMap` and `BT.inputMapReset`.
 *
 * Demo 030 in the BLIT386 demo series.
 * Prerequisites: 001-Basics (https://demos.blit386.dev/001-basics),
 * 028-Keyboard-Input (https://demos.blit386.dev/028-keyboard-input).
 *
 * Live version: https://demos.blit386.dev/030-input-map-remapping
 *
 * The engine stores two runtime keyboard tables (players 0 and 1). Each
 * face button (`BT.BTN_UP` through `BT.BTN_SELECT`) can list zero or more
 * `KeyboardEvent.code` strings. If any listed key is held, the logical
 * button counts as down (OR). This demo switches presets so you can feel
 * defaults, a custom map, and a cleared binding.
 *
 * Important: `BT.isKeyDown('KeyW')` only watches the real W key. Changing the map
 * does not rename keys - it changes which keys feed face buttons through
 * `BT.isDown(BT.BTN_*, player)`.
 *
 * The preset switches are shared-UI-kit buttons (src/shared/ui.js), so on a phone
 * you can tap them; on a keyboard the number keys printed on each button still work.
 *
 * Try this:
 * - Press 1 (or tap the button) for built-in defaults (`BT.inputMapReset()`).
 * - Press 2 for a custom layout (see on-screen text).
 * - Press 3 to clear player 0's A button until you pick another preset.
 * - Press 0 or R anytime to restore defaults (same idea as 1).
 * - Click the canvas if preset keys stop responding (focus left the page).
 */

import { bootstrap, BT, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// Layout for a 640x480 logical framebuffer (set in configure(); wider than engine default).
const DISPLAY_W = 640;
const DISPLAY_H = 480;
const MARGIN_X = 24;
const GAP_PANELS = 24;
// Two equal columns: margin + panel + gap + panel + margin == DISPLAY_W.
const PANEL_W = Math.floor((DISPLAY_W - 2 * MARGIN_X - GAP_PANELS) / 2);
const PANEL0_X = MARGIN_X;
const PANEL1_X = MARGIN_X + PANEL_W + GAP_PANELS;

// Where the intro text and the two player panels start, measured from the top of the
// screen in pixels. The top bar strip drawn by the kit is 22 pixels tall, so 28 clears it.
const INTRO_Y = 28;
const PANEL_TOP_Y = 88;

// All four preset buttons share one width so the column reads as a tidy block.
const PRESET_BUTTON_W = 200;

// The engine overlay (configured below) needs palette slot numbers, but configure() runs
// BEFORE init(), where applyTheme() installs the shared UI colors. applyTheme() always
// writes its twelve colors into slots 240..251 (its default start slot), so we can write
// the slot numbers out here as named constants instead of magic numbers.
const THEME_SLOT_PANEL = 242; // Panel fill (dark blue).
const THEME_SLOT_TEXT = 244; // Primary text (off-white).
const THEME_SLOT_HEADER = 246; // Panel titles (warm amber).
const THEME_SLOT_ACCENT = 247; // Lit / active (phosphor green).
const THEME_SLOT_WARM = 248; // Warnings (warm orange).

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

/**
 * Cycles keyboard face-button maps with `BT.inputMap` / `BT.inputMapReset`.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slot map returned by applyTheme() - theme.bg, theme.text, and friends.
    /** @type {ReturnType<typeof applyTheme> | null} */
    theme = null;

    // Human-readable name for the active preset (we track it ourselves - the
    // engine does not expose a "get current map" API).
    presetLabel = '1 Defaults (engine tables)';

    /**
     * Wider logical canvas than `defaultConfig()` so two panels of key maps fit comfortably.
     * No post-process effects, so we upscale 2x in the browser (maxCanvasSize) instead
     * of allocating a larger drawing buffer (drawingBufferSize).
     *
     * @returns {Partial<HardwareSettings>}
     */
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
        };
    }

    /**
     * Palette setup and a clean slate for keyboard maps when the page loads.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        this.palette = BT.paletteCreate(256);

        // Install the shared UI theme (twelve colors in slots 240..251) before handing
        // the palette to the engine. Every panel, button, and pip below draws with these.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        // Copy fresh maps from `BT.DEFAULT_KEYBOARD_PLAYER1` / `...PLAYER2`
        // so hot reload or revisiting this URL does not inherit another demo's edits.
        BT.inputMapReset();
        this.presetLabel = '1 Defaults (engine tables)';
        return true;
    }

    /**
     * Update-side housekeeping for the UI kit, plus one extra keyboard alias.
     */
    update() {
        // Let the kit latch keyboard shortcuts and touch contacts for this frame's
        // buttons. This must be the first line of update() when buttons use { key }.
        ui.tick();

        // The reset button below is bound to Digit0, but the original demo also accepted
        // R as a second reset key. A kit button can only carry one key binding, so this
        // alias stays here in update() (keyboard edges are safe to read here - never in
        // render()). `isKeyPressed` without a repeat rate only fires once per press.
        if (BT.isKeyPressed('KeyR')) {
            this.applyPresetDefaults();
        }
    }

    /**
     * Draw the intro text, the preset buttons, and both player panels.
     */
    render() {
        // Wipe the whole screen with the theme's deep-navy background color.
        BT.clear(this.theme.bg);

        // Full-width 22-pixel title strip across the top of the screen.
        ui.begin('topBar');
        ui.panel('Input Map Remapping - BT.inputMap / BT.inputMapReset');
        ui.end();

        // A borderless text group under the title: what the demo is about, plus the
        // classic "click the canvas" focus tip. No ui.panel() call means no box is drawn.
        ui.begin('topLeft', { x: MARGIN_X, y: INTRO_Y });
        ui.label('Face buttons use BT.isDown(BTN_*, player). Remap at runtime with BT.inputMap.', { color: 'dim' });
        ui.label('Tap a preset button or press its number key. Click the canvas if keys stop.', { color: 'dim' });
        ui.end();

        // One panel of live face-button pips per player, side by side.
        this.renderPlayerPanel(0, PANEL0_X, PANEL_TOP_Y);
        this.renderPlayerPanel(1, PANEL1_X, PANEL_TOP_Y);

        // The preset switcher lives in its own panel in the bottom-left corner. Each
        // ui.button() returns true on the one frame it is clicked, tapped, or its bound
        // key goes down - all three inputs behave exactly the same.
        ui.begin('bottomLeft');
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

    /**
     * Restore the shipped tables (`BT.DEFAULT_KEYBOARD_PLAYER1` / PLAYER2 copies).
     */
    applyPresetDefaults() {
        BT.inputMapReset();
        this.presetLabel = '1 Defaults (BT.inputMapReset)';
        BT.assignTag('Map: defaults');
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
        BT.assignTag('Map: custom');
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
        BT.assignTag('Map: cleared A');
    }

    /**
     * One player's panel: title, default-key hints, and a column of live face-button pips.
     *
     * @param {number} player - 0 or 1.
     * @param {number} originX - Left edge (pixels).
     * @param {number} originY - Top edge (pixels).
     */
    renderPlayerPanel(player, originX, originY) {
        // Pin the group at an exact position and force both panels to the same width so
        // the two columns line up regardless of how long each panel's text rows are.
        ui.begin('topLeft', { x: originX, y: originY, width: PANEL_W });
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
