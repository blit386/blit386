/**
 * Unit tests for the shared UI kit's widgets: slider value mapping, checkbox/pip state, the
 * button's nine-slice, the panel inset, meter clamping, and tooltip docking. Most widgets
 * need an open UiContext group (ctx.begin()); tooltip() draws on its own. Tests share
 * the same `createReadyContext()` (from ui-test-helpers.mjs) + `stubBt()` setup as
 * ui-core.test.mjs.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Rect2i } from 'blit386';

import { BUTTON_H, CMD_NINE_SLICE, CMD_RECT_FILL, CMD_TEXT, UI_ANCHORS } from '../ui-core.js';
import { BUTTON_LOOK, buttonFillSlice, T } from '../ui-theme.js';
import { button, checkbox, label, meter, panel, pip, slider, spacer, tooltip } from '../ui-widgets.js';
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

        // A zero-width range draws no fill (nothing to divide by zero into) - just the two
        // text commands and the meter trough the bar is drawn with.
        const commands = ctx.commands.slice(0, ctx.commandCount);

        assert.equal(ctx.commandCount, 3);
        assert.deepEqual(
            commands.filter((cmd) => cmd.kind === CMD_NINE_SLICE).map((cmd) => cmd.slice),
            [T.meterTroughSlice],
        );

        ctx.end();
    });

    it('maps the fill width from value -> pixels, drawn with the meter art', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        slider(ctx, 'Volume', 0.5, { width: 100 });

        // Trough first across the whole bar, then the info-colored meter fill on top.
        const slices = ctx.commands.slice(0, ctx.commandCount).filter((cmd) => cmd.kind === CMD_NINE_SLICE);

        assert.equal(slices.length, 2);
        assert.equal(slices[0].slice, T.meterTroughSlice);
        assert.equal(slices[0].w, 100);
        assert.equal(slices[1].slice, T.meterFillSlices.get(T.info));
        assert.equal(slices[1].w, 50);

        ctx.end();
    });

    it('prints the value with two decimals by default, or as many as opts.decimals asks', (t) => {
        stubBt(t);

        const ctx = createReadyContext();
        const valueTexts = () =>
            ctx.commands
                .slice(0, ctx.commandCount)
                .filter((cmd) => cmd.kind === CMD_TEXT)
                .map((cmd) => cmd.text);

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        slider(ctx, 'Rate', 10, { min: 1, max: 30, width: 100 });
        assert.deepEqual(valueTexts(), ['Rate', '10.00']);
        ctx.end();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        slider(ctx, 'Rate', 10.4, { min: 1, max: 30, width: 100, decimals: 0 });
        assert.deepEqual(valueTexts(), ['Rate', '10']);
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
            // Bar sits under the label row (ROW_H = 16), so absolute y is margin(4) + 16.
            pointerPos: () => ({ x: 59, y: 20 }),
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
    /**
     * Returns the meter's queued nine-slice commands, trough first.
     *
     * @param {import('../ui-core.js').UiContext} ctx - The context the meter was declared in.
     * @returns {Array<{ w: number, slice: unknown }>}
     */
    function sliceCommands(ctx) {
        return ctx.commands.slice(0, ctx.commandCount).filter((cmd) => cmd.kind === CMD_NINE_SLICE);
    }

    it('clamps a negative fraction to 0 (trough only, no fill slice)', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        meter(ctx, 'Health', -1, { width: 100 });

        const slices = sliceCommands(ctx);

        assert.equal(slices.length, 1);
        assert.equal(slices[0].slice, T.meterTroughSlice);
        assert.equal(slices[0].w, 100);

        ctx.end();
    });

    it('starts the bar 2 pixels below its row so it never paints over the label above', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);

        const rowTop = ctx.cursorY;

        meter(ctx, null, 0.5, { width: 100 });

        assert.equal(sliceCommands(ctx)[0].y, rowTop + 2);

        // The row keeps its old 13-pixel height, so widgets below do not shift.
        assert.equal(ctx.cursorY - rowTop, 13);

        ctx.end();
    });

    it('clamps a fraction over 1 down to a full bar', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        meter(ctx, 'Health', 2, { width: 100 });

        assert.equal(sliceCommands(ctx)[1].w, 100);

        ctx.end();
    });

    it('maps a mid-range fraction to a proportional fill width', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        meter(ctx, 'Health', 0.25, { width: 100 });

        assert.equal(sliceCommands(ctx)[1].w, 25);

        ctx.end();
    });

    it('draws the fill in the requested color role, info by default', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        meter(ctx, 'Info', 0.5, { width: 100 });
        meter(ctx, 'Warm', 0.5, { width: 100, color: 'warm' });

        const slices = sliceCommands(ctx);

        assert.equal(slices[1].slice, T.meterFillSlices.get(T.info));
        assert.equal(slices[3].slice, T.meterFillSlices.get(T.warm));
        assert.notEqual(slices[1].slice, slices[3].slice);

        ctx.end();
    });

    it('skips the label row entirely when text is null', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        meter(ctx, null, 0.5, { width: 100 });

        // Trough + fill only - no label CMD_TEXT command queued.
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

describe('button', () => {
    it('queues the resting nine-slice over the whole button box', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        button(ctx, 'Go', { width: 40 });

        const sliceCommand = ctx.commands.slice(0, ctx.commandCount).find((cmd) => cmd.kind === CMD_NINE_SLICE);

        assert.equal(sliceCommand.slice, T.buttonSlices[BUTTON_LOOK.REST]);
        assert.equal(sliceCommand.w, 40);
        assert.equal(sliceCommand.h, BUTTON_H);

        ctx.end();
    });

    it('starts 2 pixels below its row so its rim never paints over the label above', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);

        const rowTop = ctx.cursorY;

        button(ctx, 'Go', { width: 40 });

        const sliceCommand = ctx.commands.slice(0, ctx.commandCount).find((cmd) => cmd.kind === CMD_NINE_SLICE);

        assert.equal(sliceCommand.y, rowTop + 2);
        assert.equal(ctx.cursorY - rowTop, 2 + BUTTON_H + 3);

        ctx.end();
    });
});

describe('button lit', () => {
    it('fills a lit button with its own colors and labels it in the background color', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        button(ctx, 'On', { width: 40, lit: { fill: 50, rim: 51 } });

        const queued = ctx.commands.slice(0, ctx.commandCount);
        const sliceCommand = queued.find((cmd) => cmd.kind === CMD_NINE_SLICE);
        const textCommand = queued.find((cmd) => cmd.kind === CMD_TEXT);

        assert.equal(sliceCommand.slice, buttonFillSlice(50, 51));
        assert.equal(textCommand.color, T.bg);

        ctx.end();
    });
});

describe('panel', () => {
    /**
     * Opens a group with `opts`, declares a panel and one label, and returns the label's x.
     *
     * @param {{ pad?: number }} opts - Options for ctx.begin().
     * @returns {number}
     */
    function labelXInPanel(opts) {
        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT, opts);
        panel(ctx);
        label(ctx, 'Hi');

        const x = ctx.commands[ctx.commandCount - 1].x;

        ctx.end();

        return x;
    }

    it('insets its content past the default padding (5 + 4)', (t) => {
        stubBt(t);
        assert.equal(labelXInPanel({}), 9);
    });

    it('keeps an explicit pad exactly as the demo asked', (t) => {
        stubBt(t);
        assert.equal(labelXInPanel({ pad: 2 }), 2);
    });

    it('pads a title-only topBar panel out to the classic 22-pixel strip height', (t) => {
        let panelH = 0;

        stubBt(t, {
            drawNineSlice: (_slice, rect) => {
                panelH = rect.height;
            },
        });

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_BAR);
        panel(ctx, 'Title');
        ctx.end();

        assert.equal(panelH, 22);
    });
});

describe('tooltip', () => {
    /**
     * Records the nine-slices and the system-print call tooltip() makes.
     *
     * @param {import('node:test').TestContext} t
     * @returns {{ slices: { slice: unknown, x: number, y: number, w: number, h: number }[], printed: { x: number, y: number, color: number, text: string }[] }}
     */
    function recordDraws(t) {
        const slices = [];
        const printed = [];

        stubBt(t, {
            drawNineSlice: (slice, rect) => {
                slices.push({ slice, x: rect.x, y: rect.y, w: rect.width, h: rect.height });
            },
            systemPrint: (pos, color, text) => {
                printed.push({ x: pos.x, y: pos.y, color, text });
            },
        });

        return { slices, printed };
    }

    it('docks a padded box above the anchor and prints the label inside it', (t) => {
        const { slices, printed } = recordDraws(t);
        const ctx = createReadyContext();

        // "Hi" is 2 glyphs (12px). The nine-slice corners add 4px on each side, plus 3px of
        // breathing room, so the box is 23 wide; it is 14 + 9 - 3 = 20 tall. Anchor center is
        // x = 50, so the box starts at 39. It sits 2px above the anchor's top (y = 50 - 20 - 2).
        // The letters start 6px right of and 3px below the box's top-left.
        tooltip(ctx, new Rect2i(40, 50, 20, 20), 'Hi');

        assert.equal(slices.length, 1);
        assert.equal(slices[0].slice, T.tooltipSlice);
        assert.deepEqual([slices[0].x, slices[0].y, slices[0].w, slices[0].h], [39, 28, 23, 20]);
        assert.deepEqual(printed, [{ x: 45, y: 31, color: T.shadow, text: 'Hi' }]);
    });

    it('clamps to the display edges and honors minY and gap', (t) => {
        const { slices, printed } = recordDraws(t);
        const ctx = createReadyContext();

        // Wider than the space to the left of the anchor: the box pins to x = 0.
        tooltip(ctx, new Rect2i(0, 50, 10, 10), 'Hello');
        assert.equal(slices[0].x, 0);

        slices.length = 0;
        // Near the right edge of the 320-wide stub display. "Hello" is 5 glyphs
        // plus 8px of side caps and 3px of room, 41px wide, so the box ends flush with x = 320.
        tooltip(ctx, new Rect2i(310, 50, 10, 10), 'Hello');
        assert.equal(slices[0].x + slices[0].w, 320);

        slices.length = 0;
        printed.length = 0;
        // No room above the anchor once minY is 28, so the box drops to that line.
        // gap: 4 would have put it at 10 - 20 - 4 = -14 without the floor. The letters
        // start 3px below the box.
        tooltip(ctx, new Rect2i(40, 10, 20, 20), 'Hi', { minY: 28, gap: 4 });
        assert.equal(slices[0].y, 28);
        assert.equal(printed[0].color, T.shadow);
        assert.equal(printed[0].y, 31);
    });

    it('draws nothing for an empty label', (t) => {
        const { slices, printed } = recordDraws(t);
        const ctx = createReadyContext();

        tooltip(ctx, new Rect2i(40, 50, 20, 20), '');

        assert.equal(slices.length, 0);
        assert.equal(printed.length, 0);
    });

    it('refuses to draw inside an open group or before applyTheme()', (t) => {
        stubBt(t);

        const ctx = createReadyContext();

        ctx.begin(UI_ANCHORS.TOP_LEFT);
        assert.throws(() => tooltip(ctx, new Rect2i(0, 0, 10, 10), 'Hi'), /outside ui\.begin/);
        ctx.end();

        const wasReady = T.ready;

        T.ready = false;

        try {
            assert.throws(() => tooltip(ctx, new Rect2i(0, 0, 10, 10), 'Hi'), /applyTheme/);
        } finally {
            T.ready = wasReady;
        }
    });
});
