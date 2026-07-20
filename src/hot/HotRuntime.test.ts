// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ASSET_CHANGED_EVENT, HOT_RELOAD_DOM_EVENT } from './protocol';

function makeFakeHotContext(onImpl?: (event: string, cb: (payload: unknown) => void) => void) {
    return {
        data: {},
        on: vi.fn(onImpl),
        invalidate: vi.fn(),
        accept: vi.fn(),
    };
}

describe('HotRuntime', () => {
    // Fresh module state per test - hot/generation/wired are module-scoped singletons
    // that mirror real page-load semantics (a fresh page load is a fresh module instance).
    // BTAPI is re-imported through the SAME vi.resetModules() epoch as HotRuntime so
    // `BTAPI.instance` in the test is the identical singleton HotRuntime's internal
    // `import { BTAPI } from '../core/BTAPI'` resolves to - spying on the test's copy
    // then actually intercepts the call HotRuntime.announce() makes.
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    let HotRuntime: typeof import('./HotRuntime');
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    let BTAPI: typeof import('../core/BTAPI').BTAPI;

    beforeEach(async () => {
        vi.resetModules();
        HotRuntime = await import('./HotRuntime');
        ({ BTAPI } = await import('../core/BTAPI'));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('registerHotContext', () => {
        it('wires the asset-changed listener once, across repeated registrations', () => {
            const first = makeFakeHotContext();
            const second = makeFakeHotContext();

            HotRuntime.registerHotContext(first);
            expect(first.on).toHaveBeenCalledExactlyOnceWith(ASSET_CHANGED_EVENT, expect.any(Function));

            HotRuntime.registerHotContext(second);
            expect(second.on).not.toHaveBeenCalled();
        });

        it('is inactive before any registration, and active immediately after', () => {
            expect(HotRuntime.isHotActive()).toBe(false);

            HotRuntime.registerHotContext(makeFakeHotContext());

            expect(HotRuntime.isHotActive()).toBe(true);
        });

        it('swallows a throw from a broken hot context and logs it, without permanently blocking future wiring', () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const broken = {
                data: {},
                on: vi.fn(() => {
                    throw new Error('broken context');
                }),
                invalidate: vi.fn(),
                accept: vi.fn(),
            };

            expect(() => HotRuntime.registerHotContext(broken)).not.toThrow();
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to register'), expect.any(Error));
            expect(HotRuntime.isHotActive()).toBe(false);

            const working = makeFakeHotContext();

            HotRuntime.registerHotContext(working);

            expect(working.on).toHaveBeenCalledExactlyOnceWith(ASSET_CHANGED_EVENT, expect.any(Function));
            expect(HotRuntime.isHotActive()).toBe(true);
        });
    });

    describe('registerHotReload', () => {
        it('delegates to registerHotContext', () => {
            const hot = makeFakeHotContext();

            HotRuntime.registerHotReload(hot);

            expect(HotRuntime.isHotActive()).toBe(true);
            expect(hot.on).toHaveBeenCalledExactlyOnceWith(ASSET_CHANGED_EVENT, expect.any(Function));
        });
    });

    describe('nextGeneration', () => {
        it('increments on every call, starting from 1', () => {
            expect(HotRuntime.nextGeneration()).toBe(1);
            expect(HotRuntime.nextGeneration()).toBe(2);
            expect(HotRuntime.nextGeneration()).toBe(3);
        });
    });

    describe('requestHardReload', () => {
        it('calls invalidate on the registered hot context', () => {
            const hot = makeFakeHotContext();
            HotRuntime.registerHotContext(hot);

            HotRuntime.requestHardReload('settings changed');

            expect(hot.invalidate).toHaveBeenCalledExactlyOnceWith('settings changed');
        });

        it('falls back to location.reload when no hot context is registered', () => {
            const reloadSpy = vi.fn();
            Object.defineProperty(globalThis, 'location', {
                value: { ...globalThis.location, reload: reloadSpy },
                configurable: true,
            });

            HotRuntime.requestHardReload('settings changed');

            expect(reloadSpy).toHaveBeenCalledOnce();
        });
    });

    describe('announce', () => {
        it('logs a console line with the reason, generation, and elapsed time', () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            HotRuntime.announce('methods', 3, 12.5);

            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('#3'));
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('methods'));
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('12.5'));
        });

        it('dispatches a CustomEvent with reason/generation detail on the engine canvas', () => {
            const canvas = document.createElement('canvas');
            vi.spyOn(BTAPI.instance, 'getCanvas').mockReturnValue(canvas);

            let receivedDetail: unknown;
            canvas.addEventListener(HOT_RELOAD_DOM_EVENT, (event) => {
                receivedDetail = (event as CustomEvent).detail;
            });

            HotRuntime.announce('reinit', 7, 3.2);

            expect(receivedDetail).toEqual({ reason: 'reinit', generation: 7 });
        });

        it('falls back to window when no canvas is available', () => {
            vi.spyOn(BTAPI.instance, 'getCanvas').mockReturnValue(null);

            let receivedDetail: unknown;
            window.addEventListener(HOT_RELOAD_DOM_EVENT, (event) => {
                receivedDetail = (event as CustomEvent).detail;
            });

            HotRuntime.announce('methods', 1, 1);

            expect(receivedDetail).toEqual({ reason: 'methods', generation: 1 });
        });
    });
});
