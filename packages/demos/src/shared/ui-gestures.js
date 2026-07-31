/**
 * Touch gestures for the shared demo UI kit: swipes and tap zones.
 *
 * Both build on the per-tick pointer records ui.tick() maintains in the shared context
 * (ui-core.js). They deliberately ignore presses that start on a widget or on the virtual
 * D-pad - a finger that lands on a button belongs to that button, not to a gesture.
 *
 * Usage, in a demo's update() after ui.tick():
 *
 *     const swipe = ui.swipe();                  // 'up' | 'down' | 'left' | 'right' | null
 *     if (swipe === 'left') { this.steerLeft(); }
 *     if (ui.tapIn(LEFT_HALF_RECT)) { ... }      // big invisible touch zones
 */

// A movement counts as a swipe when the finger travels at least this many logical pixels...
const SWIPE_MIN_PX = 18;

// ...within this many update ticks (30 ticks = half a second at 60 FPS). Slower drags are
// probably aiming at something, not swiping.
const SWIPE_MAX_TICKS = 30;

// The swipe recognized on the current tick, or null. Refreshed by every stepGestures()
// call, so it is valid for exactly one update tick.
/** @type {'up' | 'down' | 'left' | 'right' | null} */
let swipeDir = null;

/**
 * Update-side step, run inside ui.tick(): watches every pointer slot for a
 * press-move-release that qualifies as a swipe.
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 */
function stepGestures(ctx) {
    swipeDir = null;

    for (let slot = 0; slot < ctx.tickPointer.length; slot++) {
        const tp = ctx.tickPointer[slot];

        // The moment a contact starts, decide whether it may become a swipe: only when it
        // starts on empty screen, away from every widget.
        if (tp.pressed) {
            tp.swipeOk = !ctx.isInsideAnyWidget(tp.downX, tp.downY);
        }

        if (!tp.released || !tp.swipeOk) {
            continue;
        }

        // Contact just ended - measure the total travel from where it started.
        const dx = tp.x - tp.downX;
        const dy = tp.y - tp.downY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        const quickEnough = ctx.tickCount - tp.downTick <= SWIPE_MAX_TICKS;

        if (!quickEnough || Math.max(absX, absY) < SWIPE_MIN_PX) {
            continue;
        }

        // The dominant axis wins: mostly-horizontal travel is left/right, otherwise up/down.
        if (absX >= absY) {
            swipeDir = dx > 0 ? 'right' : 'left';
        } else {
            swipeDir = dy > 0 ? 'down' : 'up';
        }
    }
}

/**
 * The swipe completed on this update tick, if any. Read once per update(), after ui.tick().
 *
 * @returns {'up' | 'down' | 'left' | 'right' | null}
 */
function swipeResult() {
    return swipeDir;
}

/**
 * Did a press land inside `rect` on this update tick, away from every widget? Use this for
 * large invisible touch zones (for example "tap the left half of the screen to move left").
 *
 * @param {import('./ui-core.js').UiContext} ctx - The shared UI context.
 * @param {import('blit386').Rect2i} rect - The zone to test, in display pixels.
 * @returns {boolean}
 */
function tapIn(ctx, rect) {
    for (let slot = 0; slot < ctx.tickPointer.length; slot++) {
        const tp = ctx.tickPointer[slot];

        if (tp.pressed && rect.isContainingXY(tp.x, tp.y) && !ctx.isInsideAnyWidget(tp.x, tp.y)) {
            return true;
        }
    }

    return false;
}

export { stepGestures, swipeResult, tapIn };
