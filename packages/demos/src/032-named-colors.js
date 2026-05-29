// @pageTitle Blit-Tech Demo 032 - Named Colors
//
// Named Colors Demo - Color32 named lookup table and custom registration APIs.
//
// Demo 032 in the Blit-Tech demo series.
//
// What this demo teaches:
// - How to read built-in named colors with Color32.resolveNamedColor('tomato')
// - How to add your own name with Color32.registerColor(...)
// - How to change a custom name over time with Color32.updateColor(...)
// - How to remove and re-add a custom name with Color32.unregisterColor(...)
//
// Think of the named-color table as a dictionary:
// - The "word" is a name like "cornflowerblue".
// - The "definition" is a Color32 value (r, g, b, a).
// - resolveNamedColor(name) asks the dictionary: "Do you know this word?"
//
// #region Imports

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

// #endregion

// #region Type Definitions

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #endregion

// #region Configuration

const C_BG = 1;
const C_TEXT = 2;
const C_PANEL = 3;
const C_PANEL_BORDER = 4;
const C_TOMATO = 5;
const C_CORNFLOWER = 6;
const C_CUSTOM_DYNAMIC = 7;
const C_OPTIONAL = 8;
const C_OPTIONAL_FALLBACK = 9;
const C_OK = 10;
const C_WARN = 11;

const CUSTOM_DYNAMIC_NAME = 'demo-dynamic';
const CUSTOM_OPTIONAL_NAME = 'demo-optional';

const SWATCH_W = 64;
const SWATCH_H = 26;

// #endregion

// #region Main Logic

/**
 * Demonstrates built-in and custom named colors.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    palette = null;
    optionalRegistered = true;
    elapsed = 0;

    // #endregion

    // #region Helper Functions

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
        BT.drawRectFill(new Rect2i(x, y, SWATCH_W, SWATCH_H), colorIndex);
        BT.drawRect(new Rect2i(x, y, SWATCH_W, SWATCH_H), C_PANEL_BORDER);
        BT.systemPrint(new Vector2i(x, y + SWATCH_H + 2), C_TEXT, label);
    }

    // #endregion

    // #region Main Demo Logic

    /**
     * Build palette and register custom named colors.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        this.palette = BT.paletteCreate(256);

        // UI colors for panels and text.
        this.palette.set(C_BG, new Color32(14, 18, 28));
        this.palette.set(C_TEXT, new Color32(232, 236, 245));
        this.palette.set(C_PANEL, new Color32(26, 33, 49));
        this.palette.set(C_PANEL_BORDER, new Color32(79, 93, 121));
        this.palette.set(C_OPTIONAL_FALLBACK, new Color32(80, 80, 80));
        this.palette.set(C_OK, new Color32(120, 235, 165));
        this.palette.set(C_WARN, new Color32(255, 193, 122));

        // Remove old custom names before registering fresh ones.
        this.removeIfExists(CUSTOM_DYNAMIC_NAME);
        this.removeIfExists(CUSTOM_OPTIONAL_NAME);

        // Add two custom names we can edit/remove at runtime.
        Color32.registerColor(CUSTOM_DYNAMIC_NAME, new Color32(90, 170, 255));
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
        } else if (!shouldBeRegistered && this.optionalRegistered) {
            Color32.unregisterColor(CUSTOM_OPTIONAL_NAME);
            this.optionalRegistered = false;
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
     */
    render() {
        BT.clear(C_BG);

        BT.systemPrint(new Vector2i(8, 20), C_TEXT, 'Built-in lookups + custom register/update/unregister');

        BT.drawRectFill(new Rect2i(6, 32, 308, 126), C_PANEL);
        BT.drawRect(new Rect2i(6, 32, 308, 126), C_PANEL_BORDER);

        this.drawSwatch(16, 44, C_TOMATO, 'tomato');
        this.drawSwatch(96, 44, C_CORNFLOWER, 'cornflower');
        this.drawSwatch(176, 44, C_CUSTOM_DYNAMIC, 'dynamic');
        this.drawSwatch(256, 44, C_OPTIONAL, 'optional');

        BT.systemPrint(new Vector2i(16, 104), C_TEXT, "Custom dynamic name: 'demo-dynamic'");
        BT.systemPrint(new Vector2i(16, 116), C_TEXT, "Custom optional name: 'demo-optional'");

        const optionalStateText = this.optionalRegistered
            ? 'demo-optional is registered (Color32.registerColor)'
            : 'demo-optional is missing (Color32.unregisterColor)';
        BT.systemPrint(new Vector2i(16, 132), this.optionalRegistered ? C_OK : C_WARN, optionalStateText);

        BT.drawRectFill(new Rect2i(6, 168, 308, 66), C_PANEL);
        BT.drawRect(new Rect2i(6, 168, 308, 66), C_PANEL_BORDER);
        BT.systemPrint(new Vector2i(14, 178), C_TEXT, 'Tips:');
        BT.systemPrint(new Vector2i(14, 190), C_TEXT, '- Names are trim + lowercase normalized.');
        BT.systemPrint(new Vector2i(14, 202), C_TEXT, '- registerColor throws if the name already exists.');
        BT.systemPrint(new Vector2i(14, 214), C_TEXT, '- updateColor and unregisterColor throw if missing.');
    }

    // #endregion
}

// #endregion

// #region Exports

bootstrap(Demo);

// #endregion
