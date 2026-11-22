/**
 * Unit tests for `src/core/engine/Seek.ts`, driven through `BTAPI`: renderAt seeking and resume.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    activeEffectCount,
    makeMock2DCanvas,
    makeMockCanvas,
    makeMockDemo,
    makeOffscreenCanvas2dContext,
    type OffscreenCanvas2DMock,
    resetSingleton,
} from '../../__test__/btapiFixtures';
import { createMockAudioBuffer } from '../../__test__/webaudio-mock';
import { installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../__test__/webgpu-mock';
import type { AudioClip } from '../../assets/AudioClip';
import { Palette } from '../../assets/Palette';
import { AudioManager } from '../../audio/AudioManager';
import { INVALID_SOUND_REF, type SoundRef } from '../../audio/VoicePool';
import { BT } from '../../BLIT386';
import type { Overlay } from '../../overlay';
import type { IRenderer } from '../../render/IRenderer';
import { Vector2i } from '../../utils/Vector2i';
import { BTAPI } from '../BTAPI';
import type { GameLoop } from '../GameLoop';
import type { HardwareSettings, IBTDemo, RenderAtFrom } from '../IBTDemo';

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

    describe('renderAt', () => {
        /** Boots a demo whose update/render are spies; returns the demo and private loop. */
        async function boot(demo: IBTDemo = makeMockDemo()): Promise<{ demo: IBTDemo; loop: GameLoop }> {
            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));

            return { demo, loop: (BTAPI.instance as unknown as { loop: GameLoop }).loop };
        }

        it('rejects before init', async () => {
            await expect(BTAPI.instance.seek.renderAt(1)).rejects.toThrow("hasn't started");
        });

        it.each([Number.NaN, -1, Number.POSITIVE_INFINITY, 1e300])('rejects a time of %s', async (seconds) => {
            const { loop } = await boot();

            await expect(BTAPI.instance.seek.renderAt(seconds)).rejects.toThrow('zero or more');
            // Rejected before any side effect: the live loop is still running.
            expect((loop as unknown as { isRunning: boolean }).isRunning).toBe(true);
        });

        it('rejects an unknown from', async () => {
            await boot();

            await expect(BTAPI.instance.seek.renderAt(1, 'middle' as RenderAtFrom)).rejects.toThrow(
                "'start' or 'current'",
            );
        });

        it("from 'start' re-runs init once, steps to the rounded tick, renders once", async () => {
            const { demo } = await boot();

            vi.mocked(demo.update).mockClear();
            vi.mocked(demo.render).mockClear();

            await BTAPI.instance.seek.renderAt(3.2);

            expect(demo.init).toHaveBeenCalledTimes(2);
            expect(demo.update).toHaveBeenCalledTimes(192);
            expect(demo.render).toHaveBeenCalledTimes(1);
            expect(BTAPI.instance.getTicks()).toBe(192);
        });

        it('tells the overlay the clock is parked on the seeked frame, from either origin (BT-797)', async () => {
            await boot();

            const overlay = BTAPI.instance.overlay;

            expect(overlay).not.toBeNull();

            const drawSpy = vi.spyOn(overlay as Overlay, 'updateAndRender');

            // The parked flag is the last argument: the overlay then ignores the wall-clock snapshot.
            await BTAPI.instance.seek.renderAt(1);
            expect(drawSpy.mock.lastCall?.at(-1)).toBe(true);

            await BTAPI.instance.seek.renderAt(2, 'current');
            expect(drawSpy.mock.lastCall?.at(-1)).toBe(true);
        });

        it('hands the overlay the voice-pool size on the first parked draw of a fresh engine (BT-797)', async () => {
            const { loop } = await boot({
                ...makeMockDemo(),
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayAudioMetersEnabled: true,
                }),
            });

            const overlay = BTAPI.instance.overlay;

            expect(overlay).not.toBeNull();

            // The snapshot object is reused, so read the pool size at the moment of each draw.
            const totalVoicesPerDraw: number[] = [];

            vi.spyOn(overlay as Overlay, 'updateAndRender').mockImplementation((...args) => {
                totalVoicesPerDraw.push(args[9]?.totalVoices ?? -1);
            });

            // A seek that is the engine's first render, then the step(0) re-render a capture of it runs.
            await BTAPI.instance.seek.renderAt(0, 'current');
            loop.step(0);

            expect(totalVoicesPerDraw).toHaveLength(2);
            expect(totalVoicesPerDraw[0]).toBeGreaterThan(0);
            expect(totalVoicesPerDraw[1]).toBe(totalVoicesPerDraw[0]);
        });

        it("from 'start' restores the RNG to its pre-init state", async () => {
            const statesSeenByInit: number[] = [];
            const demo = makeMockDemo();

            vi.mocked(demo.init).mockImplementation(async () => {
                statesSeenByInit.push(BTAPI.instance.getRandom().getState());

                return true;
            });
            await boot(demo);

            BTAPI.instance.getRandom().next();
            BTAPI.instance.getRandom().next();

            await BTAPI.instance.seek.renderAt(0);

            expect(statesSeenByInit).toHaveLength(2);
            expect(statesSeenByInit[1]).toBe(statesSeenByInit[0]);
        });

        it("from 'start' clears palette and post-process effects before init", async () => {
            await boot();

            const renderer = (BTAPI.instance as unknown as { renderer: { clearEffects: () => void } }).renderer;
            const clearSpy = vi.spyOn(renderer, 'clearEffects');

            BTAPI.instance.palettes.paletteCycle(1, 4, 1);
            await BTAPI.instance.seek.renderAt(0.5);

            expect(clearSpy).toHaveBeenCalled();
            expect(activeEffectCount()).toBe(0);
        });

        it("from 'start' reads a gamepad button held before the seek as held, not as a new press", async () => {
            // A pad button that went down after the last poll and is still held when the seek starts.
            // The drain must poll first and then roll over, or the replay's first update sees a press.
            const isAHeld = { value: false };
            const buttons = Array.from({ length: 16 }, (_, index) => ({
                get pressed(): boolean {
                    return index === 0 && isAHeld.value;
                },
                touched: false,
                get value(): number {
                    return index === 0 && isAHeld.value ? 1 : 0;
                },
            }));
            const pad = { connected: true, axes: [0, 0, 0, 0], buttons } as unknown as Gamepad;

            Object.defineProperty(globalThis.navigator, 'getGamepads', {
                configurable: true,
                value: () => [pad, null, null, null],
            });

            const pressedByUpdate: boolean[] = [];
            const demo = makeMockDemo();

            vi.mocked(demo.update).mockImplementation(() => {
                pressedByUpdate.push(BT.isPressed(BT.BTN_A));
            });
            await boot(demo);

            isAHeld.value = true;
            await BTAPI.instance.seek.renderAt(1 / 60);

            expect(pressedByUpdate).toEqual([false]);
            expect(BT.isDown(BT.BTN_A)).toBe(true);
        });

        describe("from 'start' with a class-based demo", () => {
            /** Instances built so far, in construction order. */
            let built: CountingDemo[] = [];

            /** Settings every CountingDemo returns from configure(). */
            const settings = {
                isSplashEnabled: false,
                displaySize: new Vector2i(320, 240),
                drawingBufferSize: new Vector2i(640, 480),
                targetFPS: 60,
            };

            /** A class demo with runtime state that only a fresh instance starts clean. */
            class CountingDemo implements IBTDemo {
                /** Bumped by every update(); a leaked value shows up as a too-high count. */
                public updates = 0;

                /** Filled by init(); a re-used instance would end up with a second copy. */
                public items: number[] = [];

                /** What init() should resolve to for this instance. */
                public initResult = true;

                /** Whether this instance was the active game while its own init() ran. */
                public wasActiveDuringInit = false;

                public constructor() {
                    built.push(this);
                }

                public configure(): typeof settings {
                    return settings;
                }

                public async init(): Promise<boolean> {
                    this.wasActiveDuringInit = BTAPI.instance.getDemo() === this;
                    this.items.push(1);

                    return this.initResult;
                }

                public update(): void {
                    this.updates++;
                }

                public render(): void {}
            }

            beforeEach(() => {
                built = [];
            });

            it('replays into a fresh instance built from the same class', async () => {
                const first = new CountingDemo();

                await boot(first);
                await BTAPI.instance.seek.renderAt(1);
                await BTAPI.instance.seek.renderAt(1);

                const active = BTAPI.instance.getDemo() as CountingDemo;

                expect(built).toHaveLength(3);
                expect(active).toBe(built[2]);
                expect(active).not.toBe(first);
                expect(active.items).toEqual([1]);
                expect(active.updates).toBe(60);

                // Installed before init() runs, so BT calls made inside init() reach this instance.
                expect(active.wasActiveDuringInit).toBe(true);
            });

            it('keeps the previous instance running when the fresh one fails init()', async () => {
                const first = new CountingDemo();

                await boot(first);
                vi.spyOn(CountingDemo.prototype, 'init').mockImplementationOnce(async () => {
                    BTAPI.instance.palettes.paletteCycle(1, 4, 1);

                    return false;
                });

                await expect(BTAPI.instance.seek.renderAt(1)).rejects.toThrow('init()');
                expect(BTAPI.instance.getDemo()).toBe(first);
                // Effects the failed init() started must not run on the restored game.
                expect(activeEffectCount()).toBe(0);
            });

            it('keeps the previous instance running when the constructor throws', async () => {
                class ThrowsOnSecondBuild extends CountingDemo {
                    public constructor() {
                        super();

                        if (built.length > 1) {
                            throw new Error('constructor failed');
                        }
                    }
                }

                const first = new ThrowsOnSecondBuild();

                await boot(first);

                await expect(BTAPI.instance.seek.renderAt(1)).rejects.toThrow('constructor');
                expect(BTAPI.instance.getDemo()).toBe(first);
            });
        });

        it("from 'start' re-runs init on the same object for an object-literal demo", async () => {
            const { demo } = await boot();

            await BTAPI.instance.seek.renderAt(1);

            expect(BTAPI.instance.getDemo()).toBe(demo);
            expect(demo.init).toHaveBeenCalledTimes(2);
        });

        it("from 'start' rejects when the re-run init fails", async () => {
            const demo = makeMockDemo();

            await boot(demo);
            vi.mocked(demo.init).mockResolvedValueOnce(false);

            await expect(BTAPI.instance.seek.renderAt(1)).rejects.toThrow('init()');
        });

        describe("a failed 'start' seek (BT-727)", () => {
            /** Parks a booted game at tick 600 with a moved camera and a drawn-from random stream. */
            async function parkAtTick600(): Promise<IBTDemo> {
                const demo = makeMockDemo();

                await boot(demo);
                await BTAPI.instance.seek.renderAt(10);
                BTAPI.instance.setCameraOffset(new Vector2i(7, 9));
                BTAPI.instance.getRandom().next();
                BTAPI.instance.getRandom().next();

                return demo;
            }

            it('puts the clock, the random stream and the camera back when init() resolves false', async () => {
                const demo = await parkAtTick600();
                const random = BTAPI.instance.getRandom();
                const ticksBefore = BTAPI.instance.getTicks();
                const stateBefore = random.getState();

                expect(ticksBefore).toBe(600);
                vi.mocked(demo.init).mockResolvedValueOnce(false);

                await expect(BTAPI.instance.seek.renderAt(5)).rejects.toThrow('init()');

                expect(BTAPI.instance.getTicks()).toBe(ticksBefore);
                expect(random.getState()).toBe(stateBefore);
                expect(BTAPI.instance.getCameraOffset().x).toBe(7);
                expect(BTAPI.instance.getCameraOffset().y).toBe(9);
            });

            it('keeps BT.random.seedValue when nothing drew since the seed', async () => {
                const demo = await parkAtTick600();
                const random = BTAPI.instance.getRandom();

                random.seed(123);
                vi.mocked(demo.init).mockResolvedValueOnce(false);

                await expect(BTAPI.instance.seek.renderAt(5)).rejects.toThrow('init()');

                expect(random.seedValue).toBe(123);
                expect(random.getState()).toBe(123);
            });

            it('puts back a camera reset that was still pending, and the post-process clock', async () => {
                const demo = await parkAtTick600();
                const internals = BTAPI.instance as unknown as {
                    lastCameraOffset: Vector2i;
                    lastRenderClockMs: number;
                    pendingCameraReset: boolean;
                };

                // A game that called resetCamera() in render(): the renderer is at 0, the deferred
                // reset is pending, and the engine still holds the world offset it re-applies.
                BTAPI.instance.resetCamera();
                internals.lastCameraOffset = new Vector2i(7, 9);
                internals.lastRenderClockMs = 12345;
                vi.mocked(demo.init).mockResolvedValueOnce(false);

                await expect(BTAPI.instance.seek.renderAt(5)).rejects.toThrow('init()');

                expect(internals.pendingCameraReset).toBe(true);
                expect(internals.lastCameraOffset.x).toBe(7);
                expect(internals.lastCameraOffset.y).toBe(9);
                expect(internals.lastRenderClockMs).toBe(12345);
            });

            it('puts them back when init() throws', async () => {
                const demo = await parkAtTick600();
                const stateBefore = BTAPI.instance.getRandom().getState();

                vi.mocked(demo.init).mockRejectedValueOnce(new Error('asset fetch failed'));
                vi.spyOn(console, 'error').mockImplementation(() => {});

                await expect(BTAPI.instance.seek.renderAt(5)).rejects.toThrow('init()');

                expect(BTAPI.instance.getTicks()).toBe(600);
                expect(BTAPI.instance.getRandom().getState()).toBe(stateBefore);
                expect(BTAPI.instance.getCameraOffset().x).toBe(7);
            });

            it('changes nothing when the constructor throws', async () => {
                class ThrowsOnThirdBuild {
                    public static built = 0;

                    public constructor() {
                        ThrowsOnThirdBuild.built++;

                        // Build 1 boots, build 2 is the setup seek's replay, build 3 is the seek under test.
                        if (ThrowsOnThirdBuild.built > 2) {
                            throw new Error('constructor failed');
                        }
                    }

                    public configure(): HardwareSettings {
                        return { isSplashEnabled: false, displaySize: new Vector2i(320, 240), targetFPS: 60 };
                    }

                    public async init(): Promise<boolean> {
                        return true;
                    }

                    public update(): void {}

                    public render(): void {}
                }

                await boot(new ThrowsOnThirdBuild());
                await BTAPI.instance.seek.renderAt(10);
                BTAPI.instance.setCameraOffset(new Vector2i(7, 9));
                BTAPI.instance.getRandom().next();

                const stateBefore = BTAPI.instance.getRandom().getState();

                vi.spyOn(console, 'error').mockImplementation(() => {});

                await expect(BTAPI.instance.seek.renderAt(5)).rejects.toThrow('constructor');

                expect(BTAPI.instance.getTicks()).toBe(600);
                expect(BTAPI.instance.getRandom().getState()).toBe(stateBefore);
                expect(BTAPI.instance.getCameraOffset().x).toBe(7);
            });
        });

        it("from 'start' works on the software backend, which has no post-process chain", async () => {
            const demo: IBTDemo = {
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    backend: 'software',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            // Same OffscreenCanvas stub the existing software-mode init tests use.
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
            await BTAPI.instance.init(demo, makeMock2DCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));

            await expect(BTAPI.instance.seek.renderAt(1)).resolves.toBeUndefined();
            expect(demo.init).toHaveBeenCalledTimes(2);
            expect(BTAPI.instance.getTicks()).toBe(60);
        });

        it("from 'start' keeps palette effects init() starts when the boot run had no splash", async () => {
            const demo = makeMockDemo();

            vi.mocked(demo.init).mockImplementation(async () => {
                BTAPI.instance.palettes.setPalette(Palette.pico8());
                BTAPI.instance.palettes.paletteCycle(1, 4, 1);

                return true;
            });
            await boot(demo);
            await BTAPI.instance.seek.renderAt(0.5);

            expect(activeEffectCount()).toBe(1);
        });

        it("from 'start' drops palette effects init() starts when the boot run had a splash", async () => {
            const demo = makeMockDemo();

            vi.mocked(demo.init).mockImplementation(async () => {
                BTAPI.instance.palettes.setPalette(Palette.pico8());
                BTAPI.instance.palettes.paletteCycle(1, 4, 1);

                return true;
            });
            await boot(demo);
            // Stand-in for a boot that showed the splash: the live handoff (endPaletteCapture) dropped
            // every palette effect init() started, and resetForSeek only checks that a splash existed.
            (BTAPI.instance as unknown as { splash: object | null }).splash = {};

            await BTAPI.instance.seek.renderAt(0.5);

            expect(activeEffectCount()).toBe(0);
        });

        it("from 'start' keeps palette effects after a restart, which runs init() without the boot splash", async () => {
            const demo = makeMockDemo();

            vi.mocked(demo.init).mockImplementation(async () => {
                BTAPI.instance.palettes.setPalette(Palette.pico8());
                BTAPI.instance.palettes.paletteCycle(1, 4, 1);

                return true;
            });
            await boot(demo);
            // Stand-in for a boot that showed the splash (see the test above); the restart below does not replay it.
            (BTAPI.instance as unknown as { splash: object | null }).splash = {};
            await boot(demo);

            await BTAPI.instance.seek.renderAt(0.5);

            expect(activeEffectCount()).toBe(1);
        });

        it("from 'current' steps forward only and rejects a past target", async () => {
            const { demo } = await boot();

            await BTAPI.instance.seek.renderAt(1, 'current');

            expect(demo.init).toHaveBeenCalledTimes(1);
            expect(BTAPI.instance.getTicks()).toBe(60);

            await expect(BTAPI.instance.seek.renderAt(0.5, 'current')).rejects.toThrow('backwards');
        });

        /** Makes the next init() call wait until the returned function is called with its result. */
        function deferNextInit(demo: IBTDemo): (ok: boolean) => void {
            let release: (ok: boolean) => void = () => undefined;

            vi.mocked(demo.init).mockImplementationOnce(
                () =>
                    new Promise<boolean>((resolve) => {
                        release = resolve;
                    }),
            );

            return (ok) => release(ok);
        }

        /** Lets every queued microtask and zero-delay timer run. */
        const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

        it('makes a BT.init during a seek wait for it, so the seek cannot take over the new run', async () => {
            const { demo } = await boot();
            const releaseReplayInit = deferNextInit(demo);

            const seek = BTAPI.instance.seek.renderAt(1);

            await settle();

            const next = makeMockDemo();
            const restart = BTAPI.instance.init(next, makeMockCanvas());

            await settle();

            expect(next.init).not.toHaveBeenCalled();

            releaseReplayInit(true);
            await seek;

            expect(await restart).toBe(true);
            expect(BTAPI.instance.getDemo()).toBe(next);
        });

        it('serializes overlapping calls', async () => {
            const { demo } = await boot();
            const releaseFirstInit = deferNextInit(demo);

            const first = BTAPI.instance.seek.renderAt(1);
            const second = BTAPI.instance.seek.renderAt(2);

            await settle();

            // The first seek is parked in its init(); the second has not started its own.
            expect(demo.init).toHaveBeenCalledTimes(2);

            releaseFirstInit(true);

            await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
            expect(demo.init).toHaveBeenCalledTimes(3);
            expect(BTAPI.instance.getTicks()).toBe(120);
        });

        it('a rejected seek does not block the next one', async () => {
            const { demo } = await boot();

            vi.mocked(demo.init).mockResolvedValueOnce(false);

            const failed = BTAPI.instance.seek.renderAt(1);
            const next = BTAPI.instance.seek.renderAt(2);

            await expect(failed).rejects.toThrow('init()');
            await expect(next).resolves.toBeUndefined();
            expect(BTAPI.instance.getTicks()).toBe(120);

            // Every earlier seek has settled, so the resume() promise settles with the loop restarted.
            vi.mocked(requestAnimationFrame).mockClear();
            await BTAPI.instance.seek.resume();

            expect(requestAnimationFrame).toHaveBeenCalled();
        });

        it("resume() during a 'start' seek waits for the seek, then plays on from its target", async () => {
            const { demo } = await boot();
            const releaseInit = deferNextInit(demo);
            const ticksSeenByUpdate: number[] = [];

            vi.mocked(demo.update).mockImplementation(() => {
                ticksSeenByUpdate.push(BTAPI.instance.getTicks());
            });

            const seek = BTAPI.instance.seek.renderAt(1);

            await settle();
            vi.mocked(requestAnimationFrame).mockClear();
            BTAPI.instance.seek.resume();
            await settle();

            // init() is still running: restarting the loop now would update a half-built game.
            expect(requestAnimationFrame).not.toHaveBeenCalled();

            releaseInit(true);
            await seek;
            await settle();

            expect(requestAnimationFrame).toHaveBeenCalled();

            // Walk the loop's start chain (two warm-up frames, then the first real tick).
            const runFrame = (time: number): void => {
                vi.mocked(requestAnimationFrame).mock.lastCall?.[0](time);
            };

            ticksSeenByUpdate.length = 0;
            runFrame(0);
            runFrame(0);
            runFrame(performance.now() + 20);

            expect(ticksSeenByUpdate[0]).toBe(60);
        });

        it('captureFrame right after an un-awaited renderAt captures the seeked tick', async () => {
            const { demo } = await boot();
            const renderer = (BTAPI.instance as unknown as { renderer: IRenderer }).renderer;
            let settleCapture: (() => void) | null = null;

            // The capture settles on the next render, with the tick that render drew.
            vi.spyOn(renderer, 'captureFrameAtDisplaySize').mockImplementation(
                () =>
                    new Promise<Blob>((resolve) => {
                        settleCapture = () => resolve(new Blob([String(BTAPI.instance.getTicks())]));
                    }),
            );
            vi.mocked(demo.render).mockImplementation(() => {
                settleCapture?.();
                settleCapture = null;
            });

            await BTAPI.instance.seek.renderAt(0, 'current'); // park the loop first

            void BTAPI.instance.seek.renderAt(1, 'current');
            const blob = await BTAPI.instance.capture.captureFrame('display');

            expect(await blob.text()).toBe('60');
        });

        it('keeps a pointer release that arrives while parked for the next stepped update, across a capture', async () => {
            const demo = makeMockDemo();
            const seen: boolean[] = [];
            vi.mocked(demo.update).mockImplementation(() => {
                seen.push(BT.isReleased(BT.BTN_POINTER_A));
            });
            const canvas = Object.assign(makeMockCanvas(), {
                getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 240 }),
            });
            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));
            const renderer = (BTAPI.instance as unknown as { renderer: IRenderer }).renderer;

            vi.spyOn(renderer, 'captureFrameAtDisplaySize').mockResolvedValue(new Blob());

            const listener = (type: string): ((event: unknown) => void) =>
                vi.mocked(canvas.addEventListener).mock.calls.find(([t]) => t === type)?.[1] as (
                    event: unknown,
                ) => void;
            const mouse = { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 5, clientY: 5 };

            await BTAPI.instance.seek.renderAt(0, 'current'); // park the loop
            listener('pointerdown')({ ...mouse, buttons: 1 });
            await BTAPI.instance.seek.renderAt(1 / 60, 'current'); // one update sees the button down
            seen.length = 0;

            listener('pointerup')({ ...mouse, buttons: 0 });
            await BTAPI.instance.capture.captureFrame('display'); // re-renders the parked tick with zero updates
            await BTAPI.instance.seek.renderAt(2 / 60, 'current');

            expect(seen).toEqual([true]);
        });

        it('waits for the audio to finish suspending before it steps', async () => {
            const { demo } = await boot();
            const audio = new AudioManager();
            let finishPark: () => void = () => undefined;

            vi.spyOn(audio, 'park').mockReturnValue(
                new Promise<void>((resolve) => {
                    finishPark = resolve;
                }),
            );
            (BTAPI.instance as unknown as { audio: AudioManager | null }).audio = audio;
            vi.mocked(demo.update).mockClear();

            const seek = BTAPI.instance.seek.renderAt(1, 'current');

            await settle();

            expect(demo.update).not.toHaveBeenCalled();

            finishPark();
            await seek;

            expect(demo.update).toHaveBeenCalledTimes(60);
        });

        it('resume() runs in call order, so a seek queued after it leaves the loop stopped', async () => {
            const { demo } = await boot();
            const releaseInit = deferNextInit(demo);

            const first = BTAPI.instance.seek.renderAt(1);
            const resumed = BTAPI.instance.seek.resume();
            const second = BTAPI.instance.seek.renderAt(2, 'current');

            await settle();
            releaseInit(true);
            await Promise.all([first, resumed, second]);

            // The second seek ran after the resume, stopped the loop again, and holds it on tick 120.
            expect(BTAPI.instance.getTicks()).toBe(120);
            expect((BTAPI.instance as unknown as { isSeekParked: boolean }).isSeekParked).toBe(true);
        });

        it('captureFrame rejects instead of hanging when the re-render after a seek throws', async () => {
            const { demo } = await boot();
            const renderer = (BTAPI.instance as unknown as { renderer: IRenderer }).renderer;

            let supersede: (error: Error) => void = () => undefined;
            const pendingCapture = new Promise<Blob>((_resolve, reject) => {
                supersede = reject;
            });

            // A plain replacement, not vi.spyOn: a spy observes the promise it returns, which would hide
            // exactly the missing handler this test is about.
            (renderer as unknown as { captureFrameAtDisplaySize: () => Promise<Blob> }).captureFrameAtDisplaySize =
                () => pendingCapture;
            await BTAPI.instance.seek.renderAt(1, 'current');
            vi.mocked(demo.render).mockImplementation(() => {
                throw new Error('render broke');
            });

            await expect(BTAPI.instance.capture.captureFrame('display')).rejects.toThrow('render broke');

            // The renderer later rejects the abandoned request (a newer capture supersedes it); that
            // rejection must not surface as unhandled.
            const unhandled = vi.fn();

            process.on('unhandledRejection', unhandled);
            supersede(new Error('Capture superseded'));
            await new Promise((resolve) => setTimeout(resolve, 10));
            process.off('unhandledRejection', unhandled);

            expect(unhandled).not.toHaveBeenCalled();
        });

        it('leaves the loop stopped until resume()', async () => {
            const { demo, loop } = await boot();

            await BTAPI.instance.seek.renderAt(1, 'current');
            vi.mocked(demo.update).mockClear();

            const tick = (loop as unknown as { tick: (now: number) => void }).tick.bind(loop);

            tick(10_000);

            expect(demo.update).not.toHaveBeenCalled();

            vi.mocked(requestAnimationFrame).mockClear();
            await BTAPI.instance.seek.resume();

            expect(requestAnimationFrame).toHaveBeenCalled();
        });

        it('resume() is a no-op when no seek parked the loop', async () => {
            await boot();
            vi.mocked(requestAnimationFrame).mockClear();

            await BTAPI.instance.seek.resume();

            expect(requestAnimationFrame).not.toHaveBeenCalled();
        });

        it('captureFrame after a seek re-renders the same tick to settle', async () => {
            const { demo } = await boot();
            const renderer = (BTAPI.instance as unknown as { renderer: IRenderer }).renderer;

            vi.spyOn(renderer, 'captureFrameAtDisplaySize').mockResolvedValue(new Blob());
            await BTAPI.instance.seek.renderAt(1, 'current');
            vi.mocked(demo.render).mockClear();

            await expect(BTAPI.instance.capture.captureFrame('display')).resolves.toBeInstanceOf(Blob);
            expect(demo.render).toHaveBeenCalledTimes(1);
            expect(BTAPI.instance.getTicks()).toBe(60);
        });

        it('parks audio for the seek, drops SFX while seeking, resumes audio on resume', async () => {
            // A real, unattached AudioManager (null context, so park/unpark are safe no-ops) with spies -
            // the stepped render may call other AudioManager methods, which a bare object would lack.
            const audio = new AudioManager();
            const refs: SoundRef[] = [];
            const demo = makeMockDemo();
            const clip = { buffer: createMockAudioBuffer() } as unknown as AudioClip;

            vi.spyOn(audio, 'park');
            vi.spyOn(audio, 'unpark');
            vi.spyOn(audio, 'playSound').mockReturnValue({ voiceIndex: 7, generation: 1 });
            vi.mocked(demo.update).mockImplementation(() => {
                refs.push(BTAPI.instance.audioCommands.soundPlay(clip));
            });
            await boot(demo);
            (BTAPI.instance as unknown as { audio: AudioManager | null }).audio = audio;

            await BTAPI.instance.seek.renderAt(0.1, 'current');

            expect(audio.park).toHaveBeenCalledTimes(1);
            expect(audio.playSound).not.toHaveBeenCalled();
            expect(refs.length).toBeGreaterThan(0);
            expect(refs.every((ref) => ref === INVALID_SOUND_REF)).toBe(true);

            await BTAPI.instance.seek.resume();

            expect(audio.unpark).toHaveBeenCalledTimes(1);
        });

        it("a keydown while stopped is a press on the first update of a 'current' seek", async () => {
            const canvas = makeMockCanvas();
            const pressed: boolean[] = [];
            const demo = makeMockDemo();

            vi.mocked(demo.update).mockImplementation(() => {
                pressed.push(BT.isKeyPressed('KeyZ'));
            });
            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));
            await BTAPI.instance.seek.renderAt(0, 'current');

            const keydownCall = (canvas.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
                ([type]) => type === 'keydown',
            );
            const keydownHandler = keydownCall?.[1] as ((event: { code: string }) => void) | undefined;

            keydownHandler?.({ code: 'KeyZ' });
            await BTAPI.instance.seek.renderAt(2 / 60, 'current');

            expect(pressed).toEqual([true, false]);
        });
    });
});
