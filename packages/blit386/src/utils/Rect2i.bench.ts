import { bench, describe } from 'vitest';

import { Rect2i } from './Rect2i';
import { Vector2i } from './Vector2i';

const BASE_X = 10;
const BASE_Y = 20;
const BASE_WIDTH = 64;
const BASE_HEIGHT = 48;
const propertyAccessSink = { value: 0 };
const BENCH_OPTIONS = {
    iterations: 500,
    time: 100,
    warmupTime: 25,
    warmupIterations: 50,
};

describe('Rect2i creation benchmarks', () => {
    const source = Rect2i.fromValuesUnchecked(BASE_X, BASE_Y, BASE_WIDTH, BASE_HEIGHT);
    const mutable = new Rect2i();

    bench(
        'new Rect2i()',
        () => {
            new Rect2i(BASE_X, BASE_Y, BASE_WIDTH, BASE_HEIGHT);
        },
        BENCH_OPTIONS,
    );

    bench(
        'clone()',
        () => {
            source.clone();
        },
        BENCH_OPTIONS,
    );

    bench(
        'set()',
        () => {
            mutable.set(BASE_X, BASE_Y, BASE_WIDTH, BASE_HEIGHT);
        },
        BENCH_OPTIONS,
    );
});

describe('Rect2i collision benchmarks', () => {
    const rect = Rect2i.fromValuesUnchecked(BASE_X, BASE_Y, BASE_WIDTH, BASE_HEIGHT);
    const point = Vector2i.fromXYUnchecked(24, 32);
    const overlapping = Rect2i.fromValuesUnchecked(30, 36, 20, 18);

    bench(
        'isContaining(Vector2i)',
        () => {
            rect.isContaining(point);
        },
        BENCH_OPTIONS,
    );

    bench(
        'isContainingXY()',
        () => {
            rect.isContainingXY(24, 32);
        },
        BENCH_OPTIONS,
    );

    bench(
        'isIntersecting(Rect2i)',
        () => {
            rect.isIntersecting(overlapping);
        },
        BENCH_OPTIONS,
    );
});

describe('Rect2i intersection benchmarks', () => {
    const rect = Rect2i.fromValuesUnchecked(BASE_X, BASE_Y, BASE_WIDTH, BASE_HEIGHT);
    const overlapping = Rect2i.fromValuesUnchecked(30, 36, 20, 18);

    bench(
        'intersection()',
        () => {
            rect.intersection(overlapping);
        },
        BENCH_OPTIONS,
    );
});

describe('Rect2i property access benchmarks', () => {
    const rect = Rect2i.fromValuesUnchecked(BASE_X, BASE_Y, BASE_WIDTH, BASE_HEIGHT);

    bench(
        'property access x/y/width/height',
        () => {
            propertyAccessSink.value = rect.x + rect.y + rect.width + rect.height;
        },
        BENCH_OPTIONS,
    );
});
