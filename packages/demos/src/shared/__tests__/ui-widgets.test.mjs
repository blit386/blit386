/**
 * Unit tests for the shared UI kit's widgets: slider value mapping, checkbox/pip state, and
 * meter clamping. Every widget needs an open UiContext group (ctx.begin()), so tests share
 * the same `createReadyContext()` (from ui-test-helpers.mjs) + `stubBt()` setup as
 * ui-core.test.mjs.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CMD_RECT_FILL, UI_ANCHORS } from '../ui-core.js';
import { checkbox, meter, pip, slider, spacer } from '../ui-widgets.js';
import { stubBt } from './bt-stub.mjs';
import { createReadyContext } from './ui-test-helpers.mjs';

describe('slider', () => {
    it('clamps an out-of-range value even with no drag in progress', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        assert.equal(slider(ctx, 'Volume', 5, { width: 100 }), 1);
        ctx.end();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        assert.equal(slider(ctx, 'Volume', -5, { width: 100 }), 0);
        ctx.end();
    });

    it('clamps to min/max instead of dividing by zero when min === max', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        const nextValue = slider(ctx, 'Fixed', 10, { min: 3, max: 3, width: 100 });

        assert.equal(nextValue, 3);
        assert.ok(!Number.isNaN(nextValue));

        // A zero-width range draws no fill rect (nothing to divide by zero into) - just the
        // two text commands and the border stroke.
        assert.equal(ctx.commandCount, 3);
        assert.ok(!ctx.commands.slice(0, ctx.commandCount).some((cmd) => cmd.kind === CMD_RECT_FILL));

        ctx.end();
    });

    it('maps the fill width from value -> pixels', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        slider(ctx, 'Volume', 0.5, { width: 100 });

        const fillCommand = ctx.commands.slice(0, ctx.commandCount).find((cmd) => cmd.kind === CMD_RECT_FILL);

        assert.equal(fillCommand.w, 50);

        ctx.end();
    });

    it('maps a drag position -> value, overriding the passed-in value', (t) => {
        // Pointer slot 0 (mouse) reports a press at a fixed spot for every frame; the first
        // frame just establishes the slider's cached hit rect, the second frame's begin()
        // sees the (still-pressed) pointer land inside that now-cached rect and starts the
        // drag, per UiContext.resolveDrag().
        stubBt(t, {
            isPointerActive: (slot) => slot === 0,
            isPressed: () => true,
            isDown: () => true,
            pointerPos: () => ({ x: 59, y: 14 }),
        });

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        slider(ctx, 'Volume', 0.1, { width: 100, id: 'volume' });
        ctx.end();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        const nextValue = slider(ctx, 'Volume', 0.1, { width: 100, id: 'volume' });
        ctx.end();

        // Bar hit rect is at absolute x = margin(4) + pad(5) = 9, width 100. A press at
        // x=59 is halfway across, so the drag reports 0.5 - not the 0.1 passed in.
        assert.equal(nextValue, 0.5);
    });
});

describe('checkbox', () => {
    it('does not toggle when neither clicked nor key-pressed', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        const nextValue = checkbox(ctx, 'Loop', false);
        ctx.end();

        assert.equal(nextValue, false);
    });

    it('toggles on the frame it is clicked or tapped', (t) => {
        stubBt(t, {
            isPointerActive: (slot) => slot === 0,
            isPressed: () => true,
            isDown: () => true,
            pointerPos: () => ({ x: 10, y: 5 }),
        });

        const ctx = createReadyContext();

        // Frame 1 establishes the cached hit rect at the top-left group's first row.
        ctx.begin(UI_ANCHORS.TOP_LEFT);
        checkbox(ctx, 'Loop', false, { id: 'loop' });
        ctx.end();

        // Frame 2: the same (still-pressed) pointer now lands inside that cached rect.
        ctx.begin(UI_ANCHORS.TOP_LEFT);
        const nextValue = checkbox(ctx, 'Loop', false, { id: 'loop' });
        ctx.end();

        assert.equal(nextValue, true);
    });

    it('toggles on a fired key, delivered edge-safely through ui.tick()', (t) => {
        let keyPressedThisTick = false;

        stubBt(t, { isKeyPressed: (code) => code === 'KeyM' && keyPressedThisTick });

        const ctx = createReadyContext();

        // Render once so the widget registers 'KeyM' as a watched key - a key nothing has
        // ever asked about is never checked by tick().
        ctx.begin(UI_ANCHORS.TOP_LEFT);
        assert.equal(checkbox(ctx, 'Mute', false, { key: 'KeyM' }), false);
        ctx.end();

        // update(): the key goes down. tick() is what makes this safe to read here instead
        // of render() - see ui-core.js's file header and CLAUDE.md's shared-UI-kit section.
        keyPressedThisTick = true;
        ctx.tick();
        keyPressedThisTick = false;

        // render(): the widget picks up the press from the mailbox and toggles.
        ctx.begin(UI_ANCHORS.TOP_LEFT);
        assert.equal(checkbox(ctx, 'Mute', false, { key: 'KeyM' }), true);
        ctx.end();

        // A second render before the next tick() must not re-fire the same press - it was
        // delivered to exactly one render frame.
        ctx.begin(UI_ANCHORS.TOP_LEFT);
        assert.equal(checkbox(ctx, 'Mute', false, { key: 'KeyM' }), false);
        ctx.end();
    });
});

describe('pip', () => {
    it('draws a filled pip plus label when on', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        pip(ctx, 'Ready', true);

        assert.equal(ctx.commandCount, 3);
        assert.ok(ctx.commands.slice(0, ctx.commandCount).some((cmd) => cmd.kind === CMD_RECT_FILL));

        ctx.end();
    });

    it('draws no fill (outline only) plus label when off', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        pip(ctx, 'Ready', false);

        assert.equal(ctx.commandCount, 2);
        assert.ok(!ctx.commands.slice(0, ctx.commandCount).some((cmd) => cmd.kind === CMD_RECT_FILL));

        ctx.end();
    });

    it('never registers a hit rectangle - it is purely visual', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        pip(ctx, 'Ready', true);
        ctx.end();

        assert.equal(ctx.hitRects.size, 0);
    });
});

describe('meter', () => {
    it('clamps a negative fraction to 0 (no fill rect)', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        meter(ctx, 'Health', -1, { width: 100 });

        assert.ok(!ctx.commands.slice(0, ctx.commandCount).some((cmd) => cmd.kind === CMD_RECT_FILL));

        ctx.end();
    });

    it('clamps a fraction over 1 down to a full bar', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        meter(ctx, 'Health', 2, { width: 100 });

        const fillCommand = ctx.commands.slice(0, ctx.commandCount).find((cmd) => cmd.kind === CMD_RECT_FILL);

        assert.equal(fillCommand.w, 100);

        ctx.end();
    });

    it('maps a mid-range fraction to a proportional fill width', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        meter(ctx, 'Health', 0.25, { width: 100 });

        const fillCommand = ctx.commands.slice(0, ctx.commandCount).find((cmd) => cmd.kind === CMD_RECT_FILL);

        assert.equal(fillCommand.w, 25);

        ctx.end();
    });

    it('skips the label row entirely when text is null', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        meter(ctx, null, 0.5, { width: 100 });

        // Bar fill + bar stroke only - no label CMD_TEXT command queued.
        assert.equal(ctx.commandCount, 2);

        ctx.end();
    });
});

describe('spacer', () => {
    it('records a zero-width row so the layout lint can tell it from a gap', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.recording = true;
        ctx.begin(UI_ANCHORS.TOP_LEFT);
        spacer(ctx, 7);
        ctx.end();

        const [row] = ctx.snapshot().groups[0].rows;

        assert.equal(row.w, 0);
        assert.equal(row.h, 7);
    });
});
