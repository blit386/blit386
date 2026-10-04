// @vitest-environment happy-dom

/**
 * CPU benchmarks for {@link KeyboardInput}'s per-tick any-key queries.
 *
 * `isAnyKeyDown`, `isAnyKeyPressed`, and `isAnyKeyReleased` run every `update()`, so they must stay a size check
 * and a short loop over the held set - no array copies. The held set below is a realistic few-keys-down state;
 * this benchmark is what regresses if a query starts allocating per call.
 */

import { bench, describe } from 'vitest';

import { KeyboardInput } from './KeyboardInput';

const BENCH_OPTIONS = {
    iterations: 200,
    time: 100,
    warmupTime: 25,
    warmupIterations: 25,
};

/** Keys held while the benchmark runs: a typical movement-plus-action chord. */
const HELD_KEYS = ['KeyW', 'KeyD', 'Space'];

const canvas = document.createElement('canvas');
const input = new KeyboardInput();

document.body.appendChild(canvas);
input.attach(canvas, { getTicks: () => 0 });

for (const code of HELD_KEYS) {
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
}

// Roll the press edges into the previous-tick snapshot so the queries measure the steady held state.
input.endUpdate(0);

describe('KeyboardInput any-key queries', () => {
    bench(
        'isAnyKeyDown + isAnyKeyPressed (with repeat) + isAnyKeyReleased',
        () => {
            input.isAnyKeyDown();
            input.isAnyKeyPressed(10, 100);
            input.isAnyKeyReleased();
        },
        BENCH_OPTIONS,
    );
});
