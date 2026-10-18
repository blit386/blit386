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
 * module reads its colors from `T`, so no widget ever hardcodes a palette slot number. It
 * also builds the nine-slices ui.panel() and ui.button() draw (`T.panelSlice`,
 * `T.buttonSlices`, ...) from those same slots.
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

import { Color32, NineSlice, Rect2i, SpriteSheet } from 'blit386';

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

// Offsets of individual theme colors within the twelve-color block, for demos that need a
// slot number before applyTheme() has run (see configure() below, which runs before init()).
// Exported so those demos derive from THEME_COLORS' actual order instead of repeating a
// literal offset that would silently go stale if the color list above is ever reordered.
const THEME_PANEL_OFFSET = THEME_COLORS.findIndex((entry) => entry.key === 'panel');
const THEME_TEXT_OFFSET = THEME_COLORS.findIndex((entry) => entry.key === 'text');

// The slot a theme color lands in when applyTheme() runs with its default startSlot.
function defaultThemeSlot(key) {
    return THEME_DEFAULT_START_SLOT + THEME_COLORS.findIndex((entry) => entry.key === key);
}

// Engine overlay colors for a demo on the default theme, matching the primitives demo:
// off-white bars, near-black text, and the screen background in the 1 px gaps between
// bands. The overlay's own defaults (slots 1 and 2) are empty in a theme-only palette and
// draw solid black. Pass it as configure()'s overlayStyle.
const THEME_OVERLAY_STYLE = Object.freeze({
    barPaletteIndex: defaultThemeSlot('text'),
    textPaletteIndex: defaultThemeSlot('shadow'),
    gapPaletteIndex: defaultThemeSlot('bg'),
});

// Audio meter band colors to go with THEME_OVERLAY_STYLE, for demos that turn on
// isOverlayAudioMetersEnabled: green level bars on a dark track, amber past the warning
// level, warm orange when a bus clips. The engine's warning and clip defaults are fixed low
// slots that a theme-only palette leaves black. Pass it as configure()'s
// overlayAudioMeterStyle.
const THEME_OVERLAY_AUDIO_METER_STYLE = Object.freeze({
    levelBarPaletteIndex: defaultThemeSlot('accent'),
    trackPaletteIndex: defaultThemeSlot('bg'),
    warningPaletteIndex: defaultThemeSlot('header'),
    clipPaletteIndex: defaultThemeSlot('warm'),
});

// The five color roles a demo can pass as `{ color: '<role>' }` at any UI kit call site.
// ui-widgets.js's roleSlot() derives its role -> T-slot lookup from this list so the two
// can never independently drift - see the worked example in the root
// .claude/rules/named-constants.md for what happens when they do.
const UI_ROLES = ['dim', 'header', 'accent', 'warm', 'info'];

// The looks a button face can wear, shared by ui.button() and ui.drawButtonFace() so demos
// that draw their own button-shaped cells pick from the same set.
const BUTTON_LOOK = Object.freeze({
    REST: 'rest', // Resting: button fill, border rim.
    HOVER: 'hover', // Under the mouse: lighter fill.
    HELD: 'held', // Pressed, or a success flash: resting fill, accent rim.
    WARN: 'warn', // A failure flash: resting fill, warm rim.
});

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

    // The nine-slices ui.panel(), ui.button(), ui.meter(), and ui.tooltip() draw with,
    // rebuilt by applyTheme() for the new slots. A button has one per BUTTON_LOOK, keyed
    // by the look's name. A meter draws its trough, then a fill slice in its color role's
    // slot - meterFillSlices maps each role's palette slot to that fill.

    panelSlice: null,
    buttonSlices: {},
    meterTroughSlice: null,
    meterFillSlices: new Map(),
    tooltipSlice: null,
};

// The UI art: the same pictures as public/sprites/panel.png, button.png, meter-bg.png,
// meter-fg.png, and tooltip.png, copied here as text so the kit can build them instantly,
// with no file to wait for - keep them in sync by hand. Each symbol picks a theme color:
// '#' outline (shadow), '=' rim (border, or accent on a held button), ':' fill (the panel,
// button, meter, or tooltip color), '.' see-through.

const PANEL_ART_CAP = 6;
const BUTTON_ART_CAP = 6;
const METER_ART_CAP = 4;
const TOOLTIP_CAP_X = 4;
const TOOLTIP_CAP_TOP = 4;
const TOOLTIP_CAP_BOTTOM = 5;

const PANEL_ART = [
    '.....####.....',
    '...##====##...',
    '..#==::::==#..',
    '.#=::::::::=#.',
    '.#=::::::::=#.',
    '#=::::::::::=#',
    '#=::::::::::=#',
    '#=::::::::::=#',
    '#=::::::::::=#',
    '.#=::::::::=#.',
    '.#=::::::::=#.',
    '..#==::::==#..',
    '...##====##...',
    '.....####.....',
];

const BUTTON_ART = [
    '.....####.....',
    '...##====##...',
    '..#========#..',
    '.#===::::===#.',
    '.#=::::::::=#.',
    '#=::::::::::=#',
    '#=::::::::::=#',
    '#=::::::::::=#',
    '##=::::::::=##',
    '.#=::::::::=#.',
    '.##==::::==##.',
    '..###====###..',
    '...########...',
    '.....####.....',
];

const METER_TROUGH_ART = [
    '...###...',
    '..#===#..',
    '.#=:::=#.',
    '#=:::::=#',
    '#=:::::=#',
    '#=:::::=#',
    '.#=:::=#.',
    '..#===#..',
    '...###...',
];

const METER_FILL_ART = [
    '.........',
    '.........',
    '...:::...',
    '..:::::..',
    '..:::::..',
    '..:::::..',
    '...:::...',
    '.........',
    '.........',
];

const TOOLTIP_ART = [
    '...###...',
    '..#:::#..',
    '.#:::::#.',
    '#:::::::#',
    '#:::::::#',
    '#:::::::#',
    '##:::::##',
    '.##:::##.',
    '..#####..',
    '...###...',
];

// A solid block: one fill pixel, no corners, so the whole thing stretches over any box.
const SOLID_ART = [':'];
const SOLID_ART_CAP = 0;

/**
 * Builds a nine-slice straight from palette indices, so the art always draws with the
 * theme's current slots - nothing is matched by color and no extra palette slot is used.
 *
 * @param {string[]} art - One string per row. Every row is the same width; the picture
 *   does not have to be square.
 * @param {number} cap - Corner size in pixels on every side. `caps` overrides individual sides.
 * @param {number} fillSlot - The palette slot ':' pixels draw with.
 * @param {number} rimSlot - The palette slot '=' pixels draw with.
 * @param {{ left?: number, top?: number, right?: number, bottom?: number }} [caps] - Per-side
 *   corner sizes, for art whose top and bottom corners differ. Omitted sides use `cap`.
 * @returns {NineSlice}
 */
function buildSlice(art, cap, fillSlot, rimSlot, caps) {
    // Index 0 is the engine's "see-through" index, so '.' maps to it.
    const slotFor = { '#': T.shadow, '=': rimSlot, ':': fillSlot, '.': 0 };
    const height = art.length;
    const width = art[0].length;
    const pixels = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
        // A short row or an unknown symbol would otherwise become silent see-through pixels.
        if (art[y].length !== width) {
            throw new Error(`UI art row ${y} must be ${width} symbols wide, like the first row.`);
        }

        for (let x = 0; x < width; x++) {
            const slot = slotFor[art[y][x]];

            if (slot === undefined) {
                throw new Error(`UI art has an unknown symbol '${art[y][x]}' at ${x},${y}.`);
            }

            pixels[y * width + x] = slot;
        }
    }

    const left = caps?.left ?? cap;
    const top = caps?.top ?? cap;
    const right = caps?.right ?? cap;
    const bottom = caps?.bottom ?? cap;
    const sheet = SpriteSheet.fromIndexedPixels(width, height, pixels);

    return NineSlice.fromSheet(
        sheet,
        new Rect2i(0, 0, width, height),
        new Rect2i(left, top, width - left - right, height - top - bottom),
    );
}

// One cached solid slice per palette slot, built the first time that slot is drawn. A slice
// only stores its slot number (never a color), so it stays right across applyTheme() calls
// and palette animation alike.
const solidSlices = new Map();

/**
 * Returns a 1x1 one-color nine-slice for `slot`, which the kit stretches over a box to draw
 * a rectangle as a sprite. The engine draws every primitive (BT.drawRectFill and friends)
 * before every sprite, so a primitive can never land on top of a nine-slice panel - sprite
 * rectangles keep their call order instead.
 *
 * @param {number} slot - Palette slot to fill with, 1-255 (slot 0 is see-through).
 * @returns {NineSlice}
 */
function solidSlice(slot) {
    let slice = solidSlices.get(slot);

    if (slice === undefined) {
        if (!Number.isInteger(slot) || slot < 1 || slot > 255) {
            throw new Error(`ui: a rectangle's palette slot must be an integer from 1 to 255, got ${slot}.`);
        }

        slice = buildSlice(SOLID_ART, SOLID_ART_CAP, slot, slot);
        solidSlices.set(slot, slice);
    }

    return slice;
}

// One cached button face per fill and rim slot pair, for ui.drawButtonFill(), keyed
// fill * 256 + rim. Unlike a solid slice, a button face also bakes in the theme's shadow
// slot (and its border slot by default), so applyTheme() clears this cache whenever it
// reinstalls the theme.
const buttonFillSlices = new Map();

/**
 * Throws unless `slot` is a palette slot a button fill or rim can use.
 *
 * @param {number} slot - The slot to check.
 * @param {string} role - 'fill' or 'rim', for the error message.
 */
function checkButtonSlot(slot, role) {
    if (!Number.isInteger(slot) || slot < 1 || slot > 255) {
        throw new Error(`ui: a button ${role}'s palette slot must be an integer from 1 to 255, got ${slot}.`);
    }
}

/**
 * Returns the kit's rounded button face with its fill in palette slot `slot`, for cells
 * that light up in a scene color - a key cap that flashes yellow, say - while keeping the
 * button shape. The rim is the theme's border unless `rimSlot` names another slot (a
 * lighter shade of the fill, for example); the shadow is always the theme's.
 *
 * @param {number} slot - Palette slot to fill with, 1-255 (slot 0 is see-through).
 * @param {number} [rimSlot] - Palette slot for the rim, 1-255. Defaults to the theme border.
 * @returns {NineSlice}
 */
function buttonFillSlice(slot, rimSlot = T.border) {
    const key = slot * 256 + rimSlot;
    let slice = buttonFillSlices.get(key);

    if (slice === undefined) {
        checkButtonSlot(slot, 'fill');
        checkButtonSlot(rimSlot, 'rim');

        slice = buildSlice(BUTTON_ART, BUTTON_ART_CAP, slot, rimSlot);
        buttonFillSlices.set(key, slice);
    }

    return slice;
}

/**
 * The rim color for a button lit with fill `color`: `color` brightened by exactly the step
 * from the theme's resting button fill to its border, channel by channel and kept within
 * 0-255. A lit button's rim then stands out from its fill as much as a resting button's
 * rim does from its own. Reads both theme colors from `palette`, so call it after
 * applyTheme(), and write the result into a slot of its own to pass as a lit button's rim.
 *
 * @param {import('blit386').Palette} palette - The palette applyTheme() wrote into.
 * @param {Color32} color - The lit fill color.
 * @returns {Color32} A new color for the rim.
 */
function litRimColor(palette, color) {
    if (!T.ready) {
        throw new Error('litRimColor: call applyTheme(palette) first, so the theme colors are known.');
    }

    const from = palette.get(T.button);
    const to = palette.get(T.border);
    const channel = (value, delta) => Math.max(0, Math.min(255, value + delta));

    return new Color32(
        channel(color.r, to.r - from.r),
        channel(color.g, to.g - from.g),
        channel(color.b, to.b - from.b),
        color.a,
    );
}

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

    T.panelSlice = buildSlice(PANEL_ART, PANEL_ART_CAP, T.panel, T.border);

    // Held and warn keep the resting fill and light up the rim instead.
    T.buttonSlices = {
        [BUTTON_LOOK.REST]: buildSlice(BUTTON_ART, BUTTON_ART_CAP, T.button, T.border),
        [BUTTON_LOOK.HOVER]: buildSlice(BUTTON_ART, BUTTON_ART_CAP, T.buttonHover, T.border),
        [BUTTON_LOOK.HELD]: buildSlice(BUTTON_ART, BUTTON_ART_CAP, T.button, T.accent),
        [BUTTON_LOOK.WARN]: buildSlice(BUTTON_ART, BUTTON_ART_CAP, T.button, T.warm),
    };
    T.meterTroughSlice = buildSlice(METER_TROUGH_ART, METER_ART_CAP, T.panel, T.border);

    // One meter fill per color a meter can ask for: 'text' plus every UI_ROLES role.
    T.meterFillSlices.clear();
    buttonFillSlices.clear();

    for (const slot of [T.text, ...UI_ROLES.map((role) => T[role])]) {
        T.meterFillSlices.set(slot, buildSlice(METER_FILL_ART, METER_ART_CAP, slot, T.border));
    }

    // The tooltip's top corners are shorter than its bottom ones, so the caps are per side.
    // The fill is the same off-white the kit uses for text, so a shadow-colored label
    // stays readable on it.
    T.tooltipSlice = buildSlice(TOOLTIP_ART, TOOLTIP_CAP_X, T.text, T.border, {
        top: TOOLTIP_CAP_TOP,
        bottom: TOOLTIP_CAP_BOTTOM,
    });

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

export {
    applyTheme,
    BUTTON_LOOK,
    buttonFillSlice,
    litRimColor,
    solidSlice,
    T,
    THEME_DEFAULT_START_SLOT,
    THEME_OVERLAY_AUDIO_METER_STYLE,
    THEME_OVERLAY_STYLE,
    THEME_PANEL_OFFSET,
    THEME_TEXT_OFFSET,
    TOOLTIP_CAP_BOTTOM,
    TOOLTIP_CAP_TOP,
    TOOLTIP_CAP_X,
    UI_ROLES,
};
