import { describe, expect, it } from 'vitest';

import {
    MAX_ASSET_PIXELS,
    MAX_BTFONT_EMBEDDED_TEXTURE_BYTES,
    MAX_BTFONT_JSON_BYTES,
    MAX_GLYPH_COUNT,
} from './AssetLimits';
import {
    assetDimensionAreaTooLargeError,
    assetDimensionInvalidError,
    assetDimensionTooLargeError,
    assetIndexedPixelLengthError,
    audioClipDecodeError,
    audioClipHttpError,
    audioClipNetworkError,
    audioClipNotReadyError,
    btfontEmbeddedTextureFormatError,
    btfontEmbeddedTextureTooLargeError,
    btfontGlyphCountTooLargeError,
    btfontJsonTooLargeError,
    CANVAS_NOT_FOUND_MESSAGE,
    INIT_FAILED_MESSAGE,
    noActivePaletteError,
    OVERLAY_NO_BACKEND,
    paletteIndexNegativeError,
    paletteIndexOutOfRangeError,
    renderDimensionAreaTooLargeError,
    renderDimensionGPULimitError,
    renderDimensionInvalidError,
    renderDimensionTooLargeError,
    spriteColorNotInPaletteError,
    spriteNotIndexizedError,
    WEBGPU_ADAPTER_MESSAGE,
    WEBGPU_DEVICE_MESSAGE,
} from './errorMessages';

describe('errorMessages', () => {
    describe('CANVAS_NOT_FOUND_MESSAGE', () => {
        it('should interpolate the canvas ID into the message', () => {
            expect(CANVAS_NOT_FOUND_MESSAGE('blit386-canvas')).toContain('blit386-canvas');
        });

        it('should produce different messages for different canvas IDs', () => {
            expect(CANVAS_NOT_FOUND_MESSAGE('canvas-a')).not.toBe(CANVAS_NOT_FOUND_MESSAGE('canvas-b'));
        });

        it('should mention canvas element syntax', () => {
            expect(CANVAS_NOT_FOUND_MESSAGE('my-canvas')).toContain('<canvas');
        });
    });

    describe('INIT_FAILED_MESSAGE', () => {
        it('should be a non-empty string', () => {
            expect(typeof INIT_FAILED_MESSAGE).toBe('string');
            expect(INIT_FAILED_MESSAGE.length).toBeGreaterThan(0);
        });

        it('should mention F12 for console access', () => {
            expect(INIT_FAILED_MESSAGE).toContain('F12');
        });
    });

    describe('WEBGPU_ADAPTER_MESSAGE', () => {
        it('should be a non-empty string', () => {
            expect(typeof WEBGPU_ADAPTER_MESSAGE).toBe('string');
            expect(WEBGPU_ADAPTER_MESSAGE.length).toBeGreaterThan(0);
        });

        it('should mention hardware acceleration', () => {
            expect(WEBGPU_ADAPTER_MESSAGE).toContain('hardware acceleration');
        });
    });

    describe('WEBGPU_DEVICE_MESSAGE', () => {
        it('should be a non-empty string', () => {
            expect(typeof WEBGPU_DEVICE_MESSAGE).toBe('string');
            expect(WEBGPU_DEVICE_MESSAGE.length).toBeGreaterThan(0);
        });

        it('should suggest closing other tabs or restarting', () => {
            expect(WEBGPU_DEVICE_MESSAGE).toContain('closing other tabs');
        });
    });

    describe('OVERLAY_NO_BACKEND', () => {
        it('should be a non-empty string', () => {
            expect(typeof OVERLAY_NO_BACKEND).toBe('string');
            expect(OVERLAY_NO_BACKEND.length).toBeGreaterThan(0);
        });

        it('should mention backend readiness', () => {
            expect(OVERLAY_NO_BACKEND).toContain("backend isn't ready");
        });
    });

    describe('renderDimensionInvalidError', () => {
        it('includes the field name and invalid size', () => {
            const message = renderDimensionInvalidError('displaySize', '0x240');

            expect(message).toContain('displaySize');
            expect(message).toContain('0x240');
        });

        it('directs the author to update configure()', () => {
            expect(renderDimensionInvalidError('drawingBufferSize', '320.5x240')).toContain('configure()');
        });
    });

    describe('renderDimensionTooLargeError', () => {
        it('includes the field name, size, and axis limits', () => {
            const message = renderDimensionTooLargeError('maxCanvasSize', '9000x720', 8192, 8192);

            expect(message).toContain('maxCanvasSize');
            expect(message).toContain('9000x720');
            expect(message).toContain('8192x8192');
        });

        it('directs the author to use a smaller configure() size', () => {
            expect(renderDimensionTooLargeError('displaySize', '9000x240', 8192, 8192)).toContain('configure()');
        });
    });

    describe('renderDimensionAreaTooLargeError', () => {
        it('includes the field name, size, and formatted pixel cap', () => {
            const message = renderDimensionAreaTooLargeError('displaySize', '4096x4097', 16_777_216);

            expect(message).toContain('displaySize');
            expect(message).toContain('4096x4097');
            expect(message).toContain('16,777,216');
        });
    });

    describe('renderDimensionGPULimitError', () => {
        it('includes the field name, size, and graphics-card limit', () => {
            const message = renderDimensionGPULimitError('drawingBufferSize', '2048x1024', 1024);

            expect(message).toContain('drawingBufferSize');
            expect(message).toContain('2048x1024');
            expect(message).toContain('graphics card');
            expect(message).toContain('1024');
        });
    });
});

describe('asset limit error message helpers', () => {
    it('assetDimensionInvalidError mentions whole-number dimensions', () => {
        expect(assetDimensionInvalidError('sprite sheet', '0x16')).toContain('whole-number');
    });

    it('assetDimensionTooLargeError includes per-axis limits', () => {
        expect(assetDimensionTooLargeError('sprite sheet', '9000x16', 8192, 8192)).toContain('8192x8192');
    });

    it('assetDimensionAreaTooLargeError formats the pixel cap', () => {
        expect(assetDimensionAreaTooLargeError('sprite sheet', '4096x4097', MAX_ASSET_PIXELS)).toContain(
            MAX_ASSET_PIXELS.toLocaleString('en-US'),
        );
    });

    it('assetIndexedPixelLengthError compares actual and expected lengths', () => {
        expect(assetIndexedPixelLengthError(10, 4, 4, 16)).toContain('10 values');
        expect(assetIndexedPixelLengthError(10, 4, 4, 16)).toContain('16');
    });

    it('btfontJsonTooLargeError suggests moving textures to a PNG file', () => {
        expect(btfontJsonTooLargeError(MAX_BTFONT_JSON_BYTES + 1, MAX_BTFONT_JSON_BYTES)).toContain('separate PNG');
    });

    it('btfontGlyphCountTooLargeError includes the glyph cap', () => {
        expect(btfontGlyphCountTooLargeError(MAX_GLYPH_COUNT + 1, MAX_GLYPH_COUNT)).toContain(
            MAX_GLYPH_COUNT.toLocaleString('en-US'),
        );
    });

    it('btfontEmbeddedTextureFormatError requires a PNG data URI', () => {
        expect(btfontEmbeddedTextureFormatError()).toContain('data:image/png;base64');
    });

    it('btfontEmbeddedTextureTooLargeError includes the payload cap', () => {
        expect(
            btfontEmbeddedTextureTooLargeError(
                MAX_BTFONT_EMBEDDED_TEXTURE_BYTES + 1,
                MAX_BTFONT_EMBEDDED_TEXTURE_BYTES,
            ),
        ).toContain(MAX_BTFONT_EMBEDDED_TEXTURE_BYTES.toLocaleString('en-US'));
    });
});

describe('runtime error message helpers', () => {
    describe('noActivePaletteError', () => {
        it('returns a non-empty string', () => {
            expect(noActivePaletteError().length).toBeGreaterThan(0);
        });

        it('mentions BT.paletteSet', () => {
            expect(noActivePaletteError()).toContain('BT.paletteSet');
        });

        it('is consistent across calls', () => {
            expect(noActivePaletteError()).toBe(noActivePaletteError());
        });
    });

    describe('paletteIndexNegativeError', () => {
        it('includes the supplied index', () => {
            expect(paletteIndexNegativeError(-3)).toContain('-3');
        });

        it('mentions 0 or higher', () => {
            expect(paletteIndexNegativeError(-3)).toContain('0 or higher');
        });

        it('produces different messages for different indices', () => {
            expect(paletteIndexNegativeError(-1)).not.toBe(paletteIndexNegativeError(-5));
        });
    });

    describe('paletteIndexOutOfRangeError', () => {
        it('includes the supplied index', () => {
            expect(paletteIndexOutOfRangeError(999, 256)).toContain('999');
        });

        it('includes the palette size', () => {
            expect(paletteIndexOutOfRangeError(999, 256)).toContain('256');
        });

        it('states the valid upper bound', () => {
            expect(paletteIndexOutOfRangeError(999, 256)).toContain('255');
        });

        it('produces different messages for different sizes', () => {
            expect(paletteIndexOutOfRangeError(20, 16)).not.toBe(paletteIndexOutOfRangeError(20, 32));
        });
    });

    describe('spriteColorNotInPaletteError', () => {
        it('includes the pixel coordinates', () => {
            const msg = spriteColorNotInPaletteError(10, 5, "'sheet.png'", '#ff0000');
            expect(msg).toContain('(10, 5)');
        });

        it('includes the source image name', () => {
            const msg = spriteColorNotInPaletteError(10, 5, "'sheet.png'", '#ff0000');
            expect(msg).toContain("'sheet.png'");
        });

        it('includes the hex color', () => {
            const msg = spriteColorNotInPaletteError(10, 5, "'sheet.png'", '#ff0000');
            expect(msg).toContain('#ff0000');
        });

        it('suggests adding the color or editing the image', () => {
            const msg = spriteColorNotInPaletteError(10, 5, "'sheet.png'", '#ff0000');
            expect(msg).toContain('add');
        });
    });

    describe('spriteNotIndexizedError', () => {
        it('returns a non-empty string', () => {
            expect(spriteNotIndexizedError().length).toBeGreaterThan(0);
        });

        it('mentions SpriteSheet.loadIndexed', () => {
            expect(spriteNotIndexizedError()).toContain('SpriteSheet.loadIndexed');
        });

        it('mentions indexize as the manual path', () => {
            expect(spriteNotIndexizedError()).toContain('indexize');
        });

        it('is consistent across calls', () => {
            expect(spriteNotIndexizedError()).toBe(spriteNotIndexizedError());
        });
    });
});

describe('audio clip error message helpers', () => {
    describe('audioClipNetworkError', () => {
        it('returns a non-empty string', () => {
            expect(audioClipNetworkError('music.mp3').length).toBeGreaterThan(0);
        });

        it('includes the requested URL', () => {
            expect(audioClipNetworkError('music.mp3')).toContain('music.mp3');
        });

        it('suggests checking the connection, path, and CORS/hosting', () => {
            const message = audioClipNetworkError('music.mp3');

            expect(message).toContain('internet connection');
            expect(message).toContain('path is correct');
            expect(message).toContain('cross-origin (CORS)');
        });

        it('suggests a common audio extension when the URL extension looks wrong', () => {
            expect(audioClipNetworkError('music.xyz')).toContain('.mp3');
        });

        it('is consistent across calls with the same URL', () => {
            expect(audioClipNetworkError('music.mp3')).toBe(audioClipNetworkError('music.mp3'));
        });

        it('produces different messages for different URLs', () => {
            expect(audioClipNetworkError('a.mp3')).not.toBe(audioClipNetworkError('b.mp3'));
        });
    });

    describe('audioClipHttpError', () => {
        it('returns a non-empty string', () => {
            expect(audioClipHttpError('music.mp3', 404).length).toBeGreaterThan(0);
        });

        it('includes the requested URL', () => {
            expect(audioClipHttpError('music.mp3', 404)).toContain('music.mp3');
        });

        it("says it can't find the file for a 404 status", () => {
            expect(audioClipHttpError('music.mp3', 404)).toContain("Can't find the audio file");
        });

        it('says the server had a problem and suggests refreshing for a non-404 status', () => {
            const message = audioClipHttpError('music.mp3', 500);

            expect(message).toContain('server had a problem');
            expect(message).toContain('500');
            expect(message).toContain('Try refreshing the page');
        });

        it('suggests a common audio extension when the URL extension looks wrong', () => {
            expect(audioClipHttpError('music.xyz', 404)).toContain('.wav');
        });

        it('is consistent across calls with the same inputs', () => {
            expect(audioClipHttpError('music.mp3', 404)).toBe(audioClipHttpError('music.mp3', 404));
        });

        it('produces different messages for a 404 versus a non-404 status', () => {
            expect(audioClipHttpError('music.mp3', 404)).not.toBe(audioClipHttpError('music.mp3', 500));
        });
    });

    describe('audioClipDecodeError', () => {
        it('returns a non-empty string', () => {
            expect(audioClipDecodeError('music.mp3').length).toBeGreaterThan(0);
        });

        it('includes the requested URL', () => {
            expect(audioClipDecodeError('music.mp3')).toContain('music.mp3');
        });

        it('mentions the browser probably not supporting the container or codec', () => {
            expect(audioClipDecodeError('music.mp3')).toContain("doesn't support this container or codec");
        });

        it('includes a format-support hint naming well-supported formats', () => {
            const message = audioClipDecodeError('music.mp3');

            expect(message).toContain('MP3');
            expect(message).toContain('OGG Vorbis');
            expect(message).toContain('WAV');
        });

        it('recommends passing a fallback URL list to AudioClip.load()', () => {
            expect(audioClipDecodeError('music.mp3')).toContain('AudioClip.load()');
        });

        it('is consistent across calls with the same URL', () => {
            expect(audioClipDecodeError('music.mp3')).toBe(audioClipDecodeError('music.mp3'));
        });

        it('produces different messages for different URLs', () => {
            expect(audioClipDecodeError('a.mp3')).not.toBe(audioClipDecodeError('b.mp3'));
        });
    });

    describe('audioClipNotReadyError', () => {
        it('returns a non-empty string', () => {
            expect(audioClipNotReadyError().length).toBeGreaterThan(0);
        });

        it('mentions waiting for BT.init() before loading an AudioClip', () => {
            const message = audioClipNotReadyError();

            expect(message).toContain('BT.init()');
            expect(message).toContain('AudioClip');
        });

        it('is consistent across calls', () => {
            expect(audioClipNotReadyError()).toBe(audioClipNotReadyError());
        });
    });
});
