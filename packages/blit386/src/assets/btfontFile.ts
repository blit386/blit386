/**
 * `.btfont` file loading for `BitmapFont`: the capped body read, JSON parsing and
 * validation, glyph table construction, texture resolution and decode, and the load error
 * messages. The class keeps the renderer side: glyph lookup, measuring, and hot reload.
 */

import {
    assertImageElementWithinLimits,
    AssetLimitError,
    BTFONT_EMBEDDED_TEXTURE_PREFIX,
    validateBtfontEmbeddedTextureUri,
    validateBtfontGlyphAtlasBounds,
    validateBtfontGlyphDataPreAtlas,
    validateBtfontJsonByteSize,
    validateBtfontTextureOrigin,
    validateGlyphCount,
} from '../utils/AssetLimits';
import { btfontGlyphEntryNotObjectError } from '../utils/errorMessages';
import { appendCacheBustQuery } from '../utils/HotReloadUrl';
import { Rect2i } from '../utils/Rect2i';
import { buildPathHint, extractExtension } from '../utils/urlHints';
import type { Glyph } from './BitmapFont';
import { readStreamedBody } from './readStreamedBody';

/** Size of the direct lookup table used for ASCII glyphs (`0-127`). */
export const ASCII_CACHE_SIZE = 128;

/**
 * Serialized glyph entry stored in `.btfont` files.
 */
interface GlyphData {
    /** X position in texture atlas. */
    x: number;

    /** Y position in texture atlas. */
    y: number;

    /** Width of glyph in pixels. */
    w: number;

    /** Height of glyph in pixels. */
    h: number;

    /** Horizontal offset when rendering. */
    ox: number;

    /** Vertical offset when rendering. */
    oy: number;

    /** Horizontal advance width. */
    adv: number;
}

/**
 * Serialized bitmap-font descriptor loaded from disk.
 */
interface FileData {
    /** Font display name. */
    name: string;

    /** Original font size in points. */
    size: number;

    /** Pixels between baselines for multi-line text. */
    lineHeight: number;

    /** Pixels from top of line to baseline (for alignment). */
    baseline: number;

    /**
     * Texture source. Can be:
     * - Base64-encoded PNG data URI (e.g., "data:image/png;base64,...")
     * - Relative path to the PNG file (resolved relative to .btfont file)
     */
    texture: string;

    /** Map of character to glyph data. Supports Unicode characters as keys. */
    glyphs: Record<string, GlyphData>;
}

/**
 * Returns whether a value is a non-null plain object (not an array).
 * Used to validate `FileData.glyphs` and individual glyph entries before reading their fields.
 *
 * @param value - The value to check.
 * @returns `true` if the value is a non-null plain object, `false` otherwise.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Creates an empty ASCII glyph lookup table pre-filled with `null`.
 *
 * @returns A new array of `Glyph | null` with `ASCII_CACHE_SIZE` elements, all initialized to `null`.
 */
export function createAsciiGlyphTable(): (Glyph | null)[] {
    return new Array<Glyph | null>(ASCII_CACHE_SIZE).fill(null);
}

/**
 * Writes a single-byte glyph into the ASCII fast-path table when the key is in range.
 *
 * @param asciiGlyphs - Pre-sized lookup table for codes `0-127`.
 * @param char - Glyph map key from the `.btfont` file.
 * @param glyph - Runtime glyph metadata to store.
 */
export function populateAsciiGlyph(asciiGlyphs: (Glyph | null)[], char: string, glyph: Glyph): void {
    if (char.length === 1) {
        const code = char.charCodeAt(0);

        if (code < ASCII_CACHE_SIZE) {
            // eslint-disable-next-line security/detect-object-injection -- Index is bounds-checked above
            asciiGlyphs[code] = glyph;
        }
    }
}

/**
 * Reads a `.btfont` response body, rejecting as soon as it passes the JSON size limit.
 *
 * Checks `Content-Length` before touching the body, then caps the running total while
 * streaming. Responses without a readable body fall back to `response.text()`, whose
 * UTF-8 length gets the same cap.
 *
 * @param response - Successful fetch response.
 * @returns Response body text.
 * @throws AssetLimitError if the body exceeds the `.btfont` JSON size limit.
 */
export async function readCappedText(response: Response): Promise<string> {
    const declared = Number(response.headers.get('content-length'));
    const declaredError = Number.isFinite(declared) && declared > 0 ? validateBtfontJsonByteSize(declared) : null;

    if (declaredError) {
        throw new AssetLimitError(declaredError);
    }

    if (response.body === null) {
        const text = await response.text();
        const textError = validateBtfontJsonByteSize(new TextEncoder().encode(text).length);

        if (textError) {
            throw new AssetLimitError(textError);
        }

        return text;
    }

    const bytes = await readStreamedBody(response.body, (total) => {
        const sizeError = validateBtfontJsonByteSize(total);

        if (sizeError) {
            throw new AssetLimitError(sizeError);
        }
    });

    return new TextDecoder().decode(bytes);
}

/**
 * Coerces a `.btfont` display `name` field to a non-empty string.
 *
 * @param value - Raw JSON value for `name`.
 * @returns Trimmed name when `value` is a non-empty string; otherwise `'Unknown'`.
 */
export function resolveDisplayName(value: unknown): string {
    return typeof value === 'string' && value.length > 0 ? value : 'Unknown';
}

/**
 * Coerces a `.btfont` metadata field to a positive finite number.
 *
 * @param value - Raw JSON value for `size`, `lineHeight`, or `baseline`.
 * @param fallback - Value used when `value` is missing or invalid.
 * @returns Safe positive metric for `BitmapFont` construction.
 */
export function resolvePositiveMetric(value: unknown, fallback: number): number {
    const parsed = parseMetricValue(value);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Coerces a raw `.btfont` metric field to a number.
 *
 * @param value - Raw JSON value for `size`, `lineHeight`, or `baseline`.
 * @returns Parsed number, or `NaN` when the value cannot be coerced.
 */
function parseMetricValue(value: unknown): number {
    return typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
}

/**
 * Parses and validates a `.btfont` JSON payload already capped by {@link readCappedText}.
 *
 * @param url - Path to the `.btfont` file (used in error messages).
 * @param jsonText - Raw JSON text from the font file.
 * @returns Parsed font descriptor and glyph map entries.
 */
export function parseBtfontFile(
    url: string,
    jsonText: string,
): { data: FileData; glyphEntries: Array<[string, GlyphData]> } {
    let parsed: unknown;

    try {
        parsed = JSON.parse(jsonText);
    } catch {
        throw buildBrokenFileError(url);
    }

    if (!isValidFileData(parsed)) {
        throw buildBrokenFileError(url);
    }

    const data = parsed;
    const glyphEntries = Object.entries(data.glyphs);
    const glyphCountError = validateGlyphCount(glyphEntries.length);

    if (glyphCountError) {
        throw new AssetLimitError(glyphCountError);
    }

    const embeddedTextureError = validateBtfontEmbeddedTextureUri(data.texture);

    if (embeddedTextureError) {
        throw new AssetLimitError(embeddedTextureError);
    }

    return { data, glyphEntries };
}

/**
 * Returns a consistent "broken or invalid .btfont" error with an extension hint appended.
 *
 * Used by both the JSON parse failure and the structural validation failure paths in
 * {@link parseBtfontFile} to ensure identical messaging.
 *
 * @param url - Path to the `.btfont` file (used in the error message and hint).
 * @returns Error ready to throw.
 */
function buildBrokenFileError(url: string): Error {
    return new Error(
        `The font file '${url}' is broken or not a valid .btfont file. Check that it's the right file.` +
            buildExtensionHint(url, '.btfont'),
    );
}

/**
 * Returns whether parsed `.btfont` JSON has the required top-level fields.
 *
 * @param data - Parsed font descriptor.
 * @returns Whether the data is valid.
 */
function isValidFileData(data: unknown): data is FileData {
    return (
        isPlainRecord(data) && typeof data.texture === 'string' && data.texture.length > 0 && isPlainRecord(data.glyphs)
    );
}

/**
 * Returns whether a glyph entry is a plain object suitable for validation.
 *
 * @param glyphData - Raw glyph entry from the parsed font file.
 * @returns Whether the glyph data is a valid object.
 */
function isGlyphEntryObject(glyphData: unknown): glyphData is GlyphData {
    return isPlainRecord(glyphData);
}

/**
 * Validates glyph entries before the font atlas image is decoded.
 *
 * @param glyphEntries - Glyph map entries from the parsed font file.
 */
export function validateGlyphEntriesPreAtlas(glyphEntries: Array<[string, GlyphData]>): void {
    for (const [char, glyphData] of glyphEntries) {
        if (!isGlyphEntryObject(glyphData)) {
            throw new AssetLimitError(btfontGlyphEntryNotObjectError(formatGlyphCharLabel(char)));
        }

        const glyphError = validateBtfontGlyphDataPreAtlas(glyphData, formatGlyphCharLabel(char));

        if (glyphError) {
            throw new AssetLimitError(glyphError);
        }
    }
}

/**
 * Converts validated `.btfont` glyph entries into runtime glyph maps.
 *
 * @param glyphEntries - Glyph map entries from the parsed font file.
 * @param atlasWidth - Font texture atlas width in pixels.
 * @param atlasHeight - Font texture atlas height in pixels.
 * @returns Glyph lookup tables for Unicode and ASCII fast paths.
 */
export function buildGlyphsFromEntries(
    glyphEntries: Array<[string, GlyphData]>,
    atlasWidth: number,
    atlasHeight: number,
): { glyphs: Map<string, Glyph>; asciiGlyphs: (Glyph | null)[] } {
    const glyphs = new Map<string, Glyph>();
    const asciiGlyphs = createAsciiGlyphTable();

    for (const [char, glyphData] of glyphEntries) {
        const glyphError = validateBtfontGlyphAtlasBounds(
            glyphData,
            atlasWidth,
            atlasHeight,
            formatGlyphCharLabel(char),
        );

        if (glyphError) {
            throw new AssetLimitError(glyphError);
        }

        const glyph: Glyph = {
            rect: new Rect2i(glyphData.x, glyphData.y, glyphData.w, glyphData.h),
            offsetX: glyphData.ox,
            offsetY: glyphData.oy,
            advance: glyphData.adv,
        };

        glyphs.set(char, glyph);

        populateAsciiGlyph(asciiGlyphs, char, glyph);
    }

    return { glyphs, asciiGlyphs };
}

/**
 * Loads a texture from either a base64 data URI or a relative path.
 *
 * @param texture - Data URI (starts with "data:") or relative path.
 * @param url - URL of the .btfont file (used to resolve relative paths).
 * @returns Loaded texture image for the font atlas.
 * @throws AssetLimitError (as a rejection) if the texture path leads to another origin than the font file.
 */
export function loadTexture(texture: string, url: string): Promise<HTMLImageElement> {
    // Embedded PNG data URIs are validated in parseBtfontFile before decode.
    if (texture.toLowerCase().startsWith(BTFONT_EMBEDDED_TEXTURE_PREFIX)) {
        return loadImage(texture);
    }

    // Relative paths are joined to the .btfont file's directory; the result must stay on its origin.
    const textureUrl = url.substring(0, url.lastIndexOf('/') + 1) + texture;
    const originError = validateBtfontTextureOrigin(textureUrl, url);

    return originError ? Promise.reject(new AssetLimitError(originError)) : loadImage(textureUrl);
}

/**
 * Cache-busts a `.btfont` texture reference for a hot reload, unless it is an
 * embedded data URI (always fresh from the just-re-fetched JSON, nothing to bust).
 *
 * @param texture - Raw `texture` field from the re-fetched `.btfont` JSON.
 * @returns `texture` unchanged for a data URI; otherwise with a cache-bust query appended.
 */
export function bustTextureUrl(texture: string): string {
    return texture.toLowerCase().startsWith(BTFONT_EMBEDDED_TEXTURE_PREFIX) ? texture : appendCacheBustQuery(texture);
}

/**
 * Returns a user-friendly load error for a font request.
 *
 * @param url - Font file path that failed to load.
 * @param status - HTTP status code from fetch.
 * @returns Beginner-friendly message with useful hints.
 */
export function buildLoadErrorMessage(url: string, status: number): string {
    const statusMessage =
        status === 404
            ? `Can't find the font file '${url}'. Check that the file exists and the path is spelled correctly.`
            : `The server had a problem loading the font file '${url}'. Try refreshing the page.`;

    const hints: string[] = [];
    const pathHint = buildPathHint(url, 'fonts');
    const extensionHint = buildExtensionHint(url, '.btfont');

    if (pathHint) {
        hints.push(pathHint);
    }

    if (extensionHint) {
        hints.push(extensionHint);
    }

    return hints.length > 0 ? `${statusMessage} ${hints.join(' ')}` : statusMessage;
}

/**
 * Suggests a corrected extension when the URL uses a different file type.
 *
 * @param url - Original URL string.
 * @param expectedExtension - Extension that should be used.
 * @returns Hint text or an empty string.
 */
function buildExtensionHint(url: string, expectedExtension: string): string {
    const extension = extractExtension(url);

    return extension !== '' && extension !== expectedExtension
        ? `The extension '${extension}' looks wrong for this file. Did you mean '${expectedExtension}'?`
        : '';
}

/**
 * Formats a glyph character label for user-facing validation errors.
 *
 * @param char - Glyph map key from the `.btfont` file.
 * @returns Printable label or a Unicode code point for control characters.
 */
function formatGlyphCharLabel(char: string): string {
    let label = char;

    if (char.length === 1) {
        const code = char.charCodeAt(0);

        // Control character boundary codes used when formatting glyph validation error labels.
        // Code points at or below `controlCharBoundary`, or equal to `asciiDelCode`,
        // are rendered as `U+XXXX` escape sequences rather than literal characters.
        const controlCharBoundary = 31;
        const asciiDelCode = 127;

        if (code <= controlCharBoundary || code === asciiDelCode) {
            label = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
        }
    }

    return label;
}

/**
 * Loads an image from a URL or data URI.
 *
 * @param src - Image source (URL or data URI).
 * @returns Loaded image element for the font texture.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.onload = () => {
            let loadError: unknown;

            try {
                assertImageElementWithinLimits('font texture', image);
            } catch (error) {
                loadError = error;
            }

            if (loadError === undefined) {
                resolve(image);
            } else {
                reject(loadError);
            }
        };
        image.onerror = () => {
            // Maximum characters shown from a texture source string in load-failure messages.
            const maxErrorURLDisplayChars = 50;

            return reject(
                new Error(
                    `Can't find the font texture image '${src.substring(0, maxErrorURLDisplayChars)}'. ` +
                        'Check for typos, wrong letter casing, or a missing file extension.',
                ),
            );
        };

        image.src = src;
    });
}
