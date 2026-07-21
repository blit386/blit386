/**
 * Unit tests for {@link SpriteSheet}.
 *
 * Covers the responsibilities that sit between loaded image assets and GPU
 * rendering:
 * - normalized UV calculation from pixel-space rectangles
 * - reported sheet dimensions and source image access
 * - lazy GPU texture creation, caching, and recreation after destroy
 * - cleanup of GPU textures and temporary `ImageBitmap` instances
 * - `load()` behavior when bitmap decoding succeeds or falls back
 * - `indexize()` / `reindexize()` palette-index conversion
 *
 * GPU-facing behavior is verified with the local WebGPU mock helpers and
 * stubbed asset-loading/browser APIs.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockGPUDevice } from '../__test__/webgpu-mock';
import { collectUsedIndices, resetUsage } from '../core/RenderPaletteUsage';
import { registerHotContext } from '../hot/HotRuntime';
import { AssetLimitError, MAX_ASSET_DIMENSION, MAX_ASSET_PIXELS } from '../utils/AssetLimits';
import { Color32 } from '../utils/Color32';
import { Rect2i } from '../utils/Rect2i';
import { AssetLoader } from './AssetLoader';
import { Palette } from './Palette';
import { getHotReloadSheets, SpriteSheet } from './SpriteSheet';

// SpriteSheet.destroy() unconditionally normalizes `sourceUrl` against `document.baseURI`
// (see unregisterFromHotReload in SpriteSheet.ts) whenever a sheet was loaded via
// SpriteSheet.load(), regardless of whether hot reload was ever active. Real browsers
// always have `document`; this file's default Node test environment does not, so - like
// the GPU/AudioContext stubs in src/__test__/setup.ts - install it once, only if missing,
// so it survives every describe block's `vi.unstubAllGlobals()` call.
if (typeof globalThis.document === 'undefined') {
    (globalThis as unknown as { document?: { baseURI: string } }).document = { baseURI: 'http://localhost/' };
}

/**
 * Returns a minimal OffscreenCanvas mock whose getImageData yields the supplied
 * pixel buffer. Use vi.stubGlobal to install it for a single test.
 */
function makeOffscreenCanvasMock(pixelData: Uint8ClampedArray, w: number, h: number) {
    return class {
        public readonly width = w;
        public readonly height = h;

        getContext(_id: string) {
            return {
                drawImage: () => {},
                imageSmoothingEnabled: false,
                getImageData: () => ({ data: pixelData }),
            };
        }
    };
}

describe('SpriteSheet', () => {
    const mockImage = { width: 256, height: 256 } as HTMLImageElement;

    describe('getUVs', () => {
        it('should return (0, 0, 1, 1) for a full-size rect', () => {
            const sheet = new SpriteSheet(mockImage);
            const uvs = sheet.getUVs(new Rect2i(0, 0, 256, 256));

            expect(uvs.u0).toBe(0);
            expect(uvs.v0).toBe(0);
            expect(uvs.u1).toBe(1);
            expect(uvs.v1).toBe(1);
        });

        it('should compute correct UVs for a sub-rect', () => {
            const sheet = new SpriteSheet(mockImage);
            const uvs = sheet.getUVs(new Rect2i(64, 32, 16, 16));

            expect(uvs.u0).toBe(64 / 256);
            expect(uvs.v0).toBe(32 / 256);
            expect(uvs.u1).toBe(80 / 256);
            expect(uvs.v1).toBe(48 / 256);
        });
    });

    describe('size', () => {
        it('should reflect the image dimensions', () => {
            const sheet = new SpriteSheet(mockImage);
            expect(sheet.size.x).toBe(256);
            expect(sheet.size.y).toBe(256);
        });

        it('should expose width and height accessors', () => {
            const sheet = new SpriteSheet(mockImage);
            expect(sheet.width).toBe(256);
            expect(sheet.height).toBe(256);
        });

        it('should return a full-sheet source rectangle', () => {
            const sheet = new SpriteSheet(mockImage);
            const rect = sheet.fullRect();

            expect(rect.x).toBe(0);
            expect(rect.y).toBe(0);
            expect(rect.width).toBe(256);
            expect(rect.height).toBe(256);
        });
    });

    describe('status and progress', () => {
        it('defaults to ready/1.0 for a normally constructed sheet', () => {
            const sheet = new SpriteSheet(mockImage);

            expect(sheet.status).toBe('ready');
            expect(sheet.progress).toBe(1.0);
        });

        it('defaults to ready/1.0 for a sheet created from raw indexed pixels', () => {
            const sheet = SpriteSheet.fromIndexedPixels(2, 2, new Uint8Array(4) as Uint8Array<ArrayBuffer>);

            expect(sheet.status).toBe('ready');
            expect(sheet.progress).toBe(1.0);
        });

        it('beginHotReplace marks the sheet loading with zero progress', () => {
            const sheet = new SpriteSheet(mockImage);

            sheet.beginHotReplace();

            expect(sheet.status).toBe('loading');
            expect(sheet.progress).toBe(0);
        });

        it('failHotReplace marks the sheet failed', () => {
            const sheet = new SpriteSheet(mockImage);

            sheet.beginHotReplace();
            sheet.failHotReplace();

            expect(sheet.status).toBe('failed');
        });
    });

    describe('getTexture', () => {
        it('should return a texture object from a mock device', () => {
            const sheet = new SpriteSheet(mockImage);
            const device = createMockGPUDevice();

            const texture = sheet.getTexture(device);
            expect(texture).toBeDefined();
            expect(texture.label).toBe('Sprite Sheet Texture');
        });

        it('should return the same cached texture on subsequent calls', () => {
            const sheet = new SpriteSheet(mockImage);
            const device = createMockGPUDevice();

            const first = sheet.getTexture(device);
            const second = sheet.getTexture(device);
            expect(second).toBe(first);
        });
    });

    describe('destroy', () => {
        it('should allow creating a new texture after destroy', () => {
            const sheet = new SpriteSheet(mockImage);
            const device = createMockGPUDevice();

            const first = sheet.getTexture(device);
            sheet.destroy();

            const second = sheet.getTexture(device);
            expect(second).not.toBe(first);
        });

        it('should call GPUTexture.destroy on the GPU texture', () => {
            const sheet = new SpriteSheet(mockImage);
            const device = createMockGPUDevice();

            const texture = sheet.getTexture(device);
            const destroySpy = vi.spyOn(texture, 'destroy');

            sheet.destroy();
            expect(destroySpy).toHaveBeenCalledOnce();
        });

        it('should not throw when destroyed before getTexture is called', () => {
            const sheet = new SpriteSheet(mockImage);
            expect(() => sheet.destroy()).not.toThrow();
        });
    });

    describe('getImage', () => {
        it('should return the source HTMLImageElement', () => {
            const sheet = new SpriteSheet(mockImage);
            expect(sheet.getImage()).toBe(mockImage);
        });
    });

    describe('isIndexed', () => {
        it('returns false before indexize is called', () => {
            const sheet = new SpriteSheet(mockImage);
            expect(sheet.isIndexed()).toBe(false);
        });
    });

    describe('indexize', () => {
        afterEach(() => {
            vi.restoreAllMocks();
            vi.unstubAllGlobals();
        });

        it('sets isIndexed to true after conversion', () => {
            // Default stub from setup.ts returns all-zero pixels (all transparent).
            const palette = new Palette(16);
            const sheet = new SpriteSheet(mockImage);

            sheet.indexize(palette);

            expect(sheet.isIndexed()).toBe(true);
        });

        it('maps transparent pixels (alpha=0) to palette index 0', () => {
            // All pixels fully transparent - expect no throws and all indices to be 0.
            const palette = new Palette(16);
            const sheet = new SpriteSheet({ width: 2, height: 2 } as HTMLImageElement);

            expect(() => sheet.indexize(palette)).not.toThrow();
            expect(sheet.isIndexed()).toBe(true);
        });

        it('maps opaque pixels to the matching palette index', () => {
            const w = 2;
            const h = 1;
            // One red pixel (alpha=255), one transparent pixel.
            const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);

            vi.stubGlobal('OffscreenCanvas', makeOffscreenCanvasMock(pixels, w, h));

            const palette = new Palette(16);
            palette.set(1, new Color32(255, 0, 0, 255)); // red at index 1

            const sheet = new SpriteSheet({ width: w, height: h } as HTMLImageElement);
            sheet.indexize(palette);

            expect(sheet.isIndexed()).toBe(true);
        });

        it('throws when an opaque pixel color is not in the palette', () => {
            const w = 1;
            const h = 1;
            // Solid red pixel - not in an empty palette.
            const pixels = new Uint8ClampedArray([200, 100, 50, 255]);

            vi.stubGlobal('OffscreenCanvas', makeOffscreenCanvasMock(pixels, w, h));

            const palette = new Palette(16); // no colors set (all black/transparent)
            const sheet = new SpriteSheet({ width: w, height: h } as HTMLImageElement);

            expect(() => sheet.indexize(palette)).toThrow(/c86432|pixel at \(0, 0\)/i);
        });

        it('creates an r8uint GPU texture on next getTexture call', () => {
            const palette = new Palette(16);
            const sheet = new SpriteSheet(mockImage);

            sheet.indexize(palette);

            const device = createMockGPUDevice();
            const createTextureSpy = vi.spyOn(device, 'createTexture');

            sheet.getTexture(device);

            expect(createTextureSpy).toHaveBeenCalledOnce();
            expect(createTextureSpy).toHaveBeenCalledWith(expect.objectContaining({ format: 'r8uint' }));
        });

        it('invalidates the existing texture when called a second time', () => {
            const palette = new Palette(16);
            const sheet = new SpriteSheet(mockImage);
            const device = createMockGPUDevice();

            sheet.indexize(palette);
            const first = sheet.getTexture(device);

            // Call indexize again - should destroy the existing texture.
            sheet.indexize(palette);
            const second = sheet.getTexture(device);

            expect(second).not.toBe(first);
        });
    });

    describe('reindexize', () => {
        afterEach(() => {
            vi.restoreAllMocks();
            vi.unstubAllGlobals();
        });

        it('throws when called before indexize', () => {
            const palette = new Palette(16);
            const sheet = new SpriteSheet(mockImage);

            expect(() => sheet.reindexize(palette)).toThrow(/indexize\(\) must be called before/i);
        });

        it('invalidates the GPU texture so the next getTexture re-creates it', () => {
            const palette = new Palette(16);
            const sheet = new SpriteSheet(mockImage);
            const device = createMockGPUDevice();

            sheet.indexize(palette);
            const first = sheet.getTexture(device);

            sheet.reindexize(palette);
            const second = sheet.getTexture(device);

            expect(second).not.toBe(first);
        });

        it('succeeds without error when palette is unchanged', () => {
            const palette = new Palette(16);
            const sheet = new SpriteSheet(mockImage);

            sheet.indexize(palette);

            expect(() => sheet.reindexize(palette)).not.toThrow();
        });
    });

    describe('load', () => {
        afterEach(() => {
            vi.restoreAllMocks();
            vi.unstubAllGlobals();
        });

        it('should create a SpriteSheet with an ImageBitmap when createImageBitmap succeeds', async () => {
            const mockBitmap = { close: vi.fn() } as unknown as ImageBitmap;
            vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(mockBitmap));
            vi.spyOn(AssetLoader, 'loadImage').mockResolvedValue(mockImage);

            const sheet = await SpriteSheet.load('test.png');
            expect(sheet).toBeInstanceOf(SpriteSheet);
            expect(sheet.size.x).toBe(256);
        });

        it('should fall back to HTMLImageElement when createImageBitmap throws', async () => {
            vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Not supported')));
            vi.spyOn(AssetLoader, 'loadImage').mockResolvedValue(mockImage);

            const sheet = await SpriteSheet.load('test.png');
            expect(sheet).toBeInstanceOf(SpriteSheet);
        });

        it('should close imageBitmap after getTexture uploads it to the GPU', async () => {
            const closeSpy = vi.fn();
            vi.stubGlobal(
                'createImageBitmap',
                vi.fn().mockResolvedValue({ close: closeSpy } as unknown as ImageBitmap),
            );
            vi.spyOn(AssetLoader, 'loadImage').mockResolvedValue(mockImage);

            const sheet = await SpriteSheet.load('test.png');
            sheet.getTexture(createMockGPUDevice());
            expect(closeSpy).toHaveBeenCalledOnce();
        });

        it('rejects oversized images returned from AssetLoader', async () => {
            vi.spyOn(AssetLoader, 'loadImage').mockResolvedValue({
                width: MAX_ASSET_DIMENSION + 1,
                height: 16,
            } as HTMLImageElement);

            await expect(SpriteSheet.load('huge.png')).rejects.toBeInstanceOf(AssetLimitError);
        });

        it('rejects images whose total pixel area exceeds engine limits', async () => {
            vi.spyOn(AssetLoader, 'loadImage').mockResolvedValue({
                width: 4096,
                height: 4097,
            } as HTMLImageElement);

            await expect(SpriteSheet.load('huge-area.png')).rejects.toBeInstanceOf(AssetLimitError);
            await expect(SpriteSheet.load('huge-area.png')).rejects.toThrow(MAX_ASSET_PIXELS.toLocaleString('en-US'));
        });

        it('should close imageBitmap on destroy when getTexture was never called', async () => {
            const closeSpy = vi.fn();
            vi.stubGlobal(
                'createImageBitmap',
                vi.fn().mockResolvedValue({ close: closeSpy } as unknown as ImageBitmap),
            );
            vi.spyOn(AssetLoader, 'loadImage').mockResolvedValue(mockImage);

            const sheet = await SpriteSheet.load('test.png');
            sheet.destroy();
            expect(closeSpy).toHaveBeenCalledOnce();
        });
    });

    describe('loadIndexed', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('loads colors, loads sheet, and indexizes in sequence', async () => {
            const palette = new Palette(32);
            const colors = [new Color32(1, 2, 3, 255)];
            const sheet = new SpriteSheet({ width: 12, height: 8 } as HTMLImageElement);
            const indexizeSpy = vi.spyOn(sheet, 'indexize').mockReturnValue(undefined);

            const loadColorsSpy = vi.spyOn(SpriteSheet, 'loadColorsIntoPalette').mockResolvedValue(colors);
            const loadSpy = vi.spyOn(SpriteSheet, 'load').mockResolvedValue(sheet);

            const result = await SpriteSheet.loadIndexed('hero.png', palette, 4);

            expect(loadColorsSpy).toHaveBeenCalledWith('hero.png', palette, 4, undefined);
            expect(loadSpy).toHaveBeenCalledWith('hero.png');
            expect(indexizeSpy).toHaveBeenCalledWith(palette);
            const loadColorsOrder = loadColorsSpy.mock.invocationCallOrder[0] ?? 0;
            const loadOrder = loadSpy.mock.invocationCallOrder[0] ?? 0;
            const indexizeOrder = indexizeSpy.mock.invocationCallOrder[0] ?? 0;
            expect(loadColorsOrder).toBeLessThan(loadOrder);
            expect(loadOrder).toBeLessThan(indexizeOrder);
            expect(result.sheet).toBe(sheet);
            expect(result.colors).toBe(colors);
            expect(result.srcRect.isEqual(new Rect2i(0, 0, 12, 8))).toBe(true);
        });

        it('forwards sort option to color registration', async () => {
            const palette = new Palette(32);
            const sheet = new SpriteSheet({ width: 2, height: 3 } as HTMLImageElement);

            const loadColorsSpy = vi.spyOn(SpriteSheet, 'loadColorsIntoPalette').mockResolvedValue([]);
            vi.spyOn(SpriteSheet, 'load').mockResolvedValue(sheet);
            vi.spyOn(sheet, 'indexize').mockReturnValue(undefined);

            await SpriteSheet.loadIndexed('hero.png', palette, 4, { sort: 'none' });

            expect(loadColorsSpy).toHaveBeenCalledWith('hero.png', palette, 4, { sort: 'none' });
        });
    });

    describe('loadColorsIntoPalette', () => {
        afterEach(() => {
            vi.restoreAllMocks();
            vi.unstubAllGlobals();
        });

        function stubLoad(pixels: Uint8ClampedArray, w: number, h: number) {
            vi.stubGlobal('OffscreenCanvas', makeOffscreenCanvasMock(pixels, w, h));
            vi.spyOn(AssetLoader, 'loadImage').mockResolvedValue({ width: w, height: h } as HTMLImageElement);
        }

        it('returns colors sorted darkest-first by luminance by default', async () => {
            // Three opaque pixels: bright white, medium red, near-black blue.
            // Scan order: white, red, blue. Luminance order: blue < red < white.
            const pixels = new Uint8ClampedArray([255, 255, 255, 255, 200, 0, 0, 255, 0, 0, 30, 255]);
            stubLoad(pixels, 3, 1);

            const palette = new Palette(16);
            const colors = await SpriteSheet.loadColorsIntoPalette('test.png', palette, 1);

            expect(colors).toHaveLength(3);
            expect(colors[0]?.b).toBe(30); // darkest first (blue)
            expect(colors[1]?.r).toBe(200); // red middle
            expect(colors[2]?.r).toBe(255); // brightest last (white)
            expect(colors[0]?.luminance).toBeLessThanOrEqual(colors[1]?.luminance ?? 0);
            expect(colors[1]?.luminance).toBeLessThanOrEqual(colors[2]?.luminance ?? 0);
        });

        it('preserves scan order when sort: "none"', async () => {
            const pixels = new Uint8ClampedArray([255, 255, 255, 255, 200, 0, 0, 255, 0, 0, 30, 255]);
            stubLoad(pixels, 3, 1);

            const palette = new Palette(16);
            const colors = await SpriteSheet.loadColorsIntoPalette('test.png', palette, 1, { sort: 'none' });

            expect(colors).toHaveLength(3);
            expect(colors[0]?.r).toBe(255); // white first (scan order)
            expect(colors[1]?.r).toBe(200); // red second
            expect(colors[2]?.b).toBe(30); // blue third
        });

        it('deduplicates identical opaque pixels on RGB', async () => {
            // Same red pixel three times.
            const pixels = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]);
            stubLoad(pixels, 3, 1);

            const palette = new Palette(16);
            const colors = await SpriteSheet.loadColorsIntoPalette('test.png', palette, 1);

            expect(colors).toHaveLength(1);
            expect(colors[0]?.r).toBe(255);
            expect(colors[0]?.g).toBe(0);
            expect(colors[0]?.b).toBe(0);
        });

        it('skips alpha=0 pixels and does not consume a palette slot', async () => {
            // Two transparent + one opaque red. Only the red should be registered.
            const pixels = new Uint8ClampedArray([0, 0, 0, 0, 99, 99, 99, 0, 200, 50, 25, 255]);
            stubLoad(pixels, 3, 1);

            const palette = new Palette(16);
            const colors = await SpriteSheet.loadColorsIntoPalette('test.png', palette, 5);

            expect(colors).toHaveLength(1);
            expect(palette.get(5).r).toBe(200);
        });

        it('forces alpha to 255 even when source alpha is partial', async () => {
            // Source has alpha=128 - should be stored as 255 to match indexize() lookup.
            const pixels = new Uint8ClampedArray([200, 100, 50, 128]);
            stubLoad(pixels, 1, 1);

            const palette = new Palette(16);
            const colors = await SpriteSheet.loadColorsIntoPalette('test.png', palette, 1);

            expect(colors).toHaveLength(1);
            expect(colors[0]?.a).toBe(255);
            expect(palette.get(1).a).toBe(255);
        });

        it('writes colors into consecutive palette slots starting at startSlot', async () => {
            // Three distinct opaque colors arranged darkest-to-brightest in scan order
            // so the default luminance sort does not reshuffle them.
            const pixels = new Uint8ClampedArray([10, 10, 10, 255, 100, 100, 100, 255, 250, 250, 250, 255]);
            stubLoad(pixels, 3, 1);

            const palette = new Palette(16);
            await SpriteSheet.loadColorsIntoPalette('test.png', palette, 4);

            expect(palette.get(4).r).toBe(10);
            expect(palette.get(5).r).toBe(100);
            expect(palette.get(6).r).toBe(250);
        });

        it('rejects when AssetLoader.loadImage rejects', async () => {
            vi.spyOn(AssetLoader, 'loadImage').mockRejectedValue(new Error('Failed to load image: missing.png'));

            const palette = new Palette(16);
            await expect(SpriteSheet.loadColorsIntoPalette('missing.png', palette, 1)).rejects.toThrow(
                /Failed to load image/,
            );
        });

        it('rejects oversized images before canvas readback', async () => {
            vi.spyOn(AssetLoader, 'loadImage').mockResolvedValue({
                width: MAX_ASSET_DIMENSION + 1,
                height: 16,
            } as HTMLImageElement);

            const palette = new Palette(16);
            await expect(SpriteSheet.loadColorsIntoPalette('huge.png', palette, 1)).rejects.toBeInstanceOf(
                AssetLimitError,
            );
        });

        it('rejects atomically when startSlot + discovered colors exceed palette size', async () => {
            // Four distinct opaque colors, but only two slots remain starting at slot 14 in a size-16 palette.
            const pixels = new Uint8ClampedArray([
                10, 10, 10, 255, 100, 100, 100, 255, 200, 200, 200, 255, 250, 250, 250, 255,
            ]);
            stubLoad(pixels, 4, 1);

            const palette = new Palette(16);
            const startSlot = 14;

            // Snapshot the target slots (and their neighbor) before the call so we can
            // verify no partial mutation on rejection.
            const before = [13, 14, 15].map((i) => palette.get(i));

            await expect(SpriteSheet.loadColorsIntoPalette('test.png', palette, startSlot)).rejects.toThrow(
                /do not fit in palette size 16/,
            );

            const after = [13, 14, 15].map((i) => palette.get(i));
            expect(after[0]?.isEqual(before[0] as Color32)).toBe(true);
            expect(after[1]?.isEqual(before[1] as Color32)).toBe(true);
            expect(after[2]?.isEqual(before[2] as Color32)).toBe(true);
        });
    });

    describe('fromIndexedPixels', () => {
        it('creates a sheet with correct dimensions', () => {
            const pixels = new Uint8Array(16 * 16) as Uint8Array<ArrayBuffer>;
            const sheet = SpriteSheet.fromIndexedPixels(16, 16, pixels);

            expect(sheet.size.x).toBe(16);
            expect(sheet.size.y).toBe(16);
        });

        it('marks the sheet as indexized', () => {
            const pixels = new Uint8Array(8 * 8) as Uint8Array<ArrayBuffer>;
            const sheet = SpriteSheet.fromIndexedPixels(8, 8, pixels);

            expect(sheet.isIndexed()).toBe(true);
        });

        it('throws on indexize (no source image)', () => {
            const pixels = new Uint8Array(4 * 4) as Uint8Array<ArrayBuffer>;
            const sheet = SpriteSheet.fromIndexedPixels(4, 4, pixels);
            const palette = new Palette(16);

            expect(() => sheet.indexize(palette)).toThrow('not available for sheets created from raw indexed data');
        });

        it('throws on reindexize (no source image)', () => {
            const pixels = new Uint8Array(4 * 4) as Uint8Array<ArrayBuffer>;
            const sheet = SpriteSheet.fromIndexedPixels(4, 4, pixels);
            const palette = new Palette(16);

            expect(() => sheet.reindexize(palette)).toThrow('not available for sheets created from raw indexed data');
        });

        it('throws on getImage (no source image)', () => {
            const pixels = new Uint8Array(4 * 4) as Uint8Array<ArrayBuffer>;
            const sheet = SpriteSheet.fromIndexedPixels(4, 4, pixels);

            expect(() => sheet.getImage()).toThrow('not available for sheets created from raw indexed data');
        });

        it('throws AssetLimitError when pixel array length mismatches dimensions', () => {
            const pixels = new Uint8Array(10) as Uint8Array<ArrayBuffer>;

            expect(() => SpriteSheet.fromIndexedPixels(4, 4, pixels)).toThrow(AssetLimitError);
            expect(() => SpriteSheet.fromIndexedPixels(4, 4, pixels)).toThrow(
                'The pixel data has 10 values, but a 4x4 sheet needs exactly 16.',
            );
        });

        it('rejects invalid raw dimensions before retaining buffers', () => {
            const pixels = new Uint8Array(16) as Uint8Array<ArrayBuffer>;

            expect(() => SpriteSheet.fromIndexedPixels(0, 4, pixels)).toThrow(AssetLimitError);
            expect(() => SpriteSheet.fromIndexedPixels(Number.NaN, 4, pixels)).toThrow(AssetLimitError);
        });

        it('rejects oversized indexed dimensions before allocation', () => {
            const pixels = new Uint8Array(16) as Uint8Array<ArrayBuffer>;

            expect(() => SpriteSheet.fromIndexedPixels(MAX_ASSET_DIMENSION + 1, 16, pixels)).toThrow(AssetLimitError);
        });

        it('creates r8uint GPU texture via getTexture', () => {
            const device = createMockGPUDevice();
            const createTextureSpy = vi.spyOn(device, 'createTexture');
            const pixels = new Uint8Array(4 * 4) as Uint8Array<ArrayBuffer>;
            const sheet = SpriteSheet.fromIndexedPixels(4, 4, pixels);

            const texture = sheet.getTexture(device);

            expect(texture).toBeDefined();
            expect(createTextureSpy).toHaveBeenCalledOnce();
            expect(createTextureSpy).toHaveBeenCalledWith(expect.objectContaining({ format: 'r8uint' }));
        });
    });

    describe('getIndexedPixels', () => {
        it('returns contents equal to the pixels passed to fromIndexedPixels', () => {
            const pixels = new Uint8Array([
                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
            ]) as Uint8Array<ArrayBuffer>;
            const sheet = SpriteSheet.fromIndexedPixels(4, 4, pixels);

            const result = sheet.getIndexedPixels();

            expect(result).toEqual(pixels);
        });

        it('returns a defensive copy - mutations do not affect internal state', () => {
            const pixels = new Uint8Array([0, 1, 2, 3]) as Uint8Array<ArrayBuffer>;
            const sheet = SpriteSheet.fromIndexedPixels(2, 2, pixels);

            const result = sheet.getIndexedPixels();
            result[0] = 99;

            expect(sheet.getIndexedPixels()[0]).toBe(0);
        });

        it('throws when the sheet has not been indexized yet', () => {
            const sheet = new SpriteSheet(mockImage);

            expect(() => sheet.getIndexedPixels()).toThrow(
                "This sprite sheet hasn't been converted to palette indices yet. Call sheet.indexize(palette) first.",
            );
        });
    });

    describe('markPaletteIndicesInRect', () => {
        it('marks resolved palette slots for unique non-zero sheet indices in the rect', () => {
            const pixels = new Uint8Array([
                0,
                1,
                1,
                0, //
                2,
                2,
                2,
                2, //
                0,
                3,
                3,
                0, //
                1,
                0,
                0,
                3, //
            ]) as Uint8Array<ArrayBuffer>;
            const sheet = SpriteSheet.fromIndexedPixels(4, 4, pixels);
            const mask = new Uint8Array(16);
            const scratch: number[] = [];

            sheet.markPaletteIndicesInRect(new Rect2i(0, 0, 4, 4), 0, mask);

            expect(collectUsedIndices(mask, 16, scratch)).toEqual([1, 2, 3]);
        });

        it('applies palette offset when marking resolved slots', () => {
            const pixels = new Uint8Array([1, 2, 0, 0]) as Uint8Array<ArrayBuffer>;
            const sheet = SpriteSheet.fromIndexedPixels(2, 2, pixels);
            const mask = new Uint8Array(16);
            const scratch: number[] = [];

            sheet.markPaletteIndicesInRect(new Rect2i(0, 0, 2, 2), 4, mask);

            expect(collectUsedIndices(mask, 16, scratch)).toEqual([5, 6]);
        });

        it('ignores transparent sheet pixels and leaves the mask unchanged when none are used', () => {
            const pixels = new Uint8Array([0, 0, 0, 0]) as Uint8Array<ArrayBuffer>;
            const sheet = SpriteSheet.fromIndexedPixels(2, 2, pixels);
            const mask = new Uint8Array(16);
            const scratch: number[] = [];

            sheet.markPaletteIndicesInRect(new Rect2i(0, 0, 2, 2), 0, mask);

            expect(collectUsedIndices(mask, 16, scratch)).toEqual([]);
        });

        it('is a no-op when the sheet is not indexized', () => {
            const sheet = new SpriteSheet(mockImage);
            const mask = new Uint8Array(16);
            const scratch: number[] = [];

            resetUsage(mask);
            sheet.markPaletteIndicesInRect(new Rect2i(0, 0, 16, 16), 0, mask);

            expect(collectUsedIndices(mask, 16, scratch)).toEqual([]);
        });
    });

    describe('hot reload', () => {
        function activateHotReload() {
            registerHotContext({
                data: {},
                on: vi.fn(),
                invalidate: vi.fn(),
                accept: vi.fn(),
            });
        }

        afterEach(() => {
            vi.restoreAllMocks();
            vi.unstubAllGlobals();
        });

        it('does not register a loaded sheet when hot reload is inactive', async () => {
            vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('n/a')));
            vi.spyOn(AssetLoader, 'loadImage').mockResolvedValue(mockImage);

            await SpriteSheet.load('inactive.png');

            expect(getHotReloadSheets('inactive.png')).toBeUndefined();
        });

        it('registers a loaded sheet under its normalized source URL once hot reload is active', async () => {
            activateHotReload();
            vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('n/a')));
            vi.spyOn(AssetLoader, 'loadImage').mockResolvedValue(mockImage);

            const sheet = await SpriteSheet.load('images/hero.png');

            expect(getHotReloadSheets('images/hero.png')).toEqual(new Set([sheet]));
            expect(getHotReloadSheets('/images/hero.png')).toEqual(new Set([sheet]));
        });

        it('removes a sheet from the registry on destroy', async () => {
            activateHotReload();
            vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('n/a')));
            vi.spyOn(AssetLoader, 'loadImage').mockResolvedValue(mockImage);

            const sheet = await SpriteSheet.load('images/gone.png');
            expect(getHotReloadSheets('images/gone.png')).toBeDefined();

            sheet.destroy();

            expect(getHotReloadSheets('images/gone.png')).toBeUndefined();
        });

        describe('hotReplaceImage', () => {
            it('warns and does nothing for a raw-indexed sheet (no source image)', () => {
                const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
                const sheet = SpriteSheet.fromIndexedPixels(2, 2, new Uint8Array(4) as Uint8Array<ArrayBuffer>);

                sheet.hotReplaceImage(mockImage, null);

                expect(warnSpy).toHaveBeenCalledOnce();
                expect(sheet.status).toBe('failed');
            });

            it('swaps the image and updates size for a non-indexized sheet', () => {
                const sheet = new SpriteSheet(mockImage);
                const newImage = { width: 64, height: 32 } as HTMLImageElement;

                sheet.beginHotReplace();
                sheet.hotReplaceImage(newImage, null);

                expect(sheet.getImage()).toBe(newImage);
                expect(sheet.size.x).toBe(64);
                expect(sheet.size.y).toBe(32);
                expect(sheet.status).toBe('ready');
                expect(sheet.progress).toBe(1.0);
            });

            it('marks the sheet failed and rethrows when the replacement image exceeds size limits', () => {
                const sheet = new SpriteSheet(mockImage);
                const oversized = { width: MAX_ASSET_DIMENSION + 1, height: 16 } as HTMLImageElement;

                sheet.beginHotReplace();

                expect(() => sheet.hotReplaceImage(oversized, null)).toThrow(AssetLimitError);
                expect(sheet.status).toBe('failed');
            });

            it('invalidates the cached texture for a non-indexized sheet', () => {
                const sheet = new SpriteSheet(mockImage);
                const device = createMockGPUDevice();
                const first = sheet.getTexture(device);

                sheet.hotReplaceImage({ width: 64, height: 64 } as HTMLImageElement, null);
                const second = sheet.getTexture(device);

                expect(second).not.toBe(first);
            });

            it('re-indexizes an already-indexized sheet against the active palette', () => {
                const pixels = new Uint8ClampedArray([255, 0, 0, 255]);
                vi.stubGlobal('OffscreenCanvas', makeOffscreenCanvasMock(pixels, 1, 1));

                const palette = new Palette(16);
                palette.set(1, new Color32(255, 0, 0, 255));

                const sheet = new SpriteSheet({ width: 1, height: 1 } as HTMLImageElement);
                sheet.indexize(palette);

                const nextPixels = new Uint8ClampedArray([0, 255, 0, 255]);
                vi.stubGlobal('OffscreenCanvas', makeOffscreenCanvasMock(nextPixels, 1, 1));
                palette.set(2, new Color32(0, 255, 0, 255));

                sheet.beginHotReplace();

                expect(() => sheet.hotReplaceImage({ width: 1, height: 1 } as HTMLImageElement, palette)).not.toThrow();
                expect(sheet.getIndexedPixels()[0]).toBe(2);
                expect(sheet.status).toBe('ready');
            });

            it('warns and skips when an indexized sheet has no active palette to reindex against', () => {
                const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
                const pixels = new Uint8ClampedArray([0, 0, 0, 0]);
                vi.stubGlobal('OffscreenCanvas', makeOffscreenCanvasMock(pixels, 1, 1));

                const palette = new Palette(16);
                const originalImage = { width: 1, height: 1 } as HTMLImageElement;
                const sheet = new SpriteSheet(originalImage);
                sheet.indexize(palette);

                const newImage = { width: 1, height: 1 } as HTMLImageElement;
                sheet.beginHotReplace();
                sheet.hotReplaceImage(newImage, null);

                expect(warnSpy).toHaveBeenCalledOnce();
                expect(sheet.getImage()).toBe(originalImage);
                expect(sheet.getImage()).not.toBe(newImage);
                expect(sheet.status).toBe('failed');
            });
        });
    });
});
