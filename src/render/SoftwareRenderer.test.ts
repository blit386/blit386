import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BitmapFont } from '../assets/BitmapFont';
import { Palette } from '../assets/Palette';
import { SpriteSheet } from '../assets/SpriteSheet';
import { Color32 } from '../utils/Color32';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import type { Effect } from './effects/Effect';
import { SoftwareRenderer } from './SoftwareRenderer';

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

        renderer.beginFrame();
        renderer.drawRectFill(new Rect2i(0, 0, 2, 2), 1);
        renderer.drawLine(new Vector2i(0, 0), new Vector2i(3, 0), 2);
        renderer.drawSprite(sheet, new Rect2i(0, 0, 2, 1), new Vector2i(0, 0), 0);

        expect(renderer.getFrameDiagnostics()).toEqual({
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: 12,
            spriteSubmittedVertices: 6,
        });

        renderer.endFrame();
    });
});
