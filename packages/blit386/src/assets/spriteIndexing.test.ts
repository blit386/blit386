import { afterEach, describe, expect, it, vi } from 'vitest';

import { Rect2i } from '../utils/Rect2i';
import { markUniqueIndicesInRect, readRgbaPixels } from './spriteIndexing';

const SIZE = 16;

/** 16x16 sheet of non-zero indices; pixel 255 wraps back to index 1. */
function makePixels(): Uint8Array {
    return Uint8Array.from({ length: SIZE * SIZE }, (_, i) => (i % 255) + 1);
}

function scan(rect: Rect2i): Uint8Array {
    const usedMask = new Uint8Array(512);

    markUniqueIndicesInRect(makePixels(), SIZE, SIZE, rect, 0, usedMask);

    return usedMask;
}

describe('markUniqueIndicesInRect empty rects', () => {
    it('marks nothing for a rect fully outside the sheet above-left', () => {
        expect(scan(new Rect2i(-30, -30, 8, 8)).some(Boolean)).toBe(false);
    });

    it('marks nothing, without scanning the distance, for a far-away rect', () => {
        expect(scan(new Rect2i(-5000, -5000, 8, 8)).some(Boolean)).toBe(false);
    });

    it('marks nothing for a rect fully outside the sheet below-right', () => {
        expect(scan(new Rect2i(20, 20, 8, 8)).some(Boolean)).toBe(false);
    });

    it('marks nothing for a rect outside on one axis only', () => {
        expect(scan(new Rect2i(-30, 4, 8, 8)).some(Boolean)).toBe(false);
    });

    it('still marks the pixels of a rect inside the sheet', () => {
        expect(scan(new Rect2i(0, 0, 2, 1)).some(Boolean)).toBe(true);
    });
});

describe('readRgbaPixels without a 2D context', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should throw a clear error when the canvas returns no 2D context', () => {
        vi.stubGlobal(
            'OffscreenCanvas',
            class {
                public getContext(): null {
                    return null;
                }
            },
        );

        expect(() => readRgbaPixels({} as HTMLImageElement, 2, 2)).toThrow(/canvas/);
    });
});

describe('readRgbaPixels on an image the browser will not let it read', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    /**
     * Stubs OffscreenCanvas so `getImageData` throws the given error.
     *
     * @param error - Error `getImageData` throws.
     */
    function stubGetImageDataThrowing(error: unknown): void {
        vi.stubGlobal(
            'OffscreenCanvas',
            class {
                public getContext(): unknown {
                    return {
                        imageSmoothingEnabled: true,
                        drawImage: () => {},
                        getImageData: () => {
                            throw error;
                        },
                    };
                }
            },
        );
    }

    it('should name the image and say how to fix a cross-origin SecurityError', () => {
        const securityError = new DOMException('x', 'SecurityError');
        stubGetImageDataThrowing(securityError);
        const image = { src: 'http://127.0.0.1:5200/sheet.png' } as HTMLImageElement;

        let thrown: unknown;

        try {
            readRgbaPixels(image, 2, 2);
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(Error);
        expect(thrown).not.toBe(securityError);
        expect((thrown as Error).message).toContain('http://127.0.0.1:5200/sheet.png');
        expect((thrown as Error).message).toContain('CORS');
        expect((thrown as Error).message).toContain('data:');
        expect((thrown as Error).cause).toBe(securityError);
    });

    it('should rethrow any other getImageData error unchanged', () => {
        const otherError = new DOMException('x', 'IndexSizeError');
        stubGetImageDataThrowing(otherError);

        expect(() => readRgbaPixels({ src: 'sheet.png' } as HTMLImageElement, 2, 2)).toThrow(otherError);
    });
});
