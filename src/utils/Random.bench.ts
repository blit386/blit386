import { bench, describe } from 'vitest';

import { Random } from './Random';
import { Rect2i } from './Rect2i';
import { Vector2i } from './Vector2i';

const SEED = 12345;
const PICK_ITEMS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const BENCH_RECT = new Rect2i(0, 0, 64, 64);
const BENCH_OUT = new Vector2i();
const BENCH_OPTIONS = {
    iterations: 500,
    time: 100,
    warmupTime: 25,
    warmupIterations: 50,
};

describe('Random hot-path benchmarks', () => {
    const rng = new Random(SEED);

    bench(
        'next()',
        () => {
            rng.next();
        },
        BENCH_OPTIONS,
    );

    bench(
        'int(100)',
        () => {
            rng.int(100);
        },
        BENCH_OPTIONS,
    );

    bench(
        'int(10, 90)',
        () => {
            rng.int(10, 90);
        },
        BENCH_OPTIONS,
    );

    bench(
        'float(0, 1)',
        () => {
            rng.float(0, 1);
        },
        BENCH_OPTIONS,
    );

    bench(
        'pick(10)',
        () => {
            rng.pick(PICK_ITEMS);
        },
        BENCH_OPTIONS,
    );

    bench(
        'bool()',
        () => {
            rng.bool();
        },
        BENCH_OPTIONS,
    );

    bench(
        'insideRectTo(64x64)',
        () => {
            rng.insideRectTo(BENCH_RECT, BENCH_OUT);
        },
        BENCH_OPTIONS,
    );

    bench(
        'direction4()',
        () => {
            rng.direction4();
        },
        BENCH_OPTIONS,
    );
});
