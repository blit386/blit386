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

function registerAndCaptureAssetHandler(
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    HotRuntimeModule: typeof import('./HotRuntime'),
): (payload: unknown) => void {
    let captured: ((payload: unknown) => void) | undefined;

    HotRuntimeModule.registerHotContext({
        data: {},
        on: (_event, cb) => {
            captured = cb;
        },
        invalidate: vi.fn(),
        accept: vi.fn(),
    });

    if (!captured) {
        throw new Error('asset-changed handler was not registered');
    }

    return captured;
}

describe('HotRuntime', () => {
    // Fresh module state per test – hot/generation/wired are module-scoped singletons
    // that mirror real page-load semantics (a fresh page load is a fresh module instance).
    // BTAPI is re-imported through the SAME vi.resetModules() epoch as HotRuntime so
    // `BTAPI.instance` in the test is the identical singleton HotRuntime's internal
    // `import { BTAPI } from '../core/BTAPI'` resolves to – spying on the test's copy
    // then actually intercepts the call HotRuntime.announce() makes.
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    let HotRuntime: typeof import('./HotRuntime');
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    let BTAPI: typeof import('../core/BTAPI').BTAPI;
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    let AssetLoader: typeof import('../assets/AssetLoader').AssetLoader;
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    let AudioClip: typeof import('../assets/AudioClip').AudioClip;
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    let SpriteSheetModule: typeof import('../assets/SpriteSheet');
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    let BitmapFontModule: typeof import('../assets/BitmapFont');

    beforeEach(async () => {
        vi.resetModules();
        HotRuntime = await import('./HotRuntime');
        ({ BTAPI } = await import('../core/BTAPI'));
        ({ AssetLoader } = await import('../assets/AssetLoader'));
        ({ AudioClip } = await import('../assets/AudioClip'));
        SpriteSheetModule = await import('../assets/SpriteSheet');
        BitmapFontModule = await import('../assets/BitmapFont');
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

    describe('handleAssetChanged', () => {
        afterEach(() => {
            vi.restoreAllMocks();
            vi.unstubAllGlobals();
        });

        it('ignores a malformed payload without throwing', () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const handler = registerAndCaptureAssetHandler(HotRuntime);

            expect(() => handler({ not: 'a payload' })).not.toThrow();
            expect(errorSpy).toHaveBeenCalled();
        });

        it('routes an image payload through AssetLoader.hotReloadImage', async () => {
            const spy = vi.spyOn(AssetLoader, 'hotReloadImage').mockResolvedValue({} as HTMLImageElement);
            const handler = registerAndCaptureAssetHandler(HotRuntime);

            handler({ url: 'hero.png', type: 'image', timestamp: 1 });
            await vi.waitFor(() => expect(spy).toHaveBeenCalledExactlyOnceWith('hero.png'));
        });

        it('replaces every registered sheet for a matching image URL', async () => {
            vi.spyOn(AssetLoader, 'hotReloadImage').mockResolvedValue({ width: 8, height: 8 } as HTMLImageElement);
            const fakeSheet = {
                beginHotReplace: vi.fn(),
                failHotReplace: vi.fn(),
                hotReplaceImage: vi.fn(),
            } as unknown as InstanceType<typeof SpriteSheetModule.SpriteSheet>;
            vi.spyOn(SpriteSheetModule, 'getHotReloadSheets').mockReturnValue(new Set([fakeSheet]));
            vi.spyOn(BTAPI.instance, 'getPalette').mockReturnValue(null);

            const handler = registerAndCaptureAssetHandler(HotRuntime);
            handler({ url: 'hero.png', type: 'image', timestamp: 1 });

            await vi.waitFor(() =>
                expect(fakeSheet.hotReplaceImage).toHaveBeenCalledExactlyOnceWith({ width: 8, height: 8 }, null),
            );
        });

        it('marks every registered sheet loading before the replacement image is fetched, then replaces once it resolves', async () => {
            let resolveFetch: ((image: HTMLImageElement) => void) | undefined;
            vi.spyOn(AssetLoader, 'hotReloadImage').mockImplementation(
                () =>
                    new Promise((resolve) => {
                        resolveFetch = resolve;
                    }),
            );
            const fakeSheet = {
                beginHotReplace: vi.fn(),
                failHotReplace: vi.fn(),
                hotReplaceImage: vi.fn(),
            } as unknown as InstanceType<typeof SpriteSheetModule.SpriteSheet>;
            vi.spyOn(SpriteSheetModule, 'getHotReloadSheets').mockReturnValue(new Set([fakeSheet]));
            vi.spyOn(BTAPI.instance, 'getPalette').mockReturnValue(null);

            const handler = registerAndCaptureAssetHandler(HotRuntime);
            handler({ url: 'hero.png', type: 'image', timestamp: 1 });

            // The fetch is still pending here – beginHotReplace already ran, hotReplaceImage/failHotReplace have not.
            expect(fakeSheet.beginHotReplace).toHaveBeenCalledOnce();
            expect(fakeSheet.hotReplaceImage).not.toHaveBeenCalled();
            expect(fakeSheet.failHotReplace).not.toHaveBeenCalled();

            resolveFetch?.({ width: 8, height: 8 } as HTMLImageElement);

            await vi.waitFor(() =>
                expect(fakeSheet.hotReplaceImage).toHaveBeenCalledExactlyOnceWith({ width: 8, height: 8 }, null),
            );
            expect(fakeSheet.failHotReplace).not.toHaveBeenCalled();
        });

        it('marks every registered sheet failed only once the replacement fetch itself rejects', async () => {
            let rejectFetch: ((error: Error) => void) | undefined;
            vi.spyOn(AssetLoader, 'hotReloadImage').mockImplementation(
                () =>
                    new Promise((_resolve, reject) => {
                        rejectFetch = reject;
                    }),
            );
            const fakeSheet = {
                beginHotReplace: vi.fn(),
                failHotReplace: vi.fn(),
                hotReplaceImage: vi.fn(),
            } as unknown as InstanceType<typeof SpriteSheetModule.SpriteSheet>;
            vi.spyOn(SpriteSheetModule, 'getHotReloadSheets').mockReturnValue(new Set([fakeSheet]));
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const handler = registerAndCaptureAssetHandler(HotRuntime);
            handler({ url: 'hero.png', type: 'image', timestamp: 1 });

            // The fetch is still pending here – beginHotReplace already ran, failHotReplace has not (yet).
            expect(fakeSheet.beginHotReplace).toHaveBeenCalledOnce();
            expect(fakeSheet.failHotReplace).not.toHaveBeenCalled();
            expect(fakeSheet.hotReplaceImage).not.toHaveBeenCalled();

            rejectFetch?.(new Error('404'));

            await vi.waitFor(() => expect(fakeSheet.failHotReplace).toHaveBeenCalledOnce());
            expect(fakeSheet.hotReplaceImage).not.toHaveBeenCalled();
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('hero.png'), expect.any(Error));
        });

        it('routes an audio payload through AudioClip.hotReload', async () => {
            const spy = vi.spyOn(AudioClip, 'hotReload').mockResolvedValue(true);
            const handler = registerAndCaptureAssetHandler(HotRuntime);

            handler({ url: 'music.mp3', type: 'audio', timestamp: 1 });
            await vi.waitFor(() => expect(spy).toHaveBeenCalledExactlyOnceWith('music.mp3'));
        });

        it('routes a font payload to every registered font for that URL', async () => {
            const fakeFont = { hotReload: vi.fn().mockResolvedValue(undefined) } as unknown as Awaited<
                ReturnType<typeof BitmapFontModule.BitmapFont.load>
            >;
            vi.spyOn(BitmapFontModule, 'getHotReloadFonts').mockReturnValue(new Set([fakeFont]));
            vi.spyOn(BTAPI.instance, 'getPalette').mockReturnValue(null);

            const handler = registerAndCaptureAssetHandler(HotRuntime);
            handler({ url: 'font.btfont', type: 'font', timestamp: 1 });

            await vi.waitFor(() => expect(fakeFont.hotReload).toHaveBeenCalledExactlyOnceWith('font.btfont', null));
        });

        it('no-ops when a font payload matches no registered font', async () => {
            vi.spyOn(BitmapFontModule, 'getHotReloadFonts').mockReturnValue(undefined);
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const handler = registerAndCaptureAssetHandler(HotRuntime);
            handler({ url: 'unmatched.btfont', type: 'font', timestamp: 1 });

            await vi.waitFor(() => expect(errorSpy).not.toHaveBeenCalled());
        });

        it('requests a hard reload for an unrecognized asset type', () => {
            // Capture the handler first, before anything has wired the listener – registerHotContext
            // only calls context.on(...) once per module instance (guarded by the internal `wired`
            // flag), so a second registerHotContext call updates which context requestHardReload
            // targets without re-registering the listener.
            const handler = registerAndCaptureAssetHandler(HotRuntime);
            const invalidate = vi.fn();
            HotRuntime.registerHotContext({ data: {}, on: vi.fn(), invalidate, accept: vi.fn() });

            handler({ url: 'level.json', type: 'other', timestamp: 1 });

            expect(invalidate).toHaveBeenCalledWith(expect.stringContaining('level.json'));
        });

        it('logs and swallows a thrown error instead of crashing', async () => {
            vi.spyOn(AudioClip, 'hotReload').mockRejectedValue(new Error('decode failed'));
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const handler = registerAndCaptureAssetHandler(HotRuntime);
            handler({ url: 'broken.mp3', type: 'audio', timestamp: 1 });

            await vi.waitFor(() =>
                expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('broken.mp3'), expect.any(Error)),
            );
        });
    });
});
