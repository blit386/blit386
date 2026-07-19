/**
 * The shared demo UI kit - the one file demos import.
 *
 *     import { applyTheme, ui } from './shared/ui.js';
 *
 * The kit is a tiny immediate-mode UI (in the spirit of Dear ImGui): demos declare panels
 * and widgets by calling ui.* every frame inside render(), and the kit lays out, draws, and
 * hit-tests them on the spot. There is nothing to create or destroy - a widget exists
 * because the demo mentioned it this frame.
 *
 * The three rules:
 *
 * 1. In init(): call applyTheme(palette) before BT.paletteSet(palette). This installs the
 *    shared UI colors (slots 240-251 by default) that every widget draws with.
 *
 * 2. In update(): call ui.tick() first when the demo uses { key } bindings, ui.swipe(),
 *    ui.tapIn(), or the D-pad. Pure display UI (panels, labels, meters) does not need it.
 *
 * 3. In render(): declare UI in ui.begin(anchor) ... ui.end() groups. Interactive widgets
 *    answer immediately:
 *
 *        ui.begin('bottomLeft');
 *        ui.panel('Presets (keys)');
 *        if (ui.button('Play melody', { key: 'Digit1' })) { this.playMelody(); }
 *        this.loop = ui.checkbox('Loop', this.loop);
 *        ui.kv('Vol', volume.toFixed(2));
 *        ui.end();
 *
 * Widget identity: a widget is recognized across frames by its label. Two widgets with the
 * same label in one frame would answer each other's clicks - give one of them a unique
 * { id: '...' } option in that case.
 *
 * Performance: widgets queue draw commands into preallocated pools and reuse every object,
 * so steady-state frames allocate nothing - safe to call from render() at 60 FPS.
 */

import { UiContext } from './ui-core.js';
import { dpadIsDown, dpadIsPressed, dpadWidget, stepDpad } from './ui-dpad.js';
import { stepGestures, swipeResult, tapIn } from './ui-gestures.js';
import { applyTheme } from './ui-theme.js';
import {
    audioUnlockHint,
    button,
    caption,
    checkbox,
    kv,
    label,
    meter,
    panel,
    pip,
    separator,
    slider,
    spacer,
} from './ui-widgets.js';

// The one shared context. Demos run one at a time, so a single instance serves them all.
const ctx = new UiContext();

const ui = {
    /**
     * Update-side housekeeping: latches keyboard shortcuts, tracks touch contacts, and
     * steps the swipe recognizer and the D-pad. Call as the first line of update().
     */
    tick() {
        ctx.tick();
        stepGestures(ctx);
        stepDpad(ctx);
    },

    /**
     * Opens a widget group. See ui-core.js begin() for anchors and options.
     *
     * @param {'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'topBar'} [anchor]
     * @param {{ x?: number, y?: number, width?: number, margin?: number, pad?: number, kvCols?: number }} [opts]
     */
    begin(anchor, opts) {
        ctx.begin(anchor, opts);
    },

    /** Closes the group: sizes it, places it, and draws everything queued since begin(). */
    end() {
        ctx.end();
    },

    /**
     * Gives the current group a background, border, and optional amber title. Call right
     * after ui.begin().
     *
     * @param {string} [title]
     */
    panel(title) {
        panel(ctx, title);
    },

    /**
     * One line of text.
     *
     * @param {string} text
     * @param {{ color?: string }} [opts] - Role: 'text', 'dim', 'header', 'accent', 'warm', 'info'.
     */
    label(text, opts) {
        label(ctx, text, opts);
    },

    /**
     * A single line of floating text pinned at an exact screen position - the shared
     * section caption the drawing demos print next to their artwork. Self-contained:
     * call it on its own, outside ui.begin()/ui.end().
     *
     * @param {number} x - Left edge in display pixels.
     * @param {number} y - Top edge in display pixels.
     * @param {string} text
     * @param {{ color?: string }} [opts] - Role; defaults to 'header' (series amber).
     */
    caption(x, y, text, opts) {
        caption(ctx, x, y, text, opts);
    },

    /**
     * The standard "click or press a key to enable sound" row for audio demos.
     * Draws only while audio is still locked; call it inside a group each frame.
     */
    audioUnlockHint() {
        audioUnlockHint(ctx);
    },

    /**
     * A "KEY: value" row with an aligned value column.
     *
     * @param {string} key
     * @param {string | number} value
     */
    kv(key, value) {
        kv(ctx, key, value);
    },

    /**
     * A toggleable checkbox row. Returns the next value: `x = ui.checkbox('X', x);`
     *
     * @param {string} text
     * @param {boolean} value
     * @param {{ key?: string, id?: string }} [opts]
     * @returns {boolean}
     */
    checkbox(text, value, opts) {
        return checkbox(ctx, text, value, opts);
    },

    /**
     * A read-only pip indicator row (lit / hollow). Purely visual, never interactive.
     *
     * @param {string} text
     * @param {boolean} on
     */
    pip(text, on) {
        pip(ctx, text, on);
    },

    /**
     * A push button. True on the frame it is clicked, tapped, or its key was pressed.
     *
     * @param {string} text
     * @param {{ key?: string, width?: number, id?: string }} [opts]
     * @returns {boolean}
     */
    button(text, opts) {
        return button(ctx, text, opts);
    },

    /**
     * A draggable value bar. Returns the next value: `v = ui.slider('Vol', v);`
     *
     * @param {string} text
     * @param {number} value
     * @param {{ min?: number, max?: number, width?: number, id?: string }} [opts]
     * @returns {number}
     */
    slider(text, value, opts) {
        return slider(ctx, text, value, opts);
    },

    /**
     * A read-only level bar.
     *
     * @param {string | null} text
     * @param {number} fraction - 0 (empty) to 1 (full).
     * @param {{ color?: string, width?: number }} [opts]
     */
    meter(text, fraction, opts) {
        meter(ctx, text, fraction, opts);
    },

    /** A thin horizontal rule across the group. */
    separator() {
        separator(ctx);
    },

    /**
     * Vertical breathing room between rows.
     *
     * @param {number} [px]
     */
    spacer(px) {
        spacer(ctx, px);
    },

    /**
     * Draws the virtual D-pad (self-contained - no begin()/end() needed). Call once per
     * frame from render(); by default it appears only after the first touch contact.
     *
     * @param {{ corner?: string, size?: number, gap?: number, margin?: number, show?: 'auto' | 'always' }} [opts]
     */
    dpadWidget(opts) {
        dpadWidget(ctx, opts);
    },

    /** Read the virtual D-pad from update(), like BT.isDown / BT.isPressed. */
    dpad: {
        /**
         * @param {'up' | 'down' | 'left' | 'right'} dir
         * @returns {boolean}
         */
        isDown(dir) {
            return dpadIsDown(dir);
        },

        /**
         * @param {'up' | 'down' | 'left' | 'right'} dir
         * @returns {boolean}
         */
        isPressed(dir) {
            return dpadIsPressed(dir);
        },
    },

    /**
     * The swipe completed on this update tick, if any. Read after ui.tick().
     *
     * @returns {'up' | 'down' | 'left' | 'right' | null}
     */
    swipe() {
        return swipeResult();
    },

    /**
     * Did a press land inside `rect` this tick (away from every widget)? For big invisible
     * touch zones. Read from update(), after ui.tick().
     *
     * @param {import('blit386').Rect2i} rect
     * @returns {boolean}
     */
    tapIn(rect) {
        return tapIn(ctx, rect);
    },

    /**
     * Has this session ever seen a touch contact? Handy for showing touch-specific hints.
     *
     * @returns {boolean}
     */
    hasTouch() {
        return ctx.touchSeen;
    },

    /**
     * Is this point on top of any kit widget (buttons, sliders, the D-pad, ...)? Demos
     * that paint or drag with the raw pointer use this to leave the UI alone - for example
     * a paint demo skips brush strokes that would land on its own Clear button.
     *
     * @param {number} x - Point x in display pixels.
     * @param {number} y - Point y in display pixels.
     * @returns {boolean}
     */
    overWidget(x, y) {
        return ctx.isInsideAnyWidget(x, y);
    },
};

export { applyTheme, ui };
