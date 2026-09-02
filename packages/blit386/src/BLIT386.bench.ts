// @vitest-environment happy-dom

/**
 * CPU benchmarks for the `BT` draw-call facade in {@link BLIT386.ts}.
 *
 * BT-229 removed the per-call closure `executeDrawCall(methodName, () => {...})` used to wrap
 * every hot draw method (`drawPixel`, `drawLine`, `drawRect`, `drawRectFill`, `drawSprite`, …) and
 * routed the numeric `BT.drawPixel(x, y, paletteIndex)` overload through a `Vector2i`-free XY fast
 * path end to end (`BTAPI.drawPixelXY` -> `IRenderer.drawPixelXY` -> `PrimitivePipeline.drawPixelXY`
 * / `SoftwareRenderer.drawPixelXY`). These benchmarks exercise that fast path through the public
 * `BT` facade itself, not the underlying pipeline, so a regression that reintroduces a per-call
 * closure or an unnecessary `Vector2i` allocation on this path shows up as a throughput drop here
 * even if the isolated pipeline benchmarks look unchanged.
 */

import { bench, describe } from 'vitest';

import { Palette } from './assets/Palette';
import { BT } from './BLIT386';
import { BTAPI } from './core/BTAPI';
import { SoftwareRenderer } from './render/SoftwareRenderer';
import { Color32 } from './utils/Color32';
import { Rect2i } from './utils/Rect2i';
import { Vector2i } from './utils/Vector2i';

const BENCH_OPTIONS = {
    iterations: 100,
    time: 100,
    warmupTime: 25,
    warmupIterations: 25,
};

/** Display size shared by every benchmark renderer in this file. */
const DISPLAY_SIZE = new Vector2i(320, 240);

/** Palette index used for all benchmark draws. */
const PALETTE_INDEX = 3;

/** No-op stand-in for a `CanvasRenderingContext2D`. */
type MockContext = {
    imageSmoothingEnabled: boolean;
    createImageData: (w: number, h: number) => ImageData;
    putImageData: () => void;
    clearRect: () => void;
    drawImage: () => void;
};

/**
 * Builds a 2D context mock whose drawing methods are plain no-ops, so bench timings measure the
 * facade and renderer's own CPU work rather than canvas emulation.
 *
 * @returns Mock 2D context.
 */
function makeMockContext(): MockContext {
    return {
        imageSmoothingEnabled: false,
        createImageData: (w: number, h: number) =>
            ({
                data: new Uint8ClampedArray(w * h * 4),
                width: w,
                height: h,
            }) as ImageData,
        putImageData: () => {},
        clearRect: () => {},
        drawImage: () => {},
    };
}

const context = makeMockContext();

/**
 * Builds a fake `HTMLCanvasElement` whose `getContext('2d')` returns a no-op mock context.
 *
 * @returns Canvas-shaped stub suitable for the `SoftwareRenderer` constructor.
 */
function makeMockCanvas(): HTMLCanvasElement {
    return {
        width: 0,
        height: 0,
        style: { width: '', height: '' },
        getContext: (type?: string) => (type === '2d' ? context : null),
        toBlob: (_cb: (blob: Blob | null) => void) => {},
    } as unknown as HTMLCanvasElement;
}

/**
 * Builds a 16-entry palette with real, non-transparent colors.
 *
 * @returns Palette with slots `1`-`15` populated.
 */
function makeBenchPalette(): Palette {
    const palette = new Palette(16);

    for (let i = 1; i < 16; i++) {
        palette.set(i, new Color32((i * 16) % 256, (i * 32) % 256, (i * 48) % 256, 255));
    }

    return palette;
}

/**
 * Installs a ready `SoftwareRenderer` + palette onto the `BTAPI` singleton so `BT.*` draw calls
 * reach the real renderer instead of showing the not-ready facade error.
 *
 * @returns Ready-to-draw renderer instance (also installed on `BTAPI.instance`).
 */
async function installBenchRenderer(): Promise<SoftwareRenderer> {
    const renderer = new SoftwareRenderer(makeMockCanvas(), DISPLAY_SIZE);
    await renderer.init();

    const api = BTAPI.instance as unknown as { renderer: SoftwareRenderer | null };
    api.renderer = renderer;

    BTAPI.instance.setPalette(makeBenchPalette());

    return renderer;
}

await installBenchRenderer();

const rect = new Rect2i(10, 10, 4, 4);
const p0 = new Vector2i(0, 0);
const p1 = new Vector2i(319, 239);

describe('BT draw-call facade', () => {
    bench(
        'BT.drawPixel(x, y, paletteIndex) x 10000',
        () => {
            for (let i = 0; i < 10000; i++) {
                BT.drawPixel(i & 0xff, (i >> 8) & 0xff, PALETTE_INDEX);
            }
        },
        BENCH_OPTIONS,
    );

    bench(
        'BT.drawPixel(Vector2i, paletteIndex) x 10000',
        () => {
            for (let i = 0; i < 10000; i++) {
                BT.drawPixel(new Vector2i(i & 0xff, (i >> 8) & 0xff), PALETTE_INDEX);
            }
        },
        BENCH_OPTIONS,
    );

    bench(
        'BT.drawRectFill x 5000',
        () => {
            for (let i = 0; i < 5000; i++) {
                BT.drawRectFill(rect, PALETTE_INDEX);
            }
        },
        BENCH_OPTIONS,
    );

    bench(
        'BT.drawLine diagonal x 100',
        () => {
            for (let i = 0; i < 100; i++) {
                BT.drawLine(p0, p1, PALETTE_INDEX);
            }
        },
        BENCH_OPTIONS,
    );
});
