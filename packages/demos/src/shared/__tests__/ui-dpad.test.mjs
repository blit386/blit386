/**
 * Unit tests for the virtual D-pad's isDown/isPressed edge semantics and visibility gating.
 *
 * downState/pressedState/visible are module-level state in ui-dpad.js (not per-context - see
 * the file's own header), so every test after the first "settles" it with one neutral
 * stepDpad() call (no pointer contact) before asserting anything. That overwrites any stale
 * true left by a previous test in this file, because stepDpad() unconditionally recomputes
 * downState[dir] = isHeld every call - see the note on each test below.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BT } from 'blit386';

import { UiContext } from '../ui-core.js';
import { applyTheme } from '../ui-theme.js';
import { dpadIsDown, dpadIsPressed, dpadWidget, stepDpad } from '../ui-dpad.js';
import { stubBt } from './bt-stub.mjs';
import { createFakePalette } from './ui-test-helpers.mjs';

// This must run before any other test in this file calls applyTheme() - T.ready starts
// false for a freshly loaded ui-theme.js module and never resets, so this guard is only
// observable once, right here. (node --test runs each test file in its own subprocess, so
// this is not racing against ui-core.test.mjs or ui-widgets.test.mjs.)
describe('dpadWidget before applyTheme()', () => {
    it('throws instead of drawing with an unresolved theme', () => {
        const ctx = new UiContext();

        assert.throws(() => dpadWidget(ctx), /call applyTheme\(palette\) in init\(\)/);
    });
});

describe('dpad isDown / isPressed edge semantics', () => {
    /**
     * Applies the theme, stubs BT (default 320x180 display, no-op draws), builds a fresh
     * context, draws the D-pad once with `show: 'always'` (skips the touchSeen wait) to
     * populate its key hit rectangles, then runs one contact-free stepDpad() to settle any
     * state a previous test in this file left behind.
     *
     * @param {import('node:test').TestContext} t
     * @returns {UiContext}
     */
    function createSettledDpadContext(t) {
        stubBt(t);
        applyTheme(createFakePalette());

        const ctx = new UiContext();

        dpadWidget(ctx, { show: 'always' });
        stepDpad(ctx);

        return ctx;
    }

    // Default layout (size 34, gap 4, margin 8, corner 'bottomRight') against the stub's
    // 320x180 display puts the 'up' key at x:[240,274), y:[62,96) - see dpadWidget()'s
    // baseX/baseY/step math in ui-dpad.js. (240, 70) lands inside it with room to spare.
    const UP_KEY_X = 250;
    const UP_KEY_Y = 70;

    it('reports isPressed on the tick a key first goes down, isDown from then on', (t) => {
        const ctx = createSettledDpadContext(t);
        const tp = ctx.tickPointer[0];

        tp.down = true;
        tp.x = UP_KEY_X;
        tp.y = UP_KEY_Y;
        stepDpad(ctx);

        assert.equal(dpadIsPressed('up'), true);
        assert.equal(dpadIsDown('up'), true);
    });

    it('drops isPressed on the next tick while the key is still held', (t) => {
        const ctx = createSettledDpadContext(t);
        const tp = ctx.tickPointer[0];

        tp.down = true;
        tp.x = UP_KEY_X;
        tp.y = UP_KEY_Y;
        stepDpad(ctx);

        stepDpad(ctx);

        assert.equal(dpadIsPressed('up'), false);
        assert.equal(dpadIsDown('up'), true);
    });

    it('clears both isPressed and isDown on release', (t) => {
        const ctx = createSettledDpadContext(t);
        const tp = ctx.tickPointer[0];

        tp.down = true;
        tp.x = UP_KEY_X;
        tp.y = UP_KEY_Y;
        stepDpad(ctx);

        tp.down = false;
        stepDpad(ctx);

        assert.equal(dpadIsPressed('up'), false);
        assert.equal(dpadIsDown('up'), false);
    });

    it('does not report a direction as down from a contact over a different key', (t) => {
        const ctx = createSettledDpadContext(t);
        const tp = ctx.tickPointer[0];

        tp.down = true;
        tp.x = UP_KEY_X;
        tp.y = UP_KEY_Y;
        stepDpad(ctx);

        assert.equal(dpadIsDown('down'), false);
        assert.equal(dpadIsDown('left'), false);
        assert.equal(dpadIsDown('right'), false);
    });

    it('recognizes a second press after a release as a fresh edge', (t) => {
        const ctx = createSettledDpadContext(t);
        const tp = ctx.tickPointer[0];

        tp.down = true;
        tp.x = UP_KEY_X;
        tp.y = UP_KEY_Y;
        stepDpad(ctx);
        assert.equal(dpadIsPressed('up'), true);

        tp.down = false;
        stepDpad(ctx);
        assert.equal(dpadIsDown('up'), false);

        tp.down = true;
        stepDpad(ctx);
        assert.equal(dpadIsPressed('up'), true);
        assert.equal(dpadIsDown('up'), true);
    });
});

describe('dpad visibility gating', () => {
    it('show "auto" ignores contacts until a touch has been seen', (t) => {
        stubBt(t);
        applyTheme(createFakePalette());

        const ctx = new UiContext();

        ctx.touchSeen = false;
        dpadWidget(ctx); // default opts.show is 'auto'
        stepDpad(ctx); // settle any state left by a previous test

        const tp = ctx.tickPointer[0];

        tp.down = true;
        tp.x = 250;
        tp.y = 70;
        stepDpad(ctx);

        assert.equal(dpadIsDown('up'), false);
    });

    it('show "auto" recognizes contacts once a touch has been seen', (t) => {
        stubBt(t);
        applyTheme(createFakePalette());

        const ctx = new UiContext();

        ctx.touchSeen = true;
        dpadWidget(ctx);
        stepDpad(ctx);

        const tp = ctx.tickPointer[0];

        tp.down = true;
        tp.x = 250;
        tp.y = 70;
        stepDpad(ctx);

        assert.equal(dpadIsDown('up'), true);
    });

    it('show "always" recognizes contacts even with no touch ever seen', (t) => {
        stubBt(t);
        applyTheme(createFakePalette());

        const ctx = new UiContext();

        ctx.touchSeen = false;
        dpadWidget(ctx, { show: 'always' });
        stepDpad(ctx);

        const tp = ctx.tickPointer[0];

        tp.down = true;
        tp.x = 250;
        tp.y = 70;
        stepDpad(ctx);

        assert.equal(dpadIsDown('up'), true);
    });
});

describe('dpad hit rects across frames', () => {
    it('keeps its rects through the next begin(), wherever the D-pad is drawn in the frame', (t) => {
        stubBt(t);
        applyTheme(createFakePalette());

        const ctx = new UiContext();

        // Frame 1: the D-pad before the frame's first begin().
        BT.ticks++;
        dpadWidget(ctx, { show: 'always' });
        ctx.begin('topLeft');
        assert.ok(ctx.hitRects.has('ui:dpad:up'));
        ctx.end();

        // Frame 2: begin() first prunes with frame 1's ids, which must include the D-pad's.
        BT.ticks++;
        ctx.begin('topLeft');
        assert.ok(ctx.hitRects.has('ui:dpad:up'));
        ctx.end();
        dpadWidget(ctx, { show: 'always' });
        assert.ok(ctx.hitRects.has('ui:dpad:up'));
    });
});
