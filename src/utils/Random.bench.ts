import { bench, describe } from 'vitest';

import { Random } from './Random';

const SEED = 12345;
const PICK_ITEMS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
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
});
