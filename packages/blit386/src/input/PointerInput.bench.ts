// @vitest-environment happy-dom

/**
 * Tier 1 CPU benchmarks for {@link PointerInput}'s pointer-event hot path.
 *
 * `handleMove` (routed from a `pointermove` listener) is the highest-frequency entry point in this
 * class – a high-poll-rate mouse can fire it at 500–1000 Hz, well above the 60–144 Hz a frame
 * budget assumes. `updateSlotPosition` used to call `canvas.getBoundingClientRect()` on every one
 * of those events; this benchmark's realistic-burst case simulates a frame's worth of such events
 * to keep that per-event rect read from silently coming back.
 */

import { bench, describe, vi } from 'vitest';

import { Vector2i } from '../utils/Vector2i';
import { PointerInput } from './PointerInput';

const BENCH_OPTIONS = {
    iterations: 100,
    time: 100,
    warmupTime: 25,
    warmupIterations: 25,
};

const DISPLAY_SIZE = new Vector2i(320, 240);

/** Approximates one frame's worth of `pointermove` events from a high-poll-rate mouse at 60 fps. */
const MOVES_PER_FRAME = 16;

/**
 * Mounts a canvas with a stubbed `getBoundingClientRect` so the benchmark measures
 * `PointerInput`'s own coordinate-conversion cost, not real layout.
 *
 * @returns Canvas element attached to `document.body`.
 */
function createBenchCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');

    canvas.getBoundingClientRect = vi.fn(() => ({
        left: 10,
        top: 20,
        right: 650,
        bottom: 500,
        width: 640,
        height: 480,
        x: 10,
        y: 20,
        toJSON: () => ({}),
    })) as unknown as typeof canvas.getBoundingClientRect;

    document.body.appendChild(canvas);

    return canvas;
}

const canvas = createBenchCanvas();
const input = new PointerInput();

input.attach(canvas, DISPLAY_SIZE);

describe('PointerInput.handleMove burst', () => {
    let x = 0;

    bench(
        `${MOVES_PER_FRAME}x pointermove + 1x endFrame`,
        () => {
            for (let i = 0; i < MOVES_PER_FRAME; i++) {
                x = (x + 1) % 600;
                canvas.dispatchEvent(
                    new PointerEvent('pointermove', {
                        pointerId: 1,
                        pointerType: 'mouse',
                        clientX: x,
                        clientY: 100,
                        bubbles: true,
                        cancelable: true,
                    }),
                );
            }

            input.endFrame();
        },
        BENCH_OPTIONS,
    );
});

describe('PointerInput.getPos', () => {
    bench(
        'getPos(0)',
        () => {
            input.getPos(0);
        },
        BENCH_OPTIONS,
    );
});
