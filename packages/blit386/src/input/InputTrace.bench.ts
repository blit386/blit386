// @vitest-environment happy-dom

/**
 * Tier 1 CPU benchmarks for {@link InputTrace}.
 *
 * Each case runs one fixed update plus one rendered frame of input rollover, the work `BTAPI`'s
 * game loop does every frame. "trace off" adds only the `isRecording` check `BTAPI` makes, and
 * must stay level with "no trace": input runs every frame, and the trace is meant to cost nothing
 * until someone starts it. "trace on" is the reference for what recording costs.
 *
 * Whichever case runs second takes one ~10 ms pause and reads about 20% slower on `hz`, even with the
 * two swapped; compare `p75` / `p99`, which stay level.
 */

import { bench, describe, vi } from 'vitest';

import { Vector2i } from '../utils/Vector2i';
import { GamepadInput } from './GamepadInput';
import { InputTrace } from './InputTrace';
import { KeyboardInput } from './KeyboardInput';
import { PointerInput } from './PointerInput';

const BENCH_OPTIONS = {
    iterations: 200,
    time: 100,
    warmupTime: 25,
    warmupIterations: 25,
};

Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { getGamepads: vi.fn(() => [null, null, null, null]) },
});

const canvas = document.createElement('canvas');

document.body.appendChild(canvas);

const pointer = new PointerInput();
const keyboard = new KeyboardInput();
const gamepad = new GamepadInput();

pointer.attach(canvas, new Vector2i(320, 240));
keyboard.attach(canvas, { getTicks: () => 0 });
gamepad.attach();

const traceOff = new InputTrace();
const traceOn = new InputTrace();

/**
 * One update and one render of input rollover, recording through `trace` when given.
 *
 * @param trace - Trace to consult, or `null` for the no-trace baseline.
 */
function cycle(trace: InputTrace | null): void {
    if (trace?.isRecording) {
        trace.record('update', 1, pointer, keyboard, gamepad);
    }

    keyboard.endUpdate(1);
    gamepad.endUpdate(1);
    pointer.endUpdate();

    if (trace?.isRecording) {
        trace.record('render', 1, pointer, keyboard, gamepad);
    }

    pointer.endFrame();
    gamepad.endFrame(1);
}

describe('InputTrace per-frame cost', () => {
    bench(
        'no trace',
        () => {
            cycle(null);
        },
        BENCH_OPTIONS,
    );

    bench(
        'trace off',
        () => {
            cycle(traceOff);
        },
        BENCH_OPTIONS,
    );

    bench(
        'trace on',
        () => {
            if (!traceOn.isRecording) {
                traceOn.start();
            }

            cycle(traceOn);
        },
        BENCH_OPTIONS,
    );
});
