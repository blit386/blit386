/**
 * Unit tests for `src/core/engine/SplashBoot.ts`, driven through `BTAPI`: the splash lifecycle inside init.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    makeMock2DCanvas,
    makeMockCanvas,
    makeOffscreenCanvas2dContext,
    type OffscreenCanvas2DMock,
    resetSingleton,
} from '../../__test__/btapiFixtures';
import { installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../__test__/webgpu-mock';
import { Palette } from '../../assets/Palette';
import { KeyboardInput } from '../../input/KeyboardInput';
import { Splash } from '../../splash';
import { RAMP_PALETTE_SIZE } from '../../splash/constants';
import { Color32 } from '../../utils/Color32';
import { Vector2i } from '../../utils/Vector2i';
import { BTAPI } from '../BTAPI';
import type { GameLoop } from '../GameLoop';
import type { HardwareSettings, IBTDemo } from '../IBTDemo';

describe('BTAPI splash lifecycle in init', () => {
    /** Timer handles for frames scheduled by the fake requestAnimationFrame. */
    const pendingFrames: ReturnType<typeof setTimeout>[] = [];

    /**
     * Builds a demo whose `configure()` returns `settings` and whose `init()` runs
     * `initBody` before resolving.
     *
     * @param settings - Extra hardware settings merged over the display defaults.
     * @param initBody - Optional body run inside `init()`.
     * @param initResult - Value `init()` resolves to.
     * @returns A demo suitable for `BTAPI.init`.
     */
    function makeSplashDemo(
        settings: Partial<HardwareSettings>,
        initBody?: () => void | Promise<void>,
        initResult = true,
    ): IBTDemo {
        return {
            configure: vi.fn().mockReturnValue({
                displaySize: new Vector2i(320, 240),
                drawingBufferSize: new Vector2i(640, 480),
                targetFPS: 60,
                ...settings,
            }),
            init: vi.fn(async () => {
                await initBody?.();

                return initResult;
            }),
            update: vi.fn(),
            render: vi.fn(),
        };
    }

    /**
     * Stubs `requestAnimationFrame` and `performance.now` with a fake frame clock,
     * so the splash's own driver runs to completion without sleeping in real time.
     *
     * @param stepMs - Milliseconds each frame advances the clock.
     */
    function driveAnimationFrames(stepMs = 16): void {
        let clock = 0;

        vi.spyOn(performance, 'now').mockImplementation(() => clock);
        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn((callback: FrameRequestCallback) => {
                pendingFrames.push(
                    setTimeout(() => {
                        clock += stepMs;
                        callback(clock);
                    }, 0),
                );

                return pendingFrames.length;
            }),
        );
    }

    /**
     * Reads the palette the renderer would resolve indices through.
     *
     * @returns The engine's active palette.
     */
    function renderPalette(): Palette | null {
        return (BTAPI.instance as unknown as { palette: Palette | null }).palette;
    }

    beforeEach(() => {
        resetSingleton();

        pendingFrames.length = 0;

        vi.resetAllMocks();
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        installMockNavigatorGPU();
        driveAnimationFrames();
    });

    afterEach(() => {
        // These tests give requestAnimationFrame a real implementation, so unlike the
        // rest of the suite the game loop actually runs. Stop it and drop any frame
        // still queued before the stub goes away: GameLoop.start() nests a second
        // requestAnimationFrame inside the first without rechecking isRunning, so an
        // in-flight outer frame would reach for a global that no longer exists.
        (BTAPI.instance as unknown as { loop: GameLoop | null }).loop?.stop();

        for (const handle of pendingFrames) {
            clearTimeout(handle);
        }

        pendingFrames.length = 0;

        resetSingleton();

        uninstallMockNavigatorGPU();

        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('reports disabled when gating turns the splash off', async () => {
        await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: false }), makeMockCanvas());

        expect(BTAPI.instance.getSplashState()).toBe('disabled');
        expect(BTAPI.instance.isSplashVisible()).toBe(false);
    });

    it('lets the game observe fadingIn from its own init()', async () => {
        let observed: string | null = null;

        await BTAPI.instance.init(
            makeSplashDemo({ isSplashEnabled: true }, () => {
                observed = BTAPI.instance.getSplashState();
            }),
            makeMockCanvas(),
        );

        expect(observed).toBe('fadingIn');
    });

    it('reports done once init() returns', async () => {
        await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: true }), makeMockCanvas());

        expect(BTAPI.instance.getSplashState()).toBe('done');
        expect(BTAPI.instance.isSplashVisible()).toBe(false);
    });

    it('plays once per page load, so a BT.init restart runs the new init() without it', async () => {
        const startSpy = vi.spyOn(Splash.prototype, 'start');
        await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: true }), makeMockCanvas());

        let stateDuringRestartInit: string | undefined;
        const restarted = makeSplashDemo({ isSplashEnabled: true }, () => {
            stateDuringRestartInit = BTAPI.instance.getSplashState();
        });
        const ok = await BTAPI.instance.init(restarted, makeMockCanvas());

        expect(ok).toBe(true);
        expect(startSpy).toHaveBeenCalledOnce();
        expect(restarted.init).toHaveBeenCalledOnce();
        expect(stateDuringRestartInit).toBe('done');
        expect(BTAPI.instance.getSplashState()).toBe('done');
        expect(BTAPI.instance.isInitialized()).toBe(true);
    });

    it('still plays on the next init when the first one failed before the splash was decided', async () => {
        const startSpy = vi.spyOn(Splash.prototype, 'start');
        const broken = makeSplashDemo({ isSplashEnabled: true, displaySize: new Vector2i(0, 0) });
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(BTAPI.instance.init(broken, makeMockCanvas())).resolves.toBe(false);
        await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: true }), makeMockCanvas());

        expect(startSpy).toHaveBeenCalledOnce();
    });

    it('plays the splash again on the next init when a splash frame threw', async () => {
        const startSpy = vi.spyOn(Splash.prototype, 'start');
        vi.spyOn(Splash.prototype, 'advance').mockImplementationOnce(() => {
            throw new Error('splash frame exploded');
        });

        await expect(BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: true }), makeMockCanvas())).rejects.toThrow(
            'splash frame exploded',
        );
        const ok = await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: true }), makeMockCanvas());

        expect(ok).toBe(true);
        expect(startSpy).toHaveBeenCalledTimes(2);
        expect(BTAPI.instance.getSplashState()).toBe('done');
        expect(BTAPI.instance.isSplashVisible()).toBe(false);
    });

    it('does not start the game loop until the splash is done', async () => {
        let loopExistedDuringInit = true;

        await BTAPI.instance.init(
            makeSplashDemo({ isSplashEnabled: true }, () => {
                loopExistedDuringInit = BTAPI.instance.isInitialized();
            }),
            makeMockCanvas(),
        );

        expect(loopExistedDuringInit).toBe(false);
    });

    it('extends the hold until a slow init() resolves', async () => {
        let initFinishedAt = -1;

        await BTAPI.instance.init(
            makeSplashDemo({ isSplashEnabled: true }, async () => {
                await new Promise((resolve) => {
                    setTimeout(resolve, 50);
                });

                initFinishedAt = performance.now();
            }),
            makeMockCanvas(),
        );

        expect(BTAPI.instance.getSplashState()).toBe('done');
        expect(initFinishedAt).toBeGreaterThan(0);
    });

    it('reaches done even when init() fails', async () => {
        const ok = await BTAPI.instance.init(
            makeSplashDemo({ isSplashEnabled: true }, undefined, false),
            makeMockCanvas(),
        );

        expect(ok).toBe(false);
        expect(BTAPI.instance.getSplashState()).toBe('done');
    });

    it('keeps the splash done and applies paletteSet immediately across a hot re-init', async () => {
        await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: true }), makeMockCanvas());

        const replacement = new Palette(16);
        const swapped = await BTAPI.instance.hotReplaceDemo(
            makeSplashDemo({}, () => {
                BTAPI.instance.palettes.setPalette(replacement);
            }),
        );

        expect(swapped).toBe(true);
        expect(BTAPI.instance.getSplashState()).toBe('done');
        expect(renderPalette()).toBe(replacement);
    });

    it('runs the splash on the software backend with no dissolve and no thrown error', async () => {
        uninstallMockNavigatorGPU();
        vi.stubGlobal(
            'OffscreenCanvas',
            class MockOffscreenCanvas {
                constructor(
                    public width: number,
                    public height: number,
                ) {}
                getContext(contextType?: string): OffscreenCanvas2DMock | null {
                    return contextType === '2d' ? makeOffscreenCanvas2dContext() : null;
                }
            },
        );

        // The dissolve is pixel-tier post-process, which the Canvas 2D renderer throws
        // on. Software must get the palette fades alone rather than an exception.
        const ok = await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: true }), makeMock2DCanvas());

        expect(ok).toBe(true);
        expect(BTAPI.instance.getActiveBackend()).toBe('software');
        expect(BTAPI.instance.getSplashState()).toBe('done');
    });

    it('does not tear down the capture until a slow init() settles, even if the splash throws', async () => {
        let resolveInit: (() => void) | undefined;
        const gamePalette = new Palette(16);
        let capturedWhileInitRan: Palette | null | undefined;

        let splashThrew = false;

        // Make the very first splash frame throw, so runSplash rejects long before init().
        vi.spyOn(Splash.prototype, 'advance').mockImplementation(() => {
            splashThrew = true;

            throw new Error('splash frame exploded');
        });

        const demo = makeSplashDemo({ isSplashEnabled: true }, async () => {
            await new Promise<void>((resolve) => {
                resolveInit = resolve;
            });

            // Runs after the splash has already failed. Capture must still be armed,
            // so this is held for the handoff rather than applied straight to screen.
            BTAPI.instance.palettes.setPalette(gamePalette);
            capturedWhileInitRan = (BTAPI.instance as unknown as { palettes: { pendingPalette: Palette | null } })
                .palettes.pendingPalette;
        });

        const initPromise = BTAPI.instance.init(demo, makeMockCanvas());

        const tick = async (): Promise<void> => {
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
        };

        // Wait until init() reached the demo body AND the splash has already thrown.
        for (let i = 0; i < 500 && !(resolveInit && splashThrew); i++) {
            await tick();
        }

        // Give the rejection time to propagate. This is the window the bug lived in:
        // Promise.all settled here and ran teardown while init() was still pending.
        for (let i = 0; i < 5; i++) {
            await tick();
        }

        resolveInit?.();

        await expect(initPromise).rejects.toThrow('splash frame exploded');

        expect(capturedWhileInitRan).toBe(gamePalette);
        expect(
            (BTAPI.instance as unknown as { palettes: { isCapturingPalette: boolean } }).palettes.isCapturingPalette,
        ).toBe(false);
    });

    it('keeps the active palette in step with the splash when init() sets none', async () => {
        const activePalette = (): Palette | null => (BTAPI.instance as unknown as { palette: Palette | null }).palette;
        let paletteDuringInit: Palette | null | undefined;

        await BTAPI.instance.init(
            makeSplashDemo({ isSplashEnabled: true }, () => {
                paletteDuringInit = activePalette();
            }),
            makeMockCanvas(),
        );

        // Without this the engine palette stays null while the renderer draws the ramp,
        // and the handoff has nothing to fade down. Assert the size, not just non-null:
        // the point is that it is the splash's own ramp, not merely some palette.
        expect(paletteDuringInit?.size).toBe(RAMP_PALETTE_SIZE);
        expect(activePalette()).not.toBeNull();
        expect(activePalette()?.size).toBe(RAMP_PALETTE_SIZE);
    });

    it('drains input edges at handoff so the skip press never reaches the first update', async () => {
        const endUpdate = vi.spyOn(KeyboardInput.prototype, 'endUpdate');

        // The skip listeners themselves are covered in Splash.dom.test.ts; this asserts
        // the other half of the swallow - that BTAPI consumes the pending edges before
        // the game's first update() can observe them.
        await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: true }), makeMockCanvas());

        expect(endUpdate).toHaveBeenCalled();
    });

    describe('reduced motion', () => {
        function installMockMatchMedia(matches: boolean): void {
            Object.defineProperty(globalThis, 'matchMedia', {
                configurable: true,
                value: vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
            });
        }

        afterEach(() => {
            Reflect.deleteProperty(globalThis, 'matchMedia');
        });

        it('installs the game palette with no animated handoff', async () => {
            installMockMatchMedia(true);

            const gamePalette = new Palette(16);
            gamePalette.set(1, Color32.white);

            await BTAPI.instance.init(
                makeSplashDemo({ isSplashEnabled: true }, () => {
                    BTAPI.instance.palettes.setPalette(gamePalette);
                }),
                makeMockCanvas(),
            );

            expect(renderPalette()).toBe(gamePalette);
            expect(gamePalette.get(1).r).toBe(255);
        });

        it('skips the WebGPU dissolve', async () => {
            installMockMatchMedia(true);

            const enableDissolveSpy = vi.spyOn(Splash.prototype, 'enableDissolve');

            await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: true }), makeMockCanvas());

            expect(enableDissolveSpy).not.toHaveBeenCalled();
        });

        it('still runs the WebGPU dissolve when reduced motion is not preferred', async () => {
            installMockMatchMedia(false);

            const enableDissolveSpy = vi.spyOn(Splash.prototype, 'enableDissolve');

            await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: true }), makeMockCanvas());

            expect(enableDissolveSpy).toHaveBeenCalled();
        });
    });
});
