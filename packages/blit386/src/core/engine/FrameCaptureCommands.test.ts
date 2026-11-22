/**
 * Unit tests for `src/core/engine/FrameCaptureCommands.ts`, driven through `BTAPI`: the Shift+F9 frame-capture and bare
 * F9 frame-copy shortcuts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeMockCanvas, resetSingleton } from '../../__test__/btapiFixtures';
import { installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../__test__/webgpu-mock';
import { Palette } from '../../assets/Palette';
import type * as FrameCaptureModule from '../../utils/FrameCapture';
import { downloadBlob } from '../../utils/FrameCapture';
import { Vector2i } from '../../utils/Vector2i';
import { BTAPI } from '../BTAPI';
import type { IBTDemo } from '../IBTDemo';

vi.mock('../../utils/FrameCapture', async (importOriginal) => {
    const actual = await importOriginal<typeof FrameCaptureModule>();

    return { ...actual, downloadBlob: vi.fn() };
});

describe('BTAPI', () => {
    beforeEach(() => {
        resetSingleton();

        vi.resetAllMocks();
        vi.stubGlobal('requestAnimationFrame', vi.fn());
        vi.stubGlobal('cancelAnimationFrame', vi.fn());

        installMockNavigatorGPU();
    });

    afterEach(() => {
        resetSingleton();

        uninstallMockNavigatorGPU();

        vi.unstubAllGlobals();
    });

    describe('Shift+F9 frame-capture shortcut', () => {
        function findKeydownHandler(canvas: HTMLCanvasElement): (event: { code: string }) => void {
            const keydownCall = (canvas.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
                ([type]) => type === 'keydown',
            );
            const keydownHandler = keydownCall?.[1] as ((event: { code: string }) => void) | undefined;

            expect(keydownHandler).toBeDefined();

            return keydownHandler as (event: { code: string }) => void;
        }

        function getLoop(): { tick: (currentTime: number) => void } | null {
            return (BTAPI.instance as unknown as { loop: { tick: (currentTime: number) => void } | null }).loop;
        }

        beforeEach(() => {
            vi.mocked(downloadBlob).mockClear();
        });

        it('captures and downloads a frame when enabled and Shift+F9 is pressed', async () => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const mockBlob = new Blob(['png-data'], { type: 'image/png' });
            const renderer = BTAPI.instance.getRenderer();

            vi.spyOn(renderer as NonNullable<typeof renderer>, 'captureFrameForShortcut').mockResolvedValue(mockBlob);

            const keydownHandler = findKeydownHandler(canvas);

            keydownHandler({ code: 'ShiftLeft' });
            keydownHandler({ code: 'F9' });
            getLoop()?.tick(20);

            // The capture-and-download runs fire-and-forget from the update tick;
            // flush pending microtasks so the awaited captureFrameForShortcut/downloadBlob
            // chain settles.
            await Promise.resolve();
            await Promise.resolve();

            expect(downloadBlob).toHaveBeenCalledExactlyOnceWith(
                mockBlob,
                expect.stringMatching(/^blit386-capture-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.png$/),
            );
        });

        it('does not download when F9 is pressed without Shift held', async () => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            findKeydownHandler(canvas)({ code: 'F9' });
            getLoop()?.tick(20);

            await Promise.resolve();
            await Promise.resolve();

            expect(downloadBlob).not.toHaveBeenCalled();
        });

        it('does nothing when isFrameCaptureShortcutEnabled is explicitly false', async () => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: false,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const renderer = BTAPI.instance.getRenderer();
            const captureFrameSpy = vi.spyOn(renderer as NonNullable<typeof renderer>, 'captureFrameForShortcut');
            const keydownHandler = findKeydownHandler(canvas);

            keydownHandler({ code: 'ShiftLeft' });
            keydownHandler({ code: 'F9' });
            getLoop()?.tick(20);

            await Promise.resolve();
            await Promise.resolve();

            expect(captureFrameSpy).not.toHaveBeenCalled();
            expect(downloadBlob).not.toHaveBeenCalled();
        });

        it('ignores a second Shift+F9 press while a capture is already in flight', async () => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            let resolveCapture: ((blob: Blob) => void) | undefined;
            const pendingCapture = new Promise<Blob>((resolve) => {
                resolveCapture = resolve;
            });

            const renderer = BTAPI.instance.getRenderer();
            const captureFrameForShortcutSpy = vi
                .spyOn(renderer as NonNullable<typeof renderer>, 'captureFrameForShortcut')
                .mockReturnValue(pendingCapture);

            const keydownHandler = findKeydownHandler(canvas);
            const loop = getLoop();

            keydownHandler({ code: 'ShiftLeft' });
            keydownHandler({ code: 'F9' });
            loop?.tick(20);
            await Promise.resolve();

            keydownHandler({ code: 'F9' });
            loop?.tick(40);
            await Promise.resolve();

            resolveCapture?.(new Blob(['png-data'], { type: 'image/png' }));
            await Promise.resolve();
            await Promise.resolve();

            expect(captureFrameForShortcutSpy).toHaveBeenCalledOnce();
            expect(downloadBlob).toHaveBeenCalledOnce();
        });

        it('recovers after stop() interrupts a capture that never settled', async () => {
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const firstCanvas = makeMockCanvas();

            await BTAPI.instance.init(demo, firstCanvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            // A capture that never resolves, standing in for a render pass that never
            // happens because stop() runs first - the same shape as a page navigation
            // interrupting an in-flight Shift+F9 capture.
            const neverSettles = new Promise<Blob>(() => {});

            const firstRenderer = BTAPI.instance.getRenderer();

            vi.spyOn(firstRenderer as NonNullable<typeof firstRenderer>, 'captureFrameForShortcut').mockReturnValue(
                neverSettles,
            );

            const firstKeydownHandler = findKeydownHandler(firstCanvas);

            firstKeydownHandler({ code: 'ShiftLeft' });
            firstKeydownHandler({ code: 'F9' });
            getLoop()?.tick(20);
            await Promise.resolve();

            // stop() must clear the in-flight guard even though the capture above never
            // settled - otherwise every Shift+F9 press after the next init() would
            // silently no-op forever.
            BTAPI.instance.stop();

            const secondCanvas = makeMockCanvas();
            const mockBlob = new Blob(['png-data'], { type: 'image/png' });

            await BTAPI.instance.init(demo, secondCanvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));
            vi.mocked(downloadBlob).mockClear();

            const secondRenderer = BTAPI.instance.getRenderer();

            vi.spyOn(secondRenderer as NonNullable<typeof secondRenderer>, 'captureFrameForShortcut').mockResolvedValue(
                mockBlob,
            );

            findKeydownHandler(secondCanvas)({ code: 'ShiftLeft' });
            findKeydownHandler(secondCanvas)({ code: 'F9' });
            getLoop()?.tick(20);

            await Promise.resolve();
            await Promise.resolve();

            expect(downloadBlob).toHaveBeenCalledExactlyOnceWith(
                mockBlob,
                expect.stringMatching(/^blit386-capture-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.png$/),
            );
        });
    });

    describe('bare F9 frame-copy-to-clipboard shortcut', () => {
        function findKeydownHandler(canvas: HTMLCanvasElement): (event: { code: string }) => void {
            const keydownCall = (canvas.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
                ([type]) => type === 'keydown',
            );
            const keydownHandler = keydownCall?.[1] as ((event: { code: string }) => void) | undefined;

            expect(keydownHandler).toBeDefined();

            return keydownHandler as (event: { code: string }) => void;
        }

        /**
         * Finds `handleClipboardShortcutKeydown` - the bare-F9 listener attached directly to
         * the canvas (separately from `KeyboardInput`'s own listener, which
         * {@link findKeydownHandler} finds). `attachInputSubsystems` registers
         * `KeyboardInput`'s listener first and this one second, so it is the second
         * `'keydown'` registration on the mock canvas.
         */
        function findClipboardShortcutKeydownHandler(canvas: HTMLCanvasElement): (event: KeyboardEvent) => void {
            const keydownCalls = (canvas.addEventListener as ReturnType<typeof vi.fn>).mock.calls.filter(
                ([type]) => type === 'keydown',
            );
            const handler = keydownCalls[1]?.[1] as ((event: KeyboardEvent) => void) | undefined;

            expect(handler).toBeDefined();

            return handler as (event: KeyboardEvent) => void;
        }

        /** A `KeyboardEvent`-shaped object for `handleClipboardShortcutKeydown`, defaulting to a genuine bare-F9 press. */
        function f9Event(overrides: Partial<Pick<KeyboardEvent, 'shiftKey' | 'repeat'>> = {}): KeyboardEvent {
            return { code: 'F9', shiftKey: false, repeat: false, ...overrides } as KeyboardEvent;
        }

        function getLoop(): { tick: (currentTime: number) => void } | null {
            return (BTAPI.instance as unknown as { loop: { tick: (currentTime: number) => void } | null }).loop;
        }

        /** Reads the private shared in-flight guard for the generation-guard regression test. */
        function isShortcutInFlight(): boolean {
            return (BTAPI.instance as unknown as { capture: { isFrameCaptureShortcutInFlight: boolean } }).capture
                .isFrameCaptureShortcutInFlight;
        }

        class MockClipboardItem {
            public constructor(public readonly data: Record<string, unknown>) {}
        }

        function installMockClipboard(): { write: ReturnType<typeof vi.fn> } {
            // Mirrors the real navigator.clipboard.write(): it does not resolve until every
            // ClipboardItem's data promise resolves, so a still-pending capture keeps the
            // write (and therefore isFrameCaptureShortcutInFlight) pending too - matching
            // real browser behavior instead of resolving eagerly regardless of capture state.
            const mockClipboard = {
                write: vi.fn(async (items: readonly MockClipboardItem[]) => {
                    await Promise.all(items.flatMap((item) => Object.values(item.data)));
                }),
            };

            Object.defineProperty(globalThis, 'navigator', {
                value: { ...globalThis.navigator, clipboard: mockClipboard },
                configurable: true,
            });
            vi.stubGlobal('ClipboardItem', MockClipboardItem);

            return mockClipboard;
        }

        beforeEach(() => {
            vi.mocked(downloadBlob).mockClear();
        });

        afterEach(() => {
            Reflect.deleteProperty(globalThis.navigator, 'clipboard');
        });

        it('copies to clipboard when enabled and bare F9 is pressed', async () => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const mockClipboard = installMockClipboard();
            const mockBlob = new Blob(['png-data'], { type: 'image/png' });
            const renderer = BTAPI.instance.getRenderer();

            vi.spyOn(renderer as NonNullable<typeof renderer>, 'captureFrameForShortcut').mockResolvedValue(mockBlob);

            findClipboardShortcutKeydownHandler(canvas)(f9Event());

            await Promise.resolve();
            await Promise.resolve();

            expect(downloadBlob).not.toHaveBeenCalled();
            expect(mockClipboard.write).toHaveBeenCalledOnce();
            expect(mockClipboard.write.mock.calls[0]?.[0]).toEqual([expect.any(MockClipboardItem)]);
        });

        it('copies the seeked frame while renderAt holds the loop stopped (BT-759)', async () => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));
            await BTAPI.instance.seek.renderAt(1, 'current');

            installMockClipboard();
            const renderer = BTAPI.instance.getRenderer();
            let settleCapture: (() => void) | null = null;

            // The capture settles on the next render, as the real one does at the end of a frame.
            vi.spyOn(renderer as NonNullable<typeof renderer>, 'captureFrameForShortcut').mockImplementation(
                () =>
                    new Promise<Blob>((resolve) => {
                        settleCapture = () => resolve(new Blob([String(BTAPI.instance.getTicks())]));
                    }),
            );
            vi.mocked(demo.render).mockImplementation(() => {
                settleCapture?.();
                settleCapture = null;
            });

            findClipboardShortcutKeydownHandler(canvas)(f9Event());
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(settleCapture).toBeNull();
            expect(isShortcutInFlight()).toBe(false);
            expect(BTAPI.instance.getTicks()).toBe(60);
        });

        it('does not copy when the keydown event has shiftKey set (Shift+F9 downloads instead)', async () => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const mockClipboard = installMockClipboard();
            const mockBlob = new Blob(['png-data'], { type: 'image/png' });
            const renderer = BTAPI.instance.getRenderer();

            vi.spyOn(renderer as NonNullable<typeof renderer>, 'captureFrameForShortcut').mockResolvedValue(mockBlob);

            // A real Shift+F9 press delivers one keydown event, with shiftKey true, to both
            // listeners: KeyboardInput's (driving the tick-based Shift+F9 download check) and
            // ours (which must no-op on shiftKey).
            const keydownHandler = findKeydownHandler(canvas);

            keydownHandler({ code: 'ShiftLeft' });
            keydownHandler({ code: 'F9' });
            findClipboardShortcutKeydownHandler(canvas)(f9Event({ shiftKey: true }));
            getLoop()?.tick(20);

            await Promise.resolve();
            await Promise.resolve();

            expect(mockClipboard.write).not.toHaveBeenCalled();
            expect(downloadBlob).toHaveBeenCalledOnce();
        });

        it('does nothing when isFrameCaptureShortcutEnabled is explicitly false', async () => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: false,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const mockClipboard = installMockClipboard();
            const renderer = BTAPI.instance.getRenderer();
            const captureFrameSpy = vi.spyOn(renderer as NonNullable<typeof renderer>, 'captureFrameForShortcut');

            findClipboardShortcutKeydownHandler(canvas)(f9Event());

            await Promise.resolve();
            await Promise.resolve();

            expect(captureFrameSpy).not.toHaveBeenCalled();
            expect(mockClipboard.write).not.toHaveBeenCalled();
            expect(downloadBlob).not.toHaveBeenCalled();
        });

        it('ignores a repeat keydown while F9 is held (event.repeat)', async () => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const mockClipboard = installMockClipboard();
            const mockBlob = new Blob(['png-data'], { type: 'image/png' });
            const renderer = BTAPI.instance.getRenderer();

            vi.spyOn(renderer as NonNullable<typeof renderer>, 'captureFrameForShortcut').mockResolvedValue(mockBlob);

            const handler = findClipboardShortcutKeydownHandler(canvas);

            handler(f9Event());
            handler(f9Event({ repeat: true }));
            handler(f9Event({ repeat: true }));

            await Promise.resolve();
            await Promise.resolve();

            expect(mockClipboard.write).toHaveBeenCalledOnce();
        });

        it('ignores a second bare-F9 press while a copy is already in flight', async () => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const mockClipboard = installMockClipboard();

            let resolveCapture: ((blob: Blob) => void) | undefined;
            const pendingCapture = new Promise<Blob>((resolve) => {
                resolveCapture = resolve;
            });

            const renderer = BTAPI.instance.getRenderer();
            const captureFrameForShortcutSpy = vi
                .spyOn(renderer as NonNullable<typeof renderer>, 'captureFrameForShortcut')
                .mockReturnValue(pendingCapture);

            const handler = findClipboardShortcutKeydownHandler(canvas);

            handler(f9Event());
            await Promise.resolve();

            // A second, distinct press (not a repeat) while the first copy is still pending.
            handler(f9Event());
            await Promise.resolve();

            resolveCapture?.(new Blob(['png-data'], { type: 'image/png' }));
            await Promise.resolve();
            await Promise.resolve();

            expect(captureFrameForShortcutSpy).toHaveBeenCalledOnce();
            expect(mockClipboard.write).toHaveBeenCalledOnce();
        });

        it('does not start a clipboard copy while a Shift+F9 capture is already in flight', async () => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const mockClipboard = installMockClipboard();

            // Both shortcuts route through the renderer's single-slot capture queue
            // (IRenderer.captureFrameForShortcut), so a bare-F9 copy must not start while
            // a Shift+F9 capture is still pending - starting one would supersede the other's
            // request instead of queuing behind it.
            let resolveCapture: ((blob: Blob) => void) | undefined;
            const pendingCapture = new Promise<Blob>((resolve) => {
                resolveCapture = resolve;
            });

            const renderer = BTAPI.instance.getRenderer();
            const captureFrameForShortcutSpy = vi
                .spyOn(renderer as NonNullable<typeof renderer>, 'captureFrameForShortcut')
                .mockReturnValue(pendingCapture);

            const keydownHandler = findKeydownHandler(canvas);

            keydownHandler({ code: 'ShiftLeft' });
            keydownHandler({ code: 'F9' });
            getLoop()?.tick(20);
            await Promise.resolve();

            // The shared guard, not KeyboardInput's tracked Shift state, is what blocks this -
            // no need to release Shift first.
            findClipboardShortcutKeydownHandler(canvas)(f9Event());
            await Promise.resolve();

            resolveCapture?.(new Blob(['png-data'], { type: 'image/png' }));
            await Promise.resolve();
            await Promise.resolve();

            expect(captureFrameForShortcutSpy).toHaveBeenCalledOnce();
            expect(mockClipboard.write).not.toHaveBeenCalled();
            expect(downloadBlob).toHaveBeenCalledOnce();
        });

        it('does not start a Shift+F9 capture while a bare-F9 copy is already in flight', async () => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const mockClipboard = installMockClipboard();

            // Mirror of the previous test: a Shift+F9 save must not start while a bare-F9
            // copy is still pending on the same renderer capture slot.
            let resolveCapture: ((blob: Blob) => void) | undefined;
            const pendingCapture = new Promise<Blob>((resolve) => {
                resolveCapture = resolve;
            });

            const renderer = BTAPI.instance.getRenderer();
            const captureFrameForShortcutSpy = vi
                .spyOn(renderer as NonNullable<typeof renderer>, 'captureFrameForShortcut')
                .mockReturnValue(pendingCapture);

            findClipboardShortcutKeydownHandler(canvas)(f9Event());
            await Promise.resolve();

            const keydownHandler = findKeydownHandler(canvas);

            keydownHandler({ code: 'ShiftLeft' });
            keydownHandler({ code: 'F9' });
            getLoop()?.tick(20);
            await Promise.resolve();

            resolveCapture?.(new Blob(['png-data'], { type: 'image/png' }));
            await Promise.resolve();
            await Promise.resolve();

            expect(captureFrameForShortcutSpy).toHaveBeenCalledOnce();
            expect(downloadBlob).not.toHaveBeenCalled();
            expect(mockClipboard.write).toHaveBeenCalledOnce();
        });

        it('recovers after stop() interrupts a copy that never settled', async () => {
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const firstCanvas = makeMockCanvas();

            await BTAPI.instance.init(demo, firstCanvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const mockClipboard = installMockClipboard();

            // A capture that never resolves, standing in for a render pass that never
            // happens because stop() runs first - the same shape as a page navigation
            // interrupting an in-flight bare-F9 copy.
            const neverSettles = new Promise<Blob>(() => {});

            const firstRenderer = BTAPI.instance.getRenderer();

            vi.spyOn(firstRenderer as NonNullable<typeof firstRenderer>, 'captureFrameForShortcut').mockReturnValue(
                neverSettles,
            );

            findClipboardShortcutKeydownHandler(firstCanvas)(f9Event());
            await Promise.resolve();

            // stop() must clear the in-flight guard even though the copy above never
            // settled - otherwise every F9 press after the next init() would silently
            // no-op forever.
            BTAPI.instance.stop();

            const secondCanvas = makeMockCanvas();
            const mockBlob = new Blob(['png-data'], { type: 'image/png' });

            await BTAPI.instance.init(demo, secondCanvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));
            mockClipboard.write.mockClear();

            const secondRenderer = BTAPI.instance.getRenderer();

            vi.spyOn(secondRenderer as NonNullable<typeof secondRenderer>, 'captureFrameForShortcut').mockResolvedValue(
                mockBlob,
            );

            findClipboardShortcutKeydownHandler(secondCanvas)(f9Event());

            await Promise.resolve();
            await Promise.resolve();

            expect(mockClipboard.write).toHaveBeenCalledOnce();
        });

        it('does not let a copy that settles after stop() clear a later capture guard', async () => {
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const firstCanvas = makeMockCanvas();

            await BTAPI.instance.init(demo, firstCanvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            installMockClipboard();

            // Simulates FrameCapture.resolve() completing asynchronously after stop() - it
            // captures its resolve/reject callbacks into locals before its own awaits, so a
            // capture already mid-GPU-readback when stop() runs keeps running independently
            // of the game loop and can settle later, after a new init()/capture cycle.
            let resolveStaleCapture: ((blob: Blob) => void) | undefined;
            const staleCapture = new Promise<Blob>((resolve) => {
                resolveStaleCapture = resolve;
            });

            const firstRenderer = BTAPI.instance.getRenderer();

            vi.spyOn(firstRenderer as NonNullable<typeof firstRenderer>, 'captureFrameForShortcut').mockReturnValue(
                staleCapture,
            );

            findClipboardShortcutKeydownHandler(firstCanvas)(f9Event());
            await Promise.resolve();

            BTAPI.instance.stop();

            const secondCanvas = makeMockCanvas();

            await BTAPI.instance.init(demo, secondCanvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            let resolveCurrentCapture: ((blob: Blob) => void) | undefined;
            const currentCapture = new Promise<Blob>((resolve) => {
                resolveCurrentCapture = resolve;
            });

            const secondRenderer = BTAPI.instance.getRenderer();

            vi.spyOn(secondRenderer as NonNullable<typeof secondRenderer>, 'captureFrameForShortcut').mockReturnValue(
                currentCapture,
            );

            findClipboardShortcutKeydownHandler(secondCanvas)(f9Event());
            await Promise.resolve();

            expect(isShortcutInFlight()).toBe(true);

            // The stale, pre-stop() capture settles now - its completion handler must see
            // that frameCaptureShortcutGeneration moved on since stop() and leave the
            // current capture's guard alone.
            resolveStaleCapture?.(new Blob(['stale-png-data'], { type: 'image/png' }));
            await Promise.resolve();
            await Promise.resolve();

            expect(isShortcutInFlight()).toBe(true);

            resolveCurrentCapture?.(new Blob(['png-data'], { type: 'image/png' }));

            await vi.waitFor(() => {
                expect(isShortcutInFlight()).toBe(false);
            });
        });

        it('keeps the clipboard write synchronous relative to the triggering keydown', async () => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const mockClipboard = installMockClipboard();

            // Never resolves - proves clipboard.write() is called with the still-pending
            // capture promise, not after awaiting it, since the write call is asserted
            // before this promise ever settles.
            const neverSettles = new Promise<Blob>(() => {});

            const renderer = BTAPI.instance.getRenderer();

            vi.spyOn(renderer as NonNullable<typeof renderer>, 'captureFrameForShortcut').mockReturnValue(neverSettles);

            findClipboardShortcutKeydownHandler(canvas)(f9Event());

            // Flush exactly one microtask - if a future refactor introduces an `await`
            // before the clipboard.write() call, this assertion catches it: write() would
            // not yet have been called at this point since the capture never resolves.
            await Promise.resolve();

            expect(mockClipboard.write).toHaveBeenCalledOnce();
        });

        it.each([
            ['navigator.clipboard is undefined', undefined],
            ['navigator.clipboard.write is missing', {}],
        ])('does nothing and logs when %s', async (_label, clipboardValue) => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            Object.defineProperty(globalThis, 'navigator', {
                value: { ...globalThis.navigator, clipboard: clipboardValue },
                configurable: true,
            });
            vi.stubGlobal('ClipboardItem', MockClipboardItem);

            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const renderer = BTAPI.instance.getRenderer();
            const captureFrameSpy = vi.spyOn(renderer as NonNullable<typeof renderer>, 'captureFrameForShortcut');

            findClipboardShortcutKeydownHandler(canvas)(f9Event());

            await Promise.resolve();
            await Promise.resolve();

            expect(captureFrameSpy).not.toHaveBeenCalled();
            expect(consoleErrorSpy).toHaveBeenCalledExactlyOnceWith(
                expect.stringContaining('Clipboard API unavailable'),
            );

            consoleErrorSpy.mockRestore();
        });

        it('does nothing and logs when ClipboardItem is undefined', async () => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isFrameCaptureShortcutEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            Object.defineProperty(globalThis, 'navigator', {
                value: { ...globalThis.navigator, clipboard: { write: vi.fn() } },
                configurable: true,
            });

            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const renderer = BTAPI.instance.getRenderer();
            const captureFrameSpy = vi.spyOn(renderer as NonNullable<typeof renderer>, 'captureFrameForShortcut');

            findClipboardShortcutKeydownHandler(canvas)(f9Event());

            await Promise.resolve();
            await Promise.resolve();

            expect(captureFrameSpy).not.toHaveBeenCalled();
            expect(consoleErrorSpy).toHaveBeenCalledExactlyOnceWith(
                expect.stringContaining('Clipboard API unavailable'),
            );

            consoleErrorSpy.mockRestore();
        });
    });
});
