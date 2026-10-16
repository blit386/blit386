/**
 * The pure half of the capture engine: URL building, tick math, pointer mapping, and the
 * per-pose state machine driven through a fake frame adapter.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';

import { captureAll, captureUrl, pointerClientPoint, runPose, stepAfterInput } from '../capture.js';
import { entriesFromResults, saveRun } from '../save.js';

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
        isReady: true,
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

    it('moves the pointer as a mouse, the only pointer type the engine tracks without a press', async () => {
        const events = [];
        const frame = fakeFrame();
        const canvas = frame.canvas();

        canvas.dispatchEvent = (event) => events.push(event);
        await runPose(frame, { id: 'hover', at: 1, pointer: { x: 10, y: 20 } }, 'display', { url: 'u' });

        assert.equal(events[0].type, 'pointermove');
        assert.equal(events[0].pointerType, 'mouse');
    });

    it('marks touch seen for the touch variant even when the pose does not ask for it', async () => {
        const frame = fakeFrame();

        await runPose(frame, { id: 'start', at: 0 }, 'touch', { url: 'u' });
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

    it('waits for isReady before the first renderAt', async () => {
        const frame = fakeFrame();
        const engine = frame.engine();
        let readyReads = 0;

        Object.defineProperty(engine, 'isReady', {
            get() {
                readyReads += 1;

                return readyReads > 1;
            },
            configurable: true,
        });

        await runPose(frame, { id: 'settled', at: 4 }, 'display', { url: 'u' });

        assert.ok(readyReads > 1);
        assert.deepEqual(frame.calls.slice(1), [['renderAt', 4, 'start']]);
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

describe('captureAll errors', () => {
    it('reports the message of an error thrown in another realm', async () => {
        // An iframe's errors are not `instanceof Error` here, which is why errorText reads `.message`.
        const foreign = runInNewContext('new Error("foreign boom")');
        const frame = fakeFrame({
            load: async () => {
                throw foreign;
            },
        });
        const results = [];

        assert.equal(foreign instanceof Error, false);

        await captureAll(
            frame,
            [{ slug: 'a', pose: { id: 'start', at: 0 }, variant: 'display' }],
            (r) => results.push(r),
            {
                demoBase: '/demos/',
                pageSuffix: '',
            },
        );

        assert.equal(results[0].error, 'load: foreign boom');
    });
});

describe('saveRun', () => {
    // A directory handle whose files all write, except those named in `failing`.
    function fakeDir(failing, written) {
        const folder = {
            getDirectoryHandle: async () => folder,
            getFileHandle: async (name) => ({
                createWritable: async () => ({
                    write: async () => {
                        if (failing.includes(name)) {
                            throw new Error('disk full');
                        }

                        written.push(name);
                    },
                    close: async () => {},
                }),
            }),
        };

        return folder;
    }

    const ok = (variant) => ({
        slug: 'basics',
        pose: 'start',
        variant,
        ok: true,
        blob: new Blob(['png']),
        width: 320,
        height: 200,
        lint: [],
    });

    it('names a file that failed, keeps going, and leaves it out of the manifest', async () => {
        const written = [];
        const existing = { entries: [] };
        const failing = ['start.uidebug.png'];
        const { manifest, failed } = await saveRun(
            fakeDir(failing, written),
            [ok('display'), ok('uidebug')],
            existing,
            {
                engineVersion: '1.0.0',
            },
        );

        assert.deepEqual(
            failed.map((item) => [item.path, item.error]),
            [['basics/start.uidebug.png', 'disk full']],
        );
        assert.ok(written.includes('start.display.png'));
        assert.deepEqual(Object.keys(manifest.entries[0].variants), ['display']);
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

    it('keeps the display size when output is captured and software can fill it in', () => {
        const blob = new Blob([]);
        const withSoftware = entriesFromResults([
            {
                slug: 'crt-toggle',
                pose: 'crt',
                variant: 'output',
                ok: true,
                blob,
                width: 1280,
                height: 960,
                lint: [{ rule: 'margin', message: 'tight' }],
            },
            {
                slug: 'crt-toggle',
                pose: 'crt',
                variant: 'software',
                ok: true,
                blob,
                width: 320,
                height: 240,
                lint: [],
            },
        ]);

        assert.equal(withSoftware[0].width, 320);
        assert.equal(withSoftware[0].height, 240);

        const outputOnly = entriesFromResults([
            {
                slug: 'crt-toggle',
                pose: 'crt',
                variant: 'output',
                ok: true,
                blob,
                width: 1280,
                height: 960,
                lint: [],
            },
        ]);

        assert.equal(outputOnly[0].width, 0);
        assert.equal(outputOnly[0].height, 0);
    });
});
