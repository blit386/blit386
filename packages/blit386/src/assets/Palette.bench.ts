import { bench, describe } from 'vitest';

import { Color32 } from '../utils/Color32';
import { MAX_PALETTE_SIZE, Palette } from './Palette';

const BENCH_OPTIONS = {
    iterations: 200,
    time: 100,
    warmupTime: 25,
    warmupIterations: 25,
};

/**
 * Builds a fully-populated 256-entry palette for benchmark fixtures.
 *
 * @returns Palette with a distinct opaque color written into every non-transparent slot.
 */
function makeBenchPalette(): Palette {
    const palette = new Palette(MAX_PALETTE_SIZE);

    for (let i = 1; i < MAX_PALETTE_SIZE; i++) {
        palette.set(i, Color32.fromRGBAUnchecked(i & 0xff, (i * 3) & 0xff, (i * 7) & 0xff, 255));
    }

    palette.clearDirty();

    return palette;
}

describe('Palette color lookup benchmarks', () => {
    const palette = makeBenchPalette();

    bench(
        'get() x256',
        () => {
            for (let i = 0; i < MAX_PALETTE_SIZE; i++) {
                palette.get(i);
            }
        },
        BENCH_OPTIONS,
    );

    bench(
        'getRef() x256',
        () => {
            for (let i = 0; i < MAX_PALETTE_SIZE; i++) {
                palette.getRef(i);
            }
        },
        BENCH_OPTIONS,
    );
});

describe('Palette.toFloat32ArrayInto GPU staging benchmarks', () => {
    const palette = makeBenchPalette();
    const target = new Float32Array(MAX_PALETTE_SIZE * 4);

    bench(
        '256-color palette (dirty each frame)',
        () => {
            // Mirrors a real per-frame palette animation: one slot is rewritten (marking the palette dirty,
            // as `set()` does) before the renderer performs its GPU uniform-buffer upload.
            palette.set(1, palette.getRef(1));
            palette.toFloat32ArrayInto(target);
        },
        BENCH_OPTIONS,
    );
});
