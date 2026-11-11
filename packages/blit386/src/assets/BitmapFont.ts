import { isHotActive } from '../hot/HotRuntime';
import { getDecodedImageSize } from '../utils/AssetLimits';
import { appendCacheBustQuery } from '../utils/HotReloadUrl';
import type { Rect2i } from '../utils/Rect2i';
import {
    ASCII_CACHE_SIZE,
    buildGlyphsFromEntries,
    buildLoadErrorMessage,
    bustTextureUrl,
    createAsciiGlyphTable,
    loadTexture,
    parseBtfontFile,
    populateAsciiGlyph,
    readCappedText,
    resolveDisplayName,
    resolvePositiveMetric,
    validateGlyphEntriesPreAtlas,
} from './btfontFile';
import { HotReloadRegistry } from './hotReloadRegistry';
import type { Palette } from './Palette';
import { SpriteSheet } from './SpriteSheet';

/**
 * Runtime glyph metadata used by the renderer.
 *
 * @since 1.8.1
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

/** Highest valid Unicode code point (inclusive), the ceiling `String.fromCodePoint` accepts. */
const MAX_UNICODE_CODE_POINT = 0x10ffff;

/**
 * Glyph map key that, when present, is used as the fallback rendered in place of any character
 * missing its own glyph - the standard Unicode replacement character. Any `.btfont` file (or the
 * embedded system font) can opt in by including an entry keyed by this character; fonts without
 * one keep the previous behavior of silently skipping the character.
 */
const FALLBACK_GLYPH_CHAR = '\uFFFD';

/**
 * Resolves a font's fallback glyph from its glyph map.
 *
 * @param glyphs - Font's Unicode glyph map.
 * @returns The {@link FALLBACK_GLYPH_CHAR} glyph, or `null` when the font defines none.
 */
function resolveFallbackGlyph(glyphs: ReadonlyMap<string, Glyph>): Glyph | null {
    return glyphs.get(FALLBACK_GLYPH_CHAR) ?? null;
}

/**
 * Dev-only registry of live bitmap fonts keyed by normalized `.btfont` source URL, so
 * `HotRuntime.handleAssetChanged` can find and hot-reload every font loaded from a changed
 * font file. Entries are never pruned - unlike {@link SpriteSheet}, `BitmapFont` has no
 * destroy/dispose lifecycle to hook; acceptable since the registry only fills in dev mode.
 */
const hotReloadFonts = new HotReloadRegistry<BitmapFont>();

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
    return hotReloadFonts.get(url);
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
 * @changed 1.5.0 `getGlyph` / `getGlyphByCode` (and `measureText`, which now shares their
 *   lookup) substitute a font-defined fallback glyph for a missing character instead of
 *   returning `null`, when the font's glyph map has an entry keyed by `U+FFFD`.
 * @changed 1.7.0 Added the `codePoints` getter, returning every Unicode code point the font
 *   defines a glyph for (ascending, derived live from the same glyph map `getGlyph()` and
 *   `hasGlyph()` read).
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

    /**
     * Glyph substituted for any character missing its own entry, or `null` when this font
     * defines no {@link FALLBACK_GLYPH_CHAR} entry. Derived from {@link glyphs}; recomputed
     * whenever it is rebuilt (construction, {@link hotReload}).
     */
    private fallbackGlyph: Glyph | null = null;

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
        this.fallbackGlyph = resolveFallbackGlyph(glyphs);
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
     * Returns every Unicode code point this font defines a glyph for, ascending.
     *
     * Derived live from the same {@link glyphs} map {@link getGlyph} / {@link hasGlyph} read -
     * it can never drift from what actually renders. Includes ordinary ASCII (the ASCII
     * fast-path array is populated from this same map at construction time, not a second,
     * disjoint source) and the fallback glyph when the font defines one (see
     * `FALLBACK_GLYPH_CHAR`). Skips a key that spans more than one Unicode scalar value (for
     * example a multi-character string from a malformed `.btfont` file) rather than reporting
     * just its first scalar - nothing validates glyph keys down to a single scalar on load, so
     * this getter defends its own "one code point per real glyph" guarantee instead of risking
     * a duplicate or misleading entry. `codePoints.length` can therefore be lower than
     * {@link glyphCount} for such a font.
     *
     * @returns Sorted array of Unicode code points covered by this font's glyph map.
     */
    get codePoints(): readonly number[] {
        return Array.from(this.glyphs.keys())
            .filter((char) => [...char].length === 1)
            .map((char) => char.codePointAt(0))
            .filter((codePoint): codePoint is number => codePoint !== undefined)
            .sort((a, b) => a - b);
    }

    /**
     * Creates a bitmap font synchronously from pre-built glyph data.
     *
     * Used for embedded fonts (e.g. the built-in system font) where the sprite
     * sheet and glyph map are already constructed in memory. The sprite sheet
     * should already contain indexed pixel data via
     * {@link SpriteSheet.fromIndexedPixels}.
     *
     * Copies `glyphs` rather than retaining the caller's map: `asciiGlyphs` is a
     * cache built once here, so a caller mutating its own map afterward would
     * otherwise drift out of sync with {@link glyphs} (and so with `getGlyph()`,
     * `hasGlyph()`, and `codePoints`).
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
        const glyphMap = new Map(glyphs);
        const asciiGlyphs = createAsciiGlyphTable();

        for (const [char, glyph] of glyphMap) {
            populateAsciiGlyph(asciiGlyphs, char, glyph);
        }

        return new BitmapFont(spriteSheet, glyphMap, asciiGlyphs, name, size, lineHeight, baseline);
    }

    /**
     * Loads a bitmap font from a `.btfont` JSON file.
     *
     * The font descriptor can reference either an embedded PNG data URI
     * (`data:image/png;base64,...`) or a texture file path relative to the font JSON file.
     * A texture path that, joined to the font's folder, leads to a different origin than the font
     * file is rejected. Only a font loaded by a bare file name (`font.btfont`) can get there.
     *
     * @changed 1.8.1 Rejects a joined `texture` path that leads to another origin than the `.btfont`
     *   file with an `AssetLimitError` - in practice an absolute URL on another site in a font loaded
     *   by a bare file name.
     * @param url - Path to the .btfont file.
     * @returns Loaded bitmap font instance.
     * @throws Error if the font descriptor or texture cannot be loaded.
     */
    static async load(url: string): Promise<BitmapFont> {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(buildLoadErrorMessage(url, response.status));
        }

        const { data, glyphEntries } = parseBtfontFile(url, await readCappedText(response));

        validateGlyphEntriesPreAtlas(glyphEntries);

        // Load texture - embedded PNG data URIs and relative PNG paths are both allowed.
        const image = await loadTexture(data.texture, url);
        const spriteSheet = new SpriteSheet(image);
        const atlasWidth = spriteSheet.width;
        const atlasHeight = spriteSheet.height;

        const { glyphs, asciiGlyphs } = buildGlyphsFromEntries(glyphEntries, atlasWidth, atlasHeight);

        // Default font size in points when the `.btfont` descriptor omits or invalidates `size`.
        const defaultFontSizePt = 12;

        const size = resolvePositiveMetric(data.size, defaultFontSizePt);

        const lineHeight = resolvePositiveMetric(data.lineHeight, size);
        const baseline = resolvePositiveMetric(data.baseline, size);

        const font = new BitmapFont(
            spriteSheet,
            glyphs,
            asciiGlyphs,
            resolveDisplayName(data.name),
            size,
            lineHeight,
            baseline,
        );

        if (isHotActive()) {
            hotReloadFonts.add(url, font);
        }

        return font;
    }

    /**
     * Returns glyph data for a character.
     *
     * Uses the ASCII lookup table for single-byte characters and falls back to the Unicode glyph
     * map for everything else, then to the font's fallback glyph (see {@link FALLBACK_GLYPH_CHAR})
     * when neither has an entry for the character.
     *
     * @param char - Single character to look up (supports Unicode).
     * @returns Glyph metadata; the font's fallback glyph when the character is missing and a
     *   fallback is defined; otherwise `null`.
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
            glyph = this.glyphs.get(char) ?? this.fallbackGlyph;
        }

        return glyph;
    }

    /**
     * Returns glyph data by numeric Unicode code point.
     *
     * Uses the ASCII lookup table for codes below `128` and falls back to the Unicode glyph map
     * for all other values, resolved via {@link String.fromCodePoint} so code points above
     * `U+FFFF` (astral characters, outside the Basic Multilingual Plane) resolve correctly instead
     * of being truncated. Falls back to the font's fallback glyph (see {@link FALLBACK_GLYPH_CHAR})
     * when the code has no glyph of its own, or is not a valid Unicode code point at all.
     *
     * @param charCode - Unicode code point to look up.
     * @returns Glyph metadata; the font's fallback glyph when no glyph exists for the code, or the
     *   code point is invalid, and a fallback is defined; otherwise `null`.
     */
    getGlyphByCode(charCode: number): Glyph | null {
        let glyph: Glyph | null;

        if (charCode < ASCII_CACHE_SIZE) {
            // eslint-disable-next-line security/detect-object-injection -- Index is bounds-checked above
            glyph = this.asciiGlyphs[charCode] ?? this.fallbackGlyph;
        } else if (Number.isInteger(charCode) && charCode <= MAX_UNICODE_CODE_POINT) {
            glyph = this.glyphs.get(String.fromCodePoint(charCode)) ?? this.fallbackGlyph;
        } else {
            // Not a valid code point (non-integer, NaN, or beyond U+10FFFF) - String.fromCodePoint
            // would throw; there is no glyph to look up, so go straight to the fallback.
            glyph = this.fallbackGlyph;
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
     * Results are cached for repeated measurements. Iterates by Unicode code point (`for...of`),
     * not by UTF-16 code unit, so an astral character (a surrogate pair) is measured as the single
     * glyph it is instead of two lone-surrogate lookups. Glyph resolution (including the ASCII
     * fast path and fallback-glyph substitution) goes through {@link getGlyph}, so a measured
     * width always matches what actually renders.
     *
     * @param text - String to measure.
     * @returns Total width in pixels.
     */
    measureText(text: string): number {
        const cached = this.measureCache.get(text);
        let width = cached ?? 0;

        if (cached === undefined) {
            for (const char of text) {
                const glyph = this.getGlyph(char);

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
     * Checks whether the character has an explicitly defined glyph of its own.
     *
     * Does not account for the font's fallback glyph (see {@link FALLBACK_GLYPH_CHAR}): a
     * character can still render, as the fallback, even when this returns `false`. Uses the same
     * ASCII fast path as `getGlyph()` for single-byte characters.
     *
     * @param char - Character to check.
     * @returns `true` if the character has its own glyph entry, independent of fallback coverage.
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
     * `.btfont` JSON, checks every glyph against the new texture, then
     * rebuilds the glyph tables and measurement cache in place and
     * replaces the underlying sprite sheet's image via
     * {@link SpriteSheet.hotReplaceImage} (which itself re-indexizes it when it was
     * already indexized). When the sheet skips that swap (indexized, no active palette),
     * the glyphs are left as they were too. `name`/`size`/`lineHeight`/`baseline` are not
     * updated by a hot reload - only glyph data and the texture.
     *
     * @param url - `.btfont` URL this font was originally loaded from.
     * @param palette - Active palette, forwarded to {@link SpriteSheet.hotReplaceImage}.
     * @throws Error if the re-fetched `.btfont` file is missing or malformed (mirrors {@link BitmapFont.load}).
     */
    async hotReload(url: string, palette: Palette | null): Promise<void> {
        const response = await fetch(appendCacheBustQuery(url));

        if (!response.ok) {
            throw new Error(buildLoadErrorMessage(url, response.status));
        }

        const { data, glyphEntries } = parseBtfontFile(url, await readCappedText(response));

        validateGlyphEntriesPreAtlas(glyphEntries);

        const image = await loadTexture(bustTextureUrl(data.texture), url);
        const atlas = getDecodedImageSize(image);
        // Check the glyphs against the new atlas before swapping it, so a bad file leaves the font untouched.
        const { glyphs, asciiGlyphs } = buildGlyphsFromEntries(glyphEntries, atlas.width, atlas.height);

        this.spriteSheet.hotReplaceImage(image, palette);

        // A skipped swap (indexized sheet, no active palette) keeps the old atlas, so the new glyphs must not land.
        if (this.spriteSheet.status !== 'ready') {
            return;
        }

        this.glyphs = glyphs;
        this.fallbackGlyph = resolveFallbackGlyph(glyphs);

        for (let code = 0; code < this.asciiGlyphs.length; code++) {
            // eslint-disable-next-line security/detect-object-injection -- code is a bounded loop index
            this.asciiGlyphs[code] = asciiGlyphs[code] ?? null;
        }

        this.clearMeasureCache();
    }
}
