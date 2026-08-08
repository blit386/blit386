// @vitest-environment happy-dom

/**
 * Unit tests for {@link bootstrap}.
 *
 * Covers the DOM-facing startup flow:
 * - optional waiting for `DOMContentLoaded`
 * - canvas lookup failures
 * - success and failure paths around `BTAPI.init()`
 * - default and custom canvas/container identifiers
 * - propagation of success and error callbacks
 *
 * The suite uses a minimal happy-dom document plus a mocked `BTAPI`
 * initialization path so bootstrap behavior can be validated without running
 * the full engine.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BTAPI } from '../core/BTAPI';
import type { IBTDemo } from '../core/IBTDemo';
import type * as HotRuntimeModule from '../hot/HotRuntime';
import { bootstrap } from './Bootstrap';
import { DEFAULT_CANVAS_ID, DEFAULT_CONTAINER_ID } from './BootstrapHelpers';

vi.mock('../hot/HotRuntime', async (importOriginal) => {
    const actual = await importOriginal<typeof HotRuntimeModule>();

    return { ...actual, isHotActive: vi.fn(() => false) };
});

vi.mock('../hot/HotSwap', () => ({
    hotSwapDemo: vi.fn(async () => true),
}));

class MockDemo implements IBTDemo {
    async init() {
        return true;
    }

    update() {}

    render() {}
}

function setupDOM(): { canvas: HTMLCanvasElement; container: HTMLDivElement } {
    const container = document.createElement('div');

    container.id = DEFAULT_CONTAINER_ID;

    document.body.appendChild(container);

    const canvas = document.createElement('canvas');

    canvas.id = DEFAULT_CANVAS_ID;

    document.body.appendChild(canvas);

    return { canvas, container };
}

function teardownDOM(): void {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
}

describe('bootstrap', () => {
    beforeEach(() => {
        vi.spyOn(BTAPI.instance, 'init').mockResolvedValue(true);
        Object.defineProperty(document, 'readyState', { value: 'complete', writable: true, configurable: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        teardownDOM();
    });

    describe('isWaitingForDOMReady', () => {
        it('should skip DOM waiting when isWaitingForDOMReady is false', async () => {
            setupDOM();

            const result = await bootstrap(MockDemo, { isWaitingForDOMReady: false });

            expect(result).toBe(true);
        });

        it('should resolve after DOMContentLoaded when readyState is loading', async () => {
            Object.defineProperty(document, 'readyState', { value: 'loading', writable: true, configurable: true });

            setupDOM();

            const bootstrapPromise = bootstrap(MockDemo, { isWaitingForDOMReady: true });

            Object.defineProperty(document, 'readyState', { value: 'complete', writable: true, configurable: true });

            document.dispatchEvent(new Event('DOMContentLoaded'));

            const result = await bootstrapPromise;

            expect(result).toBe(true);
        });

        it('should proceed immediately when the readyState is complete', async () => {
            setupDOM();

            const result = await bootstrap(MockDemo, { isWaitingForDOMReady: true });

            expect(result).toBe(true);
        });
    });

    describe('backend fallback', () => {
        it('should proceed to engine init when WebGPU is not supported, letting BTAPI handle fallback', async () => {
            setupDOM();

            // No navigator.gpu installed. BTAPI.init is mocked to return true (set in beforeEach).
            const onError = vi.fn();
            const result = await bootstrap(MockDemo, { isWaitingForDOMReady: false, onError });

            // Bootstrap no longer hard-stops on missing WebGPU; BTAPI handles backend selection.
            expect(result).toBe(true);
            expect(onError).not.toHaveBeenCalled();
        });
    });

    describe('canvas validation', () => {
        it('should return false and call onError when canvas is not found', async () => {
            // No canvas in DOM – only the container.
            const container = document.createElement('div');

            container.id = DEFAULT_CONTAINER_ID;

            document.body.appendChild(container);

            const onError = vi.fn();

            const result = await bootstrap(MockDemo, {
                isWaitingForDOMReady: false,
                canvasID: 'nonexistent-canvas',
                onError,
            });

            expect(result).toBe(false);
            expect(onError).toHaveBeenCalledOnce();
        });
    });

    describe('engine initialization', () => {
        it('should return false and call onError when demo is missing render/update', async () => {
            setupDOM();
            const initSpy = vi.spyOn(BTAPI.instance, 'init');

            class BrokenDemo implements IBTDemo {
                async init() {
                    return true;
                }

                // Intentionally invalid runtime shape for beginner-mistake detection.
                update() {}
                render() {}
            }

            (BrokenDemo.prototype as unknown as { update?: unknown }).update = undefined;

            const onError = vi.fn();
            const result = await bootstrap(BrokenDemo as unknown as new () => IBTDemo, {
                isWaitingForDOMReady: false,
                onError,
            });

            expect(result).toBe(false);
            expect(onError).toHaveBeenCalledOnce();
            expect(initSpy).not.toHaveBeenCalled();
            expect(document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '').toContain(
                'missing update() or render()',
            );

            initSpy.mockRestore();
        });

        it('should return false and call onError when BTAPI.init returns false', async () => {
            setupDOM();

            vi.spyOn(BTAPI.instance, 'init').mockResolvedValue(false);

            const onError = vi.fn();
            const result = await bootstrap(MockDemo, { isWaitingForDOMReady: false, onError });

            expect(result).toBe(false);
            expect(onError).toHaveBeenCalledOnce();
        });

        it('should return false and call onError when BTAPI.init throws', async () => {
            setupDOM();

            vi.spyOn(BTAPI.instance, 'init').mockRejectedValue(new Error('Init exploded'));

            const onError = vi.fn();
            const result = await bootstrap(MockDemo, { isWaitingForDOMReady: false, onError });

            expect(result).toBe(false);
            expect(onError).toHaveBeenCalledOnce();
        });

        it('should return true and call onSuccess on successful initialization', async () => {
            setupDOM();

            const onSuccess = vi.fn();
            const result = await bootstrap(MockDemo, { isWaitingForDOMReady: false, onSuccess });

            expect(result).toBe(true);
            expect(onSuccess).toHaveBeenCalledOnce();
        });

        it('should set canvas tabIndex to 0 and focus the canvas before engine init', async () => {
            const { canvas } = setupDOM();

            const focusSpy = vi.spyOn(canvas, 'focus');

            await bootstrap(MockDemo, { isWaitingForDOMReady: false });

            expect(canvas.tabIndex).toBe(0);
            expect(focusSpy).toHaveBeenCalled();
        });

        it('should use default canvas and container IDs when not specified', async () => {
            setupDOM();

            const result = await bootstrap(MockDemo, { isWaitingForDOMReady: false });

            expect(result).toBe(true);
        });

        it('should use custom canvas and container IDs when specified', async () => {
            const container = document.createElement('div');

            container.id = 'custom-container';

            document.body.appendChild(container);

            const canvas = document.createElement('canvas');

            canvas.id = 'custom-canvas';

            document.body.appendChild(canvas);

            const result = await bootstrap(MockDemo, {
                isWaitingForDOMReady: false,
                canvasID: 'custom-canvas',
                containerID: 'custom-container',
            });

            expect(result).toBe(true);
        });
    });

    describe('unexpected errors', () => {
        it('should return false when BTAPI.init throws synchronously', async () => {
            setupDOM();

            vi.spyOn(BTAPI.instance, 'init').mockImplementation(() => {
                throw new Error('The synchronous throw from init');
            });

            const onError = vi.fn();
            const result = await bootstrap(MockDemo, { isWaitingForDOMReady: false, onError });

            expect(result).toBe(false);
            expect(onError).toHaveBeenCalledOnce();
        });
    });

    describe('hot reload routing', () => {
        it('routes to hotSwapDemo when already initialized and a hot context is registered', async () => {
            const { isHotActive } = await import('../hot/HotRuntime');
            const { hotSwapDemo } = await import('../hot/HotSwap');

            vi.spyOn(BTAPI.instance, 'isInitialized').mockReturnValue(true);
            vi.mocked(isHotActive).mockReturnValue(true);
            vi.mocked(hotSwapDemo).mockResolvedValue(true);

            const result = await bootstrap(MockDemo, { isWaitingForDOMReady: false });

            expect(result).toBe(true);
            expect(hotSwapDemo).toHaveBeenCalledExactlyOnceWith(MockDemo);
        });

        it('does not touch the canvas when routing to hotSwapDemo', async () => {
            const { isHotActive } = await import('../hot/HotRuntime');

            vi.spyOn(BTAPI.instance, 'isInitialized').mockReturnValue(true);
            vi.mocked(isHotActive).mockReturnValue(true);

            const initSpy = vi.spyOn(BTAPI.instance, 'init');

            await bootstrap(MockDemo, { isWaitingForDOMReady: false });

            expect(initSpy).not.toHaveBeenCalled();
        });

        it('logs an error and returns false when already initialized with no hot context (double-bootstrap guard)', async () => {
            const { isHotActive } = await import('../hot/HotRuntime');

            vi.spyOn(BTAPI.instance, 'isInitialized').mockReturnValue(true);
            vi.mocked(isHotActive).mockReturnValue(false);

            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const initSpy = vi.spyOn(BTAPI.instance, 'init');

            const result = await bootstrap(MockDemo, { isWaitingForDOMReady: false });

            expect(result).toBe(false);
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('bootstrap()'));
            expect(initSpy).not.toHaveBeenCalled();
        });
    });
});
