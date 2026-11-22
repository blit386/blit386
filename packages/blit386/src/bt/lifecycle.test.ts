// @vitest-environment happy-dom

/**
 * Unit tests for the `BT` members defined in `src/bt/lifecycle.ts`: init, size and time getters, readiness, splash,
 * testState, backends, loading count, captureFrame, renderAt, downloadFrame.
 */

import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { mockHardwareSettings } from '../__test__/btFacadeFixtures';
import { AssetLoader } from '../assets/AssetLoader';
import { BitmapFont as BitmapFontClass } from '../assets/BitmapFont';
import type { IBTDemo } from '../BLIT386';
import { BT, Vector2i } from '../BLIT386';
import { BTAPI } from '../core/BTAPI';

describe('BT.init', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.init and returns its result', async () => {
        const spy = vi.spyOn(BTAPI.instance, 'init').mockResolvedValue(true);
        const demo = {
            configure: vi.fn(),
            init: vi.fn(),
            update: vi.fn(),
            render: vi.fn(),
        };
        const canvas = {} as HTMLCanvasElement;

        const result = await BT.init(demo, canvas);

        expect(spy).toHaveBeenCalledWith(demo, canvas);
        expect(result).toBe(true);
    });

    it('forwards a failure result from BTAPI', async () => {
        vi.spyOn(BTAPI.instance, 'init').mockResolvedValue(false);

        const demo = {
            configure: vi.fn(),
            init: vi.fn(),
            update: vi.fn(),
            render: vi.fn(),
        };

        const result = await BT.init(demo, {} as HTMLCanvasElement);

        expect(result).toBe(false);
    });
});

describe('BT.displaySize', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the configure default when hardware settings are not available', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(null);

        const size = BT.displaySize;

        expect(size.x).toBe(320);
        expect(size.y).toBe(240);
    });

    it('returns a clone of displaySize from hardware settings', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(mockHardwareSettings(new Vector2i(640, 480)));

        const size = BT.displaySize;

        expect(size.x).toBe(640);
        expect(size.y).toBe(480);
    });
});

describe('BT.drawingBufferSize', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the configure default when hardware settings are not available', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(null);

        expect(BT.drawingBufferSize?.isEqual(new Vector2i(640, 480))).toBe(true);
    });

    it('returns null when drawingBufferSize was not configured', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(mockHardwareSettings());

        expect(BT.drawingBufferSize).toBeNull();
    });

    it('returns a clone when drawingBufferSize is configured', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
            ...mockHardwareSettings(),
            drawingBufferSize: new Vector2i(640, 480),
        });

        const size = BT.drawingBufferSize;

        expect(size?.x).toBe(640);
        expect(size?.y).toBe(480);
    });

    it('returns an independent clone per read', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
            ...mockHardwareSettings(),
            drawingBufferSize: new Vector2i(640, 480),
        });

        const first = BT.drawingBufferSize;
        expect(first).toBeDefined();
        if (!first) {
            return;
        }

        first.x = 999;

        expect(BT.drawingBufferSize?.x).toBe(640);
    });
});

describe('BT.outputSize', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the configure default when hardware settings are not available', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(null);

        const size = BT.outputSize;

        expect(size.x).toBe(640);
        expect(size.y).toBe(480);
    });

    it('returns a mutable vector when hardware settings are not available', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(null);

        const size = BT.outputSize;

        expect(() => size.addInPlace(new Vector2i(1, 1))).not.toThrow();
        expect(size.x).toBe(641);
    });

    it('matches displaySize when drawingBufferSize is omitted', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(mockHardwareSettings(new Vector2i(320, 240)));

        const size = BT.outputSize;

        expect(size.x).toBe(320);
        expect(size.y).toBe(240);
    });

    it('returns drawingBufferSize when configured', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
            ...mockHardwareSettings(new Vector2i(320, 240)),
            drawingBufferSize: new Vector2i(640, 480),
        });

        const size = BT.outputSize;

        expect(size.x).toBe(640);
        expect(size.y).toBe(480);
    });

    it('returns an independent clone per read', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(mockHardwareSettings(new Vector2i(320, 240)));

        const first = BT.outputSize;
        first.x = 999;

        expect(BT.outputSize.x).toBe(320);
    });
});

describe('BT.targetFPS', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 60 when hardware settings are not available', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(null);

        expect(BT.targetFPS).toBe(60);
    });

    it('returns targetFPS from hardware settings', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            mockHardwareSettings(new Vector2i(320, 240), 30),
        );

        expect(BT.targetFPS).toBe(30);
    });
});

describe('BT.deltaSeconds', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1/60 when hardware settings are not available', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(null);

        expect(BT.deltaSeconds).toBeCloseTo(1 / 60);
    });

    it('returns reciprocal of targetFPS from hardware settings', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            mockHardwareSettings(new Vector2i(320, 240), 50),
        );

        expect(BT.deltaSeconds).toBeCloseTo(0.02);
    });

    it('falls back to 1/60 when targetFPS is non-positive', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            mockHardwareSettings(new Vector2i(320, 240), 0),
        );

        expect(BT.deltaSeconds).toBeCloseTo(1 / 60);
    });

    it('falls back to 1/60 when targetFPS is non-finite', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            mockHardwareSettings(new Vector2i(320, 240), Number.NaN),
        );

        expect(BT.deltaSeconds).toBeCloseTo(1 / 60);
    });
});

describe('BT.timeSeconds', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns ticks multiplied by deltaSeconds', () => {
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(90);
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            mockHardwareSettings(new Vector2i(320, 240), 30),
        );

        expect(BT.timeSeconds).toBeCloseTo(3);
    });

    it('uses fallback delta when targetFPS is non-positive, producing finite time', () => {
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(120);
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            mockHardwareSettings(new Vector2i(320, 240), 0),
        );

        const time = BT.timeSeconds;
        expect(BT.deltaSeconds).toBeCloseTo(1 / 60);
        expect(Number.isFinite(time)).toBe(true);
        expect(time).toBeCloseTo(2);
    });

    it('uses fallback delta when targetFPS is non-finite, producing finite time', () => {
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(120);
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            mockHardwareSettings(new Vector2i(320, 240), Number.POSITIVE_INFINITY),
        );

        const time = BT.timeSeconds;
        expect(BT.deltaSeconds).toBeCloseTo(1 / 60);
        expect(Number.isFinite(time)).toBe(true);
        expect(time).toBeCloseTo(2);
    });
});

describe('BT.ticks', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.getTicks', () => {
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(42);

        expect(BT.ticks).toBe(42);
    });
});

describe('BT.ticksReset', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.resetTicks', () => {
        const spy = vi.spyOn(BTAPI.instance, 'resetTicks').mockReturnValue(undefined);

        BT.ticksReset();

        expect(spy).toHaveBeenCalledOnce();
    });
});

describe('BT.renderAlpha', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.getRenderAlpha', () => {
        vi.spyOn(BTAPI.instance, 'getRenderAlpha').mockReturnValue(0.42);

        expect(BT.renderAlpha).toBe(0.42);
    });
});

describe('BT.assignTag', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.assignTag', () => {
        const spy = vi.spyOn(BTAPI.instance, 'assignTag').mockReturnValue(undefined);

        BT.assignTag('Milestone');

        expect(spy).toHaveBeenCalledWith('Milestone');
    });
});

describe('BT.isDevMode', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.isDevMode', () => {
        const spy = vi.spyOn(BTAPI.instance, 'isDevMode').mockReturnValue(true);

        expect(BT.isDevMode).toBe(true);
        expect(spy).toHaveBeenCalledWith();
    });
});

describe('BT.isReady', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.isInitialized', () => {
        const spy = vi.spyOn(BTAPI.instance, 'isInitialized').mockReturnValue(true);

        expect(BT.isReady).toBe(true);
        expect(spy).toHaveBeenCalledWith();
    });
});

describe('BT.testState', () => {
    /** Minimal demo with an optional `testState` hook; `init()` resolves so `hotReplaceDemo` accepts it. */
    function makeDemo(testState?: () => unknown): IBTDemo {
        return {
            init: vi.fn().mockResolvedValue(true),
            update: vi.fn(),
            render: vi.fn(),
            ...(testState ? { testState } : {}),
        };
    }

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(42);
        vi.spyOn(BTAPI.instance, 'getActiveBackend').mockReturnValue('software');
    });

    afterEach(() => {
        Reflect.set(BTAPI.instance, 'demo', null);
    });

    it('returns ticks and backend with state null when no demo is running', () => {
        expect(BT.testState()).toEqual({ ticks: 42, backend: 'software', state: null });
    });

    it('returns state null when the demo has no testState hook', () => {
        vi.spyOn(BTAPI.instance, 'getDemo').mockReturnValue(makeDemo());

        expect(BT.testState()).toEqual({ ticks: 42, backend: 'software', state: null });
    });

    it('deep-copies the hook result so mutating it does not touch the game', () => {
        const item = { id: 1 };
        const game = { score: 3, player: new Vector2i(10, 20), items: [item] };
        vi.spyOn(BTAPI.instance, 'getDemo').mockReturnValue(makeDemo(() => game));

        const snapshot = BT.testState();

        expect(snapshot).toEqual({
            ticks: 42,
            backend: 'software',
            state: { score: 3, player: { x: 10, y: 20 }, items: [{ id: 1 }] },
        });
        expect(Object.getPrototypeOf((snapshot.state as { player: unknown }).player)).toBe(Object.prototype);

        const state = snapshot.state as typeof game;
        state.score = 99;
        for (const copy of state.items) {
            copy.id = 99;
        }

        expect(game.score).toBe(3);
        expect(item.id).toBe(1);
    });

    it('maps an undefined hook result to state null', () => {
        vi.spyOn(BTAPI.instance, 'getDemo').mockReturnValue(makeDemo(() => undefined));

        expect(BT.testState()).toEqual({ ticks: 42, backend: 'software', state: null });
    });

    it('catches a throwing hook, logs it, and reports the message', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const boom = new Error('boom');
        vi.spyOn(BTAPI.instance, 'getDemo').mockReturnValue(
            makeDemo(() => {
                throw boom;
            }),
        );

        expect(BT.testState()).toEqual({ ticks: 42, backend: 'software', state: null, error: 'boom' });
        expect(errorSpy).toHaveBeenCalledWith('[BT] testState() threw:', boom);
    });

    it('reports a thrown string as-is and a thrown null-prototype object with a generic message', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const getDemo = vi.spyOn(BTAPI.instance, 'getDemo');

        getDemo.mockReturnValue(
            makeDemo(() => {
                throw 'plain string';
            }),
        );
        expect(BT.testState().error).toBe('plain string');

        getDemo.mockReturnValue(
            makeDemo(() => {
                throw Object.create(null);
            }),
        );
        expect(BT.testState()).toEqual({
            ticks: 42,
            backend: 'software',
            state: null,
            error: 'testState() threw a value with no readable message',
        });
    });

    it('reads an Error message once, so a getter that changes between reads cannot leak a non-string', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const fickle = new Error('unused');
        let reads = 0;
        Object.defineProperty(fickle, 'message', {
            get(): unknown {
                reads++;
                return reads === 1 ? 'first read' : { notAString: true };
            },
        });
        vi.spyOn(BTAPI.instance, 'getDemo').mockReturnValue(
            makeDemo(() => {
                throw fickle;
            }),
        );

        expect(BT.testState().error).toBe('first read');
    });

    it('reports an Error whose message getter throws with a generic message', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const hostile = new Error('hidden');
        Object.defineProperty(hostile, 'message', {
            get(): string {
                throw new Error('message getter threw');
            },
        });
        vi.spyOn(BTAPI.instance, 'getDemo').mockReturnValue(
            makeDemo(() => {
                throw hostile;
            }),
        );

        expect(BT.testState()).toEqual({
            ticks: 42,
            backend: 'software',
            state: null,
            error: 'testState() threw a value with no readable message',
        });
    });

    it('reports a cyclic result instead of throwing', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        vi.spyOn(BTAPI.instance, 'getDemo').mockReturnValue(makeDemo(() => cyclic));

        const snapshot = BT.testState();

        expect(snapshot.state).toBeNull();
        expect(snapshot.error).toMatch(/circular/i);
        expect(errorSpy).toHaveBeenCalledWith('[BT] testState() threw:', expect.any(TypeError));
    });

    it('reports a BigInt result instead of throwing', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(BTAPI.instance, 'getDemo').mockReturnValue(makeDemo(() => ({ big: 1n })));

        const snapshot = BT.testState();

        expect(snapshot.state).toBeNull();
        expect(snapshot.error).toMatch(/bigint/i);
    });

    it("calls the new instance's hook after a 'reinit' hot-reload swap", async () => {
        const oldHook = vi.fn(() => ({ generation: 1 }));
        const newHook = vi.fn(() => ({ generation: 2 }));
        Reflect.set(BTAPI.instance, 'demo', makeDemo(oldHook));

        expect(BT.testState().state).toEqual({ generation: 1 });

        expect(await BTAPI.instance.hotReplaceDemo(makeDemo(newHook))).toBe(true);

        expect(BT.testState().state).toEqual({ generation: 2 });
        expect(oldHook).toHaveBeenCalledTimes(1);
        expect(newHook).toHaveBeenCalledTimes(1);
    });
});

describe('BT.captureFrame', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.captureFrame and returns its result', async () => {
        const mockBlob = new Blob(['test'], { type: 'image/png' });
        const spy = vi.spyOn(BTAPI.instance.capture, 'captureFrame').mockResolvedValue(mockBlob);

        const result = await BT.captureFrame();

        expect(spy).toHaveBeenCalledOnce();
        expect(result).toBe(mockBlob);
    });
});

describe('BT.renderAt', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('passes options.from through to BTAPI.instance.renderAt', async () => {
        const spy = vi.spyOn(BTAPI.instance.seek, 'renderAt').mockResolvedValue(undefined);

        await BT.renderAt(3, { from: 'current' });

        expect(spy).toHaveBeenCalledWith(3, 'current');
    });

    it.each([['current'], [null], [[]]])('rejects, never throws, when options is %j', async (options) => {
        const spy = vi.spyOn(BTAPI.instance.seek, 'renderAt').mockResolvedValue(undefined);
        let result: Promise<void> | undefined;

        expect(() => {
            result = BT.renderAt(3, options as never);
        }).not.toThrow();
        await expect(result).rejects.toThrow('takes its options as an object');
        expect(spy).not.toHaveBeenCalled();
    });
});

describe("BT.captureFrame({ size: 'display' })", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("passes 'display' through to BTAPI.instance.captureFrame", async () => {
        const mockBlob = new Blob(['png'], { type: 'image/png' });
        const spy = vi.spyOn(BTAPI.instance.capture, 'captureFrame').mockResolvedValue(mockBlob);

        const result = await BT.captureFrame({ size: 'display' });

        expect(result).toBe(mockBlob);
        expect(spy).toHaveBeenCalledExactlyOnceWith('display');
    });

    it('passes undefined (the outputSize default) when no options are given', async () => {
        const spy = vi.spyOn(BTAPI.instance.capture, 'captureFrame').mockResolvedValue(new Blob());

        await BT.captureFrame();

        expect(spy).toHaveBeenCalledExactlyOnceWith(undefined);
    });
});

describe('BT.downloadFrame', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('calls captureFrame, creates object URL, clicks anchor, and revokes URL', async () => {
        const mockBlob = new Blob(['test'], { type: 'image/png' });

        vi.spyOn(BTAPI.instance.capture, 'captureFrame').mockResolvedValue(mockBlob);

        const mockUrl = 'blob:mock-url';
        const createObjectURL = vi.fn().mockReturnValue(mockUrl);
        const revokeObjectURL = vi.fn();

        vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

        const mockAnchor = { href: '', download: '', click: vi.fn() };

        vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLAnchorElement);

        await BT.downloadFrame('screenshot.png');

        expect(createObjectURL).toHaveBeenCalledWith(mockBlob);
        expect(mockAnchor.href).toBe(mockUrl);
        expect(mockAnchor.download).toBe('screenshot.png');
        expect(mockAnchor.click).toHaveBeenCalledOnce();
        expect(revokeObjectURL).toHaveBeenCalledWith(mockUrl);
    });

    it("forwards { size: 'display' } to BTAPI.instance.captureFrame", async () => {
        const spy = vi.spyOn(BTAPI.instance.capture, 'captureFrame').mockResolvedValue(new Blob());

        vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:x'), revokeObjectURL: vi.fn() });
        vi.spyOn(document, 'createElement').mockReturnValue({
            href: '',
            download: '',
            click: vi.fn(),
        } as unknown as HTMLAnchorElement);

        await BT.downloadFrame('exact.png', { size: 'display' });

        expect(spy).toHaveBeenCalledExactlyOnceWith('display');
    });

    it('uses the default filename when none is provided', async () => {
        const mockBlob = new Blob(['test'], { type: 'image/png' });

        vi.spyOn(BTAPI.instance.capture, 'captureFrame').mockResolvedValue(mockBlob);
        vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:x'), revokeObjectURL: vi.fn() });

        const mockAnchor = { href: '', download: '', click: vi.fn() };

        vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLAnchorElement);

        await BT.downloadFrame();

        expect(mockAnchor.download).toBe('blit386-capture.png');
    });
});

describe('BT.requestedBackend', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('is typed as Backend | null on the public facade', () => {
        expectTypeOf(BT.requestedBackend).toEqualTypeOf<'webgpu' | 'software' | null>();
    });

    it('delegates to BTAPI.instance.getRequestedBackend', () => {
        const spy = vi.spyOn(BTAPI.instance, 'getRequestedBackend').mockReturnValue('software');

        const result = BT.requestedBackend;

        expect(spy).toHaveBeenCalled();
        expect(result).toBe('software');
    });

    it('returns null before initialization', () => {
        vi.spyOn(BTAPI.instance, 'getRequestedBackend').mockReturnValue(null);

        expect(BT.requestedBackend).toBeNull();
    });

    it('returns webgpu when BTAPI reports webgpu requested', () => {
        vi.spyOn(BTAPI.instance, 'getRequestedBackend').mockReturnValue('webgpu');

        expect(BT.requestedBackend).toBe('webgpu');
    });
});

describe('BT.activeBackend', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.getActiveBackend', () => {
        const spy = vi.spyOn(BTAPI.instance, 'getActiveBackend').mockReturnValue('webgpu');

        const result = BT.activeBackend;

        expect(spy).toHaveBeenCalled();
        expect(result).toBe('webgpu');
    });

    it('returns null before initialization', () => {
        vi.spyOn(BTAPI.instance, 'getActiveBackend').mockReturnValue(null);

        expect(BT.activeBackend).toBeNull();
    });

    it('returns software when BTAPI reports software backend active', () => {
        vi.spyOn(BTAPI.instance, 'getActiveBackend').mockReturnValue('software');

        expect(BT.activeBackend).toBe('software');
    });
});

describe('BT.loadingAssetsCount', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.getLoadingAssetsCount', () => {
        const spy = vi.spyOn(BTAPI.instance, 'getLoadingAssetsCount').mockReturnValue(3);

        const result = BT.loadingAssetsCount;

        expect(spy).toHaveBeenCalled();
        expect(result).toBe(3);
    });

    it('returns 0 when nothing is loading', () => {
        vi.spyOn(BTAPI.instance, 'getLoadingAssetsCount').mockReturnValue(0);

        expect(BT.loadingAssetsCount).toBe(0);
    });

    it('reflects a real pending AssetLoader image load, without mocking BTAPI', async () => {
        /** Image stub whose `onload`/`onerror` must be fired manually, so the test controls timing. */
        class DeferredImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            width = 10;
            height = 10;
            src = '';
        }

        const instances: DeferredImage[] = [];

        vi.stubGlobal(
            'Image',
            class extends DeferredImage {
                constructor() {
                    super();
                    instances.push(this);
                }
            },
        );

        try {
            expect(BT.loadingAssetsCount).toBe(0);

            const promise = AssetLoader.loadImage('pending-bt-aggregate.png');

            expect(BT.loadingAssetsCount).toBe(1);

            instances[0]?.onload?.();
            await promise;

            expect(BT.loadingAssetsCount).toBe(0);
        } finally {
            vi.unstubAllGlobals();
            AssetLoader.clear();
        }
    });
});

describe('BT splash getters', () => {
    it('reports disabled before any init', () => {
        expect(BT.splashState).toBe('disabled');
        expect(BT.isSplashVisible).toBe(false);
    });

    it('are getters, not methods', () => {
        expect(typeof BT.splashState).toBe('string');
        expect(typeof BT.isSplashVisible).toBe('boolean');
    });

    it('delegates splashState to BTAPI', () => {
        const spy = vi.spyOn(BTAPI.instance, 'getSplashState').mockReturnValue('shown');

        expect(BT.splashState).toBe('shown');

        spy.mockRestore();
    });

    it('delegates isSplashVisible to BTAPI', () => {
        const spy = vi.spyOn(BTAPI.instance, 'isSplashVisible').mockReturnValue(true);

        expect(BT.isSplashVisible).toBe(true);

        spy.mockRestore();
    });
});

describe('BT.loadingAssetsCount with bitmap fonts', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('counts a pending BitmapFont.load and drops to 0 after it fails', async () => {
        let release: (response: unknown) => void = () => undefined;

        vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((resolve) => (release = resolve))));

        expect(BT.loadingAssetsCount).toBe(0);

        const pending = expect(BitmapFontClass.load('pending-bt-font.btfont')).rejects.toThrow();

        expect(BT.loadingAssetsCount).toBe(1);

        release({ ok: false, status: 404, statusText: 'Not Found' });
        await pending;

        expect(BT.loadingAssetsCount).toBe(0);
    });
});
