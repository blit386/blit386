// @vitest-environment happy-dom

/**
 * Tier 1 CPU benchmarks for the Canvas 2D software renderer fallback.
 *
 * Measures the CPU raster loops that back {@link SoftwareRenderer} when WebGPU is unavailable:
 * - Sprite blit throughput (`drawSprite`) for small and large source rects
 * - Bitmap text throughput (`drawBitmapText`) for short and long strings
 * - Full-canvas rect fill (`drawRectFill`)
 * - A corner-to-corner diagonal line (`drawLine`)
 * - An empty frame's clear + present cost (`fillFrame` / `presentFrame`)
 *
 * The canvas's 2D context methods (`putImageData`, `drawImage`, `clearRect`) are stubbed as
 * no-ops so timings measure the CPU raster loops themselves, not canvas emulation.
 */

import { bench, describe, vi } from 'vitest';

import { Palette } from '../assets/Palette';
import { SpriteSheet } from '../assets/SpriteSheet';
import { createSystemFont } from '../assets/SystemFont';
import { Color32 } from '../utils/Color32';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { SoftwareRenderer } from './SoftwareRenderer';

const BENCH_OPTIONS = {
    iterations: 100,
    time: 100,
    warmupTime: 25,
    warmupIterations: 25,
};

/** Display size shared by every benchmark renderer in this file. */
const DISPLAY_SIZE = new Vector2i(320, 240);

/** Number of queued sprite draws per sprite-blit benchmark iteration. */
const SPRITE_DRAW_COUNT = 300;

/** No-op stand-in for a `CanvasRenderingContext2D` / `OffscreenCanvasRenderingContext2D`. */
type MockContext = {
    imageSmoothingEnabled: boolean;
    createImageData: (w: number, h: number) => ImageData;
    putImageData: ReturnType<typeof vi.fn>;
    clearRect: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
};

/**
 * Builds a 2D context mock whose drawing methods are `vi.fn()` no-ops, so bench timings measure
 * the renderer's own CPU raster loops rather than canvas emulation.
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
        putImageData: vi.fn(),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
    };
}

/** Mock `OffscreenCanvas` returning a shared logical 2D context mock. */
class MockOffscreenCanvas {
    /**
     * Creates a mock offscreen canvas with the given pixel dimensions.
     *
     * @param width – Canvas width in pixels.
     * @param height – Canvas height in pixels.
     */
    constructor(
        public width: number,
        public height: number,
    ) {}

    /**
     * Returns the shared no-op logical 2D context mock.
     *
     * @param contextId – Context type requested; only `'2d'` returns a context.
     * @returns Mock 2D context, or `null` for any other context type.
     */
    getContext(contextId?: string): MockContext | null {
        return contextId === '2d' ? logicalContext : null;
    }
}

const outputContext = makeMockContext();
const logicalContext = makeMockContext();

vi.stubGlobal(
    'ImageData',
    class MockImageData {
        /**
         * Creates a mock `ImageData` backed by a plain `Uint8ClampedArray`.
         *
         * @param width – Image width in pixels.
         * @param height – Image height in pixels.
         * @param data – Backing pixel buffer; defaults to a zeroed buffer sized for `width` x `height`.
         */
        constructor(
            public width: number,
            public height: number,
            public data: Uint8ClampedArray = new Uint8ClampedArray(width * height * 4),
        ) {}
    },
);
vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);

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
        getContext: (type?: string) => (type === '2d' ? outputContext : null),
        toBlob: (_cb: (blob: Blob | null) => void) => {},
    } as unknown as HTMLCanvasElement;
}

/**
 * Builds a 16-entry palette with real, non-transparent colors for sprite/text/fill benchmarks.
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
 * Builds an indexed sprite sheet filled with cycling non-zero palette indices.
 *
 * @param width – Sheet width in pixels.
 * @param height – Sheet height in pixels.
 * @returns Sprite sheet for benchmark fixtures.
 */
function makeBenchSheet(width: number, height: number): SpriteSheet {
    const pixels = new Uint8Array(width * height) as Uint8Array<ArrayBuffer>;

    for (let i = 0; i < pixels.length; i++) {
        // eslint-disable-next-line security/detect-object-injection -- loop index bounded by buffer length
        pixels[i] = (i % 14) + 1;
    }

    return SpriteSheet.fromIndexedPixels(width, height, pixels);
}

/**
 * Builds and initializes a `SoftwareRenderer` against a mock canvas, with a bench palette applied.
 *
 * @returns Ready-to-draw renderer instance.
 */
async function makeBenchRenderer(): Promise<SoftwareRenderer> {
    const renderer = new SoftwareRenderer(makeMockCanvas(), DISPLAY_SIZE);
    await renderer.init();
    renderer.setPalette(makeBenchPalette());
    return renderer;
}

const spriteBlitRenderer = await makeBenchRenderer();
const bitmapTextRenderer = await makeBenchRenderer();
const rectFillRenderer = await makeBenchRenderer();
const lineDrawRenderer = await makeBenchRenderer();
const frameClearRenderer = await makeBenchRenderer();

describe('SoftwareRenderer sprite blit', () => {
    const renderer = spriteBlitRenderer;

    const sheet = makeBenchSheet(128, 128);
    const smallSrcRect = new Rect2i(0, 0, 8, 8);
    const largeSrcRect = new Rect2i(0, 0, 32, 32);
    const destPos = new Vector2i(0, 0);

    bench(
        'drawSprite (8x8 source rect)',
        () => {
            renderer.beginFrame();

            for (let i = 0; i < SPRITE_DRAW_COUNT; i++) {
                renderer.drawSprite(sheet, smallSrcRect, destPos, 0);
            }

            renderer.endFrame();
        },
        BENCH_OPTIONS,
    );

    bench(
        'drawSprite (32x32 source rect)',
        () => {
            renderer.beginFrame();

            for (let i = 0; i < SPRITE_DRAW_COUNT; i++) {
                renderer.drawSprite(sheet, largeSrcRect, destPos, 0);
            }

            renderer.endFrame();
        },
        BENCH_OPTIONS,
    );
});

describe('SoftwareRenderer bitmap text', () => {
    const renderer = bitmapTextRenderer;

    const font = createSystemFont();
    const shortText = 'The quick brown fox.';
    const longText = shortText.repeat(10).slice(0, 200);
    const pos = new Vector2i(0, 0);

    bench(
        'drawBitmapText (20 chars)',
        () => {
            renderer.beginFrame();
            renderer.drawBitmapText(font, pos, shortText, 0);
            renderer.endFrame();
        },
        BENCH_OPTIONS,
    );

    bench(
        'drawBitmapText (200 chars)',
        () => {
            renderer.beginFrame();
            renderer.drawBitmapText(font, pos, longText, 0);
            renderer.endFrame();
        },
        BENCH_OPTIONS,
    );
});

describe('SoftwareRenderer rect fill', () => {
    const renderer = rectFillRenderer;

    const fullScreenRect = new Rect2i(0, 0, DISPLAY_SIZE.x, DISPLAY_SIZE.y);

    bench(
        'drawRectFill (full 320x240 canvas)',
        () => {
            renderer.beginFrame();
            renderer.drawRectFill(fullScreenRect, 1);
            renderer.endFrame();
        },
        BENCH_OPTIONS,
    );
});

describe('SoftwareRenderer line draw', () => {
    const renderer = lineDrawRenderer;

    const lineStart = new Vector2i(0, 0);
    const lineEnd = new Vector2i(DISPLAY_SIZE.x - 1, DISPLAY_SIZE.y - 1);

    bench(
        'drawLine (diagonal, corner to corner)',
        () => {
            renderer.beginFrame();
            renderer.drawLine(lineStart, lineEnd, 1);
            renderer.endFrame();
        },
        BENCH_OPTIONS,
    );
});

describe('SoftwareRenderer frame clear and present', () => {
    const renderer = frameClearRenderer;

    bench(
        'beginFrame + endFrame (empty frame)',
        () => {
            renderer.beginFrame();
            renderer.endFrame();
        },
        BENCH_OPTIONS,
    );
});
