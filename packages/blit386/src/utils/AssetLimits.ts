import {
    assetDimensionAreaTooLargeError,
    assetDimensionInvalidError,
    assetDimensionTooLargeError,
    assetIndexedPixelLengthError,
    assetIndexedPixelOverflowError,
    btfontEmbeddedTextureFormatError,
    btfontEmbeddedTextureTooLargeError,
    btfontGlyphAreaTooLargeError,
    btfontGlyphCountTooLargeError,
    btfontGlyphMetricNotIntegerError,
    btfontGlyphNegativeAdvanceError,
    btfontGlyphNegativePositionError,
    btfontGlyphNegativeSizeError,
    btfontGlyphOutsideAtlasError,
    btfontGlyphSizeTooLargeError,
    btfontJsonTooLargeError,
} from './errorMessages';
import type { Rect2i } from './Rect2i';
import { MAX_RENDER_DIMENSION, MAX_RENDER_PIXELS } from './RenderLimits';

/** Maximum decoded asset width or height on either axis before CPU/GPU allocation. */
export const MAX_ASSET_DIMENSION = MAX_RENDER_DIMENSION;

/** Maximum total decoded pixels for an image or indexed buffer before allocation. */
export const MAX_ASSET_PIXELS = MAX_RENDER_PIXELS;

/** Shared allocation policy for sprite sheets, font atlases, and indexed pixel buffers. */
export const ASSET_DIMENSION_LIMITS = {
    maxWidth: MAX_ASSET_DIMENSION,
    maxHeight: MAX_ASSET_DIMENSION,
    maxPixels: MAX_ASSET_PIXELS,
} as const;

/** Maximum `.btfont` JSON payload size in bytes before parsing. */
export const MAX_BTFONT_JSON_BYTES = 1_048_576;

/** Required prefix for embedded `.btfont` texture data URIs. */
export const BTFONT_EMBEDDED_TEXTURE_PREFIX = 'data:image/png;base64,';

/** Maximum base64 payload size for an embedded `.btfont` texture (characters after the data-URI prefix). */
export const MAX_BTFONT_EMBEDDED_TEXTURE_BYTES = 524_288;

/** Maximum number of glyph entries accepted from a `.btfont` file. */
export const MAX_GLYPH_COUNT = 8192;

/** Maximum pixels iterated for a single software sprite blit (`width * height`). */
export const MAX_SPRITE_BLIT_PIXELS = MAX_ASSET_PIXELS;

/** Error type for asset-dimension failures surfaced through public load APIs. */
export class AssetLimitError extends Error {
    /**
     * Creates an asset limit error.
     *
     * @param message – User-facing validation message.
     */
    constructor(message: string) {
        super(message);
        this.name = 'AssetLimitError';
    }
}

/** Serialized glyph metrics from a `.btfont` file before conversion to {@link Glyph}. */
export interface BtfontGlyphData {
    /** X position in the texture atlas. */
    x: number;
    /** Y position in the texture atlas. */
    y: number;
    /** Glyph width in pixels. */
    w: number;
    /** Glyph height in pixels. */
    h: number;
    /** Horizontal offset when rendering. */
    ox: number;
    /** Vertical offset when rendering. */
    oy: number;
    /** Horizontal advance width. */
    adv: number;
}

/**
 * Formats width and height for error messages.
 *
 * @param width – Width in pixels.
 * @param height – Height in pixels.
 * @returns Size formatted as `WIDTHxHEIGHT`.
 */
export function formatSize(width: number, height: number): string {
    return `${width}x${height}`;
}

/**
 * Computes a safe pixel count when width and height are valid asset dimensions.
 *
 * @param width – Width in pixels.
 * @param height – Height in pixels.
 * @returns Total pixels when valid, otherwise `null`.
 */
export function computeSafePixelArea(width: number, height: number): number | null {
    if (!isPositiveIntegerDimension(width) || !isPositiveIntegerDimension(height)) {
        return null;
    }

    if (width > ASSET_DIMENSION_LIMITS.maxWidth || height > ASSET_DIMENSION_LIMITS.maxHeight) {
        return null;
    }

    const area = width * height;

    if (!Number.isSafeInteger(area) || area > ASSET_DIMENSION_LIMITS.maxPixels) {
        return null;
    }

    return area;
}

/**
 * Returns whether a value is a positive finite integer suitable for pixel sizing.
 *
 * @param value – Candidate dimension.
 * @returns True when the value is a positive whole number.
 */
function isPositiveIntegerDimension(value: number): boolean {
    return Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

/**
 * Returns whether a value is a finite integer suitable for glyph metrics.
 *
 * @param value – Candidate metric.
 * @returns True when the value is a finite whole number.
 */
function isIntegerMetric(value: number): boolean {
    return Number.isFinite(value) && Number.isInteger(value);
}

/**
 * Validates decoded image or indexed-buffer dimensions before allocation.
 *
 * @param context – Asset label used in error text (for example `'sprite sheet'`).
 * @param width – Width in pixels.
 * @param height – Height in pixels.
 * @returns A user-facing error message when invalid, otherwise `null`.
 */
export function validateDimensions(context: string, width: number, height: number): string | null {
    if (!isPositiveIntegerDimension(width) || !isPositiveIntegerDimension(height)) {
        return assetDimensionInvalidError(context, formatSize(width, height));
    }

    if (width > ASSET_DIMENSION_LIMITS.maxWidth || height > ASSET_DIMENSION_LIMITS.maxHeight) {
        return assetDimensionTooLargeError(
            context,
            formatSize(width, height),
            ASSET_DIMENSION_LIMITS.maxWidth,
            ASSET_DIMENSION_LIMITS.maxHeight,
        );
    }

    const area = width * height;

    if (!Number.isSafeInteger(area) || area > ASSET_DIMENSION_LIMITS.maxPixels) {
        return assetDimensionAreaTooLargeError(context, formatSize(width, height), ASSET_DIMENSION_LIMITS.maxPixels);
    }

    return null;
}

/**
 * Validates decoded image dimensions and throws when they exceed engine limits.
 *
 * @param context – Asset label used in error text.
 * @param width – Width in pixels.
 * @param height – Height in pixels.
 * @throws {@link AssetLimitError} when the dimensions are invalid.
 */
export function assertDimensions(context: string, width: number, height: number): void {
    const error = validateDimensions(context, width, height);

    if (error) {
        throw new AssetLimitError(error);
    }
}

/**
 * Validates an `HTMLImageElement` after decode and before canvas readback or texture upload.
 *
 * @param context – Asset label used in error text.
 * @param image – Loaded image element.
 * @throws {@link AssetLimitError} when the image dimensions are invalid.
 */
export function assertImageElementWithinLimits(context: string, image: HTMLImageElement): void {
    assertDimensions(context, image.width, image.height);
}

/**
 * Validates raw indexed pixel dimensions and optional buffer length before retention.
 *
 * @param width – Texture width in pixels.
 * @param height – Texture height in pixels.
 * @param pixelLength – Optional indexed pixel array length to compare against `width * height`.
 * @returns A user-facing error message when invalid, otherwise `null`.
 */
export function validateIndexedPixelInput(width: number, height: number, pixelLength?: number): string | null {
    const dimensionError = validateDimensions('indexed sprite sheet', width, height);

    if (dimensionError) {
        return dimensionError;
    }

    const expectedLength = computeSafePixelArea(width, height);

    if (expectedLength === null) {
        return assetIndexedPixelOverflowError(formatSize(width, height));
    }

    if (pixelLength !== undefined && pixelLength !== expectedLength) {
        return assetIndexedPixelLengthError(pixelLength, width, height, expectedLength);
    }

    return null;
}

/**
 * Validates raw indexed pixel dimensions and throws before buffer allocation.
 *
 * @param width – Texture width in pixels.
 * @param height – Texture height in pixels.
 * @param pixelLength – Optional indexed pixel array length to compare against `width * height`.
 * @throws {@link AssetLimitError} when the dimensions or length are invalid.
 */
export function assertIndexedPixelInput(width: number, height: number, pixelLength?: number): void {
    const error = validateIndexedPixelInput(width, height, pixelLength);

    if (error) {
        throw new AssetLimitError(error);
    }
}

/**
 * Validates a `.btfont` JSON payload size before parsing.
 *
 * @param byteLength – UTF-8 byte length of the JSON text.
 * @returns A user-facing error message when invalid, otherwise `null`.
 */
export function validateBtfontJsonByteSize(byteLength: number): string | null {
    if (!Number.isFinite(byteLength) || byteLength < 0 || !Number.isInteger(byteLength)) {
        return btfontJsonTooLargeError(byteLength, MAX_BTFONT_JSON_BYTES);
    }

    if (byteLength > MAX_BTFONT_JSON_BYTES) {
        return btfontJsonTooLargeError(byteLength, MAX_BTFONT_JSON_BYTES);
    }

    return null;
}

/**
 * Validates glyph map size before building lookup tables.
 *
 * @param count – Number of glyph entries.
 * @returns A user-facing error message when invalid, otherwise `null`.
 */
export function validateGlyphCount(count: number): string | null {
    if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
        return btfontGlyphCountTooLargeError(count, MAX_GLYPH_COUNT);
    }

    if (count > MAX_GLYPH_COUNT) {
        return btfontGlyphCountTooLargeError(count, MAX_GLYPH_COUNT);
    }

    return null;
}

/**
 * Validates an embedded `.btfont` texture URI before image decode.
 *
 * Relative PNG paths are accepted without additional checks. Embedded textures must
 * use {@link BTFONT_EMBEDDED_TEXTURE_PREFIX} and stay within
 * {@link MAX_BTFONT_EMBEDDED_TEXTURE_BYTES} base64 character count (after the prefix).
 *
 * @param texture – Texture field from a `.btfont` file.
 * @returns A user-facing error message when invalid, otherwise `null`.
 */
export function validateBtfontEmbeddedTextureUri(texture: string): string | null {
    const lowerTexture = texture.toLowerCase();

    if (!lowerTexture.startsWith('data:')) {
        return null;
    }

    if (!lowerTexture.startsWith(BTFONT_EMBEDDED_TEXTURE_PREFIX)) {
        return btfontEmbeddedTextureFormatError();
    }

    const payloadLength = texture.length - BTFONT_EMBEDDED_TEXTURE_PREFIX.length;

    if (payloadLength > MAX_BTFONT_EMBEDDED_TEXTURE_BYTES) {
        return btfontEmbeddedTextureTooLargeError(payloadLength, MAX_BTFONT_EMBEDDED_TEXTURE_BYTES);
    }

    return null;
}

/**
 * Validates numeric glyph metrics before atlas bounds are checked.
 *
 * @param glyph – Glyph metrics from the `.btfont` file.
 * @param charLabel – Character label used in error text.
 * @returns A user-facing error message when invalid, otherwise `null`.
 */
function validateBtfontGlyphMetrics(glyph: BtfontGlyphData, charLabel: string): string | null {
    const metrics: Array<[string, number]> = [
        ['x', glyph.x],
        ['y', glyph.y],
        ['w', glyph.w],
        ['h', glyph.h],
        ['ox', glyph.ox],
        ['oy', glyph.oy],
        ['adv', glyph.adv],
    ];

    for (const [name, value] of metrics) {
        if (!isIntegerMetric(value)) {
            return btfontGlyphMetricNotIntegerError(charLabel, name, value);
        }
    }

    if (glyph.x < 0 || glyph.y < 0) {
        return btfontGlyphNegativePositionError(charLabel);
    }

    if (glyph.w < 0 || glyph.h < 0) {
        return btfontGlyphNegativeSizeError(charLabel);
    }

    if (glyph.adv < 0) {
        return btfontGlyphNegativeAdvanceError(charLabel);
    }

    return null;
}

/**
 * Validates glyph metrics and per-glyph size limits before the font atlas image is decoded.
 *
 * @param glyph – Glyph metrics from the `.btfont` file.
 * @param charLabel – Character label used in error text.
 * @returns A user-facing error message when invalid, otherwise `null`.
 */
export function validateBtfontGlyphDataPreAtlas(glyph: BtfontGlyphData, charLabel: string): string | null {
    const metricError = validateBtfontGlyphMetrics(glyph, charLabel);

    if (metricError) {
        return metricError;
    }

    if (glyph.w > ASSET_DIMENSION_LIMITS.maxWidth || glyph.h > ASSET_DIMENSION_LIMITS.maxHeight) {
        return btfontGlyphSizeTooLargeError(
            charLabel,
            glyph.w,
            glyph.h,
            ASSET_DIMENSION_LIMITS.maxWidth,
            ASSET_DIMENSION_LIMITS.maxHeight,
        );
    }

    const glyphArea = glyph.w * glyph.h;

    if (glyph.w > 0 && glyph.h > 0 && (!Number.isSafeInteger(glyphArea) || glyphArea > MAX_SPRITE_BLIT_PIXELS)) {
        return btfontGlyphAreaTooLargeError(charLabel);
    }

    return null;
}

/**
 * Validates that a glyph rectangle fits inside the decoded font atlas.
 *
 * @param glyph – Glyph metrics from the `.btfont` file.
 * @param atlasWidth – Font texture atlas width in pixels.
 * @param atlasHeight – Font texture atlas height in pixels.
 * @param charLabel – Character label used in error text.
 * @returns A user-facing error message when invalid, otherwise `null`.
 */
export function validateBtfontGlyphAtlasBounds(
    glyph: BtfontGlyphData,
    atlasWidth: number,
    atlasHeight: number,
    charLabel: string,
): string | null {
    if (glyph.x + glyph.w > atlasWidth || glyph.y + glyph.h > atlasHeight) {
        return btfontGlyphOutsideAtlasError(charLabel, glyph.x, glyph.y, glyph.w, glyph.h, atlasWidth, atlasHeight);
    }

    return null;
}

/**
 * Validates one serialized glyph entry against atlas bounds and metric rules.
 *
 * @param glyph – Glyph metrics from the `.btfont` file.
 * @param atlasWidth – Font texture atlas width in pixels.
 * @param atlasHeight – Font texture atlas height in pixels.
 * @param charLabel – Character label used in error text.
 * @returns A user-facing error message when invalid, otherwise `null`.
 */
export function validateBtfontGlyphData(
    glyph: BtfontGlyphData,
    atlasWidth: number,
    atlasHeight: number,
    charLabel: string,
): string | null {
    const preAtlasError = validateBtfontGlyphDataPreAtlas(glyph, charLabel);

    if (preAtlasError) {
        return preAtlasError;
    }

    return validateBtfontGlyphAtlasBounds(glyph, atlasWidth, atlasHeight, charLabel);
}

/**
 * Clips a sprite source rectangle to the sheet and software blit limits.
 *
 * Returns `null` when the rectangle is empty, fully outside the sheet, or still
 * too large to iterate safely after clipping.
 *
 * @param srcRect – Requested source rectangle in sheet space.
 * @param sheetWidth – Sprite sheet width in pixels.
 * @param sheetHeight – Sprite sheet height in pixels.
 * @returns Clipped source bounds, or `null` when the blit should be skipped.
 */
export function clipSpriteSourceRect(
    srcRect: Rect2i,
    sheetWidth: number,
    sheetHeight: number,
): { x: number; y: number; width: number; height: number } | null {
    if (
        !Number.isFinite(srcRect.x) ||
        !Number.isFinite(srcRect.y) ||
        !Number.isFinite(srcRect.width) ||
        !Number.isFinite(srcRect.height) ||
        !Number.isInteger(srcRect.x) ||
        !Number.isInteger(srcRect.y) ||
        !Number.isInteger(srcRect.width) ||
        !Number.isInteger(srcRect.height)
    ) {
        return null;
    }

    if (srcRect.width <= 0 || srcRect.height <= 0) {
        return null;
    }

    const x0 = Math.max(0, srcRect.x);
    const y0 = Math.max(0, srcRect.y);
    const x1 = Math.min(sheetWidth, srcRect.x + srcRect.width);
    const y1 = Math.min(sheetHeight, srcRect.y + srcRect.height);
    const width = x1 - x0;
    const height = y1 - y0;

    if (width <= 0 || height <= 0) {
        return null;
    }

    const area = width * height;

    if (!Number.isSafeInteger(area) || area > MAX_SPRITE_BLIT_PIXELS) {
        return null;
    }

    return { x: x0, y: y0, width, height };
}
