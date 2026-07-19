/**
 * Shared UI theme - the one set of colors every demo's UI draws with.
 *
 * Demos used to pick their own HUD colors by hand, and over time those colors drifted apart:
 * one demo's panel was a slightly different blue than the next one's, headers were three
 * different ambers, and so on. This module fixes twelve canonical UI colors in one place.
 *
 * applyTheme() writes the twelve colors into a demo's palette (by default into slots
 * 240-251, high above the low slots scene art normally grows up from) and registers a named
 * alias for each one - the same mechanism as the engine's own palette.applyHUD(). It also
 * fills the module-level `T` object with the resolved palette indices. Every other ui-*.js
 * module reads its colors from `T`, so no widget ever hardcodes a palette slot number.
 *
 * Usage, inside a demo's init():
 *
 *     this.palette = BT.paletteCreate(256);
 *     this.theme = applyTheme(this.palette);   // or applyTheme(this.palette, someOtherStartSlot)
 *     BT.paletteSet(this.palette);
 *
 * The returned object maps each color to its palette slot ({ bg, panel, text, ... }), so a
 * demo can also use theme colors for its own drawing - most commonly BT.clear(theme.bg).
 */

import { Color32 } from 'blit386';

// The twelve theme colors, in the order they are written into the palette. `key` is the
// property name on the `T` object below; `name` is the alias registered on the palette so
// demos can also look a color up with palette.getNamed('ui_text') if they want to reuse a
// UI color for their own drawing.
const THEME_COLORS = [
    { key: 'bg', name: 'ui_bg', hex: '#101628' }, // Screen / band background (deep navy).
    { key: 'shadow', name: 'ui_shadow', hex: '#0a0e1a' }, // Darker edge under top bars.
    { key: 'panel', name: 'ui_panel', hex: '#1e2740' }, // Panel fill.
    { key: 'border', name: 'ui_panel_border', hex: '#5a6480' }, // Borders, separators, meter outlines.
    { key: 'text', name: 'ui_text', hex: '#e6ecf5' }, // Primary text (off-white, kind to CRT filters).
    { key: 'dim', name: 'ui_text_dim', hex: '#8c96aa' }, // Secondary text, key-value keys.
    { key: 'header', name: 'ui_header', hex: '#ffc878' }, // Panel titles (warm amber).
    { key: 'accent', name: 'ui_accent', hex: '#7dffa5' }, // Lit / on / active (phosphor green).
    { key: 'warm', name: 'ui_accent_warm', hex: '#ff8c5a' }, // Warnings, unlock prompts.
    { key: 'info', name: 'ui_info', hex: '#7dc3ff' }, // Bar and meter fills, values, code.
    { key: 'button', name: 'ui_button', hex: '#32405f' }, // Button fill, resting state.
    { key: 'buttonHover', name: 'ui_button_hover', hex: '#45577d' }, // Button fill under the mouse.
];

// Resolved palette indices, filled in by applyTheme(). Widgets read `T.text`, `T.panel`,
// and so on instead of raw numbers. `ready` lets the kit give a helpful error when a demo
// forgets to call applyTheme() before drawing UI.
//
// `T` is a single module-level object, not per-palette state: calling applyTheme() again
// (a second demo instance, a test harness, hot-reload) overwrites it in place for whatever
// is currently reading it. That is safe today because ui-core.js and ui-dpad.js assume the
// same "one demo runs at a time" model this whole kit is built on (see ui.js) - there is
// exactly one UiContext and it always draws with the most recently applied theme. It would
// stop being safe the moment two palettes/themes need to be live at once (multiple demos in
// one page, parallel unit tests); that scenario needs a themes-per-context redesign, not a
// patch here.
// applyTheme()'s default startSlot. Exported so a demo that must reference this slot before
// calling applyTheme() (for example inside configure(), which runs before init()) can point
// at the same constant instead of repeating the literal 240.
const THEME_DEFAULT_START_SLOT = 240;

const T = {
    bg: 0,
    shadow: 0,
    panel: 0,
    border: 0,
    text: 0,
    dim: 0,
    header: 0,
    accent: 0,
    warm: 0,
    info: 0,
    button: 0,
    buttonHover: 0,
    ready: false,
};

/**
 * Writes the twelve theme colors into `palette` and remembers where they landed.
 *
 * @param {import('blit386').Palette} palette - The palette the demo is about to activate.
 * @param {number} startSlot - First slot to write (the twelve colors fill startSlot..startSlot+11).
 *   The default (THEME_DEFAULT_START_SLOT, 240) sits at the top of a 256-slot palette, far
 *   away from scene colors, which conventionally grow up from slot 1. Demos whose effects
 *   animate high palette slots pass a different startSlot that stays clear of their animated
 *   range.
 * @returns {{ bg: number, shadow: number, panel: number, border: number, text: number,
 *   dim: number, header: number, accent: number, warm: number, info: number, button: number,
 *   buttonHover: number }} The palette slot of each theme color, for the demo's own drawing.
 */
function applyTheme(palette, startSlot = THEME_DEFAULT_START_SLOT) {
    // Fail fast with clear messages - a wrong startSlot would otherwise show up later as
    // mysteriously wrong UI colors, which is much harder to track down.
    if (!Number.isInteger(startSlot) || startSlot < 1) {
        throw new Error(`applyTheme: startSlot must be an integer of at least 1, got ${startSlot}.`);
    }

    if (startSlot + THEME_COLORS.length > palette.size) {
        throw new Error(
            `applyTheme: slots ${startSlot}..${startSlot + THEME_COLORS.length - 1} do not fit in a ` +
                `palette of size ${palette.size}. Pass a smaller startSlot.`,
        );
    }

    // Write each color into its slot, register its friendly name, and remember the index.
    for (let i = 0; i < THEME_COLORS.length; i++) {
        const entry = THEME_COLORS[i];
        const slot = startSlot + i;

        palette.set(slot, Color32.fromHex(entry.hex));
        palette.setNamed(entry.name, slot);

        T[entry.key] = slot;
    }

    T.ready = true;

    // Hand back a copy of the slot map (not `T` itself) so a demo cannot accidentally
    // repoint the slots the widgets draw with.
    return {
        bg: T.bg,
        shadow: T.shadow,
        panel: T.panel,
        border: T.border,
        text: T.text,
        dim: T.dim,
        header: T.header,
        accent: T.accent,
        warm: T.warm,
        info: T.info,
        button: T.button,
        buttonHover: T.buttonHover,
    };
}

export { applyTheme, T, THEME_DEFAULT_START_SLOT };
