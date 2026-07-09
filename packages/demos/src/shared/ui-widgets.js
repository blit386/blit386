/**
 * The widgets of the shared demo UI kit.
 *
 * Every function here follows the same immediate-mode recipe (see ui-core.js for the big
 * picture): reserve a row with ctx.addRow(), queue draw commands with group-relative
 * coordinates, optionally register a hit rectangle, and - for interactive widgets - answer
 * the caller right away using last frame's cached rectangle. Nothing here allocates in the
 * steady state; every object involved is pooled and reused.
 *
 * Demos never import this file directly - the ui.js facade wires these functions to the
 * one shared UiContext and exposes them as ui.panel(), ui.button(), and so on.
 */

import { BUTTON_H, CMD_RECT_FILL, CMD_RECT_STROKE, CMD_TEXT, FONT_W, FULL_WIDTH, ROW_H } from './ui-core.js';
import { T } from './ui-theme.js';

// Checkbox pip geometry: a 10x10 square with the label starting 14 pixels in.
const PIP_SIZE = 10;
const PIP_LABEL_OFFSET = 14;

// Buttons get 8 pixels of breathing room on each side of their label.
const BUTTON_TEXT_PAD = 8;

// Default width of slider and meter bars when the demo does not pass one.
const BAR_DEFAULT_W = 140;
const SLIDER_BAR_H = 12;
const METER_BAR_H = 8;

/**
 * Keeps a number between `min` and `max`.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Translates a color role name ('dim', 'header', ...) into its theme palette slot.
 *
 * @param {string | undefined} role - One of 'text', 'dim', 'header', 'accent', 'warm', 'info'.
 * @returns {number} A palette index from the shared theme.
 */
function roleSlot(role) {
    switch (role) {
        case 'dim':
            return T.dim;
        case 'header':
            return T.header;
        case 'accent':
            return T.accent;
        case 'warm':
            return T.warm;
        case 'info':
            return T.info;
        default:
            return T.text;
    }
}

/**
 * Turns the current group into a bordered panel (background + border + optional amber
 * title). Call it right after ui.begin(), before any other widget.
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {string} [title] - Panel title, drawn in the header color. Omit for a plain box.
 */
function panel(ctx, title) {
    if (!ctx.inGroup) {
        throw new Error('ui.panel: call ui.begin() first.');
    }

    if (ctx.commandCount > 0) {
        throw new Error('ui.panel: declare the panel before any other widget in the group.');
    }

    ctx.hasPanel = true;

    if (title) {
        // The classic title inset used across the demo series: 4 pixels from the top-left
        // corner (3 for the slightly tighter full-width top bar).
        const titleY = ctx.isTopBar ? 3 : 4;

        ctx.addCommand(CMD_TEXT, 4, titleY, 0, 0, T.header, title);

        // The title contributes to auto width (4 px inset on both sides), and the first
        // content row starts below it.
        ctx.maxGroupW = Math.max(ctx.maxGroupW, title.length * FONT_W + 8);
        ctx.cursorY = ctx.isTopBar ? 22 : 20;
    }
}

/**
 * One line of text.
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {string} text - The line to print.
 * @param {{ color?: string }} [opts] - color picks a role: 'text' (default), 'dim',
 *   'header', 'accent', 'warm', or 'info'.
 */
function label(ctx, text, opts = {}) {
    const rowY = ctx.addRow(text.length * FONT_W, ROW_H);

    // +1 vertically centers the 14-pixel font inside the 16-pixel row.
    ctx.addCommand(CMD_TEXT, ctx.pad, rowY + 1, 0, 0, roleSlot(opts.color), text);
}

/**
 * A "KEY: value" row - the key in dim gray, the value in bright text, aligned to a shared
 * value column so stacked kv rows line up.
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {string} key - Left-hand name.
 * @param {string | number} value - Right-hand value (numbers are printed as-is).
 */
function kv(ctx, key, value) {
    const valueText = String(value);

    // The value column starts after kvCols characters (from ui.begin() opts, default 8),
    // or after the key plus one space when the key is longer than that.
    const valueX = Math.max(ctx.kvCols, key.length + 1) * FONT_W;
    const rowY = ctx.addRow(valueX + valueText.length * FONT_W, ROW_H);

    ctx.addCommand(CMD_TEXT, ctx.pad, rowY + 1, 0, 0, T.dim, key);
    ctx.addCommand(CMD_TEXT, ctx.pad + valueX, rowY + 1, 0, 0, T.text, valueText);
}

/**
 * A checkbox row: a small square "pip" (filled when on, hollow when off) plus a label.
 * The whole row is tappable. Returns the NEXT value, so demos write:
 *
 *     this.loop = ui.checkbox('Loop', this.loop);
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {string} text - The label next to the pip (also the widget's identity).
 * @param {boolean} value - The current on/off state.
 * @param {{ key?: string, id?: string }} [opts] - key binds a keyboard shortcut (a
 *   KeyboardEvent.code like 'KeyM'); id overrides the identity when two checkboxes share
 *   one label.
 * @returns {boolean} The value for the next frame (flipped when clicked/tapped/key-pressed).
 */
function checkbox(ctx, text, value, opts = {}) {
    const id = opts.id || text;
    const contentW = PIP_LABEL_OFFSET + text.length * FONT_W;
    const rowY = ctx.addRow(contentW, ROW_H);

    const res = ctx.resolveInteraction(id);
    const keyFired = ctx.consumeKey(opts.key);

    // The pip: filled with the accent color when on, hollow otherwise; always outlined.
    if (value) {
        ctx.addCommand(CMD_RECT_FILL, ctx.pad, rowY + 3, PIP_SIZE, PIP_SIZE, T.accent);
    }

    ctx.addCommand(CMD_RECT_STROKE, ctx.pad, rowY + 3, PIP_SIZE, PIP_SIZE, T.border);

    // On or hovered rows brighten so the row reads as live.
    const textColor = value || res.hover ? T.text : T.dim;

    ctx.addCommand(CMD_TEXT, ctx.pad + PIP_LABEL_OFFSET, rowY + 1, 0, 0, textColor, text);

    // The full row is the touch target, not just the little pip.
    ctx.addHit(id, ctx.pad, rowY, contentW, ROW_H);

    return res.activated || keyFired ? !value : value;
}

/**
 * A read-only indicator row: the same pip-plus-label look as ui.checkbox(), but purely
 * visual - nothing happens when it is tapped. Use it to display live state the user does
 * not set directly, like "is this key held down right now?".
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {string} text - The label next to the pip.
 * @param {boolean} on - Whether the pip is lit.
 */
function pip(ctx, text, on) {
    const contentW = PIP_LABEL_OFFSET + text.length * FONT_W;
    const rowY = ctx.addRow(contentW, ROW_H);

    // Lit pips fill with the accent color; unlit ones stay hollow. Always outlined.
    if (on) {
        ctx.addCommand(CMD_RECT_FILL, ctx.pad, rowY + 3, PIP_SIZE, PIP_SIZE, T.accent);
    }

    ctx.addCommand(CMD_RECT_STROKE, ctx.pad, rowY + 3, PIP_SIZE, PIP_SIZE, T.border);
    ctx.addCommand(CMD_TEXT, ctx.pad + PIP_LABEL_OFFSET, rowY + 1, 0, 0, on ? T.text : T.dim, text);
}

/**
 * A push button. Returns true on the frame it is clicked, tapped, or (when opts.key is
 * given) its keyboard shortcut was pressed.
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {string} text - The button label (also the widget's identity).
 * @param {{ key?: string, width?: number, id?: string }} [opts] - key binds a keyboard
 *   shortcut; width fixes the button width in pixels; id overrides the identity when two
 *   buttons share one label.
 * @returns {boolean} True when the button was activated this frame.
 */
function button(ctx, text, opts = {}) {
    const id = opts.id || text;
    const w = typeof opts.width === 'number' ? opts.width : text.length * FONT_W + 2 * BUTTON_TEXT_PAD;
    const rowY = ctx.addRow(w, BUTTON_H + 3);

    const res = ctx.resolveInteraction(id);
    const keyFired = ctx.consumeKey(opts.key);

    // Three visual states: held (pressed right now), hovered (mouse only), resting.
    let fill = T.button;

    if (res.held) {
        fill = T.accent;
    } else if (res.hover) {
        fill = T.buttonHover;
    }

    ctx.addCommand(CMD_RECT_FILL, ctx.pad, rowY, w, BUTTON_H, fill);
    ctx.addCommand(CMD_RECT_STROKE, ctx.pad, rowY, w, BUTTON_H, T.border);

    // Center the label; while held, dark text on the bright accent fill stays readable.
    const textX = ctx.pad + ((w - text.length * FONT_W) >> 1);

    ctx.addCommand(CMD_TEXT, textX, rowY + 2, 0, 0, res.held ? T.bg : T.text, text);

    ctx.addHit(id, ctx.pad, rowY, w, BUTTON_H);

    return res.activated || keyFired;
}

/**
 * A draggable value bar (label row + bar row). Drag anywhere on the bar to set the value;
 * the drag keeps following the pointer even if it slides off the bar. Returns the new
 * value, so demos write:
 *
 *     volume = ui.slider('Music', volume);
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {string} text - The label above the bar (also the widget's identity).
 * @param {number} value - The current value.
 * @param {{ min?: number, max?: number, width?: number, id?: string }} [opts] - min/max
 *   bound the value (default 0..1); width sets the bar width in pixels; id overrides the
 *   identity.
 * @returns {number} The value for the next frame.
 */
function slider(ctx, text, value, opts = {}) {
    const id = opts.id || text;
    const min = typeof opts.min === 'number' ? opts.min : 0;
    const max = typeof opts.max === 'number' ? opts.max : 1;
    const barW = typeof opts.width === 'number' ? opts.width : BAR_DEFAULT_W;

    // Handle the drag BEFORE drawing, so the bar and the printed value already show this
    // frame's new value instead of lagging one frame behind the finger.
    const dragX = ctx.resolveDrag(id);
    const rec = ctx.hitRects.get(id);
    let nextValue = clamp(value, min, max);

    if (dragX !== null && rec) {
        // Where is the pointer along the bar, from 0 (left edge) to 1 (right edge)?
        const fraction = clamp((dragX - rec.x) / rec.w, 0, 1);

        nextValue = min + fraction * (max - min);
    }

    const valueText = nextValue.toFixed(2);

    // Label row: name on the left, live value right-aligned over the bar's right edge.
    const labelY = ctx.addRow(barW, ROW_H);

    ctx.addCommand(CMD_TEXT, ctx.pad, labelY + 1, 0, 0, T.dim, text);
    ctx.addCommand(CMD_TEXT, ctx.pad + barW - valueText.length * FONT_W, labelY + 1, 0, 0, T.text, valueText);

    // Bar row: an outline that fills up left-to-right in proportion to the value.
    const barY = ctx.addRow(barW, SLIDER_BAR_H + 4);
    const fillW = Math.round(barW * ((nextValue - min) / (max - min)));

    if (fillW > 0) {
        ctx.addCommand(CMD_RECT_FILL, ctx.pad, barY, fillW, SLIDER_BAR_H, dragX === null ? T.info : T.accent);
    }

    ctx.addCommand(CMD_RECT_STROKE, ctx.pad, barY, barW, SLIDER_BAR_H, T.border);

    ctx.addHit(id, ctx.pad, barY, barW, SLIDER_BAR_H);

    return nextValue;
}

/**
 * A read-only progress/level bar (label row + bar row). Purely visual - for a draggable
 * bar use ui.slider().
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {string | null} text - Label above the bar, or null for the bar alone.
 * @param {number} fraction - Fill amount from 0 (empty) to 1 (full).
 * @param {{ color?: string, width?: number }} [opts] - color picks the fill role
 *   (default 'info'); width sets the bar width in pixels.
 */
function meter(ctx, text, fraction, opts = {}) {
    const barW = typeof opts.width === 'number' ? opts.width : BAR_DEFAULT_W;

    if (text !== null && text !== undefined) {
        const labelY = ctx.addRow(barW, ROW_H);

        ctx.addCommand(CMD_TEXT, ctx.pad, labelY + 1, 0, 0, T.dim, text);
    }

    const barY = ctx.addRow(barW, METER_BAR_H + 4);
    const fillW = Math.round(barW * clamp(fraction, 0, 1));

    if (fillW > 0) {
        ctx.addCommand(CMD_RECT_FILL, ctx.pad, barY, fillW, METER_BAR_H, roleSlot(opts.color || 'info'));
    }

    ctx.addCommand(CMD_RECT_STROKE, ctx.pad, barY, barW, METER_BAR_H, T.border);
}

/**
 * A thin horizontal rule across the group, for separating sections inside one panel.
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 */
function separator(ctx) {
    const rowY = ctx.addRow(0, 5);

    // FULL_WIDTH is a sentinel: the line stretches to the group's final width, which is
    // only known once every row has been declared (ui.end() fills it in).
    ctx.addCommand(CMD_RECT_FILL, ctx.pad, rowY + 2, FULL_WIDTH, 1, T.border);
}

/**
 * Vertical breathing room between rows.
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {number} [px] - How many pixels to skip (default 6).
 */
function spacer(ctx, px = 6) {
    if (!ctx.inGroup) {
        throw new Error('ui.spacer: call ui.begin() first.');
    }

    ctx.cursorY += px;
}

export { button, checkbox, kv, label, meter, panel, pip, separator, slider, spacer };
