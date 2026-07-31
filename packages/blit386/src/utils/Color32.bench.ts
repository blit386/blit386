import { bench, describe } from 'vitest';

import { clampByte, Color32 } from './Color32';

const BASE_R = 64;
const BASE_G = 128;
const BASE_B = 192;
const BASE_A = 224;
const OTHER_R = 24;
const OTHER_G = 80;
const OTHER_B = 136;
const OTHER_A = 200;
const BENCH_OPTIONS = {
    iterations: 500,
    time: 100,
    warmupTime: 25,
    warmupIterations: 50,
};

/**
 * Restores a mutable color to a known baseline before in-place benchmarks.
 *
 * @param color - Color to reset.
 * @param r - Red channel.
 * @param g - Green channel.
 * @param b - Blue channel.
 * @param a - Alpha channel.
 */
function resetColor(color: Color32, r: number, g: number, b: number, a: number): void {
    color.r = r;
    color.g = g;
    color.b = b;
    color.a = a;
}

describe('Color32 creation benchmarks', () => {
    bench(
        'new Color32()',
        () => {
            new Color32(BASE_R, BASE_G, BASE_B, BASE_A);
        },
        BENCH_OPTIONS,
    );

    bench(
        'fromRGBAUnchecked()',
        () => {
            Color32.fromRGBAUnchecked(BASE_R, BASE_G, BASE_B, BASE_A);
        },
        BENCH_OPTIONS,
    );

    bench(
        'fromHex() #RGB',
        () => {
            Color32.fromHex('#abc');
        },
        BENCH_OPTIONS,
    );

    bench(
        'fromHex() #RRGGBB',
        () => {
            Color32.fromHex('#a1b2c3');
        },
        BENCH_OPTIONS,
    );

    bench(
        'fromHex() #RRGGBBAA',
        () => {
            Color32.fromHex('#a1b2c3d4');
        },
        BENCH_OPTIONS,
    );

    bench(
        'fromFloat()',
        () => {
            Color32.fromFloat(0.25, 0.5, 0.75, 0.875);
        },
        BENCH_OPTIONS,
    );

    bench(
        'fromHSL()',
        () => {
            Color32.fromHSL(210, 60, 45, BASE_A);
        },
        BENCH_OPTIONS,
    );

    bench(
        'fromUint32()',
        () => {
            Color32.fromUint32(0xe0c08040);
        },
        BENCH_OPTIONS,
    );
});

describe('Color32 conversion benchmarks', () => {
    const color = Color32.fromRGBAUnchecked(BASE_R, BASE_G, BASE_B, BASE_A);
    const out = new Float32Array(8);

    bench(
        'toFloat32Array()',
        () => {
            color.toFloat32Array();
        },
        BENCH_OPTIONS,
    );

    bench(
        'writeToFloat32Array()',
        () => {
            color.writeToFloat32Array(out, 0);
        },
        BENCH_OPTIONS,
    );

    bench(
        'toUint32()',
        () => {
            color.toUint32();
        },
        BENCH_OPTIONS,
    );

    bench(
        'toHex()',
        () => {
            color.toHex();
        },
        BENCH_OPTIONS,
    );

    bench(
        'toCSS()',
        () => {
            color.toCSS();
        },
        BENCH_OPTIONS,
    );
});

describe('Color32 blending benchmarks', () => {
    const left = Color32.fromRGBAUnchecked(BASE_R, BASE_G, BASE_B, BASE_A);
    const right = Color32.fromRGBAUnchecked(OTHER_R, OTHER_G, OTHER_B, OTHER_A);
    const mutable = Color32.fromRGBAUnchecked(BASE_R, BASE_G, BASE_B, BASE_A);

    bench(
        'lerp()',
        () => {
            left.lerp(right, 0.35);
        },
        BENCH_OPTIONS,
    );

    bench(
        'lerpInPlace()',
        () => {
            resetColor(mutable, BASE_R, BASE_G, BASE_B, BASE_A);
            mutable.lerpInPlace(right, 0.35);
        },
        BENCH_OPTIONS,
    );

    bench(
        'multiply()',
        () => {
            left.multiply(right);
        },
        BENCH_OPTIONS,
    );

    bench(
        'multiplyInPlace()',
        () => {
            resetColor(mutable, BASE_R, BASE_G, BASE_B, BASE_A);
            mutable.multiplyInPlace(right);
        },
        BENCH_OPTIONS,
    );

    bench(
        'add()',
        () => {
            left.add(right);
        },
        BENCH_OPTIONS,
    );

    bench(
        'addInPlace()',
        () => {
            resetColor(mutable, BASE_R, BASE_G, BASE_B, BASE_A);
            mutable.addInPlace(right);
        },
        BENCH_OPTIONS,
    );
});

describe('Color32 comparison benchmarks', () => {
    const left = Color32.fromRGBAUnchecked(BASE_R, BASE_G, BASE_B, BASE_A);
    const right = Color32.fromRGBAUnchecked(BASE_R, BASE_G, BASE_B, BASE_A);

    bench(
        'isEqual()',
        () => {
            left.isEqual(right);
        },
        BENCH_OPTIONS,
    );
});

describe('Color32 utility benchmarks', () => {
    const color = Color32.fromRGBAUnchecked(BASE_R, BASE_G, BASE_B, BASE_A);

    bench(
        'clampByte()',
        () => {
            clampByte(300.75);
        },
        BENCH_OPTIONS,
    );

    bench(
        'luminance',
        () => {
            Math.trunc(color.luminance);
        },
        BENCH_OPTIONS,
    );

    bench(
        'premultiplyAlpha()',
        () => {
            color.premultiplyAlpha();
        },
        BENCH_OPTIONS,
    );
});

describe('Color32 mutation benchmarks', () => {
    const mutable = new Color32();
    const source = Color32.fromRGBAUnchecked(BASE_R, BASE_G, BASE_B, BASE_A);

    bench(
        'setRGBA()',
        () => {
            mutable.setRGBA(BASE_R, BASE_G, BASE_B, BASE_A);
        },
        BENCH_OPTIONS,
    );

    bench(
        'setRGBAUnchecked()',
        () => {
            mutable.setRGBAUnchecked(BASE_R, BASE_G, BASE_B, BASE_A);
        },
        BENCH_OPTIONS,
    );

    bench(
        'copyFrom()',
        () => {
            mutable.copyFrom(source);
        },
        BENCH_OPTIONS,
    );
});
