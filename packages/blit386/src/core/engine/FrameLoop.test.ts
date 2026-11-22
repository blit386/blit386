/**
 * Unit tests for `src/core/engine/FrameLoop.ts`, driven through `BTAPI`: the tick clock, Backquote toggle timing,
 * camera reset and gamepad edges through the real game loop.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeMockCanvas, makeMockDemo, resetSingleton } from '../../__test__/btapiFixtures';
import { installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../__test__/webgpu-mock';
import { Palette } from '../../assets/Palette';
import { BT } from '../../BLIT386';
import type { Overlay } from '../../overlay';
import { Color32 } from '../../utils/Color32';
import { Vector2i } from '../../utils/Vector2i';
import { BTAPI } from '../BTAPI';
import type { GameLoop } from '../GameLoop';
import type { IBTDemo } from '../IBTDemo';

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

    describe('tick clock', () => {
        /** Boots a mock demo and returns the private loop and renderer for driving frames. */
        async function bootForClock(): Promise<{
            loop: GameLoop;
            renderer: { endFrame: (deltaMs: number) => void };
            demo: IBTDemo;
        }> {
            const demo = makeMockDemo();

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const internals = BTAPI.instance as unknown as {
                loop: GameLoop;
                renderer: { endFrame: (deltaMs: number) => void };
            };

            return { loop: internals.loop, renderer: internals.renderer, demo };
        }

        it('feeds post-process effects the tick delta, not wall time', async () => {
            const { loop, renderer } = await bootForClock();
            const endFrameSpy = vi.spyOn(renderer, 'endFrame');
            const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(123_456);

            loop.stop();
            loop.step(30);

            // 30 * (1000 / 60) is 500 up to float noise. With performance.now() frozen, a 500 ms
            // delta can only come from the tick clock.
            expect(endFrameSpy.mock.lastCall?.[0]).toBeCloseTo(500);

            loop.step(0);

            expect(endFrameSpy).toHaveBeenLastCalledWith(0);
            nowSpy.mockRestore();
        });

        it('clamps the delta to 0 after BT.ticksReset()', async () => {
            const { loop, renderer } = await bootForClock();
            const endFrameSpy = vi.spyOn(renderer, 'endFrame');

            loop.stop();
            loop.step(60);
            BTAPI.instance.resetTicks();
            loop.step(1);

            expect(endFrameSpy).toHaveBeenLastCalledWith(0);
        });

        it('records the input trace once per update, before the inputs roll over, and once per frame', async () => {
            const { loop } = await bootForClock();
            const internals = BTAPI.instance as unknown as {
                keyboard: { endUpdate: (tick: number) => void };
                pointer: { endUpdate: () => void; endFrame: () => void };
            };
            const recordSpy = vi.spyOn(BTAPI.instance.inputTrace, 'record');
            const keyboardEndUpdate = vi.spyOn(internals.keyboard, 'endUpdate');
            const pointerEndFrame = vi.spyOn(internals.pointer, 'endFrame');

            loop.stop();
            loop.step(2); // without start(), the loop never calls record
            expect(recordSpy).not.toHaveBeenCalled();

            BTAPI.instance.inputTrace.start();
            loop.step(2);

            const { entries } = BTAPI.instance.inputTrace.stop();

            expect(entries.map((e) => e.clock)).toEqual(['update', 'update', 'render']);
            expect(recordSpy.mock.invocationCallOrder[0]).toBeLessThan(
                keyboardEndUpdate.mock.invocationCallOrder.at(-2) ?? 0,
            );
            expect(recordSpy.mock.invocationCallOrder[2]).toBeLessThan(
                pointerEndFrame.mock.invocationCallOrder.at(-1) ?? 0,
            );
        });

        /** A 16-entry palette with distinct, in-range colors. */
        function makeRampPalette(base: number): Palette {
            const palette = new Palette(16);

            for (let slot = 1; slot < 16; slot++) {
                palette.set(slot, new Color32(base + slot * 3, slot * 10, 255 - slot * 10));
            }

            return palette;
        }

        /** The palette's slot colors as one comparable string. */
        function describePalette(palette: Palette): string {
            return Array.from({ length: 16 }, (_, slot) => {
                const color = palette.getRef(slot);

                return `${color.r},${color.g},${color.b}`;
            }).join(' ');
        }

        it('a flash that ends during the stepped ticks is gone from the rendered frame', async () => {
            const { loop } = await bootForClock();
            const palette = makeRampPalette(10);
            const before = describePalette(palette);

            BTAPI.instance.palettes.setPalette(palette);
            BTAPI.instance.palettes.paletteFlash(new Color32(255, 255, 255), 100);

            loop.stop();
            // 10 ticks is 166 ms and the flash lasts 100 ms. Updated once per render, the flash would
            // only take its snapshot here and still be showing.
            loop.step(10);

            expect(describePalette(palette)).toBe(before);
        });

        it('one big step and many single steps leave palette effects identical', async () => {
            const { loop, demo } = await bootForClock();

            vi.mocked(demo.update).mockImplementation(() => {
                if (BTAPI.instance.getTicks() === 10) {
                    BTAPI.instance.palettes.paletteFlash(new Color32(255, 255, 255), 100);
                }

                if (BTAPI.instance.getTicks() === 20) {
                    BTAPI.instance.palettes.paletteFadeRange(9, 15, makeRampPalette(200), 2000);
                }
            });

            /** Replays ticks 0-60 in the given step sizes and returns the resulting palette. */
            const run = (stepSizes: number[]): string => {
                const palette = makeRampPalette(10);

                BTAPI.instance.palettes.setPalette(palette); // drops running effects
                loop.resetTicks();
                // Speed 1 crosses a whole step exactly at tick 60 - a float boundary that one large
                // catch-up delta and sixty small deltas can land on opposite sides of.
                BTAPI.instance.palettes.paletteCycle(1, 8, 1);

                for (const size of stepSizes) {
                    loop.step(size);
                }

                return describePalette(palette);
            };

            loop.stop();

            expect(run([60])).toBe(run(Array.from({ length: 60 }, () => 1)));
        });

        it('re-rendering without updates does not advance palette effects', async () => {
            const { loop } = await bootForClock();
            const palette = makeRampPalette(10);

            BTAPI.instance.palettes.setPalette(palette);
            BTAPI.instance.palettes.paletteCycle(1, 8, 30);

            loop.stop();
            loop.step(5);

            const afterSteps = describePalette(palette);

            loop.step(0);
            loop.step(0);

            expect(describePalette(palette)).toBe(afterSteps);
        });

        it('reports isUpdating only while the demo update() runs', async () => {
            const { loop, demo } = await bootForClock();
            const seen: boolean[] = [];

            vi.spyOn(demo, 'update').mockImplementation(() => {
                seen.push(BTAPI.instance.isUpdating);
            });

            loop.stop();
            loop.step(1);

            expect(seen).toEqual([true]);
            expect(BTAPI.instance.isUpdating).toBe(false);
        });

        it('tells the pointer whether the frame ran an update step', async () => {
            const { loop } = await bootForClock();
            const pointer = BTAPI.instance.getPointer();

            expect(pointer).not.toBeNull();

            const endFrameSpy = vi.spyOn(pointer as NonNullable<typeof pointer>, 'endFrame');
            const endUpdateSpy = vi.spyOn(pointer as NonNullable<typeof pointer>, 'endUpdate');

            loop.stop();
            loop.step(0);

            expect(endFrameSpy).toHaveBeenCalledTimes(1);
            expect(endUpdateSpy).not.toHaveBeenCalled();

            loop.step(1);

            expect(endFrameSpy).toHaveBeenCalledTimes(2);
            expect(endUpdateSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('overlay Backquote toggle timing', () => {
        it('registers a Backquote press consumed by the same fixed-update tick', async () => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayVisibleAtStart: false,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const overlay = (BTAPI.instance as unknown as { overlay: Overlay | null }).overlay;

            expect(overlay?.isBodyVisible).toBe(false);

            const keydownCall = (canvas.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
                ([type]) => type === 'keydown',
            );
            const keydownHandler = keydownCall?.[1] as ((event: { code: string }) => void) | undefined;

            expect(keydownHandler).toBeDefined();

            keydownHandler?.({ code: 'Backquote' });

            // Drive one fixed-update step and the following render in a single
            // GameLoop.tick() call, matching what a real rAF frame does: the update
            // phase (which clears the keyboard's press edge) always runs before the
            // render phase (where the overlay's toggle check lives).
            const loop = (
                BTAPI.instance as unknown as {
                    loop: { lastUpdateTime: number; tick: (currentTime: number) => void } | null;
                }
            ).loop;

            loop?.tick(20);

            expect(overlay?.isBodyVisible).toBe(true);
        });
    });
});

describe('camera reset persistence through the real game loop', () => {
    beforeEach(() => {
        resetSingleton();

        vi.resetAllMocks();
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        installMockNavigatorGPU();
    });

    afterEach(() => {
        (BTAPI.instance as unknown as { loop: GameLoop | null }).loop?.stop();

        resetSingleton();

        uninstallMockNavigatorGPU();

        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('retains the world offset across a zero fixed-update render, then commits the reset durably once a tick with no setCameraOffset() runs', async () => {
        // A synthetic clock the test fully controls, shared by requestAnimationFrame's
        // timestamp and performance.now() so GameLoop's accumulator math is deterministic -
        // unlike the real clock, which would make the exact update-tick cadence unpredictable.
        let clock = 0;

        vi.spyOn(performance, 'now').mockImplementation(() => clock);

        const rafCallbacks: FrameRequestCallback[] = [];

        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn((callback: FrameRequestCallback) => {
                rafCallbacks.push(callback);

                return rafCallbacks.length;
            }),
        );

        /**
         * Advances the fake clock and fires the next queued rAF callback, if any.
         *
         * A 5ms step against `targetFPS: 60`'s ~16.667ms fixed-update interval means most
         * frames land with zero update steps, with an update firing roughly every 4th frame -
         * exactly the "render outpaces update" condition `lastCameraOffset` exists for.
         */
        function drainOneFrame(): void {
            clock += 5;

            rafCallbacks.shift()?.(clock);
        }

        /**
         * Drains frames until `condition` is true, bounded so a regression that never
         * satisfies it fails this test with a clear error instead of hanging the Vitest
         * worker - `drainOneFrame` is synchronous, so a runaway loop here blocks the event
         * loop and cannot be interrupted by `testTimeout`.
         *
         * @param condition - Checked after each drained frame.
         */
        function drainFramesUntil(condition: () => boolean): void {
            const maxFrames = 1000;

            for (let frames = 0; !condition(); frames++) {
                if (frames >= maxFrames) {
                    throw new Error(`Exceeded ${maxFrames} frames waiting for condition.`);
                }

                drainOneFrame();
            }
        }

        const cameraSamples: Vector2i[] = [];
        let hasEstablishedWorldOffset = false;
        let hasIssuedReset = false;

        const demo: IBTDemo = {
            configure: () => ({
                isSplashEnabled: false,
                displaySize: new Vector2i(320, 240),
                targetFPS: 60,
            }),
            init: vi.fn().mockResolvedValue(true),
            update: vi.fn(() => {
                if (!hasEstablishedWorldOffset) {
                    BTAPI.instance.setCameraOffset(new Vector2i(500, 0));
                    hasEstablishedWorldOffset = true;
                }

                // Later ticks deliberately never call setCameraOffset again, simulating a
                // screen (a menu, a world map) that stops touching the camera after the reset.
            }),
            render: vi.fn(() => {
                cameraSamples.push(BTAPI.instance.getCameraOffset());

                if (hasEstablishedWorldOffset && !hasIssuedReset) {
                    // The documented pattern: flip to screen space for UI at the end of render().
                    BTAPI.instance.resetCamera();
                    hasIssuedReset = true;
                }
            }),
        };

        await BTAPI.instance.init(demo, makeMockCanvas());
        BTAPI.instance.palettes.setPalette(new Palette(16));

        // GameLoop.start() double-rAF-bootstraps before its first real tick.
        drainOneFrame();
        drainOneFrame();

        drainFramesUntil(() => hasIssuedReset);

        // The frame that issued the reset re-primed to the world offset first - the reset
        // only affects this frame's remaining draws, not the sample taken at render() start.
        expect(cameraSamples.at(-1)).toEqual(new Vector2i(500, 0));

        // A render frame with zero fixed-update steps must still hold the world offset -
        // committing the reset immediately would flash it to (0, 0) here instead.
        drainOneFrame();

        expect(cameraSamples.at(-1)).toEqual(new Vector2i(500, 0));

        // Drive frames until a fixed-update tick runs (update() no longer calls
        // setCameraOffset, so this commits the pending reset); that same frame's render()
        // samples the result immediately after.
        const ticksBeforeCommit = BTAPI.instance.getTicks();

        drainFramesUntil(() => BTAPI.instance.getTicks() !== ticksBeforeCommit);

        expect(cameraSamples.at(-1)).toEqual(new Vector2i(0, 0));
    });
});

describe('gamepad edges through the real game loop', () => {
    let pads: (Gamepad | null)[];

    /**
     * Builds a connected standard-mapping pad with only button 0 (A) possibly held.
     *
     * @param isAHeld - Whether A is down.
     * @returns A minimal `Gamepad` stand-in.
     */
    function makePad(isAHeld: boolean): Gamepad {
        const buttons = Array.from({ length: 16 }, (_, index) => ({
            pressed: index === 0 && isAHeld,
            touched: false,
            value: index === 0 && isAHeld ? 1 : 0,
        }));

        return { connected: true, axes: [0, 0, 0, 0], buttons } as unknown as Gamepad;
    }

    beforeEach(() => {
        resetSingleton();

        vi.resetAllMocks();
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        installMockNavigatorGPU();

        pads = [null, null, null, null];
        Object.defineProperty(globalThis.navigator, 'getGamepads', { configurable: true, value: () => pads });
    });

    afterEach(() => {
        (BTAPI.instance as unknown as { loop: GameLoop | null }).loop?.stop();

        resetSingleton();

        uninstallMockNavigatorGPU();

        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('reports a pad press and release to exactly one update across render-only and double-update frames', async () => {
        // Same synthetic clock as the camera test above: rAF timestamps and performance.now()
        // share it, so the number of updates each frame runs is fully determined.
        let clock = 0;

        vi.spyOn(performance, 'now').mockImplementation(() => clock);

        const rafCallbacks: FrameRequestCallback[] = [];

        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn((callback: FrameRequestCallback) => {
                rafCallbacks.push(callback);

                return rafCallbacks.length;
            }),
        );

        /**
         * Advances the clock by `ms` and fires the next queued frame.
         *
         * @param ms - Frame length in milliseconds.
         * @returns How many fixed updates the frame ran.
         */
        function runFrame(ms: number): number {
            const ticksBefore = BTAPI.instance.getTicks();

            clock += ms;
            rafCallbacks.shift()?.(clock);

            return BTAPI.instance.getTicks() - ticksBefore;
        }

        /**
         * Runs 4 ms frames until one runs an update, which leaves less than 4 ms in the
         * accumulator - so the next two 4 ms frames are guaranteed to run no update.
         */
        function syncToUpdate(): void {
            for (let frames = 0; runFrame(4) === 0; frames++) {
                if (frames >= 100) {
                    throw new Error('No fixed update ran within 100 frames.');
                }
            }
        }

        const presses: boolean[] = [];
        const releases: boolean[] = [];

        const demo: IBTDemo = {
            configure: () => ({
                isSplashEnabled: false,
                displaySize: new Vector2i(320, 240),
                targetFPS: 60,
            }),
            init: vi.fn().mockResolvedValue(true),
            update: vi.fn(() => {
                presses.push(BT.isPressed(BT.BTN_A));
                releases.push(BT.isReleased(BT.BTN_A));
            }),
            render: vi.fn(),
        };

        pads[0] = makePad(false);

        await BTAPI.instance.init(demo, makeMockCanvas());
        BTAPI.instance.palettes.setPalette(new Palette(16));

        // GameLoop.start() double-rAF-bootstraps before its first real tick.
        runFrame(4);
        runFrame(4);
        syncToUpdate();

        // The press is polled at the end of a frame that runs no update, then a second
        // render-only frame passes, then one frame runs several updates.
        presses.length = 0;
        pads[0] = makePad(true);

        expect(runFrame(4)).toBe(0);
        expect(runFrame(4)).toBe(0);
        expect(runFrame(40)).toBeGreaterThanOrEqual(2);
        expect(presses[0]).toBe(true);
        expect(presses.filter(Boolean)).toHaveLength(1);

        syncToUpdate();
        releases.length = 0;
        pads[0] = makePad(false);

        expect(runFrame(4)).toBe(0);
        expect(runFrame(4)).toBe(0);
        expect(runFrame(40)).toBeGreaterThanOrEqual(2);
        expect(releases[0]).toBe(true);
        expect(releases.filter(Boolean)).toHaveLength(1);
    });
});
