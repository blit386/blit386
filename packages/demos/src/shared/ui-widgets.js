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
 *
 * tooltip() is the exception that draws immediately instead of queueing a command. It has
 * to land on top of artwork the demo painted after the last ui.end(), the same reason
 * ui.drawRectFill() draws right away. Its box and text position are module-level scratch
 * objects, so a tooltip every frame still allocates nothing.
 */

import { BT, Rect2i, Vector2i } from 'blit386';

import {
    BUTTON_H,
    BUTTON_TEXT_PAD_Y,
    CMD_NINE_SLICE,
    CMD_RECT_FILL,
    CMD_RECT_STROKE,
    CMD_TEXT,
    FONT_H,
    FONT_W,
    FULL_WIDTH,
    ROW_H,
} from './ui-core.js';
import {
    BUTTON_LOOK,
    buttonFillSlice,
    T,
    TOOLTIP_CAP_BOTTOM,
    TOOLTIP_CAP_TOP,
    TOOLTIP_CAP_X,
    UI_ROLES,
} from './ui-theme.js';

// Checkbox pip geometry: a 10x10 square with the label starting 14 pixels in.
const PIP_SIZE = 10;
const PIP_LABEL_OFFSET = 14;

// Buttons get 8 pixels of breathing room on each side of their label.
const BUTTON_TEXT_PAD = 8;

// Empty pixels above a button. The label row above ends where the button's row begins, but
// its glyphs reach a pixel or two past that line, so the button is pushed down to keep its
// rim from painting over the text.
const BUTTON_TOP_GAP = 2;

// Default width of slider and meter bars when the demo does not pass one.
const BAR_DEFAULT_W = 140;
const SLIDER_BAR_H = 12;
const METER_BAR_H = 9;
const METER_TOP_GAP = 2;

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

// Roles that already failed a roleSlot() lookup once - logged once each, not once per
// frame, so a demo with a typo'd role does not spam the console at 60 FPS.
const warnedRoles = new Set();

/**
 * Translates a color role name ('dim', 'header', ...) into its theme palette slot.
 * 'text' (and any other unrecognized value, including undefined) falls back to T.text -
 * this fallback is intentional: a demo passing no {color} option, or the literal role
 * 'text', should draw with the plain text color, not throw.
 *
 * @param {string | undefined} role - One of UI_ROLES, or 'text', or omitted.
 * @returns {number} A palette index from the shared theme.
 */
function roleSlot(role) {
    if (role === undefined || role === 'text') {
        return T.text;
    }

    if (UI_ROLES.includes(role)) {
        return T[role];
    }

    if (!warnedRoles.has(role)) {
        console.warn(
            `ui: unrecognized color role "${role}" - falling back to text. Valid roles: ${UI_ROLES.join(', ')}.`,
        );
        warnedRoles.add(role);
    }

    return T.text;
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

    // Push everything inside the panel away from its rim: the sides through the group's
    // padding, the top through the row cursor, the bottom (one step roomier) through end().
    const inset = ctx.panelInset;

    ctx.pad += inset;
    ctx.cursorY += inset;

    if (title) {
        // The title inset used across the demo series: 6 pixels in from the left,
        // 3 pixels down from the top of the panel - plus the panel's own inset.
        const titleY = 3 + inset;

        ctx.addCommand(CMD_TEXT, 6 + inset, titleY, 0, 0, T.header, title);

        // The title contributes to auto width (4 px inset on both sides, plus the panel
        // inset), and the first content row starts below it.
        ctx.maxGroupW = Math.max(ctx.maxGroupW, title.length * FONT_W + 8 + inset * 2);
        ctx.cursorY = 18 + inset;
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
 * A single line of floating text pinned at an exact screen position - the shared
 * "section caption" the drawing demos print next to their artwork. Unlike label(),
 * which stacks rows inside the current begin()/end() group, caption() opens and
 * closes its own tiny one-row group, so demos call it on its own:
 *
 *     ui.caption(24, 40, 'Pixels');
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {number} x - Left edge of the caption in display pixels.
 * @param {number} y - Top edge of the caption in display pixels.
 * @param {string} text - The caption text.
 * @param {{ color?: string }} [opts] - color picks a role; captions default to
 *   'header' (the amber title color shared by the whole demo series).
 */
function caption(ctx, x, y, text, opts = {}) {
    // Passing x and y pins the group to an exact spot next to the artwork (instead
    // of snapping it to a screen corner), and pad: 0 removes the group's built-in
    // inner padding so the text lands right at the requested position. With no
    // panel() call the group has no box around it - just floating text.
    ctx.begin('topLeft', { x, y, pad: 0 });
    label(ctx, text, { color: opts.color ?? 'header' });
    ctx.end();
}

// The box floats this many pixels above the anchor it describes. The letters sit
// inside the nine-slice's center, inset by the corner caps from ui-theme.js.
const TOOLTIP_GAP = 2;

// Tuning on top of the caps, found by eye against tooltip.png: a little extra width so the
// text is not pressed to the rim, a shorter box, and the text origin inside the box.
const TOOLTIP_EXTRA_W = 3;
const TOOLTIP_TRIM_H = 3;
const TOOLTIP_TEXT_X = 6;
const TOOLTIP_TEXT_Y = 3;

// One box and one text position, reused every call. A tooltip redraws every frame
// the pointer is over something, so a fresh rectangle each time would add up.
const tooltipRect = new Rect2i(0, 0, 0, 0);
const tooltipTextPos = new Vector2i(0, 0);

/**
 * A small label box docked above an anchor rectangle - a grid cell, a swatch, a
 * sprite. Call it on its own, outside begin()/end(), and after the thing it
 * describes, so the box is painted on top of that artwork.
 *
 * The box is centered on the anchor and clamped inside the display. Pass `minY`
 * when a title bar occupies the top of the screen: if there is no room above the
 * anchor, the box is pushed down to `minY` instead of covering that strip.
 *
 * The chrome is the shared tooltip nine-slice: a shadow outline, an off-white fill
 * (the same color as kit text), and the letters drawn in that shadow color so they
 * read on the fill. The letters sit in the stretchable center.
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {import('blit386').Rect2i} anchor - The box the tooltip sits above, in display pixels.
 * @param {string} label - The text inside the tooltip. An empty string draws nothing.
 * @param {{ minY?: number, gap?: number }} [opts] - minY is the highest the box may
 *   rise (default 0, the top of the display). gap is the space between the box and
 *   the anchor (default 2).
 */
function tooltip(ctx, anchor, label, opts = {}) {
    if (!T.ready) {
        throw new Error('ui.tooltip: call applyTheme(palette) in init() before drawing any UI.');
    }

    if (ctx.inGroup) {
        throw new Error('ui.tooltip: call it on its own, outside ui.begin() / ui.end().');
    }

    if (label.length === 0) {
        return;
    }

    // The corner caps stay at 1:1, so the box has to be at least that big around the
    // letters. FONT_H includes line spacing, so the height is trimmed back to hug the glyphs.
    const width = label.length * FONT_W + TOOLTIP_CAP_X * 2 + TOOLTIP_EXTRA_W;
    const height = FONT_H + TOOLTIP_CAP_TOP + TOOLTIP_CAP_BOTTOM - TOOLTIP_TRIM_H;
    const display = BT.displaySize;
    const minY = opts.minY ?? 0;
    const gap = opts.gap ?? TOOLTIP_GAP;

    // Center on the anchor, then clamp. The Math.max(0, ...) on the right edge
    // keeps a tooltip wider than the screen pinned to x = 0 instead of a negative bound.
    const anchorCenterX = anchor.x + Math.floor(anchor.width / 2);
    let x = anchorCenterX - Math.floor(width / 2);
    let y = anchor.y - height - gap;

    x = clamp(x, 0, Math.max(0, display.x - width));
    y = Math.max(minY, Math.min(y, display.y - height));

    tooltipRect.set(x, y, width, height);
    BT.drawNineSlice(T.tooltipSlice, tooltipRect);

    tooltipTextPos.set(x + TOOLTIP_TEXT_X, y + TOOLTIP_TEXT_Y);
    BT.systemPrint(tooltipTextPos, T.shadow, label);
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

    // On or hovered rows brighten so the row reads as live.
    drawPipRow(ctx, rowY, value, text, value || res.hover ? T.text : T.dim);

    // The full row is the touch target, not just the little pip.
    ctx.addHit(id, ctx.pad, rowY, contentW, ROW_H, 'checkbox');

    return res.activated || keyFired ? !value : value;
}

/**
 * Queues the shared pip-row drawing used by both checkbox() and pip(): a small
 * square (filled with the accent color when on, hollow otherwise, always
 * outlined) followed by its label.
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {number} rowY - The row's top edge, from ctx.addRow().
 * @param {boolean} on - Whether the pip is lit (filled).
 * @param {string} text - The label next to the pip.
 * @param {number} textColor - Palette slot for the label text.
 */
function drawPipRow(ctx, rowY, on, text, textColor) {
    if (on) {
        ctx.addCommand(CMD_RECT_FILL, ctx.pad, rowY + 3, PIP_SIZE, PIP_SIZE, T.accent);
    }

    ctx.addCommand(CMD_RECT_STROKE, ctx.pad, rowY + 3, PIP_SIZE, PIP_SIZE, T.border);
    ctx.addCommand(CMD_TEXT, ctx.pad + PIP_LABEL_OFFSET, rowY + 1, 0, 0, textColor, text);
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

    // Lit pips brighten their label; unlit ones stay dim.
    drawPipRow(ctx, rowY, on, text, on ? T.text : T.dim);
}

/**
 * A push button. Returns true on the frame it is clicked, tapped, or (when opts.key is
 * given) its keyboard shortcut was pressed.
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {string} text - The button label (also the widget's identity).
 * @param {{ key?: string, width?: number, id?: string, lit?: { fill: number, rim: number } }} [opts] -
 *   key binds a keyboard shortcut; width fixes the button width in pixels; id overrides the
 *   identity when two buttons share one label; lit shows the button switched on, filled
 *   and rimmed with those two palette slots.
 * @returns {boolean} True when the button was activated this frame.
 */
function button(ctx, text, opts = {}) {
    const id = opts.id || text;
    const w = typeof opts.width === 'number' ? opts.width : text.length * FONT_W + 2 * BUTTON_TEXT_PAD;
    const rowY = ctx.addRow(w, BUTTON_TOP_GAP + BUTTON_H + 3) + BUTTON_TOP_GAP;

    const res = ctx.resolveInteraction(id);
    const keyFired = ctx.consumeKey(opts.key);

    // Three visual states, each its own recolored nine-slice: held (pressed right now),
    // hovered (mouse only), resting.
    let look = BUTTON_LOOK.REST;

    if (res.held) {
        look = BUTTON_LOOK.HELD;
    } else if (res.hover) {
        look = BUTTON_LOOK.HOVER;
    }

    // While held, the label lights up in the same accent as the rim.
    let slice = T.buttonSlices[look];
    let textSlot = res.held ? T.accent : T.text;

    // A lit button - one that is switched on - wears its own fill and rim, with the label
    // in the dark background color so it reads on a bright fill. Pressing it still shows
    // the usual held look, so the press is felt either way.
    if (opts.lit && !res.held) {
        slice = buttonFillSlice(opts.lit.fill, opts.lit.rim);
        textSlot = T.bg;
    }

    ctx.addCommand(CMD_NINE_SLICE, ctx.pad, rowY, w, BUTTON_H, 0, '', slice);

    // Center the label.
    const textX = ctx.pad + ((w - text.length * FONT_W) >> 1);

    ctx.addCommand(CMD_TEXT, textX, rowY + BUTTON_TEXT_PAD_Y, 0, 0, textSlot, text);

    ctx.addHit(id, ctx.pad, rowY, w, BUTTON_H, 'button');

    return res.activated || keyFired;
}

/**
 * A draggable value bar (label row + bar row). Drag anywhere on the bar to set the value;
 * the drag keeps following the pointer even if it slides off the bar. Returns the new
 * value, so demos write:
 *
 *     volume = ui.slider('Music', volume);
 *
 * The bar is drawn with the same nine-slice trough and fill art as ui.meter(), so sliders
 * and meters look alike; the fill turns from info blue to accent green while dragged.
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {string} text - The label above the bar (also the widget's identity).
 * @param {number} value - The current value.
 * @param {{ min?: number, max?: number, width?: number, id?: string, decimals?: number }} [opts]
 *   - min/max bound the value (default 0..1); width sets the bar width in pixels; id
 *   overrides the identity; decimals is how many digits the printed value shows after the
 *   point (default 2, 0 for whole numbers).
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
    const range = max - min;
    let nextValue = clamp(value, min, max);

    if (dragX !== null && rec && range !== 0) {
        // Where is the pointer along the bar, from 0 (left edge) to 1 (right edge)?
        const fraction = clamp((dragX - rec.x) / rec.w, 0, 1);

        nextValue = min + fraction * range;
    }

    const decimals = typeof opts.decimals === 'number' ? opts.decimals : 2;
    const valueText = nextValue.toFixed(decimals);

    // Label row: name on the left, live value right-aligned over the bar's right edge.
    const labelY = ctx.addRow(barW, ROW_H);

    ctx.addCommand(CMD_TEXT, ctx.pad, labelY + 1, 0, 0, T.dim, text);
    ctx.addCommand(CMD_TEXT, ctx.pad + barW - valueText.length * FONT_W, labelY + 1, 0, 0, T.text, valueText);

    // Bar row: the meter's trough, filled left-to-right in proportion to the value. The
    // art is METER_BAR_H tall and sits METER_TOP_GAP pixels down, the same gap a meter
    // keeps under its label, inside the taller SLIDER_BAR_H band that stays the hit area
    // so the bar is easy to grab with a finger. An equal min/max (a zero-width range) has
    // no meaningful fraction - draw the bar empty rather than dividing by zero into NaN.
    const barY = ctx.addRow(barW, SLIDER_BAR_H + 4);
    const artY = barY + METER_TOP_GAP;
    const fillW = range === 0 ? 0 : Math.round(barW * ((nextValue - min) / range));

    ctx.addCommand(CMD_NINE_SLICE, ctx.pad, artY, barW, METER_BAR_H, 0, '', T.meterTroughSlice);

    if (fillW > 0) {
        const fillSlice = T.meterFillSlices.get(dragX === null ? T.info : T.accent);

        ctx.addCommand(CMD_NINE_SLICE, ctx.pad, artY, fillW, METER_BAR_H, 0, '', fillSlice);
    }

    ctx.addHit(id, ctx.pad, barY, barW, SLIDER_BAR_H, 'slider');

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

    // The row starts METER_TOP_GAP pixels above the bar: the label row above ends where
    // this row begins, but its glyphs reach a pixel or two past that line, so the bar
    // is pushed down to keep from painting over the text.
    const barY = ctx.addRow(barW, METER_TOP_GAP + METER_BAR_H + 2) + METER_TOP_GAP;
    const fillW = Math.round(barW * clamp(fraction, 0, 1));

    // Two nine-slices: the trough across the whole bar, then the fill on top, as wide as
    // the fraction. The fill art keeps a see-through margin, so it sits inside the rim.
    ctx.addCommand(CMD_NINE_SLICE, ctx.pad, barY, barW, METER_BAR_H, 0, '', T.meterTroughSlice);

    if (fillW > 0) {
        const fillSlice = T.meterFillSlices.get(roleSlot(opts.color || 'info'));

        ctx.addCommand(CMD_NINE_SLICE, ctx.pad, barY, fillW, METER_BAR_H, 0, '', fillSlice);
    }
}

/**
 * The standard "enable sound" prompt every audio demo shows, kept in one place so
 * the wording and color can never drift between demos. Browsers refuse to play any
 * sound until the user interacts with the page, so this row reminds the user to
 * click or press a key. It draws only while audio is still locked - once
 * BT.isAudioUnlocked flips true, the row disappears on its own. Call it inside a
 * ui.begin()/ui.end() group like any other row.
 *
 * Pass `opts.text` when the default sentence is too long for a tiny playfield
 * (for example Snake at 160x120).
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {{ text?: string }} [opts] - Optional overrides. `text` replaces the default
 *   "Click or press a key to enable sound" wording.
 */
function audioUnlockHint(ctx, opts = {}) {
    if (BT.isAudioUnlocked) {
        return;
    }

    const text =
        typeof opts.text === 'string' && opts.text.length > 0 ? opts.text : 'Click or press a key to enable sound';

    label(ctx, text, { color: 'warm' });
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

    // A zero-width row, so the layout lint sees a deliberate spacer instead of a gap.
    ctx.addRow(0, px);
}

export {
    audioUnlockHint,
    button,
    caption,
    checkbox,
    kv,
    label,
    meter,
    panel,
    pip,
    PIP_SIZE,
    separator,
    slider,
    spacer,
    tooltip,
};
