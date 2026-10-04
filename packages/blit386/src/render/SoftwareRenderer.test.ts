import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    applyMaskToGrid,
    DOC_RESULTS,
    indexToLetter,
    orientRows,
    PADDED_SHEET_H,
    PADDED_SHEET_PIXELS,
    PADDED_SHEET_W,
    PADDED_SRC_RECT_ARGS,
    scaleRows,
    SOURCE_H,
    SOURCE_PIXELS,
    SOURCE_ROWS,
    SOURCE_W,
    stretchRows,
    WIDE_ROWS,
    WIDE_SHEET_H,
    WIDE_SHEET_PIXELS,
    WIDE_SHEET_W,
    WIDE_SRC_RECT_ARGS,
} from '../__test__/spriteOrientationFixture';
import { BitmapFont } from '../assets/BitmapFont';
import { Palette } from '../assets/Palette';
import { SpriteSheet } from '../assets/SpriteSheet';
import { Color32 } from '../utils/Color32';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import type { Effect } from './effects/Effect';
import { SoftwareRenderer } from './SoftwareRenderer';
import { resolveSpriteOrientation } from './SpriteOrientation';

type MockContext = {
    imageSmoothingEnabled: boolean;
    createImageData: (w: number, h: number) => ImageData;
    putImageData: ReturnType<typeof vi.fn>;
    clearRect: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
    lastImageData: ImageData | null;
};

function makeMockContext(): MockContext {
    const instance: MockContext = {
        imageSmoothingEnabled: false,
        createImageData: (w: number, h: number) =>
            ({
                data: new Uint8ClampedArray(w * h * 4),
                width: w,
                height: h,
            }) as ImageData,
        putImageData: vi.fn((imageData: ImageData) => {
            instance.lastImageData = imageData;
        }),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        lastImageData: null,
    };
    return instance;
}

const context = makeMockContext();
const logicalContext = makeMockContext();

class MockOffscreenCanvas {
    constructor(
        public width: number,
        public height: number,
    ) {}
    getContext(contextId?: string): MockContext | null {
        return contextId === '2d' ? logicalContext : null;
    }
}

function canvasGet2d(ctx: MockContext): (type?: string) => MockContext | null {
    return (type?: string) => (type === '2d' ? ctx : null);
}

function getPixel(imageData: ImageData, width: number, x: number, y: number): [number, number, number, number] {
    const index = (y * width + x) * 4;
    /* eslint-disable security/detect-object-injection */
    return [
        imageData.data[index] ?? 0,
        imageData.data[index + 1] ?? 0,
        imageData.data[index + 2] ?? 0,
        imageData.data[index + 3] ?? 0,
    ];
    /* eslint-enable security/detect-object-injection */
}

function makePalette(): Palette {
    const palette = new Palette(16);
    palette.set(1, new Color32(255, 0, 0, 255));
    palette.set(2, new Color32(0, 0, 255, 255));
    palette.set(3, new Color32(0, 255, 0, 255));
    return palette;
}

function hashPixels(imageData: ImageData): number {
    let hash = 2166136261 >>> 0;
    for (const value of imageData.data) {
        hash ^= value;
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
}

describe('SoftwareRenderer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        context.lastImageData = null;
        logicalContext.lastImageData = null;
        vi.stubGlobal(
            'ImageData',
            class MockImageData {
                constructor(
                    public width: number,
                    public height: number,
                    public data: Uint8ClampedArray = new Uint8ClampedArray(width * height * 4),
                ) {}
            },
        );
        vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('requires palette before beginFrame', async () => {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob: (_cb: (blob: Blob | null) => void) => {},
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));
        await renderer.init();

        expect(() => renderer.beginFrame()).toThrow('No palette set yet. Call BT.paletteSet');
    });

    it('renders primitives with camera offset applied', async () => {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob: (_cb: (blob: Blob | null) => void) => {},
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));
        await renderer.init();
        renderer.setPalette(makePalette());

        renderer.beginFrame();
        renderer.setCameraOffset(new Vector2i(1, 1));
        renderer.drawPixel(new Vector2i(2, 2), 1);
        renderer.endFrame();

        const frame = logicalContext.lastImageData;
        expect(frame).not.toBeNull();
        expect(getPixel(frame as ImageData, 4, 1, 1)).toEqual([255, 0, 0, 255]);
    });

    it('renders indexed sprites with transparent index and palette offsets', async () => {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob: (_cb: (blob: Blob | null) => void) => {},
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));
        await renderer.init();

        const palette = makePalette();
        palette.set(4, new Color32(255, 255, 0, 255));
        renderer.setPalette(palette);
        renderer.setClearColor(4);

        const sheet = SpriteSheet.fromIndexedPixels(2, 1, new Uint8Array([1, 0]));
        renderer.beginFrame();
        renderer.drawSprite(sheet, new Rect2i(0, 0, 2, 1), new Vector2i(0, 0), 1);
        renderer.endFrame();

        const frame = logicalContext.lastImageData;
        expect(frame).not.toBeNull();
        expect(getPixel(frame as ImageData, 4, 0, 0)).toEqual([0, 0, 255, 255]);
        expect(getPixel(frame as ImageData, 4, 1, 0)).toEqual([255, 255, 0, 255]);
    });

    it('keeps each queued sprite draw independent when the caller reuses one srcRect (drawTile scratch rect)', async () => {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob: (_cb: (blob: Blob | null) => void) => {},
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));
        await renderer.init();
        renderer.setPalette(makePalette());

        // 2x1 sheet: left texel index 1 (red), right texel index 2 (blue).
        const sheet = SpriteSheet.fromIndexedPixels(2, 1, new Uint8Array([1, 2]));
        const scratch = new Rect2i(0, 0, 1, 1);

        renderer.beginFrame();
        renderer.drawSprite(sheet, scratch, new Vector2i(0, 0), 0);
        scratch.x = 1; // BT.drawTile rewrites its scratch rect before the next draw.
        renderer.drawSprite(sheet, scratch, new Vector2i(1, 0), 0);
        renderer.endFrame();

        const frame = logicalContext.lastImageData;
        expect(frame).not.toBeNull();
        expect(getPixel(frame as ImageData, 4, 0, 0)).toEqual([255, 0, 0, 255]);
        expect(getPixel(frame as ImageData, 4, 1, 0)).toEqual([0, 0, 255, 255]);
    });

    it('skips non-integer sprite source rectangles in software rendering', async () => {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob: (_cb: (blob: Blob | null) => void) => {},
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));
        await renderer.init();
        renderer.setPalette(makePalette());

        const sheet = SpriteSheet.fromIndexedPixels(2, 2, new Uint8Array([1, 2, 3, 4]));
        const srcRect = new Rect2i(0, 0, 2, 2);
        srcRect.x = 0.5;

        renderer.beginFrame();
        renderer.drawSprite(sheet, srcRect, new Vector2i(0, 0), 0);
        renderer.endFrame();

        const frame = logicalContext.lastImageData;
        expect(frame).not.toBeNull();
        expect(getPixel(frame as ImageData, 4, 0, 0)).toEqual([0, 0, 0, 0]);
    });

    it('skips sprite source rectangles fully outside the sheet', async () => {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob: (_cb: (blob: Blob | null) => void) => {},
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));
        await renderer.init();
        renderer.setPalette(makePalette());

        const sheet = SpriteSheet.fromIndexedPixels(2, 2, new Uint8Array([1, 2, 3, 4]));
        renderer.beginFrame();
        renderer.drawSprite(sheet, new Rect2i(10, 10, 2, 2), new Vector2i(0, 0), 0);
        renderer.endFrame();

        const frame = logicalContext.lastImageData;
        expect(frame).not.toBeNull();
        expect(getPixel(frame as ImageData, 4, 0, 0)).toEqual([0, 0, 0, 0]);
    });

    it('skips invalid sprite source rectangles in software rendering', async () => {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob: (_cb: (blob: Blob | null) => void) => {},
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));
        await renderer.init();
        renderer.setPalette(makePalette());

        const sheet = SpriteSheet.fromIndexedPixels(2, 2, new Uint8Array([1, 2, 3, 4]));
        renderer.beginFrame();
        renderer.drawSprite(sheet, new Rect2i(0, 0, 2, 2), new Vector2i(0, 0), 0);
        renderer.drawSprite(sheet, new Rect2i(2, 0, -1, 2), new Vector2i(2, 0), 0);
        renderer.endFrame();

        const frame = logicalContext.lastImageData;
        expect(frame).not.toBeNull();
        expect(getPixel(frame as ImageData, 4, 0, 0)).toEqual([255, 0, 0, 255]);
        expect(getPixel(frame as ImageData, 4, 2, 0)).toEqual([0, 0, 0, 0]);
    });

    it('clips partial sprite source rectangles while preserving destination alignment', async () => {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob: (_cb: (blob: Blob | null) => void) => {},
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));
        await renderer.init();
        renderer.setPalette(makePalette());

        const sheet = SpriteSheet.fromIndexedPixels(2, 2, new Uint8Array([1, 2, 3, 0]));
        renderer.beginFrame();
        renderer.drawSprite(sheet, new Rect2i(-1, 0, 2, 2), new Vector2i(0, 0), 0);
        renderer.endFrame();

        const frame = logicalContext.lastImageData;
        expect(frame).not.toBeNull();
        expect(getPixel(frame as ImageData, 4, 0, 0)).toEqual([0, 0, 0, 0]);
        expect(getPixel(frame as ImageData, 4, 1, 0)).toEqual([255, 0, 0, 255]);
        expect(getPixel(frame as ImageData, 4, 1, 1)).toEqual([0, 255, 0, 255]);
    });

    it('renders bitmap text through sprite-backed glyphs', async () => {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob: (_cb: (blob: Blob | null) => void) => {},
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));
        await renderer.init();
        renderer.setPalette(makePalette());

        const sheet = SpriteSheet.fromIndexedPixels(1, 1, new Uint8Array([1]));
        const glyphs = new Map([
            [
                'A',
                {
                    rect: new Rect2i(0, 0, 1, 1),
                    offsetX: 0,
                    offsetY: 0,
                    advance: 1,
                },
            ],
        ]);
        const font = BitmapFont.createFromGlyphs(sheet, glyphs, 'test', 8, 1, 1);

        renderer.beginFrame();
        renderer.drawBitmapText(font, new Vector2i(0, 0), 'A', 0);
        renderer.endFrame();

        const frame = logicalContext.lastImageData;
        expect(frame).not.toBeNull();
        expect(getPixel(frame as ImageData, 4, 0, 0)).toEqual([255, 0, 0, 255]);
    });

    it('throws clear unsupported errors for fullscreen effects', async () => {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob: (_cb: (blob: Blob | null) => void) => {},
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));
        await renderer.init();

        const effect: Effect = { tier: 'pixel', init: vi.fn(), updateUniforms: vi.fn(), encodePass: vi.fn() };

        expect(() => renderer.addEffect(effect)).toThrow(SoftwareRenderer.EFFECTS_UNSUPPORTED_MESSAGE);
        expect(() => renderer.removeEffect(effect)).toThrow(SoftwareRenderer.EFFECTS_UNSUPPORTED_MESSAGE);
        expect(() => renderer.clearEffects()).toThrow(SoftwareRenderer.EFFECTS_UNSUPPORTED_MESSAGE);
    });

    it('resolves captureFrame on next endFrame', async () => {
        const toBlob = vi.fn((callback: (blob: Blob | null) => void) =>
            callback(new Blob(['png'], { type: 'image/png' })),
        );
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob,
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));
        await renderer.init();
        renderer.setPalette(makePalette());

        const capture = renderer.captureFrame();
        renderer.beginFrame();
        renderer.endFrame();

        const blob = await capture;
        expect(blob.type).toBe('image/png');
        expect(toBlob).toHaveBeenCalledOnce();
    });

    it('replaces an older pending capture request with a clear error', async () => {
        const toBlob = vi.fn((callback: (blob: Blob | null) => void) =>
            callback(new Blob(['png'], { type: 'image/png' })),
        );
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob,
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));
        await renderer.init();
        renderer.setPalette(makePalette());

        const firstCapture = renderer.captureFrame();
        const secondCapture = renderer.captureFrame();

        renderer.beginFrame();
        renderer.endFrame();

        await expect(firstCapture).rejects.toThrow('A capture is already in progress');
        await expect(secondCapture).resolves.toBeInstanceOf(Blob);
    });

    it('rejects captureFrame when canvas.toBlob is unavailable', async () => {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob: undefined,
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));
        await renderer.init();
        renderer.setPalette(makePalette());

        const capture = renderer.captureFrame();
        renderer.beginFrame();
        renderer.endFrame();

        await expect(capture).rejects.toThrow("doesn't support canvas image export");
    });

    it('rejects captureFrame when canvas.toBlob returns no image data', async () => {
        const toBlob = vi.fn((callback: (blob: Blob | null) => void) => callback(null));
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob,
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));
        await renderer.init();
        renderer.setPalette(makePalette());

        const capture = renderer.captureFrame();
        renderer.beginFrame();
        renderer.endFrame();

        await expect(capture).rejects.toThrow('something went wrong exporting the canvas image');
    });

    it('captureFrameAtDisplaySize falls back to HTMLCanvasElement.toBlob when OffscreenCanvas is unavailable', async () => {
        vi.stubGlobal('OffscreenCanvas', undefined);

        const logicalToBlob = vi.fn((callback: (blob: Blob | null) => void) =>
            callback(new Blob(['logical-png'], { type: 'image/png' })),
        );
        const fakeLogicalCanvas = {
            width: 0,
            height: 0,
            getContext: canvasGet2d(logicalContext),
            toBlob: logicalToBlob,
        } as unknown as HTMLCanvasElement;

        vi.stubGlobal('document', { createElement: vi.fn(() => fakeLogicalCanvas) });

        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob: (callback: (blob: Blob | null) => void) => callback(new Blob(['png'], { type: 'image/png' })),
        } as unknown as HTMLCanvasElement;

        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));

        await renderer.init();
        renderer.setPalette(makePalette());

        const capture = renderer.captureFrameAtDisplaySize();

        renderer.beginFrame();
        renderer.endFrame();

        const blob = await capture;

        expect(blob.type).toBe('image/png');
        expect(logicalToBlob).toHaveBeenCalledOnce();
    });

    it('rejects pending display-size captures when init() re-runs', async () => {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));

        await renderer.init();

        const publicCapture = renderer.captureFrameAtDisplaySize();
        const shortcutCapture = renderer.captureFrameForShortcut();

        await renderer.init();

        await expect(publicCapture).rejects.toThrow('renderer was reset');
        await expect(shortcutCapture).rejects.toThrow('renderer was reset');
    });

    it('produces deterministic output for the same command sequence', async () => {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob: (_cb: (blob: Blob | null) => void) => {},
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(8, 8));
        await renderer.init();
        renderer.setPalette(makePalette());

        const runSequence = (): number => {
            renderer.beginFrame();
            renderer.setClearColor(3);
            renderer.drawRectFill(new Rect2i(1, 1, 3, 3), 1);
            renderer.drawLine(new Vector2i(0, 7), new Vector2i(7, 0), 2);
            renderer.setCameraOffset(new Vector2i(1, 0));
            renderer.drawRect(new Rect2i(2, 2, 4, 4), 1);
            renderer.resetCamera();
            renderer.endFrame();

            const frame = logicalContext.lastImageData;
            expect(frame).not.toBeNull();
            return hashPixels(frame as ImageData);
        };

        const first = runSequence();
        const second = runSequence();

        expect(second).toBe(first);
    });

    it('getFrameDiagnostics reports GPU-equivalent vertex counts before endFrame', async () => {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob: (_cb: (blob: Blob | null) => void) => {},
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(8, 8));
        await renderer.init();
        renderer.setPalette(makePalette());

        const sheet = SpriteSheet.fromIndexedPixels(2, 1, new Uint8Array([1, 0]));
        const fontSheet = SpriteSheet.fromIndexedPixels(1, 1, new Uint8Array([1]));
        const glyphs = new Map([
            [
                'A',
                {
                    rect: new Rect2i(0, 0, 1, 1),
                    offsetX: 0,
                    offsetY: 0,
                    advance: 1,
                },
            ],
        ]);
        const font = BitmapFont.createFromGlyphs(fontSheet, glyphs, 'test', 8, 1, 1);

        renderer.beginFrame();
        renderer.drawRectFill(new Rect2i(0, 0, 2, 2), 1);
        renderer.drawLine(new Vector2i(0, 0), new Vector2i(3, 0), 2);
        renderer.drawSprite(sheet, new Rect2i(0, 0, 2, 1), new Vector2i(0, 0), 0);
        renderer.drawBitmapText(font, new Vector2i(0, 0), 'AA', 0);

        expect(renderer.getFrameDiagnostics()).toEqual({
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 12,
            spriteSubmittedVertices: 18,
        });

        renderer.endFrame();
    });
});

describe('SoftwareRenderer drawSpriteOriented (flip and quarter turns)', () => {
    const DISPLAY = 16;

    beforeEach(() => {
        logicalContext.lastImageData = null;
        vi.stubGlobal(
            'ImageData',
            class MockImageData {
                constructor(
                    public width: number,
                    public height: number,
                    public data: Uint8ClampedArray = new Uint8ClampedArray(width * height * 4),
                ) {}
            },
        );
        vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    /** Palette where index n renders as (n, 0, 0), so the framebuffer's red channel reads back the index. */
    function makeIndexPalette(): Palette {
        const palette = new Palette(16);
        for (let i = 1; i < 16; i++) {
            palette.set(i, new Color32(i, 0, 0, 255));
        }
        return palette;
    }

    async function render(draw: (renderer: SoftwareRenderer) => void): Promise<ImageData> {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: canvasGet2d(context),
            toBlob: (_cb: (blob: Blob | null) => void) => {},
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(DISPLAY, DISPLAY));
        await renderer.init();
        renderer.setPalette(makeIndexPalette());
        renderer.beginFrame();
        draw(renderer);
        renderer.endFrame();

        return logicalContext.lastImageData as ImageData;
    }

    /** Reads a w x h block at (x, y) back as letters (stored index = red channel). */
    function readGrid(frame: ImageData, x: number, y: number, w: number, h: number): string {
        return Array.from({ length: h }, (_, row) =>
            Array.from({ length: w }, (_, col) => indexToLetter(getPixel(frame, DISPLAY, x + col, y + row)[0])).join(
                '',
            ),
        ).join(' / ');
    }

    // Draw from inside a larger sheet so source-rect offsets are exercised.
    const SRC = new Rect2i(...PADDED_SRC_RECT_ARGS);

    it.each(Array.from({ length: 32 }, (_, mask) => mask))('mask %i writes the documented grid', async (mask) => {
        const orientation = resolveSpriteOrientation(mask);
        const frame = await render((renderer) => {
            const sheet = SpriteSheet.fromIndexedPixels(PADDED_SHEET_W, PADDED_SHEET_H, PADDED_SHEET_PIXELS);
            renderer.setCameraOffset(new Vector2i(1, 1));
            if (orientation === 0) {
                renderer.drawSprite(sheet, SRC, new Vector2i(3, 3), 0);
            } else {
                renderer.drawSpriteOriented(sheet, SRC, new Vector2i(3, 3), 0, orientation);
            }
        });
        const swap = orientation >= 4;
        const w = swap ? SOURCE_H : SOURCE_W;
        const h = swap ? SOURCE_W : SOURCE_H;

        // Camera (1, 1) puts the footprint top-left at (2, 2); nothing else is touched.
        expect(readGrid(frame, 2, 2, w, h)).toBe(applyMaskToGrid(mask));
        // eslint-disable-next-line security/detect-object-injection
        expect(readGrid(frame, 2, 2, w, h)).toBe(DOC_RESULTS[orientation]);
        expect(
            readGrid(frame, 1, 1, w + 2, h + 2)
                .replaceAll(/[A-F]/g, '')
                .replaceAll(' / ', ''),
        ).toMatch(/^\.+$/);
    });

    it('applies paletteOffset and transparency on the oriented path', async () => {
        const frame = await render((renderer) => {
            const sheet = SpriteSheet.fromIndexedPixels(2, 1, new Uint8Array([1, 0]));
            renderer.drawSpriteOriented(
                sheet,
                new Rect2i(0, 0, 2, 1),
                new Vector2i(0, 0),
                2,
                resolveSpriteOrientation(1),
            );
        });

        expect(getPixel(frame, DISPLAY, 0, 0)).toEqual([0, 0, 0, 0]);
        expect(getPixel(frame, DISPLAY, 1, 0)).toEqual([3, 0, 0, 255]);
    });

    it('keeps clipped texels where the full GPU quad would put them', async () => {
        // Source rect overhangs the 3x2 sheet by one column on the left; with FLIP_H the visible
        // columns land on the left of the 4-wide footprint, matching the GPU quad.
        const frame = await render((renderer) => {
            const sheet = SpriteSheet.fromIndexedPixels(SOURCE_W, SOURCE_H, SOURCE_PIXELS);
            renderer.drawSpriteOriented(
                sheet,
                new Rect2i(-1, 0, 4, 2),
                new Vector2i(0, 0),
                0,
                resolveSpriteOrientation(1),
            );
        });

        expect(readGrid(frame, 0, 0, 4, 2)).toBe('CBA. / FED.');
    });

    const WIDE_SRC = new Rect2i(...WIDE_SRC_RECT_ARGS);

    function paddedSheet(): SpriteSheet {
        return SpriteSheet.fromIndexedPixels(PADDED_SHEET_W, PADDED_SHEET_H, PADDED_SHEET_PIXELS);
    }

    function wideSheet(): SpriteSheet {
        return SpriteSheet.fromIndexedPixels(WIDE_SHEET_W, WIDE_SHEET_H, WIDE_SHEET_PIXELS);
    }

    describe('drawSpriteStretched', () => {
        const integerCases = Array.from({ length: 32 }, (_, mask) =>
            [1, 2, 3, 4].map((s) => [mask, s] as const),
        ).flat();

        it.each(integerCases)('mask %i at integer scale %i is a block copy', async (mask, s) => {
            const orientation = resolveSpriteOrientation(mask);
            const oriented = orientRows(SOURCE_ROWS, mask);
            const fw = oriented[0]?.length ?? 0;
            const fh = oriented.length;
            const frame = await render((renderer) => {
                renderer.drawSpriteStretched(paddedSheet(), SRC, 1, 1, fw * s, fh * s, 0, orientation);
            });

            expect(readGrid(frame, 1, 1, fw * s, fh * s)).toBe(scaleRows(oriented, s, s).join(' / '));
        });

        it.each([
            // [label, mask, dw, dh] on the 3x2 ABC / DEF source.
            ['x 3->2, y 2->1', 0, 2, 1],
            ['y 2->3', 0, 3, 3],
            ['ROT_90_CW: x 2->1, y 3->2', 4, 1, 2],
            ['ROT_90_CW: x 2->3', 4, 3, 3],
            ['FLIP_H: x 3->2, y 2->3', 1, 2, 3],
        ])('uneven stretch %s follows the center rule', async (_label, mask, dw, dh) => {
            const frame = await render((renderer) => {
                renderer.drawSpriteStretched(paddedSheet(), SRC, 2, 2, dw, dh, 0, resolveSpriteOrientation(mask));
            });

            expect(readGrid(frame, 2, 2, dw, dh)).toBe(stretchRows(orientRows(SOURCE_ROWS, mask), dw, dh).join(' / '));
        });

        it.each([
            ['x 5->7', 0, 7, 3],
            ['ROT_90_CW: y 5->7', 4, 3, 7],
        ])('uneven stretch %s on the 5x3 source', async (_label, mask, dw, dh) => {
            const frame = await render((renderer) => {
                renderer.drawSpriteStretched(wideSheet(), WIDE_SRC, 2, 2, dw, dh, 0, resolveSpriteOrientation(mask));
            });

            expect(readGrid(frame, 2, 2, dw, dh)).toBe(stretchRows(orientRows(WIDE_ROWS, mask), dw, dh).join(' / '));
        });

        it.each(Array.from({ length: 32 }, (_, mask) => mask))(
            'mask %i stretches the 5x3 source into 7x7',
            async (mask) => {
                const frame = await render((renderer) => {
                    renderer.drawSpriteStretched(wideSheet(), WIDE_SRC, 2, 2, 7, 7, 0, resolveSpriteOrientation(mask));
                });

                expect(readGrid(frame, 2, 2, 7, 7)).toBe(stretchRows(orientRows(WIDE_ROWS, mask), 7, 7).join(' / '));
            },
        );

        it('clips at the screen edge and keeps the visible part in place', async () => {
            const full = stretchRows(orientRows(SOURCE_ROWS, 0), 6, 4);
            const frame = await render((renderer) => {
                renderer.drawSpriteStretched(paddedSheet(), SRC, -2, -1, 6, 4, 0, 0);
            });

            expect(readGrid(frame, 0, 0, 4, 3)).toBe(
                full
                    .slice(1)
                    .map((row) => row.slice(2))
                    .join(' / '),
            );
        });

        it('clips at the right and bottom edges', async () => {
            const full = stretchRows(orientRows(SOURCE_ROWS, 0), 6, 4);
            const frame = await render((renderer) => {
                renderer.drawSpriteStretched(paddedSheet(), SRC, DISPLAY - 3, DISPLAY - 2, 6, 4, 0, 0);
            });

            expect(readGrid(frame, DISPLAY - 3, DISPLAY - 2, 3, 2)).toBe(
                full
                    .slice(0, 2)
                    .map((row) => row.slice(0, 3))
                    .join(' / '),
            );
        });

        it('applies the camera offset like a 1:1 sprite', async () => {
            const frame = await render((renderer) => {
                renderer.setCameraOffset(new Vector2i(1, 1));
                renderer.drawSpriteStretched(paddedSheet(), SRC, 3, 3, 6, 4, 0, 0);
            });

            expect(readGrid(frame, 2, 2, 6, 4)).toBe(scaleRows(SOURCE_ROWS, 2, 2).join(' / '));
        });

        it('applies paletteOffset and skips transparent texels', async () => {
            const frame = await render((renderer) => {
                const sheet = SpriteSheet.fromIndexedPixels(2, 1, new Uint8Array([1, 0]));
                renderer.drawSpriteStretched(sheet, new Rect2i(0, 0, 2, 1), 0, 0, 4, 1, 2, 0);
            });

            expect(readGrid(frame, 0, 0, 4, 1)).toBe('CC..');
        });
    });
});
