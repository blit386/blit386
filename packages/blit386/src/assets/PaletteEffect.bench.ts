import { bench, describe } from 'vitest';

import { Color32 } from '../utils/Color32';
import { Palette } from './Palette';
import { CycleEffect, FadeEffect, PaletteEffectManager, paletteSwap } from './PaletteEffect';

const BENCH_OPTIONS = {
    iterations: 500,
    time: 100,
    warmupTime: 25,
    warmupIterations: 50,
};

const PALETTE_SIZE = 256;

/**
 * Creates a palette with distinct colors for benchmarking.
 *
 * @returns A 256-entry palette with unique color values.
 */
function makePalette(): Palette {
    const p = new Palette(PALETTE_SIZE);

    for (let i = 1; i < PALETTE_SIZE; i++) {
        p.set(i, new Color32(i, (i * 7) % 256, (i * 13) % 256));
    }

    return p;
}

/**
 * Creates a deterministic time provider for benchmarks.
 *
 * @returns Object with `now()` clock and `advance(ms)` control.
 */
function makeTimeClock(): { now: () => number; advance: (ms: number) => void } {
    let t = 0;

    return {
        now: () => t,
        advance: (ms: number) => {
            t += ms;
        },
    };
}

describe('CycleEffect benchmarks', () => {
    const palette = makePalette();
    const effect = new CycleEffect(1, 31, 60);

    bench(
        'update() 32-entry range',
        () => {
            effect.update(palette, 16.67);
        },
        BENCH_OPTIONS,
    );
});

describe('CycleEffect large range benchmarks', () => {
    const palette = makePalette();
    const effect = new CycleEffect(1, 255, 60);

    bench(
        'update() 255-entry range',
        () => {
            effect.update(palette, 16.67);
        },
        BENCH_OPTIONS,
    );
});

describe('FadeEffect benchmarks', () => {
    const source = makePalette();
    const target = makePalette();

    // Make target different so lerp actually does work.
    for (let i = 1; i < PALETTE_SIZE; i++) {
        target.set(i, new Color32(255 - i, (i * 3) % 256, (i * 11) % 256));
    }

    bench(
        'update() full 256-entry palette',
        () => {
            // Recreate each iteration so the effect doesn't complete.
            const effect = new FadeEffect(source, target, 2000, 'ease-in-out');
            effect.update(source, 16.67);
        },
        BENCH_OPTIONS,
    );
});

describe('paletteSwap benchmarks', () => {
    const palette = makePalette();

    bench(
        'swap two entries',
        () => {
            paletteSwap(palette, 1, 2);
        },
        BENCH_OPTIONS,
    );
});

describe('PaletteEffectManager benchmarks', () => {
    const clock = makeTimeClock();
    const palette = makePalette();
    const manager = new PaletteEffectManager(clock.now);

    // Add a mix of effects to simulate realistic usage.
    manager.add(new CycleEffect(1, 15, 30));
    manager.add(new CycleEffect(16, 31, -20));
    manager.add(new CycleEffect(32, 47, 10));

    bench(
        'update() with 3 active cycle effects',
        () => {
            clock.advance(16.67);
            manager.update(palette);
        },
        BENCH_OPTIONS,
    );
});

describe('PaletteEffectManager empty benchmarks', () => {
    const clock = makeTimeClock();
    const palette = makePalette();
    const manager = new PaletteEffectManager(clock.now);

    bench(
        'update() with no active effects',
        () => {
            clock.advance(16.67);
            manager.update(palette);
        },
        BENCH_OPTIONS,
    );
});
