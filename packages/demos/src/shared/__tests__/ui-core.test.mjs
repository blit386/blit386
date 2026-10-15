/**
 * Unit tests for the shared UI kit's core: hit testing, the "allocates nothing per frame"
 * draw-command pool, begin()/end() group invariants, and layout anchor math (exercised
 * end-to-end, since resolveOriginX()/resolveOriginY() are internal and not exported).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hitContains, UI_ANCHORS } from '../ui-core.js';
import { stubBt } from './bt-stub.mjs';
import { createReadyContext } from './ui-test-helpers.mjs';

describe('hitContains', () => {
    const rec = { x: 10, y: 10, w: 20, h: 20 };

    it('is true for a point inside the rectangle', () => {
        assert.ok(hitContains(rec, 15, 15, 0));
    });

    it('includes the left and top edges', () => {
        assert.ok(hitContains(rec, 10, 15, 0));
        assert.ok(hitContains(rec, 15, 10, 0));
    });

    it('excludes the right and bottom edges', () => {
        assert.ok(!hitContains(rec, 30, 15, 0));
        assert.ok(!hitContains(rec, 15, 30, 0));
    });

    it('is false just outside the rectangle', () => {
        assert.ok(!hitContains(rec, 9, 15, 0));
        assert.ok(!hitContains(rec, 15, 9, 0));
    });

    it('grows the test area by inflate on every side', () => {
        assert.ok(!hitContains(rec, 8, 15, 0));
        assert.ok(hitContains(rec, 8, 15, 3));
    });
});

describe('UiContext draw-command pool', () => {
    it('starts pre-filled with 192 reusable command objects', () => {
        const ctx = createReadyContext();

        assert.equal(ctx.commands.length, 192);
    });

    it('reuses pooled slots and allocates nothing while under the initial size', (t) => {
        stubBt(t);

        const ctx = createReadyContext();
        const commandsArray = ctx.commands;

        ctx.begin(UI_ANCHORS.TOP_LEFT);

        for (let i = 0; i < 192; i++) {
            ctx.addCommand(0, i, 0, 1, 1, 0);
        }

        assert.strictEqual(ctx.commands, commandsArray);
        assert.equal(ctx.commands.length, 192);
        assert.equal(ctx.commandCount, 192);
    });

    it('grows by exactly one and warns exactly once past the initial size', (t) => {
        stubBt(t);

        const warnCalls = [];

        t.mock.method(console, 'warn', (message) => {
            warnCalls.push(message);
        });

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);

        for (let i = 0; i < 193; i++) {
            ctx.addCommand(0, i, 0, 1, 1, 0);
        }

        assert.equal(ctx.commands.length, 193);
        assert.equal(ctx.commandCount, 193);
        assert.equal(warnCalls.length, 1);

        // A second overflow must not warn again - it is logged once per context, not once
        // per overflow.
        ctx.addCommand(0, 0, 0, 1, 1, 0);
        assert.equal(warnCalls.length, 1);
    });

    it('resets commandCount (not the pool array) at every begin()', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        ctx.addCommand(0, 0, 0, 1, 1, 0);
        ctx.end();

        const commandsArray = ctx.commands;

        ctx.begin(UI_ANCHORS.TOP_LEFT);

        assert.equal(ctx.commandCount, 0);
        assert.strictEqual(ctx.commands, commandsArray);
    });
});

describe('UiContext begin()/end() invariants', () => {
    // begin()'s "call applyTheme() first" guard is not covered here: T.ready flips true
    // the first time any test in this file calls applyTheme() (via createReadyContext())
    // and never resets, so there is no reliable "theme not yet applied" state left to
    // assert against once the file's other tests have run. ui-theme.test.mjs covers
    // applyTheme() itself; this file assumes the documented "call applyTheme() first"
    // contract is met, like every real demo does.

    it('throws when begin() is called while a group is already open', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);

        assert.throws(() => ctx.begin(UI_ANCHORS.TOP_LEFT), /previous group is still open/);
    });

    it('throws when end() is called without an open group', () => {
        const ctx = createReadyContext();

        assert.throws(() => ctx.end(), /no group is open/);
    });

    it('throws when a widget row is declared outside a group', () => {
        const ctx = createReadyContext();

        assert.throws(() => ctx.addRow(10, 10), /must be declared between ui\.begin\(\) and ui\.end\(\)/);
    });
});

describe('UiContext layout anchor math', () => {
    /**
     * Runs one begin()/addCommand()/end() cycle for `anchor` against a stubbed 320x180
     * display and returns the absolute x/y the flush handed to the stubbed drawRectFill.
     *
     * @param {string} anchor - One of UI_ANCHORS.
     * @param {import('node:test').TestContext} t - The running test's context.
     * @returns {{ x: number, y: number }}
     */
    function flushOneRectAndCapture(anchor, t) {
        let captured = null;

        stubBt(t, {
            drawRectFill: (rect) => {
                captured = { x: rect.x, y: rect.y };
            },
        });

        const ctx = createReadyContext();

        ctx.begin(anchor);

        // Go through addRow(), like every real widget does - it is what feeds maxGroupW
        // (and therefore the final groupW resolveOriginX/Y need) and advances cursorY
        // (therefore groupH). A bare addCommand() with no addRow() would leave both at 0.
        const rowY = ctx.addRow(10, 10);

        ctx.addCommand(0, 0, rowY, 10, 10, 0);
        ctx.end();

        return captured;
    }

    // groupW for every case below: content width 10 plus 2*pad (5 each side) = 20.
    // groupH: cursorY advanced by 10 (addRow's `advance`) plus 0 bottom padding (no panel).
    const GROUP_W = 20;
    const GROUP_H = 10;

    it('places a topLeft group at the margin from the top-left corner', (t) => {
        const { x, y } = flushOneRectAndCapture(UI_ANCHORS.TOP_LEFT, t);

        assert.equal(x, 4);
        assert.equal(y, 4);
    });

    it('places a topRight group at the margin from the top-right corner', (t) => {
        const { x } = flushOneRectAndCapture(UI_ANCHORS.TOP_RIGHT, t);

        assert.equal(x, 320 - 4 - GROUP_W);
    });

    it('places a bottomLeft group so its bottom edge sits at the margin (grows upward)', (t) => {
        const { x, y } = flushOneRectAndCapture(UI_ANCHORS.BOTTOM_LEFT, t);

        assert.equal(x, 4);
        assert.equal(y, 180 - 4 - GROUP_H);
    });

    it('places a bottomRight group at the bottom-right corner', (t) => {
        const { x, y } = flushOneRectAndCapture(UI_ANCHORS.BOTTOM_RIGHT, t);

        assert.equal(x, 320 - 4 - GROUP_W);
        assert.equal(y, 180 - 4 - GROUP_H);
    });

    it('stretches a topBar group across the full display width, pinned to the origin', (t) => {
        const { x, y } = flushOneRectAndCapture(UI_ANCHORS.TOP_BAR, t);

        assert.equal(x, 0);
        assert.equal(y, 0);
    });

    it('honors explicit x/y overrides regardless of anchor', (t) => {
        let captured = null;

        stubBt(t, {
            drawRectFill: (rect) => {
                captured = { x: rect.x, y: rect.y };
            },
        });

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_RIGHT, { x: 42, y: 7 });
        ctx.addCommand(0, 0, 0, 10, 10, 0);
        ctx.end();

        assert.equal(captured.x, 42);
        assert.equal(captured.y, 7);
    });
});

describe('UiContext snapshot', () => {
    it('records nothing and allocates nothing while recording is off', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        const { frameGroups, groupRows, groupWidgets } = ctx;

        for (let frame = 0; frame < 2; frame++) {
            ctx.begin(UI_ANCHORS.TOP_LEFT);
            ctx.addRow(40, 10);
            ctx.addHit('a', 5, 0, 40, 10, 'button');
            ctx.end();
            ctx.tick();
        }

        // Same array objects (never reassigned) and still empty.
        assert.equal(ctx.frameGroups, frameGroups);
        assert.equal(ctx.groupRows, groupRows);
        assert.equal(ctx.groupWidgets, groupWidgets);
        assert.equal(frameGroups.length + groupRows.length + groupWidgets.length, 0);
        assert.deepEqual(ctx.snapshot(), { display: { w: 320, h: 180 }, groups: [] });
    });

    it('captures groups, rows, and widgets in absolute coordinates', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.recording = true;
        ctx.begin(UI_ANCHORS.BOTTOM_RIGHT);
        const rowY = ctx.addRow(40, 10);
        ctx.addHit('Play', ctx.pad, rowY, 40, 10, 'button');
        ctx.addRow(0, 4);
        ctx.end();

        const snap = ctx.snapshot();
        const [group] = snap.groups;

        assert.equal(snap.groups.length, 1);
        assert.equal(group.anchor, UI_ANCHORS.BOTTOM_RIGHT);
        assert.equal(group.pinnedX, false);
        assert.equal(group.margin, 4);
        assert.equal(group.panel, false);
        // Width = content + 2 * pad (5); height = cursor (pad - 5 + 10 + 4).
        assert.deepEqual(group.rect, { x: 320 - 4 - 50, y: 180 - 4 - 14, w: 50, h: 14 });
        assert.equal(group.rows.length, 2);
        assert.equal(group.rows[1].w, 0);
        assert.deepEqual(group.widgets, [
            { id: 'Play', kind: 'button', rect: { x: group.rect.x + 5, y: group.rect.y + rowY, w: 40, h: 10 } },
        ]);
    });

    it('starts a fresh group list on the first begin() after a tick', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.recording = true;
        ctx.begin(UI_ANCHORS.TOP_LEFT);
        ctx.end();
        ctx.tick();
        ctx.begin(UI_ANCHORS.TOP_LEFT);
        ctx.end();

        assert.equal(ctx.snapshot().groups.length, 1);
    });

    it('returns a copy the caller cannot use to mutate kit state', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.recording = true;
        ctx.begin(UI_ANCHORS.TOP_LEFT);
        ctx.end();

        const first = ctx.snapshot();
        first.groups[0].rect.x = 999;

        assert.notEqual(ctx.snapshot().groups[0].rect.x, 999);
    });

    it('draws overlay strokes only when debug is on', (t) => {
        const strokes = [];
        stubBt(t, { drawRect: (rect) => strokes.push(rect.width) });

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        ctx.addRow(40, 10);
        ctx.end();
        const quiet = strokes.length;

        ctx.debug = true;
        ctx.begin(UI_ANCHORS.TOP_LEFT);
        ctx.addRow(40, 10);
        ctx.addHit('a', 5, 0, 40, 10, 'button');
        ctx.end();

        assert.ok(strokes.length > quiet);
    });
});
