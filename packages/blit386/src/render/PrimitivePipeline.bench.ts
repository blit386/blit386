import { bench, describe } from 'vitest';

import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { PrimitivePipeline } from './PrimitivePipeline';

const BENCH_OPTIONS = {
    iterations: 100,
    time: 100,
    warmupTime: 25,
    warmupIterations: 25,
};

/** Palette index used for all benchmark draws – value is not itself relevant. */
const PALETTE_INDEX = 3;

/** Diagonal line endpoints – a full-height 320x240 display diagonal (Bresenham worst case). */
const LINE_START = new Vector2i(0, 0);
const LINE_END = new Vector2i(319, 239);

/**
 * Fills a pipeline's batch with a fixed number of filled rectangles.
 * Shared by the fill-throughput benches and the reset() setup below.
 *
 * @param pipeline – Pipeline instance to fill.
 * @param rect – Reused rect instance passed to `drawRectFill()`.
 * @param count – Number of rectangles to draw.
 */
function fillWithRects(pipeline: PrimitivePipeline, rect: Rect2i, count: number): void {
    for (let i = 0; i < count; i++) {
        pipeline.drawRectFill(rect, PALETTE_INDEX);
    }
}

const pipeline = new PrimitivePipeline();
const rect = new Rect2i(10, 10, 4, 4);

describe('PrimitivePipeline vertex batch filling', () => {
    bench(
        'drawRectFill x 5000',
        () => {
            pipeline.reset();
            fillWithRects(pipeline, rect, 5000);
        },
        BENCH_OPTIONS,
    );

    bench(
        'drawPixelXY x 10000',
        () => {
            pipeline.reset();

            // Each pixel emits a 6-vertex quad, so 10,000 pixels (60,000 vertices) exceed the
            // pipeline's 50,000-vertex per-frame capacity – reset partway through so the batch
            // stays within capacity instead of silently dropping vertices near the end.
            for (let i = 0; i < 10000; i++) {
                if (i === 8000) {
                    pipeline.reset();
                }

                pipeline.drawPixelXY(i & 0xff, (i >> 8) & 0xff, PALETTE_INDEX);
            }
        },
        BENCH_OPTIONS,
    );

    bench(
        'drawLine diagonal (Bresenham) x 100',
        () => {
            // Each 320px diagonal line emits ~1,920 vertices (6 per pixel), so the batch is
            // reset between calls rather than accumulated – accumulating 100 of them would
            // exceed the pipeline's per-frame vertex capacity and start dropping vertices.
            for (let i = 0; i < 100; i++) {
                pipeline.reset();
                pipeline.drawLine(LINE_START, LINE_END, PALETTE_INDEX);
            }
        },
        BENCH_OPTIONS,
    );

    bench(
        'reset() after full batch',
        () => {
            // Populate a realistically full batch before measuring the reset cost itself –
            // reset() empties the batch, so each iteration needs fresh contents beforehand.
            fillWithRects(pipeline, rect, 5000);
            pipeline.reset();
        },
        BENCH_OPTIONS,
    );
});
