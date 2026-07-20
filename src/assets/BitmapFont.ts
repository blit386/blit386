import { isHotActive } from '../hot/HotRuntime';
import {
    assertImageElementWithinLimits,
    AssetLimitError,
    BTFONT_EMBEDDED_TEXTURE_PREFIX,
    validateBtfontEmbeddedTextureUri,
    validateBtfontGlyphAtlasBounds,
    validateBtfontGlyphDataPreAtlas,
    validateBtfontJsonByteSize,
    validateGlyphCount,
} from '../utils/AssetLimits';
import { btfontGlyphEntryNotObjectError } from '../utils/errorMessages';
import { appendCacheBustQuery, normalizeAssetUrl } from '../utils/HotReloadUrl';
import { Rect2i } from '../utils/Rect2i';
import { buildPathHint, extractExtension } from '../utils/urlHints';
import type { Palette } from './Palette';
import { SpriteSheet } from './SpriteSheet';

/**
 * Runtime glyph metadata used by the renderer.
 */
export interface Glyph {
    /** Source rectangle in the font texture atlas. */
    rect: Rect2i;

    /** Horizontal offset from the pen position when rendering. */
    offsetX: number;

    /** Vertical offset from the pen position when rendering. */
    offsetY: number;

    /** Horizontal advance after drawing (distance to next character). */
    advance: number;
}

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
 * Measured text dimensions in pixels.
 *
 * @since 0.1.0
 */
export interface TextSize {
    /** Width of the text in pixels. */
    width: number;

    /** Height of the text in pixels. */
    height: number;
}

/** Size of the direct lookup table used for ASCII glyphs (`0-127`). */
const ASCII_CACHE_SIZE = 128;

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
function createAsciiGlyphTable(): (Glyph | null)[] {
    return new Array<Glyph | null>(ASCII_CACHE_SIZE).fill(null);
}

/**
 * Writes a single-byte glyph into the ASCII fast-path table when the key is in range.
 *
 * @param asciiGlyphs - Pre-sized lookup table for codes `0-127`.
 * @param char - Glyph map key from the `.btfont` file.
 * @param glyph - Runtime glyph metadata to store.
 */
function populateAsciiGlyph(asciiGlyphs: (Glyph | null)[], char: string, glyph: Glyph): void {
    if (char.length === 1) {
        const code = char.charCodeAt(0);

        if (code < ASCII_CACHE_SIZE) {
            // eslint-disable-next-line security/detect-object-injection -- Index is bounds-checked above
            asciiGlyphs[code] = glyph;
        }
    }
}

/**
 * Dev-only registry of live bitmap fonts keyed by normalized `.btfont` source URL,
 * so `HotRuntime.handleAssetChanged` can find and hot-reload every font loaded from
 * a changed font file. Populated only while {@link isHotActive} (no production
 * memory cost). Entries are never pruned - unlike {@link SpriteSheet}, `BitmapFont`
 * has no destroy/dispose lifecycle to hook; acceptable since the registry only
 * exists in dev mode.
 */
const hotReloadRegistry = new Map<string, Set<BitmapFont>>();

/**
 * Registers `font` under its normalized source URL for hot-reload routing, when a
 * Vite HMR context is active. Called by {@link BitmapFont.load}.
 *
 * @param url - Source URL the font was loaded from.
 * @param font - Font to register.
 */
function registerFontForHotReload(url: string, font: BitmapFont): void {
    if (!isHotActive()) {
        return;
    }

    const key = normalizeAssetUrl(url);
    const bucket = hotReloadRegistry.get(key) ?? new Set<BitmapFont>();

    bucket.add(font);
    hotReloadRegistry.set(key, bucket);
}

/**
 * Returns every registered font loaded from a URL matching `url` after normalization.
 *
 * Internal - used by `HotRuntime.handleAssetChanged` to route a `'font'`
 * asset-changed event to the fonts that need reloading.
 *
 * @param url - Changed asset URL to look up.
 * @returns Matching fonts, or `undefined` when none are registered.
 */
export function getHotReloadFonts(url: string): ReadonlySet<BitmapFont> | undefined {
    return hotReloadRegistry.get(normalizeAssetUrl(url));
}

/**
 * Bitmap font backed by a sprite-sheet texture atlas.
 *
 * The class is responsible for:
 * - loading `.btfont` metadata and its referenced texture
 * - exposing glyph lookup by character or character code
 * - measuring string widths with a small reusable cache
 * - providing the underlying {@link SpriteSheet} used for rendering glyph quads
 *
 * @since 0.1.0
 */
export class BitmapFont {
    /** Font display name. */
    public readonly name: string;

    /** Original font size in points. */
    public readonly size: number;

    /** Pixels between baselines for multi-line text. */
    public readonly lineHeight: number;

    /** Pixels from top of line to baseline. */
    public readonly baseline: number;

    /** Sprite sheet containing the font texture atlas. */
    private readonly spriteSheet: SpriteSheet;

    /** Map of character strings to glyph metadata (for Unicode characters). */
    private glyphs: Map<string, Glyph> = new Map();

    /** Direct array lookup for ASCII characters (codes 0-127) for fast access. */
    private readonly asciiGlyphs: (Glyph | null)[] = new Array<Glyph | null>(ASCII_CACHE_SIZE).fill(null);

    /** Cache for text measurement results to avoid repeated calculations. */
    private measureCache: Map<string, number> = new Map();

    /**
     * Creates a BitmapFont instance.
     * Use {@link BitmapFont.load} or {@link BitmapFont.createFromGlyphs} to construct instances.
     *
     * @param spriteSheet - Texture atlas containing all font glyphs.
     * @param glyphs - Map of character strings to glyph metadata.
     * @param asciiGlyphs - Pre-populated ASCII lookup array.
     * @param name - Font display name.
     * @param size - Original font size in points.
     * @param lineHeight - Vertical spacing between lines.
     * @param baseline - Distance from top to text baseline.
     */
    private constructor(
        spriteSheet: SpriteSheet,
        glyphs: Map<string, Glyph>,
        asciiGlyphs: (Glyph | null)[],
        name: string,
        size: number,
        lineHeight: number,
        baseline: number,
    ) {
        this.spriteSheet = spriteSheet;
        this.glyphs = glyphs;
        this.asciiGlyphs = asciiGlyphs;
        this.name = name;
        this.size = size;
        this.lineHeight = lineHeight;
        this.baseline = baseline;
    }

    /**
     * Returns the total number of glyphs loaded into the font.
     *
     * @returns Total glyph count.
     */
    get glyphCount(): number {
        return this.glyphs.size;
    }

    /**
     * Creates a bitmap font synchronously from pre-built glyph data.
     *
     * Used for embedded fonts (e.g. the built-in system font) where the sprite
     * sheet and glyph map are already constructed in memory. The sprite sheet
     * should already contain indexed pixel data via
     * {@link SpriteSheet.fromIndexedPixels}.
     *
     * @param spriteSheet - Texture atlas containing all font glyphs.
     * @param glyphs - Map of character strings to glyph metadata.
     * @param name - Font display name.
     * @param size - Font size in points.
     * @param lineHeight - Vertical spacing between lines in pixels.
     * @param baseline - Distance from top to text baseline in pixels.
     * @returns Fully constructed BitmapFont ready for rendering.
     */
    static createFromGlyphs(
        spriteSheet: SpriteSheet,
        glyphs: Map<string, Glyph>,
        name: string,
        size: number,
        lineHeight: number,
        baseline: number,
    ): BitmapFont {
        const asciiGlyphs = createAsciiGlyphTable();

        for (const [char, glyph] of glyphs) {
            populateAsciiGlyph(asciiGlyphs, char, glyph);
        }

        return new BitmapFont(spriteSheet, glyphs, asciiGlyphs, name, size, lineHeight, baseline);
    }

    /**
     * Loads a bitmap font from a `.btfont` JSON file.
     *
     * The font descriptor can reference either an embedded PNG data URI
     * (`data:image/png;base64,...`) or a texture file path relative to the font JSON file.
     *
     * @param url - Path to the .btfont file.
     * @returns Loaded bitmap font instance.
     * @throws Error if the font descriptor or texture cannot be loaded.
     */
    static async load(url: string): Promise<BitmapFont> {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(BitmapFont.buildLoadErrorMessage(url, response.status));
        }

        const { data, glyphEntries } = BitmapFont.parseBtfontFile(url, await response.text());

        BitmapFont.validateGlyphEntriesPreAtlas(glyphEntries);

        // Load texture - embedded PNG data URIs and relative PNG paths are both allowed.
        const image = await BitmapFont.loadTexture(data.texture, url);
        const spriteSheet = new SpriteSheet(image);
        const atlasWidth = spriteSheet.width;
        const atlasHeight = spriteSheet.height;

        const { glyphs, asciiGlyphs } = BitmapFont.buildGlyphsFromEntries(glyphEntries, atlasWidth, atlasHeight);

        // Default font size in points when the `.btfont` descriptor omits or invalidates `size`.
        const defaultFontSizePt = 12;

        const size = BitmapFont.resolvePositiveMetric(data.size, defaultFontSizePt);

        const lineHeight = BitmapFont.resolvePositiveMetric(data.lineHeight, size);
        const baseline = BitmapFont.resolvePositiveMetric(data.baseline, size);

        const font = new BitmapFont(
            spriteSheet,
            glyphs,
            asciiGlyphs,
            BitmapFont.resolveDisplayName(data.name),
            size,
            lineHeight,
            baseline,
        );

        registerFontForHotReload(url, font);

        return font;
    }

    /**
     * Coerces a `.btfont` display `name` field to a non-empty string.
     *
     * @param value - Raw JSON value for `name`.
     * @returns Trimmed name when `value` is a non-empty string; otherwise `'Unknown'`.
     */
    private static resolveDisplayName(value: unknown): string {
        let name = 'Unknown';

        if (typeof value === 'string' && value.length > 0) {
            name = value;
        }

        return name;
    }

    /**
     * Coerces a `.btfont` metadata field to a positive finite number.
     *
     * @param value - Raw JSON value for `size`, `lineHeight`, or `baseline`.
     * @param fallback - Value used when `value` is missing or invalid.
     * @returns Safe positive metric for {@link BitmapFont} construction.
     */
    private static resolvePositiveMetric(value: unknown, fallback: number): number {
        const parsed = BitmapFont.parseMetricValue(value);
        let metric = fallback;

        if (Number.isFinite(parsed) && parsed > 0) {
            metric = parsed;
        }

        return metric;
    }

    /**
     * Coerces a raw `.btfont` metric field to a number.
     *
     * @param value - Raw JSON value for `size`, `lineHeight`, or `baseline`.
     * @returns Parsed number, or `NaN` when the value cannot be coerced.
     */
    private static parseMetricValue(value: unknown): number {
        let parsed = Number.NaN;

        if (typeof value === 'number') {
            parsed = value;
        } else if (typeof value === 'string') {
            parsed = Number(value);
        }

        return parsed;
    }

    /**
     * Parses and validates a `.btfont` JSON payload after byte-size checks.
     *
     * @param url - Path to the `.btfont` file (used in error messages).
     * @param jsonText - Raw JSON text from the font file.
     * @returns Parsed font descriptor and glyph map entries.
     */
    private static parseBtfontFile(
        url: string,
        jsonText: string,
    ): { data: FileData; glyphEntries: Array<[string, GlyphData]> } {
        const jsonByteLength = new TextEncoder().encode(jsonText).length;
        const jsonSizeError = validateBtfontJsonByteSize(jsonByteLength);

        if (jsonSizeError) {
            throw new AssetLimitError(jsonSizeError);
        }

        let parsed: unknown;

        try {
            parsed = JSON.parse(jsonText);
        } catch {
            throw BitmapFont.buildBrokenFileError(url);
        }

        if (!BitmapFont.isValidFileData(parsed)) {
            throw BitmapFont.buildBrokenFileError(url);
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
    private static buildBrokenFileError(url: string): Error {
        return new Error(
            `The font file '${url}' is broken or not a valid .btfont file. Check that it's the right file.` +
                BitmapFont.buildExtensionHint(url, '.btfont'),
        );
    }

    /**
     * Returns whether parsed `.btfont` JSON has the required top-level fields.
     *
     * @param data - Parsed font descriptor.
     * @returns Whether the data is valid.
     */
    private static isValidFileData(data: unknown): data is FileData {
        let valid = false;

        if (typeof data === 'object' && data !== null) {
            const record = data as Record<string, unknown>;
            const texture = record.texture;

            if (typeof texture === 'string' && texture.length > 0 && isPlainRecord(record.glyphs)) {
                valid = true;
            }
        }

        return valid;
    }

    /**
     * Returns whether a glyph entry is a plain object suitable for validation.
     *
     * @param glyphData - Raw glyph entry from the parsed font file.
     * @returns Whether the glyph data is a valid object.
     */
    private static isGlyphEntryObject(glyphData: unknown): glyphData is GlyphData {
        return isPlainRecord(glyphData);
    }

    /**
     * Validates glyph entries before the font atlas image is decoded.
     *
     * @param glyphEntries - Glyph map entries from the parsed font file.
     */
    private static validateGlyphEntriesPreAtlas(glyphEntries: Array<[string, GlyphData]>): void {
        for (const [char, glyphData] of glyphEntries) {
            if (!BitmapFont.isGlyphEntryObject(glyphData)) {
                throw new AssetLimitError(btfontGlyphEntryNotObjectError(BitmapFont.formatGlyphCharLabel(char)));
            }

            const glyphError = validateBtfontGlyphDataPreAtlas(glyphData, BitmapFont.formatGlyphCharLabel(char));

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
    private static buildGlyphsFromEntries(
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
                BitmapFont.formatGlyphCharLabel(char),
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
     */
    private static loadTexture(texture: string, url: string): Promise<HTMLImageElement> {
        // Embedded PNG data URIs are validated in parseBtfontFile before decode;
        // relative paths are resolved against the .btfont file's directory.
        const textureUrl = texture.toLowerCase().startsWith(BTFONT_EMBEDDED_TEXTURE_PREFIX)
            ? texture
            : url.substring(0, url.lastIndexOf('/') + 1) + texture;

        return BitmapFont.loadImage(textureUrl);
    }

    /**
     * Cache-busts a `.btfont` texture reference for a hot reload, unless it is an
     * embedded data URI (always fresh from the just-re-fetched JSON, nothing to bust).
     *
     * @param texture - Raw `texture` field from the re-fetched `.btfont` JSON.
     * @returns `texture` unchanged for a data URI; otherwise with a cache-bust query appended.
     */
    private static bustTextureUrl(texture: string): string {
        return texture.toLowerCase().startsWith(BTFONT_EMBEDDED_TEXTURE_PREFIX)
            ? texture
            : appendCacheBustQuery(texture);
    }

    /**
     * Returns a user-friendly load error for a font request.
     *
     * @param url - Font file path that failed to load.
     * @param status - HTTP status code from fetch.
     * @returns Beginner-friendly message with useful hints.
     */
    private static buildLoadErrorMessage(url: string, status: number): string {
        const statusMessage =
            status === 404
                ? `Can't find the font file '${url}'. Check that the file exists and the path is spelled correctly.`
                : `The server had a problem loading the font file '${url}'. Try refreshing the page.`;

        const hints: string[] = [];
        const pathHint = buildPathHint(url, 'fonts');
        const extensionHint = BitmapFont.buildExtensionHint(url, '.btfont');

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
    private static buildExtensionHint(url: string, expectedExtension: string): string {
        const extension = extractExtension(url);
        let hint = '';

        if (extension !== '' && extension !== expectedExtension) {
            hint = `The extension '${extension}' looks wrong for this file. Did you mean '${expectedExtension}'?`;
        }

        return hint;
    }

    /**
     * Formats a glyph character label for user-facing validation errors.
     *
     * @param char - Glyph map key from the `.btfont` file.
     * @returns Printable label or a Unicode code point for control characters.
     */
    private static formatGlyphCharLabel(char: string): string {
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
    private static loadImage(src: string): Promise<HTMLImageElement> {
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

    /**
     * Returns glyph data for a character.
     *
     * Uses the ASCII lookup table for single-byte characters and falls back to
     * the Unicode glyph map for everything else.
     *
     * @param char - Single character to look up (supports Unicode).
     * @returns Glyph metadata, or `null` when the font does not contain the character.
     */
    getGlyph(char: string): Glyph | null {
        let glyph: Glyph | null = null;

        // Fast path for ASCII characters.
        if (char.length === 1) {
            const code = char.charCodeAt(0);

            if (code < ASCII_CACHE_SIZE) {
                // eslint-disable-next-line security/detect-object-injection -- Index is bounds-checked above
                glyph = this.asciiGlyphs[code] ?? null;
            }
        }

        if (glyph === null) {
            glyph = this.glyphs.get(char) ?? null;
        }

        return glyph;
    }

    /**
     * Returns glyph data by numeric character code.
     *
     * Uses the ASCII lookup table for codes below `128` and falls back to the
     * Unicode glyph map for all other values.
     *
     * @param charCode - Character code to look up.
     * @returns Glyph metadata, or `null` when no glyph exists for the code.
     */
    getGlyphByCode(charCode: number): Glyph | null {
        let glyph: Glyph | null;

        if (charCode < ASCII_CACHE_SIZE) {
            // eslint-disable-next-line security/detect-object-injection -- Index is bounds-checked above
            glyph = this.asciiGlyphs[charCode] ?? null;
        } else {
            glyph = this.glyphs.get(String.fromCharCode(charCode)) ?? null;
        }

        return glyph;
    }

    /**
     * Returns the sprite sheet that owns the font texture atlas.
     *
     * @returns Sprite sheet used when rendering glyph quads.
     */
    getSpriteSheet(): SpriteSheet {
        return this.spriteSheet;
    }

    /**
     * Measures the horizontal pixel width of a text string.
     *
     * Results are cached for repeated measurements and use an optimized ASCII
     * fast path during width calculation.
     *
     * @param text - String to measure.
     * @returns Total width in pixels.
     */
    measureText(text: string): number {
        const cached = this.measureCache.get(text);
        let width = cached ?? 0;

        if (cached === undefined) {
            const len = text.length;

            for (let i = 0; i < len; i++) {
                const code = text.charCodeAt(i);
                let glyph: Glyph | null = null;

                // Fast path for ASCII characters.
                if (code < ASCII_CACHE_SIZE) {
                    // eslint-disable-next-line security/detect-object-injection -- Index is bounds-checked above
                    glyph = this.asciiGlyphs[code] ?? null;
                } else {
                    // Unicode fallback - index is guaranteed valid within loop bounds.
                    // eslint-disable-next-line security/detect-object-injection -- Index is within loop bounds
                    const char = text[i];

                    if (char !== undefined) {
                        glyph = this.glyphs.get(char) ?? null;
                    }
                }

                if (glyph) {
                    width += glyph.advance;
                }
            }

            // Cache the result with FIFO eviction when full.

            // Maximum number of cached string-width measurements retained at once.
            // The cache uses FIFO eviction (insertion order) when this limit is reached.
            const measureCacheMaxSize = 256;

            if (this.measureCache.size >= measureCacheMaxSize) {
                // Remove oldest inserted entry (first key in Map insertion order).
                const firstKey = this.measureCache.keys().next().value;

                if (firstKey !== undefined) {
                    this.measureCache.delete(firstKey);
                }
            }

            this.measureCache.set(text, width);
        }

        return width;
    }

    /**
     * Measures the pixel size of a single-line text string.
     *
     * Allocates and returns a new `{ width, height }` object on every call, so
     * results from separate calls never alias each other. For hot loops where
     * per-call allocation matters, use `measureTextSizeInto()` instead.
     *
     * @param text - String to measure.
     * @returns A new width/height pair for the measured text.
     */
    measureTextSize(text: string): TextSize {
        return {
            width: this.measureText(text),
            height: this.lineHeight,
        };
    }

    /**
     * Measures the pixel size of a single-line text string into a caller-owned object.
     *
     * Zero-allocation variant of `measureTextSize()` for hot loops or other
     * performance-sensitive call sites: writes into `result` instead of
     * allocating a new object.
     *
     * @param text - String to measure.
     * @param result - Object that receives the measured width and height.
     * @returns The same `result` object after being populated.
     */
    measureTextSizeInto(text: string, result: TextSize): TextSize {
        result.width = this.measureText(text);
        result.height = this.lineHeight;

        return result;
    }

    /**
     * Checks whether the font contains a glyph for a character.
     *
     * Uses the same ASCII fast path as `getGlyph()` for single-byte characters.
     *
     * @param char - Character to check.
     * @returns `true` if the font can render the character.
     */
    hasGlyph(char: string): boolean {
        let found: boolean;

        if (char.length === 1) {
            const code = char.charCodeAt(0);

            if (code < ASCII_CACHE_SIZE) {
                // eslint-disable-next-line security/detect-object-injection -- Index is bounds-checked above
                found = this.asciiGlyphs[code] != null;
            } else {
                found = this.glyphs.has(char);
            }
        } else {
            found = this.glyphs.has(char);
        }

        return found;
    }

    /**
     * Clears cached text measurement results.
     *
     * Useful after profiling, tests, or when you want to bound cache growth
     * across distinct text workloads.
     */
    clearMeasureCache(): void {
        this.measureCache.clear();
    }

    /**
     * Hot-reloads this font's `.btfont` descriptor and texture in place, keeping the
     * same `BitmapFont` instance so demo-held references stay valid.
     *
     * Internal - routed from `HotRuntime.handleAssetChanged` when the dev asset
     * watcher reports a changed font file. Re-fetches a cache-busted copy of the
     * `.btfont` JSON, rebuilds the glyph tables and measurement cache in place, and
     * replaces the underlying sprite sheet's image via
     * {@link SpriteSheet.hotReplaceImage} (which itself re-indexizes it when it was
     * already indexized). `name`/`size`/`lineHeight`/`baseline` are not updated by a
     * hot reload - only glyph data and the texture.
     *
     * @param url - `.btfont` URL this font was originally loaded from.
     * @param palette - Active palette, forwarded to {@link SpriteSheet.hotReplaceImage}.
     * @throws Error if the re-fetched `.btfont` file is missing or malformed (mirrors {@link BitmapFont.load}).
     */
    async hotReload(url: string, palette: Palette | null): Promise<void> {
        const response = await fetch(appendCacheBustQuery(url));

        if (!response.ok) {
            throw new Error(BitmapFont.buildLoadErrorMessage(url, response.status));
        }

        const { data, glyphEntries } = BitmapFont.parseBtfontFile(url, await response.text());

        BitmapFont.validateGlyphEntriesPreAtlas(glyphEntries);

        const image = await BitmapFont.loadTexture(BitmapFont.bustTextureUrl(data.texture), url);

        this.spriteSheet.hotReplaceImage(image, palette);

        const { glyphs, asciiGlyphs } = BitmapFont.buildGlyphsFromEntries(
            glyphEntries,
            this.spriteSheet.width,
            this.spriteSheet.height,
        );

        this.glyphs = glyphs;

        for (let code = 0; code < this.asciiGlyphs.length; code++) {
            // eslint-disable-next-line security/detect-object-injection -- code is a bounded loop index
            this.asciiGlyphs[code] = asciiGlyphs[code] ?? null;
        }

        this.clearMeasureCache();
    }
}
