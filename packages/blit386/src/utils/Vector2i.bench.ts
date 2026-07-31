import { bench, describe } from 'vitest';

import { Vector2i } from './Vector2i';

const BASE_X = 17;
const BASE_Y = 23;
const OTHER_X = 5;
const OTHER_Y = 11;
const FLOAT_X = 17.75;
const FLOAT_Y = 23.25;
const MUL_SCALAR = 3;
const DIV_SCALAR = 2;
const LERP_T = 0.35;
const BENCH_OPTIONS = {
    iterations: 500,
    time: 100,
    warmupTime: 25,
    warmupIterations: 50,
};

/**
 * Restores a mutable vector to a known baseline before in-place benchmarks.
 *
 * @param vector - Vector to reset.
 * @param x - X component to assign.
 * @param y - Y component to assign.
 */
function resetVector(vector: Vector2i, x: number, y: number): void {
    vector.x = x;
    vector.y = y;
}

describe('Vector2i creation and copy benchmarks', () => {
    const source = Vector2i.fromXYUnchecked(BASE_X, BASE_Y);
    const out = new Vector2i();

    bench(
        'new Vector2i()',
        () => {
            new Vector2i();
        },
        BENCH_OPTIONS,
    );

    bench(
        'fromXYUnchecked()',
        () => {
            Vector2i.fromXYUnchecked(BASE_X, BASE_Y);
        },
        BENCH_OPTIONS,
    );

    bench(
        'fromFloat()',
        () => {
            Vector2i.fromFloat(FLOAT_X, FLOAT_Y);
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
        'cloneTo()',
        () => {
            source.cloneTo(out);
        },
        BENCH_OPTIONS,
    );
});

describe('Vector2i addition benchmarks', () => {
    const left = Vector2i.fromXYUnchecked(BASE_X, BASE_Y);
    const right = Vector2i.fromXYUnchecked(OTHER_X, OTHER_Y);
    const mutable = Vector2i.fromXYUnchecked(BASE_X, BASE_Y);
    const out = new Vector2i();

    bench(
        'add()',
        () => {
            left.add(right);
        },
        BENCH_OPTIONS,
    );

    bench(
        'addXY()',
        () => {
            left.addXY(OTHER_X, OTHER_Y);
        },
        BENCH_OPTIONS,
    );

    bench(
        'addInPlace()',
        () => {
            resetVector(mutable, BASE_X, BASE_Y);
            mutable.addInPlace(right);
        },
        BENCH_OPTIONS,
    );

    bench(
        'addTo()',
        () => {
            left.addTo(right, out);
        },
        BENCH_OPTIONS,
    );
});

describe('Vector2i subtraction benchmarks', () => {
    const left = Vector2i.fromXYUnchecked(BASE_X, BASE_Y);
    const right = Vector2i.fromXYUnchecked(OTHER_X, OTHER_Y);
    const mutable = Vector2i.fromXYUnchecked(BASE_X, BASE_Y);
    const out = new Vector2i();

    bench(
        'sub()',
        () => {
            left.sub(right);
        },
        BENCH_OPTIONS,
    );

    bench(
        'subInPlace()',
        () => {
            resetVector(mutable, BASE_X, BASE_Y);
            mutable.subInPlace(right);
        },
        BENCH_OPTIONS,
    );

    bench(
        'subTo()',
        () => {
            left.subTo(right, out);
        },
        BENCH_OPTIONS,
    );
});

describe('Vector2i multiplication and division benchmarks', () => {
    const vector = Vector2i.fromXYUnchecked(BASE_X, BASE_Y);
    const mutable = Vector2i.fromXYUnchecked(BASE_X, BASE_Y);
    const out = new Vector2i();

    bench(
        'mul()',
        () => {
            vector.mul(MUL_SCALAR);
        },
        BENCH_OPTIONS,
    );

    bench(
        'div()',
        () => {
            vector.div(DIV_SCALAR);
        },
        BENCH_OPTIONS,
    );

    bench(
        'mulInPlace()',
        () => {
            resetVector(mutable, BASE_X, BASE_Y);
            mutable.mulInPlace(MUL_SCALAR);
        },
        BENCH_OPTIONS,
    );

    bench(
        'mulTo()',
        () => {
            vector.mulTo(MUL_SCALAR, out);
        },
        BENCH_OPTIONS,
    );
});

describe('Vector2i distance benchmarks', () => {
    const start = Vector2i.fromXYUnchecked(BASE_X, BASE_Y);
    const target = Vector2i.fromXYUnchecked(120, -48);

    bench(
        'distanceTo()',
        () => {
            start.distanceTo(target);
        },
        BENCH_OPTIONS,
    );

    bench(
        'distanceToXY()',
        () => {
            start.distanceToXY(120, -48);
        },
        BENCH_OPTIONS,
    );

    bench(
        'sqrDistanceTo()',
        () => {
            start.sqrDistanceTo(target);
        },
        BENCH_OPTIONS,
    );

    bench(
        'manhattanDistanceTo()',
        () => {
            start.manhattanDistanceTo(target);
        },
        BENCH_OPTIONS,
    );

    bench(
        'chebyshevDistanceTo()',
        () => {
            start.chebyshevDistanceTo(target);
        },
        BENCH_OPTIONS,
    );
});

describe('Vector2i static method benchmarks', () => {
    const start = Vector2i.fromXYUnchecked(BASE_X, BASE_Y);
    const end = Vector2i.fromXYUnchecked(120, -48);
    const out = new Vector2i();

    bench(
        'Vector2i.lerp()',
        () => {
            Vector2i.lerp(start, end, LERP_T);
        },
        BENCH_OPTIONS,
    );

    bench(
        'Vector2i.lerpTo()',
        () => {
            Vector2i.lerpTo(start, end, LERP_T, out);
        },
        BENCH_OPTIONS,
    );

    bench(
        'Vector2i.distance()',
        () => {
            Vector2i.distance(start, end);
        },
        BENCH_OPTIONS,
    );

    bench(
        'Vector2i.sqrDistance()',
        () => {
            Vector2i.sqrDistance(start, end);
        },
        BENCH_OPTIONS,
    );
});

describe('Vector2i comparison benchmarks', () => {
    const left = Vector2i.fromXYUnchecked(BASE_X, BASE_Y);
    const equal = Vector2i.fromXYUnchecked(BASE_X, BASE_Y);
    const zero = new Vector2i();

    bench(
        'isEqual()',
        () => {
            left.isEqual(equal);
        },
        BENCH_OPTIONS,
    );

    bench(
        'isEqualXY()',
        () => {
            left.isEqualXY(BASE_X, BASE_Y);
        },
        BENCH_OPTIONS,
    );

    bench(
        'isZero()',
        () => {
            zero.isZero();
        },
        BENCH_OPTIONS,
    );
});
