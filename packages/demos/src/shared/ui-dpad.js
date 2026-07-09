/**
 * Virtual D-pad - four on-screen arrow keys for demos that need directional input on
 * phones and tablets, where there is no keyboard.
 *
 * The engine's face buttons (BT.BTN_UP and friends) are fed by keyboards and gamepads but
 * never by touch, so a touch-only visitor cannot steer a game like Snake at all. This
 * widget fills that gap: the demo draws it once per frame with ui.dpadWidget() in render(),
 * and reads it in update() alongside the real buttons:
 *
 *     if (BT.isDown(BT.BTN_LEFT, 0) || ui.dpad.isDown('left')) { ... }
 *
 * By default ('show: auto') the D-pad stays invisible until the session sees its first
 * touch contact, so mouse-and-keyboard visitors never know it exists. It sits in the
 * bottom-right corner - the bottom-LEFT 48x48 corner belongs to the engine overlay's
 * toggle, and most thumbs rest on the right half of a phone anyway.
 */

import { BT } from 'blit386';

import { hitContains } from './ui-core.js';
import { T } from './ui-theme.js';

// Widget ids for the four keys. They live in the shared hit-rectangle map, which also
// means the swipe recognizer automatically ignores swipes that start on the D-pad.
const DPAD_IDS = {
    up: 'ui:dpad:up',
    down: 'ui:dpad:down',
    left: 'ui:dpad:left',
    right: 'ui:dpad:right',
};

const DIRECTIONS = ['up', 'down', 'left', 'right'];

// Touch targets are generous: every key's hit rectangle grows by this many pixels per
// side, so the gaps between keys and near-misses still register.
const DPAD_HIT_INFLATE = 6;

// Module state: whether the D-pad was drawn in the most recent render, and the per-tick
// held/pressed state of each direction. One D-pad per page is plenty.
let visible = false;

const downState = { up: false, down: false, left: false, right: false };
const pressedState = { up: false, down: false, left: false, right: false };

/**
 * Update-side step, run inside ui.tick(): reads the live touch/mouse contacts against the
 * key rectangles cached by the last render and derives held + just-pressed per direction.
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 */
function stepDpad(ctx) {
    for (const dir of DIRECTIONS) {
        const rec = ctx.hitRects.get(DPAD_IDS[dir]);
        let isHeld = false;

        if (visible && rec) {
            // Any of the four pointer slots holds this key down (multitouch: one thumb can
            // steer while another taps a button elsewhere).
            for (let slot = 0; slot < ctx.tickPointer.length; slot++) {
                const tp = ctx.tickPointer[slot];

                if (tp.down && hitContains(rec, tp.x, tp.y, DPAD_HIT_INFLATE)) {
                    isHeld = true;
                    break;
                }
            }
        }

        // "Pressed" means: held now, but not on the previous tick - a fresh touch.
        pressedState[dir] = isHeld && !downState[dir];
        downState[dir] = isHeld;
    }
}

/**
 * Is a D-pad key currently held down? Read from update(), like BT.isDown.
 *
 * @param {'up' | 'down' | 'left' | 'right'} dir - Which key.
 * @returns {boolean}
 */
function dpadIsDown(dir) {
    return downState[dir] === true;
}

/**
 * Was a D-pad key just pressed this tick? Read from update(), like BT.isPressed.
 *
 * @param {'up' | 'down' | 'left' | 'right'} dir - Which key.
 * @returns {boolean}
 */
function dpadIsPressed(dir) {
    return pressedState[dir] === true;
}

/**
 * Draws one arrow glyph as a stack of thin filled rectangles (the system font has no arrow
 * characters). A triangle is just rows that get wider away from the tip.
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context (for its scratch rect).
 * @param {'up' | 'down' | 'left' | 'right'} dir - Which way the triangle points.
 * @param {number} keyX - Key top-left x.
 * @param {number} keyY - Key top-left y.
 * @param {number} size - Key size in pixels.
 * @param {number} color - Palette index for the glyph.
 */
function drawArrow(ctx, dir, keyX, keyY, size, color) {
    // The triangle spans about a third of the key and is centered inside it.
    const rows = Math.max(3, Math.floor(size * 0.3));
    const centerX = keyX + (size >> 1);
    const centerY = keyY + (size >> 1);
    const start = -(rows >> 1);

    for (let i = 0; i < rows; i++) {
        // Row `i` counts away from the tip; each row is two pixels wider than the last.
        const span = i + 1;

        if (dir === 'up') {
            ctx.flushRect.set(centerX - span, centerY + start + i, 2 * span, 1);
        } else if (dir === 'down') {
            ctx.flushRect.set(centerX - span, centerY - start - i, 2 * span, 1);
        } else if (dir === 'left') {
            ctx.flushRect.set(centerX + start + i, centerY - span, 1, 2 * span);
        } else {
            ctx.flushRect.set(centerX - start - i, centerY - span, 1, 2 * span);
        }

        BT.drawRectFill(ctx.flushRect, color);
    }
}

/**
 * Declares and draws the virtual D-pad. Call once per frame from render(), every frame -
 * the widget itself decides whether it is visible. Self-contained: no ui.begin()/end()
 * needed around it.
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {{ corner?: 'bottomRight' | 'bottomLeft' | 'topRight' | 'topLeft', size?: number,
 *   gap?: number, margin?: number, show?: 'auto' | 'always' }} [opts] - size is one key's
 *   width/height in pixels (default 34); gap is the space between keys; margin is the gap
 *   to the screen edges; show 'always' skips the wait-for-first-touch behavior.
 */
function dpadWidget(ctx, opts = {}) {
    if (!T.ready) {
        throw new Error('ui.dpadWidget: call applyTheme(palette) in init() before drawing any UI.');
    }

    const show = opts.show || 'auto';

    visible = show === 'always' || ctx.touchSeen;

    if (!visible) {
        return;
    }

    const size = typeof opts.size === 'number' ? opts.size : 34;
    const gap = typeof opts.gap === 'number' ? opts.gap : 4;
    const margin = typeof opts.margin === 'number' ? opts.margin : 8;
    const corner = opts.corner || 'bottomRight';

    // The cross fits a square of three keys plus two gaps on each axis.
    const total = 3 * size + 2 * gap;
    const display = BT.displaySize;
    const baseX = corner === 'bottomLeft' || corner === 'topLeft' ? margin : display.x - margin - total;
    const baseY = corner === 'topLeft' || corner === 'topRight' ? margin : display.y - margin - total;
    const step = size + gap;

    for (const dir of DIRECTIONS) {
        drawKey(ctx, dir, baseX, baseY, step, size);
    }
}

/**
 * Draws one D-pad key (face, border, arrow) and caches its hit rectangle.
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {'up' | 'down' | 'left' | 'right'} dir - Which key.
 * @param {number} baseX - Left edge of the whole cross.
 * @param {number} baseY - Top edge of the whole cross.
 * @param {number} step - Key size plus gap (one grid cell of the cross).
 * @param {number} size - Key size in pixels.
 */
function drawKey(ctx, dir, baseX, baseY, step, size) {
    // Cross layout: up/down share the middle column, left/right the middle row.
    let keyX = baseX + step;
    let keyY = baseY + step;

    if (dir === 'up') {
        keyY = baseY;
    } else if (dir === 'down') {
        keyY = baseY + 2 * step;
    } else if (dir === 'left') {
        keyX = baseX;
    } else {
        keyX = baseX + 2 * step;
    }

    const isHeld = downState[dir];

    // Key face: panel-colored at rest, accent-lit while held, always outlined.
    ctx.flushRect.set(keyX, keyY, size, size);
    BT.drawRectFill(ctx.flushRect, isHeld ? T.accent : T.panel);
    ctx.flushRect.set(keyX, keyY, size, size);
    BT.drawRect(ctx.flushRect, T.border);

    drawArrow(ctx, dir, keyX, keyY, size, isHeld ? T.bg : T.dim);

    // Cache the key's rectangle for update-side reads and gesture exclusion. The D-pad
    // never moves, so writing the same values every frame is cheap and correct.
    const id = DPAD_IDS[dir];
    let rec = ctx.hitRects.get(id);

    if (!rec) {
        rec = { x: 0, y: 0, w: 0, h: 0 };
        ctx.hitRects.set(id, rec);
    }

    rec.x = keyX;
    rec.y = keyY;
    rec.w = size;
    rec.h = size;
}

export { dpadIsDown, dpadIsPressed, dpadWidget, stepDpad };
