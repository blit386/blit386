/**
 * The pure half of the capture engine: URL building, tick math, pointer mapping, and the
 * per-pose state machine driven through a fake frame adapter.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { captureAll, captureUrl, pointerClientPoint, runPose, stepAfterInput } from '../capture.js';
import { entriesFromResults } from '../save.js';

// Node has no DOM events; the fake canvas only reads `type`, `code`, and `clientX` from them.
globalThis.KeyboardEvent ??= class {
    constructor(type, init) {
        this.type = type;
        Object.assign(this, init);
    }
};
globalThis.PointerEvent ??= class {
    constructor(type, init) {
        this.type = type;
        Object.assign(this, init);
    }
};

describe('captureUrl', () => {
    it('builds the dev and build forms and adds the software backend', () => {
        assert.equal(captureUrl('/demos/', '.html', 'basics', 'display'), '/demos/basics.html?embed&capture');
        assert.equal(captureUrl('./', '', 'basics', 'software'), './basics?embed&capture&backend=software');
    });
});

describe('stepAfterInput', () => {
    it('advances two ticks by default so ui.tick() latches the press', () => {
        assert.equal(stepAfterInput(2, 60), 2 + 2 / 60);
        assert.equal(stepAfterInput(0, 30, 3), 0.1);
    });
});

describe('pointerClientPoint', () => {
    it('maps a display pixel to the center of its on-screen cell', () => {
        const rect = { left: 100, top: 50, width: 640, height: 400 };
        const point = pointerClientPoint(rect, { x: 320, y: 200 }, { x: 10, y: 20 });

        assert.deepEqual(point, { clientX: 100 + 21, clientY: 50 + 41 });
    });
});

function fakeFrame(overrides = {}) {
    const calls = [];
    const engine = {
        targetFPS: 60,
        displaySize: { x: 320, y: 200 },
        renderAt: async (seconds, options) => calls.push(['renderAt', seconds, options?.from ?? 'start']),
        captureFrame: async () => new Blob(['png'], { type: 'image/png' }),
    };
    const ui = {
        debug: false,
        recording: false,
        touchSeen: false,
        snapshot: () => ({ display: { w: 320, h: 200 }, groups: [] }),
    };
    const canvas = {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 200 }),
        dispatchEvent: (event) => calls.push(['event', event.type, event.code ?? event.clientX]),
    };

    return {
        calls,
        load: async (url) => calls.push(['load', url]),
        engine: () => engine,
        ui: () => ui,
        canvas: () => canvas,
        ...overrides,
    };
}

describe('runPose', () => {
    it('loads, seeks, captures at display size, and lints', async () => {
        const frame = fakeFrame();
        const result = await runPose(frame, { id: 'settled', at: 4 }, 'display', {
            url: '/demos/basics.html?embed&capture',
        });

        assert.deepEqual(frame.calls, [
            ['load', '/demos/basics.html?embed&capture'],
            ['renderAt', 4, 'start'],
        ]);
        assert.equal(result.width, 320);
        assert.equal(result.height, 200);
        assert.deepEqual(result.lint, []);
        assert.equal(result.blob.type, 'image/png');
    });

    it('dispatches keys on the canvas and steps two ticks forward', async () => {
        const frame = fakeFrame();

        await runPose(frame, { id: 'play', at: 1, keys: ['Digit1'] }, 'display', { url: 'u' });

        assert.deepEqual(frame.calls.slice(1), [
            ['renderAt', 1, 'start'],
            ['event', 'keydown', 'Digit1'],
            ['renderAt', 1 + 2 / 60, 'current'],
            ['event', 'keyup', 'Digit1'],
        ]);
    });

    it('switches the overlay on for uidebug and marks touch seen for touch', async () => {
        const frame = fakeFrame();

        await runPose(frame, { id: 'start', at: 0 }, 'uidebug', { url: 'u' });
        assert.equal(frame.ui().debug, true);

        await runPose(frame, { id: 'touch', at: 0, touch: true }, 'display', { url: 'u' });
        assert.equal(frame.ui().touchSeen, true);
    });

    it('lints the snapshot taken before capture, which re-renders and duplicates groups', async () => {
        const group = {
            anchor: 'top-bar',
            margin: 0,
            rows: [],
            rect: { x: 0, y: 0, w: 10, h: 10 },
            widgets: [{ id: 'J - Jump', rect: { x: 0, y: 0, w: 10, h: 10 } }],
        };
        const groups = [group];
        const frame = fakeFrame();
        const engine = frame.engine();
        const ui = frame.ui();

        ui.snapshot = () => ({ display: { w: 320, h: 200 }, groups: [...groups] });
        engine.captureFrame = async () => {
            groups.push(group);

            return new Blob(['png'], { type: 'image/png' });
        };

        const result = await runPose(frame, { id: 'start', at: 0 }, 'display', { url: 'u' });

        assert.equal(result.snapshot.groups.length, 1);
        assert.deepEqual(result.lint, []);
    });

    it('names the failing step', async () => {
        const frame = fakeFrame({
            load: async () => {
                throw new Error('never resized');
            },
        });

        await assert.rejects(runPose(frame, { id: 'start', at: 0 }, 'display', { url: 'u' }), /load: never resized/);
    });
});

describe('captureAll', () => {
    it('reports every job and keeps going after a failure', async () => {
        let count = 0;
        const frame = fakeFrame({
            load: async () => {
                count += 1;

                if (count === 1) {
                    throw new Error('boom');
                }
            },
        });
        const results = [];

        await captureAll(
            frame,
            [
                { slug: 'a', pose: { id: 'start', at: 0 }, variant: 'display' },
                { slug: 'b', pose: { id: 'start', at: 0 }, variant: 'display' },
            ],
            (result) => results.push(result),
            { demoBase: '/demos/', pageSuffix: '.html' },
        );

        assert.equal(results.length, 2);
        assert.equal(results[0].ok, false);
        assert.match(results[0].error, /boom/);
        assert.equal(results[1].ok, true);
    });
});

describe('entriesFromResults', () => {
    it('merges variants per pose and records a failed variant as the entry error', () => {
        const blob = new Blob([]);
        const entries = entriesFromResults([
            { slug: 'a', pose: 'start', variant: 'display', ok: true, blob, width: 320, height: 200, lint: [] },
            { slug: 'a', pose: 'start', variant: 'uidebug', ok: true, blob, width: 320, height: 200, lint: [] },
            { slug: 'a', pose: 'start', variant: 'software', ok: false, error: 'no gpu' },
        ]);

        assert.equal(entries.length, 1);
        assert.deepEqual(Object.keys(entries[0].variants), ['display', 'uidebug']);
        assert.equal(entries[0].error, 'software: no gpu');
    });
});
