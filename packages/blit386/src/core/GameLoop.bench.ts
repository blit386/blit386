/**
 * Benchmarks for {@link GameLoop}'s dropped-frame detection scan.
 *
 * `detectFrameDrop` is private and only reachable in production through the
 * rAF-driven `tick()` chain, so this file uses the same narrow type-cast
 * technique as `GameLoop.test.ts` to invoke it directly – see that file's
 * `frame-drop detection` describe block. Casting straight to the private
 * method (rather than driving it through `tick()`) keeps the measurement
 * limited to the O(60) min-scan itself, without `tick()`'s unrelated
 * accumulator/update/render bookkeeping mixed in.
 */

import { bench, describe } from 'vitest';

import type { FrameDropEvent } from './GameLoop';
import { GameLoop } from './GameLoop';

const BENCH_OPTIONS = {
    iterations: 200,
    time: 100,
    warmupTime: 25,
    warmupIterations: 25,
};

/** Steady-state 60 FPS frame time, in milliseconds. */
const FRAME_MS_60FPS = 16.67;

/** Narrow view onto {@link GameLoop}'s private detection entry point for benchmarking. */
type PrivateGameLoop = {
    detectFrameDrop: (deltaTime: number) => void;
};

/**
 * Creates a `GameLoop` with its 60-sample ring buffer already primed at a
 * steady 60 FPS cadence, ready for repeated `detectFrameDrop` calls that
 * each evict the oldest sample and re-scan the full window.
 *
 * @returns The primed loop, cast to expose the private detection method.
 */
function makePrimedLoop(): PrivateGameLoop {
    const loop = new GameLoop(
        FRAME_MS_60FPS,
        () => {},
        () => {},
        (_event: FrameDropEvent) => {},
    );
    const p = loop as unknown as PrivateGameLoop;

    // Prime the 60-sample ring buffer (BASELINE_WINDOW) so every benchmarked
    // call scans a full, steady-state window rather than an initial warm-up.
    for (let i = 0; i < 60; i++) {
        p.detectFrameDrop(FRAME_MS_60FPS);
    }

    return p;
}

describe('GameLoop frame-drop detection (steady state)', () => {
    const primed = makePrimedLoop();

    bench(
        'detectFrameDrop() – full 60-sample ring buffer, no drop',
        () => {
            primed.detectFrameDrop(FRAME_MS_60FPS);
        },
        BENCH_OPTIONS,
    );
});
