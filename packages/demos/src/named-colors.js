/**
 * Named Colors Demo - Color32 named lookup table and custom registration APIs.
 *
 * Demo 032 in the BLIT386 demo series.
 * Prerequisites: 001-Basics (https://demos.blit386.dev/001-basics),
 * 003-Colors (https://demos.blit386.dev/003-colors).
 *
 * What this demo teaches:
 * - How to read built-in named colors with Color32.resolveNamedColor('tomato')
 * - How to add your own name with Color32.registerColor(...)
 * - How to change a custom name over time with Color32.updateColor(...)
 * - How to remove and re-add a custom name with Color32.unregisterColor(...)
 *
 * Think of the named-color table as a dictionary:
 * - The "word" is a name like "cornflowerblue".
 * - The "definition" is a Color32 value (r, g, b, a).
 * - resolveNamedColor(name) asks the dictionary: "Do you know this word?"
 *
 * The title strip, captions, and tips panel draw with the shared demo UI kit
 * (src/shared/ui.js), so this demo's chrome matches every other demo. The color
 * swatches themselves stay hand-drawn - their palette slots ARE the lesson.
 *
 * Live version: https://demos.blit386.dev/032-named-colors
 */

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

// The shared demo UI kit. applyTheme() installs the kit's twelve UI colors high in the
// palette (slots 240-251, far above this demo's slots 1-9), and ui.* draws the title
// strip, the caption text, and the Tips panel.
import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// Palette indices for this demo's own colors. Slot 0 stays transparent.
// Panels, captions, and status text draw with the shared UI theme instead (installed by
// applyTheme() in init()), so only two kinds of slots live down here: the overlay timing
// chart's bar colors, and the lesson's swatch slots.
//
// The chart slots exist because configure() runs BEFORE init() installs the theme, so the
// chart style cannot point at theme slots - init() copies the matching theme colors here.
const C_CHART_UPDATE = 1; // Timing chart: update() bar (matches the theme's blue-gray border).
const C_CHART_RENDER = 2; // Timing chart: render() bar (matches the theme's off-white text).
const C_CHART_TAG = 3; // Timing chart: milestone tag labels (matches the theme's green accent).
const C_TOMATO = 5; // Swatch slot for built-in name "tomato".
const C_CORNFLOWER = 6; // Swatch slot for built-in name "cornflowerblue".
const C_CUSTOM_DYNAMIC = 7; // Swatch slot for animated custom name "demo-dynamic".
const C_OPTIONAL = 8; // Swatch slot for toggled custom name "demo-optional".
const C_OPTIONAL_FALLBACK = 9; // Gray shown when demo-optional is unregistered.

const CUSTOM_DYNAMIC_NAME = 'demo-dynamic';
const CUSTOM_OPTIONAL_NAME = 'demo-optional';

const SWATCH_W = 64;
const SWATCH_H = 26;

/**
 * Demonstrates built-in and custom named colors.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // theme holds the palette slot numbers of the shared UI kit colors, filled in by
    // applyTheme() in init(). We use them for the background, the swatch panel frame,
    // and the swatch outlines and labels.
    theme = null;

    optionalRegistered = true;
    elapsed = 0;

    /**
     * Opt in to the overlay timing chart with palette-matched bar colors.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_CHART_UPDATE,
                renderBarPaletteIndex: C_CHART_RENDER,
                tagPaletteIndex: C_CHART_TAG,
            },
        };
    }

    /**
     * Build palette and register custom named colors.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        this.palette = BT.paletteCreate(256);

        // Overlay timing chart colors. These copy the shared theme's hex values into the
        // low slots that configure() pointed the chart style at (see the note on the
        // C_CHART_* constants above for why the chart cannot use theme slots directly).
        this.palette.set(C_CHART_UPDATE, Color32.fromHex('#5a6480')); // theme border blue-gray
        this.palette.set(C_CHART_RENDER, Color32.fromHex('#e6ecf5')); // theme text off-white
        this.palette.set(C_CHART_TAG, Color32.fromHex('#7dffa5')); // theme accent green

        // Fallback gray for the moments when demo-optional is unregistered.
        this.palette.set(C_OPTIONAL_FALLBACK, new Color32(80, 80, 80));

        // Install the shared UI kit colors. They land in palette slots 240-251, far above
        // the swatch slots this demo animates (5-9), so the two can never collide. The
        // returned map remembers which slot each UI color went to (theme.bg, theme.text, ...).
        this.theme = applyTheme(this.palette);

        // Remove old custom names before registering fresh ones.
        // Hot reload can leave names in memory from a previous run; unregister first
        // so registerColor does not throw "name already exists".
        this.removeIfExists(CUSTOM_DYNAMIC_NAME);
        this.removeIfExists(CUSTOM_OPTIONAL_NAME);

        // registerColor adds a NEW entry to the global name table.
        // It throws if the name is already taken - that is why we cleared above.
        // 'demo-dynamic' will be rewritten every tick with updateColor in update().
        Color32.registerColor(CUSTOM_DYNAMIC_NAME, new Color32(90, 170, 255));

        // 'demo-optional' starts registered; update() will unregister and re-register
        // it on a timer so you can watch resolveNamedColor fall back to gray.
        Color32.registerColor(CUSTOM_OPTIONAL_NAME, new Color32(255, 90, 150));
        this.optionalRegistered = true;
        this.elapsed = 0;

        BT.paletteSet(this.palette);
        return true;
    }

    /**
     * Animate custom named colors every tick.
     */
    update() {
        this.elapsed += BT.deltaSeconds;

        // Read two built-in names from the registry.
        const tomato = this.resolveOr('tomato', new Color32(255, 99, 71));
        const cornflower = this.resolveOr('cornflowerblue', new Color32(100, 149, 237));

        // Blend between the two built-ins to create a moving custom color.
        // Math.sin() returns -1..1, so (sin+1)/2 converts it to 0..1.
        const t = (Math.sin(this.elapsed * 2) + 1) / 2;
        const dynamicColor = tomato.lerp(cornflower, t);
        Color32.updateColor(CUSTOM_DYNAMIC_NAME, dynamicColor);

        // Every 3 seconds toggle demo-optional:
        // registered -> unregistered -> registered -> ...
        const cycle = Math.floor(this.elapsed / 3) % 2;
        const shouldBeRegistered = cycle === 0;

        if (shouldBeRegistered && !this.optionalRegistered) {
            Color32.registerColor(CUSTOM_OPTIONAL_NAME, new Color32(255, 90, 150));
            this.optionalRegistered = true;
            BT.assignTag('Optional registered');
        } else if (!shouldBeRegistered && this.optionalRegistered) {
            Color32.unregisterColor(CUSTOM_OPTIONAL_NAME);
            this.optionalRegistered = false;
            BT.assignTag('Optional removed');
        }

        // Copy current named colors into palette slots used by draw calls.
        this.palette.set(C_TOMATO, tomato);
        this.palette.set(C_CORNFLOWER, cornflower);
        this.palette.set(C_CUSTOM_DYNAMIC, this.resolveOr(CUSTOM_DYNAMIC_NAME, new Color32(255, 255, 255)));
        this.palette.set(
            C_OPTIONAL,
            this.resolveOr(CUSTOM_OPTIONAL_NAME, this.resolveOr('gray', new Color32(128, 128, 128))),
        );
    }

    /**
     * Draw color swatches and live registry status.
     *
     * The chrome (title strip, captions, Tips panel) draws with the shared UI kit;
     * the swatch panel and swatches stay hand-drawn because their palette slots
     * are what this demo teaches.
     */
    render() {
        // Fill the screen with the shared UI theme's deep navy background.
        BT.clear(this.theme.bg);

        // Full-width title strip across the top of the screen, drawn by the shared UI kit.
        // 'topBar' is the classic 22-pixel strip; panel() gives it a background and title.
        ui.begin('topBar');
        ui.panel('Built-in lookups + register / update / unregister');
        ui.end();

        // Upper panel: hand-drawn background for the four color swatches. Kit panels size
        // themselves around kit rows only, so a frame around hand-drawn artwork keeps using
        // BT.drawRectFill / BT.drawRect - but with the shared theme's panel colors.
        BT.drawRectFill(new Rect2i(6, 32, 308, 126), this.theme.panel);
        BT.drawRect(new Rect2i(6, 32, 308, 126), this.theme.border);

        // Four labeled swatches in one row (tomato, cornflower, animated custom, optional custom).
        this.drawSwatch(16, 44, C_TOMATO, 'tomato');
        this.drawSwatch(96, 44, C_CORNFLOWER, 'cornflower');
        this.drawSwatch(176, 44, C_CUSTOM_DYNAMIC, 'dynamic');
        this.drawSwatch(256, 44, C_OPTIONAL, 'optional');

        // Captions under the swatches: a borderless kit group pinned inside the panel.
        // Passing x and y pins the group's top-left corner; pad: 0 removes the group's
        // inner padding so the first row starts exactly at (16, 100).
        ui.begin('topLeft', { x: 16, y: 100, pad: 0 });
        ui.label("Custom dynamic name: 'demo-dynamic'");
        ui.label("Custom optional name: 'demo-optional'");

        // The status line flips between the theme's green 'accent' and orange 'warm' roles,
        // so you can watch Color32.registerColor / Color32.unregisterColor take effect
        // every 3 seconds (update() drives the toggle).
        if (this.optionalRegistered) {
            ui.label('demo-optional is registered (registerColor)', { color: 'accent' });
        } else {
            ui.label('demo-optional is missing (unregisterColor)', { color: 'warm' });
        }
        ui.end();

        // Lower panel: API tips as a kit panel anchored to the bottom-left corner.
        // The kit sizes the panel to its widest row and keeps a small screen margin.
        ui.begin('bottomLeft');
        ui.panel('Tips');
        ui.label('Names are trim + lowercase normalized.', { color: 'dim' });
        ui.label('registerColor throws if the name exists.', { color: 'dim' });
        ui.label('updateColor / unregisterColor throw if missing.', { color: 'dim' });
        ui.end();
    }

    /**
     * Resolve a named color and fall back if the name is missing.
     *
     * @param {string} name
     * @param {Color32} fallback
     * @returns {Color32}
     */
    resolveOr(name, fallback) {
        const resolved = Color32.resolveNamedColor(name);
        if (resolved === undefined) {
            return fallback;
        }
        return resolved;
    }

    /**
     * If a custom name exists, remove it first so init() can register cleanly.
     *
     * This makes hot-reload safer during development.
     *
     * @param {string} name
     */
    removeIfExists(name) {
        if (Color32.resolveNamedColor(name) !== undefined) {
            Color32.unregisterColor(name);
        }
    }

    /**
     * Draw one labeled color swatch.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} colorIndex
     * @param {string} label
     */
    drawSwatch(x, y, colorIndex, label) {
        // Fill the swatch with the palette slot we are demonstrating - the lesson itself.
        BT.drawRectFill(new Rect2i(x, y, SWATCH_W, SWATCH_H), colorIndex);

        // The outline and the label are chrome, so they use the shared UI theme colors.
        BT.drawRect(new Rect2i(x, y, SWATCH_W, SWATCH_H), this.theme.border);
        BT.systemPrint(new Vector2i(x, y + SWATCH_H + 2), this.theme.text, label);
    }
}

bootstrap(Demo);
