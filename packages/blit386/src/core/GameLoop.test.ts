/**
 * Unit tests for {@link GameLoop}.
 *
 * Verifies the fixed-timestep loop contract:
 * - constructor validation for invalid update intervals
 * - public tick-counter and stop behavior
 * - start-up scheduling through `requestAnimationFrame`
 * - internal tick processing, including multiple updates per frame
 * - accumulator clamping to avoid runaway catch-up work
 * - optional dropped-frame detection callback
 *
 * Private frame-advance behavior is exercised through a narrow type cast so
 * the suite can validate timing semantics without changing production APIs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrameDropEvent } from './GameLoop';
import { GameLoop } from './GameLoop';

describe('GameLoop', () => {
    describe('constructor', () => {
        it('should accept a valid positive update interval', () => {
            const loop = new GameLoop(16.67, vi.fn(), vi.fn());

            expect(loop).toBeDefined();
        });

        it('should throw on a zero interval', () => {
            expect(() => new GameLoop(0, vi.fn(), vi.fn())).toThrow('finite positive number');
        });

        it('should throw on a negative interval', () => {
            expect(() => new GameLoop(-16, vi.fn(), vi.fn())).toThrow('finite positive number');
        });

        it('should throw on NaN interval', () => {
            expect(() => new GameLoop(NaN, vi.fn(), vi.fn())).toThrow('finite positive number');
        });

        it('should throw on an Infinity interval', () => {
            expect(() => new GameLoop(Infinity, vi.fn(), vi.fn())).toThrow('finite positive number');
        });

        it('should throw on a negative Infinity interval', () => {
            expect(() => new GameLoop(-Infinity, vi.fn(), vi.fn())).toThrow('finite positive number');
        });
    });

    describe('getTicks', () => {
        it('should return 0 initially', () => {
            const loop = new GameLoop(16.67, vi.fn(), vi.fn());

            expect(loop.getTicks()).toBe(0);
        });
    });

    describe('resetTicks', () => {
        it('should reset tick count to 0', () => {
            const loop = new GameLoop(16.67, vi.fn(), vi.fn());

            (loop as unknown as { ticks: number }).ticks = 5;

            loop.resetTicks();

            expect(loop.getTicks()).toBe(0);
        });
    });

    describe('getRenderAlpha', () => {
        type PrivateLoop = {
            tick: (currentTime: number) => void;
            isRunning: boolean;
            lastUpdateTime: number;
            accumulator: number;
        };

        beforeEach(() => {
            vi.stubGlobal('requestAnimationFrame', vi.fn());
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('should return 0 initially', () => {
            const loop = new GameLoop(16.67, vi.fn(), vi.fn());

            expect(loop.getRenderAlpha()).toBe(0);
        });

        it('should set renderAlpha to the leftover accumulator fraction after fixed updates', () => {
            const loop = new GameLoop(10, vi.fn(), vi.fn());
            const p = loop as unknown as PrivateLoop;

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(25); // 25ms at 10ms interval = 2 steps, 5ms leftover

            expect(loop.getRenderAlpha()).toBeCloseTo(0.5);
        });

        it('should be 0 immediately after a frame whose deltaTime consumes the accumulator exactly', () => {
            const loop = new GameLoop(10, vi.fn(), vi.fn());
            const p = loop as unknown as PrivateLoop;

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(20); // 20ms at 10ms interval = 2 whole steps, 0ms remainder

            expect(loop.getRenderAlpha()).toBe(0);
        });

        it('should approach but never reach 1 as deltaTime approaches a full updateInterval without crossing it', () => {
            const loop = new GameLoop(100, vi.fn(), vi.fn());
            const p = loop as unknown as PrivateLoop;

            p.isRunning = true;
            p.lastUpdateTime = 0;
            // 97.9ms at a 100ms interval: 0 steps, 97.9ms leftover. Kept more
            // than SNAP_EPSILON_MS (2ms) away from the 100ms boundary so the
            // rAF-jitter snap correction does not round this up to a full step.
            p.tick(97.9);

            const alpha = loop.getRenderAlpha();

            expect(alpha).toBeCloseTo(0.979);
            expect(alpha).toBeLessThan(1);
        });

        it('should stay within [0, 1) across consecutive frames, including a multi-step catch-up frame', () => {
            const onUpdate = vi.fn();
            const loop = new GameLoop(10, onUpdate, vi.fn());
            const p = loop as unknown as PrivateLoop;

            p.isRunning = true;
            p.lastUpdateTime = 0;

            p.tick(7); // 7ms delta: 0 steps, 7ms leftover -> alpha 0.7

            expect(loop.getRenderAlpha()).toBeGreaterThanOrEqual(0);
            expect(loop.getRenderAlpha()).toBeLessThan(1);

            p.tick(32); // 25ms delta on top of the 7ms leftover: 3 steps (catch-up), 2ms leftover -> alpha 0.2

            expect(onUpdate).toHaveBeenCalledTimes(3);
            expect(loop.getRenderAlpha()).toBeGreaterThanOrEqual(0);
            expect(loop.getRenderAlpha()).toBeLessThan(1);

            p.tick(47); // 15ms delta on top of the 2ms leftover: 1 step, 7ms leftover -> alpha 0.7

            expect(onUpdate).toHaveBeenCalledTimes(4);
            expect(loop.getRenderAlpha()).toBeGreaterThanOrEqual(0);
            expect(loop.getRenderAlpha()).toBeLessThan(1);
        });

        it('should keep renderAlpha within [0, 1) even at the max-steps clamp boundary', () => {
            const loop = new GameLoop(10, vi.fn(), vi.fn());
            const p = loop as unknown as PrivateLoop;

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(10000); // huge pause – MAX_STEPS clamp leaves 0 leftover

            const alpha = loop.getRenderAlpha();

            expect(alpha).toBeGreaterThanOrEqual(0);
            expect(alpha).toBeLessThan(1);
        });

        it('should not produce a non-finite renderAlpha when updateInterval is corrupted to 0', () => {
            const loop = new GameLoop(10, vi.fn(), vi.fn());
            const p = loop as unknown as PrivateLoop & { updateInterval: number };

            p.updateInterval = 0;
            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(25);

            expect(Number.isFinite(loop.getRenderAlpha())).toBe(true);
        });
    });

    describe('stop', () => {
        it('should not throw when called before start', () => {
            const loop = new GameLoop(16.67, vi.fn(), vi.fn());

            expect(() => loop.stop()).not.toThrow();
        });
    });

    describe('start', () => {
        beforeEach(() => {
            vi.stubGlobal('requestAnimationFrame', vi.fn());
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('should call requestAnimationFrame when started', () => {
            const loop = new GameLoop(16.67, vi.fn(), vi.fn());

            loop.start();

            expect(requestAnimationFrame).toHaveBeenCalledOnce();
        });

        it('should not call requestAnimationFrame again if already running', () => {
            const loop = new GameLoop(16.67, vi.fn(), vi.fn());

            loop.start();

            const callsBefore = (requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;

            loop.start();

            expect((requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
        });
    });

    describe('start (RAF flush)', () => {
        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('sets lastUpdateTime after flushing nested RAF callbacks', () => {
            const rafCallbacks: Array<(time?: number) => void> = [];

            vi.stubGlobal(
                'requestAnimationFrame',
                vi.fn((cb: (time?: number) => void) => {
                    rafCallbacks.push(cb);

                    return rafCallbacks.length;
                }),
            );

            const loop = new GameLoop(16.67, vi.fn(), vi.fn());
            const p = loop as unknown as { lastUpdateTime: number };

            loop.start();

            // Execute outer RAF callback.
            rafCallbacks[0]?.();

            // Execute inner RAF callback – sets lastUpdateTime and schedules first tick.
            rafCallbacks[1]?.();

            expect(p.lastUpdateTime).toBeGreaterThan(0);
            expect(rafCallbacks).toHaveLength(3);
        });

        it('schedules every frame with the same bound tick callback reference used from start() through tick()', () => {
            const rafCallbacks: Array<(time?: number) => void> = [];

            vi.stubGlobal(
                'requestAnimationFrame',
                vi.fn((cb: (time?: number) => void) => {
                    rafCallbacks.push(cb);

                    return rafCallbacks.length;
                }),
            );

            const loop = new GameLoop(16.67, vi.fn(), vi.fn());

            loop.start();
            rafCallbacks[0]?.(); // outer start() rAF
            rafCallbacks[1]?.(); // inner start() rAF – schedules the first tick

            const firstTickCallback = rafCallbacks[2];

            firstTickCallback?.(10); // run the first tick – schedules the next one
            const secondTickCallback = rafCallbacks[3];

            expect(firstTickCallback).toBeDefined();
            expect(firstTickCallback).toBe(secondTickCallback);
        });
    });

    describe('tick (via type cast)', () => {
        type PrivateLoop = {
            tick: (currentTime: number) => void;
            isRunning: boolean;
            lastUpdateTime: number;
            accumulator: number;
        };

        beforeEach(() => {
            vi.stubGlobal('requestAnimationFrame', vi.fn());
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('should do nothing when isRunning is false', () => {
            const onUpdate = vi.fn();
            const onRender = vi.fn();
            const loop = new GameLoop(16.67, onUpdate, onRender);

            (loop as unknown as PrivateLoop).tick(100);

            expect(onUpdate).not.toHaveBeenCalled();
            expect(onRender).not.toHaveBeenCalled();
        });

        it('should call onUpdate and onRender when running', () => {
            const onUpdate = vi.fn();
            const onRender = vi.fn();
            const loop = new GameLoop(10, onUpdate, onRender);
            const p = loop as unknown as PrivateLoop;

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(20); // 20ms delta at 10ms interval = 2 update steps

            expect(onUpdate).toHaveBeenCalledTimes(2);
            expect(onRender).toHaveBeenCalledOnce();
        });

        it('should clamp accumulator to prevent spiral-of-death', () => {
            const onUpdate = vi.fn();
            const loop = new GameLoop(10, onUpdate, vi.fn());
            const p = loop as unknown as PrivateLoop;

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(10000); // huge pause – MAX_STEPS = 8 caps at 8 updates

            expect(onUpdate).toHaveBeenCalledTimes(8);
        });

        it('should call onRender exactly once per frame regardless of update step count', () => {
            const onRender = vi.fn();
            const loop = new GameLoop(10, vi.fn(), onRender);
            const p = loop as unknown as PrivateLoop;

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(10000); // many steps, but one render

            expect(onRender).toHaveBeenCalledOnce();
        });

        it('should increment tick count by the number of update steps', () => {
            const loop = new GameLoop(10, vi.fn(), vi.fn());
            const p = loop as unknown as PrivateLoop;

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(30); // 30ms at 10ms interval = 3 steps

            expect(loop.getTicks()).toBe(3);
        });

        it('should schedule the next frame via requestAnimationFrame', () => {
            const loop = new GameLoop(10, vi.fn(), vi.fn());
            const p = loop as unknown as PrivateLoop;

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(10);

            expect(requestAnimationFrame).toHaveBeenCalled();
        });

        it('should reuse the same bound callback reference across every scheduled frame', () => {
            const loop = new GameLoop(10, vi.fn(), vi.fn());
            const p = loop as unknown as PrivateLoop;

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(10);
            p.tick(20);
            p.tick(30);

            const raf = requestAnimationFrame as ReturnType<typeof vi.fn>;
            const callbacks = raf.mock.calls.map((call) => call[0]);

            expect(callbacks).toHaveLength(3);
            expect(callbacks[0]).toBe(callbacks[1]);
            expect(callbacks[1]).toBe(callbacks[2]);
        });
    });

    describe('frame-drop detection', () => {
        type PrivateLoop = {
            tick: (currentTime: number) => void;
            isRunning: boolean;
            lastUpdateTime: number;
            accumulator: number;
            recentDeltas: number[];
            deltaHead: number;
            deltaCount: number;
        };

        /**
         * Pre-populates the ring-buffer baseline so that the next tick is
         * evaluated against an established baseline rather than skipped during
         * warm-up. Caller is responsible for passing a `count` no greater than
         * the configured `BASELINE_WINDOW` (60); all current callers use 16.
         */
        const primeBaseline = (loop: GameLoop, sampleMs: number, count: number = 16): void => {
            const p = loop as unknown as PrivateLoop;

            for (let i = 0; i < count; i++) {
                // eslint-disable-next-line security/detect-object-injection -- test helper, index is a bounded loop counter
                p.recentDeltas[i] = sampleMs;
            }

            p.deltaHead = count;
            p.deltaCount = count;
        };

        beforeEach(() => {
            vi.stubGlobal('requestAnimationFrame', vi.fn());
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('should not invoke the callback when delta is within the baseline', () => {
            const onFrameDrop = vi.fn();
            const loop = new GameLoop(16.67, vi.fn(), vi.fn(), onFrameDrop);
            const p = loop as unknown as PrivateLoop;

            primeBaseline(loop, 16.67);

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(16.67); // exactly one baseline interval

            expect(onFrameDrop).not.toHaveBeenCalled();
        });

        it('should not invoke the callback when delta is just under the 1.5x threshold', () => {
            const onFrameDrop = vi.fn();
            const loop = new GameLoop(16.67, vi.fn(), vi.fn(), onFrameDrop);
            const p = loop as unknown as PrivateLoop;

            primeBaseline(loop, 16.67);

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(16.67 * 1.49);

            expect(onFrameDrop).not.toHaveBeenCalled();
        });

        it('should invoke the callback when delta exceeds 1.5x the baseline', () => {
            const onFrameDrop = vi.fn();
            const loop = new GameLoop(16.67, vi.fn(), vi.fn(), onFrameDrop);
            const p = loop as unknown as PrivateLoop;

            primeBaseline(loop, 16.67);

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(50); // ~3 baseline intervals

            expect(onFrameDrop).toHaveBeenCalledOnce();

            const event = onFrameDrop.mock.calls[0]?.[0] as FrameDropEvent;

            expect(event.droppedFrames).toBe(2); // round(50 / 16.67) – 1 = 2
            expect(event.deltaTime).toBe(50);
            expect(event.expectedInterval).toBeCloseTo(16.67);
        });

        it('should report at least one dropped frame even when the gap is just past the threshold', () => {
            const onFrameDrop = vi.fn();
            const loop = new GameLoop(10, vi.fn(), vi.fn(), onFrameDrop);
            const p = loop as unknown as PrivateLoop;

            primeBaseline(loop, 10);

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(16); // 1.6x baseline – between 1 and 2 in raw frame terms

            expect(onFrameDrop).toHaveBeenCalledOnce();

            const event = onFrameDrop.mock.calls[0]?.[0] as FrameDropEvent;

            expect(event.droppedFrames).toBeGreaterThanOrEqual(1);
        });

        it('should auto-calibrate the baseline to the actual rAF cadence', () => {
            // Configured for 60 FPS but the browser fires rAF at 120 Hz
            // (common on a 120 Hz display in Firefox / Chrome with vsync at
            // the native rate). A missed vsync (~16.67 ms) at 120 Hz would
            // sit far below 1.5x of the configured 16.67 ms updateInterval
            // and would not be reported in a naive implementation.
            const onFrameDrop = vi.fn();
            const loop = new GameLoop(16.67, vi.fn(), vi.fn(), onFrameDrop);
            const p = loop as unknown as PrivateLoop;

            primeBaseline(loop, 8.33); // 120 Hz cadence

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(16.67); // one missed vsync at 120 Hz

            expect(onFrameDrop).toHaveBeenCalledOnce();

            const event = onFrameDrop.mock.calls[0]?.[0] as FrameDropEvent;

            expect(event.expectedInterval).toBeCloseTo(8.33);
            expect(event.droppedFrames).toBe(1);
        });

        it('should detect drops on a 144 Hz display even with a low targetFPS', () => {
            // Worst-case mismatch: updateInterval = 33.33 ms (targetFPS = 30)
            // but rAF fires at 144 Hz (~6.94 ms). A single missed vsync of
            // ~13.88 ms is less than half the configured updateInterval but
            // is still a real visible stutter, and must be reported.
            const onFrameDrop = vi.fn();
            const loop = new GameLoop(33.33, vi.fn(), vi.fn(), onFrameDrop);
            const p = loop as unknown as PrivateLoop;

            primeBaseline(loop, 6.94); // 144 Hz cadence

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(13.88); // one missed vsync at 144 Hz

            expect(onFrameDrop).toHaveBeenCalledOnce();

            const event = onFrameDrop.mock.calls[0]?.[0] as FrameDropEvent;

            expect(event.expectedInterval).toBeCloseTo(6.94);
            expect(event.droppedFrames).toBe(1);
            expect(event.deltaTime).toBe(13.88);
        });

        it('should skip detection during the warm-up window', () => {
            const onFrameDrop = vi.fn();
            const loop = new GameLoop(16.67, vi.fn(), vi.fn(), onFrameDrop);
            const p = loop as unknown as PrivateLoop;

            // No priming: rolling window is empty. Even a huge gap should not
            // fire because the baseline has not been established.
            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(100);

            expect(onFrameDrop).not.toHaveBeenCalled();
        });

        it('should suppress the callback when the gap looks like a backgrounded tab', () => {
            const onFrameDrop = vi.fn();
            const loop = new GameLoop(16.67, vi.fn(), vi.fn(), onFrameDrop);
            const p = loop as unknown as PrivateLoop;

            primeBaseline(loop, 16.67);

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(5000); // 5 seconds, clearly a tab switch or pause

            expect(onFrameDrop).not.toHaveBeenCalled();
        });

        it('should not pollute the baseline with backgrounded gaps', () => {
            const onFrameDrop = vi.fn();
            const loop = new GameLoop(16.67, vi.fn(), vi.fn(), onFrameDrop);
            const p = loop as unknown as PrivateLoop;

            primeBaseline(loop, 16.67);

            const countBefore = p.deltaCount;
            const headBefore = p.deltaHead;

            p.isRunning = true;
            p.lastUpdateTime = 0;
            p.tick(5000); // backgrounded gap

            expect(p.deltaCount).toBe(countBefore);
            expect(p.deltaHead).toBe(headBefore);
        });

        it('should be a no-op when no callback is provided', () => {
            const loop = new GameLoop(16.67, vi.fn(), vi.fn());
            const p = loop as unknown as PrivateLoop;

            p.isRunning = true;
            p.lastUpdateTime = 0;

            expect(() => p.tick(100)).not.toThrow();
        });
    });

    describe('frame-drop detection – incremental baseline matches full rescan', () => {
        type PrivateDetector = {
            detectFrameDrop: (deltaTime: number) => void;
        };

        const BASELINE_WINDOW = 60;
        const WARMUP_SAMPLES = 8;
        const BACKGROUND_THRESHOLD_MS = 1000;
        const DROP_THRESHOLD_MULTIPLIER = 1.5;

        /**
         * Reference re-implementation of the pre-optimization O(window) full
         * rescan baseline algorithm (identical ring-buffer write, warm-up
         * gating, and threshold semantics), used to generate the expected
         * event sequence for comparison against the production incremental
         * tracker in {@link GameLoop.detectFrameDrop}.
         */
        function referenceEvents(deltas: number[]): FrameDropEvent[] {
            const ring = new Array<number>(BASELINE_WINDOW).fill(0);
            let head = 0;
            let count = 0;
            const events: FrameDropEvent[] = [];

            for (const deltaTime of deltas) {
                if (deltaTime >= BACKGROUND_THRESHOLD_MS) {
                    continue;
                }

                // eslint-disable-next-line security/detect-object-injection -- reference impl, index is a bounded ring-buffer head
                ring[head] = deltaTime;
                head = (head + 1) % BASELINE_WINDOW;

                if (count < BASELINE_WINDOW) {
                    count++;
                }

                if (count < WARMUP_SAMPLES) {
                    continue;
                }

                let baseline = Number.POSITIVE_INFINITY;
                let seen = 0;

                for (const sample of ring) {
                    if (seen >= count) {
                        break;
                    }

                    if (sample < baseline) {
                        baseline = sample;
                    }

                    seen++;
                }

                if (deltaTime <= baseline * DROP_THRESHOLD_MULTIPLIER) {
                    continue;
                }

                events.push({
                    droppedFrames: Math.max(1, Math.round(deltaTime / baseline) - 1),
                    deltaTime,
                    expectedInterval: baseline,
                });
            }

            return events;
        }

        it('produces identical FrameDropEvents to a full-rescan reference over a mixed 60/120Hz scripted sequence', () => {
            const deltas: number[] = [
                ...(Array(20).fill(16.67) as number[]), // 60Hz warm-up
                ...(Array(30).fill(8.33) as number[]), // switch to 120Hz cadence
                20, // drop relative to the 8.33 baseline
                ...(Array(40).fill(8.33) as number[]), // continue at 120Hz, wraps the ring buffer, evicts old 60Hz + drop samples
                5000, // background pause – excluded from ring and reporting
                50, // drop relative to the 8.33 baseline, right after the pause
                ...(Array(70).fill(16.67) as number[]), // back to 60Hz for long enough to evict all 8.33 samples
                35, // drop relative to the re-established 16.67 baseline
            ];

            const expected = referenceEvents(deltas);

            const onFrameDrop = vi.fn();
            const loop = new GameLoop(16.67, vi.fn(), vi.fn(), onFrameDrop);
            const p = loop as unknown as PrivateDetector;

            for (const deltaTime of deltas) {
                p.detectFrameDrop(deltaTime);
            }

            const actual = onFrameDrop.mock.calls.map((call) => call[0] as FrameDropEvent);

            expect(expected.length).toBeGreaterThan(0);
            expect(actual).toEqual(expected);
        });
    });
});
