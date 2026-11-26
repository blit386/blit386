/**
 * Unit tests for swipe recognition. stepGestures() reads only `ctx.tickPointer` and
 * `ctx.isInsideAnyWidget()` (both pure UiContext state/methods), so these tests drive it
 * directly through a bare UiContext - no BT stub needed, no theme, no begin()/end().
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { UiContext } from '../ui-core.js';
import { stepGestures, swipeResult } from '../ui-gestures.js';

/**
 * Builds a fresh UiContext and seeds `tickPointer[0]` as if a press-then-release just
 * happened: pressed at (downX, downY) on `downTick`, released at (x, y) on `tickCount`.
 *
 * @param {{ downX: number, downY: number, x: number, y: number, downTick?: number,
 *   tickCount?: number, swipeOk?: boolean }} spec
 * @returns {UiContext}
 */
function createContextWithReleasedSwipeCandidate(spec) {
    const ctx = new UiContext();
    const tp = ctx.tickPointer[0];

    tp.pressed = false;
    tp.released = true;
    tp.swipeOk = spec.swipeOk ?? true;
    tp.downX = spec.downX;
    tp.downY = spec.downY;
    tp.x = spec.x;
    tp.y = spec.y;
    tp.downTick = spec.downTick ?? 0;
    ctx.tickCount = spec.tickCount ?? spec.downTick ?? 0;

    return ctx;
}

describe('stepGestures / swipeResult', () => {
    it('recognizes a rightward swipe', () => {
        const ctx = createContextWithReleasedSwipeCandidate({ downX: 0, downY: 0, x: 30, y: 0 });

        stepGestures(ctx);

        assert.equal(swipeResult(), 'right');
    });

    it('recognizes a leftward swipe', () => {
        const ctx = createContextWithReleasedSwipeCandidate({ downX: 30, downY: 0, x: 0, y: 0 });

        stepGestures(ctx);

        assert.equal(swipeResult(), 'left');
    });

    it('recognizes a downward swipe', () => {
        const ctx = createContextWithReleasedSwipeCandidate({ downX: 0, downY: 0, x: 0, y: 30 });

        stepGestures(ctx);

        assert.equal(swipeResult(), 'down');
    });

    it('recognizes an upward swipe', () => {
        const ctx = createContextWithReleasedSwipeCandidate({ downX: 0, downY: 30, x: 0, y: 0 });

        stepGestures(ctx);

        assert.equal(swipeResult(), 'up');
    });

    it('picks the dominant axis on a diagonal move', () => {
        const ctx = createContextWithReleasedSwipeCandidate({ downX: 0, downY: 0, x: 30, y: 20 });

        stepGestures(ctx);

        assert.equal(swipeResult(), 'right');
    });

    it('does not recognize a swipe just under the minimum distance', () => {
        const ctx = createContextWithReleasedSwipeCandidate({ downX: 0, downY: 0, x: 17, y: 0 });

        stepGestures(ctx);

        assert.equal(swipeResult(), null);
    });

    it('recognizes a swipe at exactly the minimum distance', () => {
        const ctx = createContextWithReleasedSwipeCandidate({ downX: 0, downY: 0, x: 18, y: 0 });

        stepGestures(ctx);

        assert.equal(swipeResult(), 'right');
    });

    it('does not recognize a swipe that took too long', () => {
        const ctx = createContextWithReleasedSwipeCandidate({
            downX: 0,
            downY: 0,
            x: 30,
            y: 0,
            downTick: 0,
            tickCount: 31,
        });

        stepGestures(ctx);

        assert.equal(swipeResult(), null);
    });

    it('recognizes a swipe finished at exactly the tick limit', () => {
        const ctx = createContextWithReleasedSwipeCandidate({
            downX: 0,
            downY: 0,
            x: 30,
            y: 0,
            downTick: 0,
            tickCount: 30,
        });

        stepGestures(ctx);

        assert.equal(swipeResult(), 'right');
    });

    it('ignores a release that started on a widget', () => {
        const ctx = createContextWithReleasedSwipeCandidate({
            downX: 0,
            downY: 0,
            x: 30,
            y: 0,
            swipeOk: false,
        });

        stepGestures(ctx);

        assert.equal(swipeResult(), null);
    });

    it('resets to null every call, even after a prior call recognized a swipe', () => {
        const first = createContextWithReleasedSwipeCandidate({ downX: 0, downY: 0, x: 30, y: 0 });

        stepGestures(first);
        assert.equal(swipeResult(), 'right');

        const second = new UiContext();

        stepGestures(second);
        assert.equal(swipeResult(), null);
    });

    it('marks a fresh press as swipe-eligible only when it starts off every widget', () => {
        const ctx = new UiContext();

        ctx.hitRects.set('button', { x: 0, y: 0, w: 50, h: 50 });

        const tp = ctx.tickPointer[0];

        tp.pressed = true;
        tp.downX = 100;
        tp.downY = 100;

        stepGestures(ctx);
        assert.equal(tp.swipeOk, true);

        tp.downX = 10;
        tp.downY = 10;

        stepGestures(ctx);
        assert.equal(tp.swipeOk, false);
    });
});
