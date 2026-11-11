import { bench, describe } from 'vitest';

import { Palette } from '../../assets/Palette';
import { resetUsage } from '../../core/RenderPaletteUsage';
import { Rect2i } from '../../utils/Rect2i';
import { Vector2i } from '../../utils/Vector2i';
import { computeGrid, PaletteView } from './PaletteView';

const BENCH_OPTIONS = {
    iterations: 100,
    time: 100,
    warmupTime: 25,
    warmupIterations: 25,
};

const grid16 = computeGrid(320, undefined, 16);
const palette16 = new Palette(16);
const usedMask16 = new Uint8Array(256);
const paletteBand16 = new Rect2i(0, 200, 320, 40);

const grid256 = computeGrid(320, undefined, 256);
const palette256 = new Palette(256);
const usedMask256 = new Uint8Array(256);
const paletteBand256 = new Rect2i(0, 120, 320, 120);

const paletteView = new PaletteView(true);

const noopRenderer = {
    drawBarFill: () => {},
    getCameraOffset: () => new Vector2i(0, 0),
    resetCamera: () => {},
};

describe('PaletteView.draw', () => {
    bench(
        '16-slot palette grid',
        () => {
            resetUsage(usedMask16);
            paletteView.draw(noopRenderer as never, paletteBand16, palette16, grid16, usedMask16, 1);
        },
        BENCH_OPTIONS,
    );

    bench(
        '256-slot palette grid',
        () => {
            resetUsage(usedMask256);
            paletteView.draw(noopRenderer as never, paletteBand256, palette256, grid256, usedMask256, 1);
        },
        BENCH_OPTIONS,
    );
});
