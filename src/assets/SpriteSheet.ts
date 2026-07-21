import { markIndexUsed } from '../core/RenderPaletteUsage';
import { isHotActive } from '../hot/HotRuntime';
import { assertDimensions, assertImageElementWithinLimits, assertIndexedPixelInput } from '../utils/AssetLimits';
import { Color32 } from '../utils/Color32';
import { spriteColorNotInPaletteError } from '../utils/errorMessages';
import { normalizeAssetUrl } from '../utils/HotReloadUrl';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { AssetLoader } from './AssetLoader';
import type { Palette } from './Palette';

/** Number of slots in a palette; matches the 8-bit palette index range. */
const PALETTE_SLOT_COUNT = 256;

/** Reused per-call bitmask of sheet indices seen while scanning a source rect. */
const MARK_INDICES_IN_RECT_SCRATCH = new Uint8Array(PALETTE_SLOT_COUNT);

/** RGBA byte stride per pixel when reading decoded image data. */
const RGBA_BYTES_PER_PIXEL = 4;

/** Depth or array-layer count for a 2-D GPU texture descriptor. */
const TEXTURE_LAYER_COUNT = 1;

/**
 * Lifecycle status of a sprite sheet's backing image data.
 *
 * A sheet only ever reports `'loading'` or `'failed'` while a hot-reload
 * replacement image is in flight - normal construction always resolves an
 * image beforehand, so a sheet starts (and, once reloaded, settles back to)
 * `'ready'`.
 */
type SpriteSheetStatus = 'loading' | 'ready' | 'failed';

/**
 * Dev-only registry of live sprite sheets keyed by normalized source URL, so
 * `HotRuntime.handleAssetChanged` can find and hot-replace every sheet loaded
 * from a changed image. Populated only while {@link isHotActive} (no production
 * memory cost); entries are removed in {@link SpriteSheet.destroy}.
 */
const hotReloadRegistry = new Map<string, Set<SpriteSheet>>();

/**
 * Returns every registered sheet loaded from a URL matching `url` after normalization.
 *
 * Internal – used by `HotRuntime.handleAssetChanged` to route an `'image'`
 * asset-changed event to the sheets that need their texture replaced.
 *
 * @param url - Changed asset URL to look up.
 * @returns Matching sheets, or `undefined` when none are registered.
 */
export function getHotReloadSheets(url: string): ReadonlySet<SpriteSheet> | undefined {
    return hotReloadRegistry.get(normalizeAssetUrl(url));
}

/**
 * Maps retained RGBA bytes to palette indices for one sprite sheet.
 *
 * @param w - Image width in pixels.
 * @param h - Image height in pixels.
 * @param rgba - RGBA byte buffer (`w * h * 4` bytes).
 * @param palette - Active palette used for color lookup.
 * @param imageSrc - Source label for error messages.
 * @returns Palette index per pixel (`w * h` bytes).
 */
function mapRgbaPixelsToIndexed(
    w: number,
    h: number,
    rgba: Uint8Array,
    palette: Palette,
    imageSrc: string,
): Uint8Array<ArrayBuffer> {
    const indexed = new Uint8Array(w * h);
    const pixelCount = w * h;

    for (let i = 0; i < pixelCount; i++) {
        const base = i * RGBA_BYTES_PER_PIXEL;
        const a = rgba[base + 3];

        if (a === 0) {
            // Index 0 is the transparent sentinel - the shader discards any pixel with rawIndex == 0.
            // eslint-disable-next-line security/detect-object-injection
            indexed[i] = 0;
            continue;
        }

        // eslint-disable-next-line security/detect-object-injection
        const r = rgba[base] ?? 0;
        const g = rgba[base + 1] ?? 0;
        const b = rgba[base + 2] ?? 0;
        const color = new Color32(r, g, b, 255);
        const index = palette.findColor(color);

        if (index === -1) {
            const hex =
                '#' +
                r.toString(16).padStart(2, '0') +
                g.toString(16).padStart(2, '0') +
                b.toString(16).padStart(2, '0');
            const x = i % w;
            const y = Math.floor(i / w);
            throw new Error(spriteColorNotInPaletteError(x, y, imageSrc, hex));
        }

        // eslint-disable-next-line security/detect-object-injection
        indexed[i] = index;
    }

    return indexed;
}

/**
 * Collects unique opaque RGB colors from a flat RGBA byte buffer.
 *
 * @param data - RGBA bytes in row-major order.
 * @returns Deduped opaque colors with alpha forced to 255.
 */
function collectUniqueOpaqueColors(data: Uint8Array): Color32[] {
    const seen = new Set<number>();
    const collected: Color32[] = [];

    for (let i = 0; i < data.length; i += RGBA_BYTES_PER_PIXEL) {
        const a = data[i + 3] ?? 0;

        if (a === 0) {
            continue;
        }

        // eslint-disable-next-line security/detect-object-injection
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;

        // Pack RGB into a single 24-bit integer for fast Set lookup.
        const key = (r << 16) | (g << 8) | b;

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        collected.push(new Color32(r, g, b, 255));
    }

    return collected;
}

/**
 * Validates that opaque colors can be written into consecutive palette slots.
 *
 * @param collected - Colors to register.
 * @param palette - Target palette.
 * @param startSlot - First destination slot.
 * @throws RangeError when `startSlot` is invalid or the colors do not fit.
 */
function assertOpaqueColorsFitInPalette(collected: Color32[], palette: Palette, startSlot: number): void {
    if (collected.length > 0) {
        if (startSlot < 1) {
            throw new RangeError(
                `loadColorsIntoPalette: startSlot ${startSlot} is invalid (slot 0 is reserved for transparency).`,
            );
        }

        const endSlot = startSlot + collected.length - 1;

        if (endSlot >= palette.size) {
            throw new RangeError(
                `loadColorsIntoPalette: ${collected.length} colors do not fit in palette size ${palette.size} starting at slot ${startSlot}.`,
            );
        }
    }
}

/**
 * Writes collected colors into consecutive palette slots.
 *
 * @param collected - Colors in write order.
 * @param palette - Target palette.
 * @param startSlot - First destination slot.
 */
function writeCollectedColors(collected: Color32[], palette: Palette, startSlot: number): void {
    collected.forEach((color, index) => {
        palette.set(startSlot + index, color);
    });
}

/**
 * Marks palette indices referenced by non-zero pixels inside a bounded scan rect.
 *
 * @param pixels - Indexed pixel buffer for the full sheet.
 * @param sheetWidth - Sheet width in pixels.
 * @param startX - Inclusive left bound in sheet coordinates.
 * @param startY - Inclusive top bound in sheet coordinates.
 * @param endX - Exclusive right bound in sheet coordinates.
 * @param endY - Exclusive bottom bound in sheet coordinates.
 * @param paletteOffset - Palette offset applied at draw time.
 * @param usedMask - Mutable usage mask indexed by resolved palette slot.
 * @param seenSheetIndices - Per-call scratch mask for deduplicating sheet indices.
 */
function markUniqueIndicesInBounds(
    pixels: Uint8Array,
    sheetWidth: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    paletteOffset: number,
    usedMask: Uint8Array,
    seenSheetIndices: Uint8Array,
): void {
    const rectWidth = endX - startX;
    const pixelCount = (endY - startY) * rectWidth;

    for (let flat = 0; flat < pixelCount; flat++) {
        const y = startY + Math.floor(flat / rectWidth);
        const x = startX + (flat % rectWidth);
        const sheetIndex = pixels[y * sheetWidth + x] ?? 0;

        if (sheetIndex === 0) {
            continue;
        }

        // eslint-disable-next-line security/detect-object-injection -- sheet indices are 0-255
        if (seenSheetIndices[sheetIndex] === 1) {
            continue;
        }

        // eslint-disable-next-line security/detect-object-injection -- sheet indices are 0-255
        seenSheetIndices[sheetIndex] = 1;

        markIndexUsed(usedMask, sheetIndex + paletteOffset);
    }
}

/**
 * Result object returned by {@link SpriteSheet.loadIndexed}.
 *
 * @since 1.0.3
 */
export type IndexedSpriteLoadResult = {
    /** Loaded and indexized sprite sheet. */
    sheet: SpriteSheet;

    /** Full-frame source rectangle matching the loaded image size. */
    srcRect: Rect2i;

    /** Colors registered into the palette in write order. */
    colors: Color32[];
};

/**
 * Sprite-sheet wrapper around a loaded image asset.
 *
 * The class keeps the original image available for CPU-side inspection while
 * lazily creating and caching a GPU texture for rendering. When possible,
 * `load()` also pre-decodes the source into an `ImageBitmap` so texture uploads
 * preserve pixel-art alpha and color values more reliably.
 *
 * After calling `indexize()`, the sheet stores palette indices rather than RGBA
 * data. The GPU texture becomes an `r8uint` format uploaded via `writeTexture`.
 * The original RGBA bytes are retained so `reindexize()` can re-convert without
 * reloading the image.
 *
 * @since 0.1.0
 */
export class SpriteSheet {
    /** Source HTML image element (null for sheets created from raw indexed data). */
    private image: HTMLImageElement | null;

    /** Sprite sheet dimensions in pixels. Backing field for the public {@link size} getter. */
    private _size: Vector2i;

    /** Source URL this sheet was loaded from via {@link SpriteSheet.load}, or `null` otherwise. */
    private sourceUrl: string | null = null;

    /** Pre-decoded image bitmap for GPU upload (created by load()). */
    private imageBitmap: ImageBitmap | null = null;

    /** GPU texture created lazily on first use. */
    private texture: GPUTexture | null = null;

    /** Retained original RGBA pixel data (set by indexize, used by reindexize). */
    private rgbaPixels: Uint8Array<ArrayBuffer> | null = null;

    /** Palette index per pixel (set by indexize, uploaded as r8uint texture). */
    private indexedPixels: Uint8Array<ArrayBuffer> | null = null;

    /** Lifecycle status. Backing field for the public {@link status} getter. */
    private _status: SpriteSheetStatus = 'ready';

    /** Load progress in `[0, 1]`. Backing field for the public {@link progress} getter. */
    private _progress = 1.0;

    /**
     * Creates a sprite sheet from a loaded image.
     * Use the static load() method for easier loading from URL.
     *
     * @param image - Pre-loaded HTMLImageElement, or null for raw indexed data sheets.
     * @param size - Explicit dimensions (required when image is null).
     */
    constructor(image: HTMLImageElement | null, size?: Vector2i) {
        this.image = image;

        if (image) {
            assertImageElementWithinLimits('sprite sheet', image);
            this._size = new Vector2i(image.width, image.height);
        } else if (size) {
            assertDimensions('sprite sheet', size.x, size.y);
            this._size = size;
        } else {
            throw new Error('Either an image or explicit size must be provided.');
        }
    }

    /**
     * Gets the sprite-sheet dimensions in pixels.
     *
     * @returns Sheet dimensions. Changes after a hot-replace image swap with
     *   different dimensions – any `srcRect` a demo holds onto is the demo's own
     *   responsibility to reconcile.
     */
    get size(): Vector2i {
        return this._size;
    }

    /**
     * Gets the sprite-sheet width in pixels.
     *
     * @returns Sheet width in pixels.
     */
    get width(): number {
        return this.size.x;
    }

    /**
     * Gets the sprite-sheet height in pixels.
     *
     * @returns Sheet height in pixels.
     */
    get height(): number {
        return this.size.y;
    }

    /**
     * Gets the lifecycle status of this sheet's backing image data.
     *
     * @returns `'ready'` once constructed (an image has always already resolved by
     *   then); `'loading'` or `'failed'` only while and after a hot-reload
     *   replacement image is in flight, respectively.
     */
    get status(): SpriteSheetStatus {
        return this._status;
    }

    /**
     * Gets the load progress of this sheet's backing image data, in `[0, 1]`.
     *
     * @returns `1.0` once ready; `0.0` while a hot-reload replacement image is in
     *   flight. Coarse-grained - `HTMLImageElement` reports no byte-level progress.
     */
    get progress(): number {
        return this._progress;
    }

    /**
     * Returns a display label for the source image, used in error messages.
     *
     * @returns Quoted image `src` when available, or `(unnamed)` for sheets
     *   created from raw indexed data.
     */
    private get sourceName(): string {
        return this.image?.src ? `'${this.image.src}'` : '(unnamed)';
    }

    /**
     * Loads a sprite sheet from an image URL.
     *
     * Attempts to create an `ImageBitmap` with explicit alpha and color-space
     * settings for more predictable GPU uploads. If bitmap creation fails, the
     * instance still works and falls back to uploading the `HTMLImageElement`.
     *
     * @param url - Path or URL to the image file.
     * @returns Promise resolving to the loaded SpriteSheet.
     */
    static async load(url: string): Promise<SpriteSheet> {
        const image = await AssetLoader.loadImage(url);
        const sheet = new SpriteSheet(image);

        sheet.sourceUrl = url;
        sheet.registerForHotReload();

        // Create ImageBitmap with explicit alpha handling.
        // - premultiplyAlpha: 'none' preserves original alpha values (avoids dark fringes)
        // - colorSpaceConversion: 'none' preserves exact RGB values for pixel art
        try {
            sheet.imageBitmap = await createImageBitmap(image, {
                premultiplyAlpha: 'none',
                colorSpaceConversion: 'none',
            });
        } catch (error) {
            // Fall back to HTMLImageElement if ImageBitmap creation fails.
            console.warn(
                `[SpriteSheet] ImageBitmap creation failed for ${url}, using HTMLImageElement fallback:`,
                error,
            );
        }

        return sheet;
    }

    /**
     * Convenience one-call path for palette-indexed sprite setup.
     *
     * This combines:
     * 1) {@link SpriteSheet.loadColorsIntoPalette}
     * 2) {@link SpriteSheet.load}
     * 3) {@link SpriteSheet.indexize}
     *
     * It returns the indexized sheet plus a full-frame source rectangle and the
     * colors that were written into the palette. Callers still control when to
     * activate the palette via `BT.paletteSet(palette)`.
     *
     * @param url - Path or URL to the PNG file.
     * @param palette - Target palette used for both registration and indexization.
     * @param startSlot - First palette slot to write discovered colors into.
     * @param options - Optional color-sort behavior for registration.
     * @param options.sort - Color ordering for palette registration.
     * @returns Object with `sheet`, `srcRect`, and registered `colors`.
     */
    static async loadIndexed(
        url: string,
        palette: Palette,
        startSlot: number,
        options?: { sort?: 'luminance' | 'none' },
    ): Promise<IndexedSpriteLoadResult> {
        const colors = await SpriteSheet.loadColorsIntoPalette(url, palette, startSlot, options);
        const sheet = await SpriteSheet.load(url);

        sheet.indexize(palette);

        return {
            sheet,
            srcRect: new Rect2i(0, 0, sheet.size.x, sheet.size.y),
            colors,
        };
    }

    /**
     * Walks a PNG's pixels and registers every unique opaque color into the
     * supplied palette starting at `startSlot`.
     *
     * Pixels with alpha 0 are skipped - they map to the engine's transparent
     * sentinel slot 0 at draw time. Opaque pixels are deduplicated on RGB and
     * stored with alpha forced to 255, matching the lookup performed by
     * `indexize()` so a subsequent `sheet.indexize(palette)` call resolves
     * without throwing on missing colors.
     *
     * By default colors are sorted darkest-first by perceived luminance
     * ({@link Color32.luminance}); pass `{ sort: 'none' }` to keep the
     * row-major scan order of the source image.
     *
     * Image loading goes through {@link AssetLoader.loadImage}, so the call
     * shares cache and in-flight deduplication with {@link SpriteSheet.load}.
     *
     * The destination range is validated before any write, so the palette is
     * never left partially mutated: if the collected colors would not fit
     * (`startSlot < 1` or `startSlot + count > palette.size`), the method
     * throws without touching any slot.
     *
     * @param url - Path or URL to the PNG file.
     * @param palette - Target palette to populate.
     * @param startSlot - First palette slot to write into.
     * @param options - Optional configuration.
     * @param options.sort - Color ordering. Defaults to `'luminance'`.
     * @returns Registered colors in palette-write order.
     * @throws Error if the image cannot be loaded.
     * @throws RangeError if the discovered colors do not fit in the palette starting at `startSlot`.
     */
    static async loadColorsIntoPalette(
        url: string,
        palette: Palette,
        startSlot: number,
        options?: { sort?: 'luminance' | 'none' },
    ): Promise<Color32[]> {
        const image = await AssetLoader.loadImage(url);

        assertImageElementWithinLimits('sprite sheet', image);

        const w = image.width;
        const h = image.height;

        const data = SpriteSheet.readRgbaPixels(image, w, h);
        const collected = collectUniqueOpaqueColors(data);
        const sortMode = options?.sort ?? 'luminance';

        if (sortMode === 'luminance') {
            collected.sort((c1, c2) => c1.luminance - c2.luminance);
        }

        // Validate the full destination range up front so a mid-loop palette.set()
        // throw (out-of-range slot, or opaque color at reserved slot 0) cannot
        // leave the palette partially mutated. All collected colors are opaque,
        // so startSlot must be at least 1.
        assertOpaqueColorsFitInPalette(collected, palette, startSlot);
        writeCollectedColors(collected, palette, startSlot);

        return collected;
    }

    /**
     * Creates a sprite sheet from pre-computed palette-indexed pixel data.
     *
     * The resulting sheet is immediately indexized - its `getTexture()` call
     * will produce an `r8uint` GPU texture without needing `indexize()`. This
     * is used for embedded assets like the built-in system font where the pixel
     * data is already expressed as palette indices.
     *
     * Sheets created this way do not support `indexize()` or `reindexize()`
     * because there is no source RGBA data to re-map.
     *
     * @param width - Texture width in pixels.
     * @param height - Texture height in pixels.
     * @param indexedPixels - Flat array of palette indices, one byte per pixel (row-major).
     * @returns Sprite sheet ready for rendering.
     */
    static fromIndexedPixels(width: number, height: number, indexedPixels: Uint8Array<ArrayBuffer>): SpriteSheet {
        assertIndexedPixelInput(width, height, indexedPixels.length);

        const sheet = new SpriteSheet(null, new Vector2i(width, height));

        sheet.indexedPixels = indexedPixels;

        return sheet;
    }

    /**
     * Decodes an image's pixels via an off-screen canvas and returns a flat
     * RGBA byte buffer. Shared by `indexize` and `loadColorsIntoPalette`.
     *
     * @param image - Source HTML image element.
     * @param w - Image width in pixels.
     * @param h - Image height in pixels.
     * @returns Flat RGBA byte array (`w * h * RGBA_BYTES_PER_PIXEL` bytes).
     */
    private static readRgbaPixels(image: HTMLImageElement, w: number, h: number): Uint8Array<ArrayBuffer> {
        const canvas = new OffscreenCanvas(w, h);
        const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, 0, 0);

        return new Uint8Array(ctx.getImageData(0, 0, w, h).data.buffer.slice(0)) as Uint8Array<ArrayBuffer>;
    }

    /**
     * Converts the sprite sheet's RGBA pixels to palette indices.
     *
     * Each non-transparent pixel is looked up in the provided palette via exact
     * color matching. Index 0 is always transparent. The resulting indices are
     * stored internally; an `r8uint` GPU texture is created lazily on the next
     * `getTexture()` call.
     *
     * The original RGBA data is retained so `reindexize()` can re-convert after a
     * palette swap without reloading the image.
     *
     * @param palette - Active palette used for color-to-index mapping.
     * @throws If any opaque pixel's color is not present in the palette.
     */
    indexize(palette: Palette): void {
        if (!this.image) {
            throw new Error('indexize: not available for sheets created from raw indexed data.');
        }

        assertImageElementWithinLimits('sprite sheet', this.image);

        const w = this.size.x;
        const h = this.size.y;

        this.rgbaPixels = SpriteSheet.readRgbaPixels(this.image, w, h);
        this.indexedPixels = mapRgbaPixelsToIndexed(w, h, this.rgbaPixels, palette, this.sourceName);

        this.invalidateTexture();
    }

    /**
     * Re-converts retained RGBA pixels to palette indices using a new palette.
     *
     * Use this only when the **slot layout** of the palette has changed - that is,
     * when the same colors now live at different index positions. It works by
     * replaying the original RGBA data through `palette.findColor()` and assigning
     * each opaque pixel the index of its matching color in the new palette.
     *
     * **Do not call this to change what color a slot displays.** If you only want
     * to swap the visible color at a slot (e.g. animate a fire effect), mutate the
     * palette entry directly - the stored indices remain valid and the fragment
     * shader picks up the new color automatically on the next frame:
     *
     * ```ts
     * // Palette-value swap: change what a slot looks like.
     * // The sprite's stored indices are unchanged; no reindexize needed.
     * palette.set(FIRE_SLOT, Color32.fromHex('#ff4400'));
     * BT.paletteSet(palette);
     * ```
     *
     * ```ts
     * // Palette-layout swap: same colors, different slot positions.
     * // Sprite indices now point to wrong slots, so reindexize is required.
     * sheet.reindexize(newLayoutPalette);
     * // Or for all sheets at once:
     * BT.paletteSet(newLayoutPalette);
     * BT.spritesRefresh();
     * ```
     *
     * If the new palette does not contain a pixel's original RGBA value,
     * `palette.findColor()` returns `-1` and `reindexize()` throws an `Error`
     * with the offending color and coordinates, e.g.:
     * `[SpriteSheet] 'sheet.png' pixel at (x, y) has color #rrggbb which is not in the active palette.`
     *
     * Must be preceded by a call to `indexize()`. The GPU texture is invalidated and
     * re-created on the next `getTexture()` call.
     *
     * @param palette - New palette used for color-to-index mapping.
     * @throws If `indexize()` has not been called yet.
     * @throws If any opaque pixel's color is not found in the new palette.
     */
    reindexize(palette: Palette): void {
        if (!this.image) {
            throw new Error('reindexize: not available for sheets created from raw indexed data.');
        }

        if (this.rgbaPixels === null) {
            throw new Error('reindexize: indexize() must be called before reindexize().');
        }

        const w = this.size.x;
        const h = this.size.y;
        this.indexedPixels = mapRgbaPixelsToIndexed(w, h, this.rgbaPixels, palette, this.sourceName);

        this.invalidateTexture();
    }

    /**
     * Marks this sheet as loading a hot-reloaded replacement image.
     *
     * Internal – called by `HotRuntime.handleAssetChanged` immediately before it
     * starts fetching the changed image, so {@link status}/{@link progress} reflect
     * the fetch while it's in flight. Followed by either {@link hotReplaceImage}
     * (the fetch resolved) or {@link failHotReplace} (the fetch itself threw).
     */
    beginHotReplace(): void {
        this._status = 'loading';
        this._progress = 0;
    }

    /**
     * Marks this sheet's in-flight hot-reload replacement as failed.
     *
     * Internal – called by `HotRuntime.handleAssetChanged` when the replacement
     * image fetch itself throws, before {@link hotReplaceImage} is ever reached.
     */
    failHotReplace(): void {
        this._status = 'failed';
    }

    /**
     * Replaces this sheet's source image in place after a hot-reloaded asset change.
     *
     * Swaps the image reference, validates and updates {@link size} (dimension
     * changes are allowed – buffers rebuild to match), re-runs `indexize` against
     * `palette` when the sheet was already indexized so `indexedPixels` stays in
     * sync with the new pixels, and invalidates the cached GPU texture so the next
     * `getTexture()` call re-uploads it. Sets {@link status} to `'ready'` on success.
     *
     * No-op (with a console warning, and {@link status} set to `'failed'`) for sheets
     * created from raw indexed data – there is no source image to replace – and for
     * an already-indexized sheet when `palette` is `null`, since there is nothing safe
     * to reindex against.
     *
     * If `indexize()` throws partway (a pixel color from the new image is missing from
     * `palette`), this sheet is left with the new image/size but a stale, mismatched
     * `indexedPixels`/texture until a subsequent successful hot reload – an accepted
     * dev-only-path risk, not a production code path. {@link status} is set to
     * `'failed'` and the error is rethrown.
     *
     * @param image - Newly loaded replacement image.
     * @param palette - Active palette, used to re-run `indexize` when the sheet was
     *   already indexized.
     * @throws If the replacement image exceeds engine size limits, or `indexize()` throws.
     */
    hotReplaceImage(image: HTMLImageElement, palette: Palette | null): void {
        if (!this.image) {
            console.warn('[BT] Hot reload: sprite sheet has no source image (raw indexed data); skipping.');
            this._status = 'failed';

            return;
        }

        if (this.indexedPixels !== null && palette === null) {
            console.warn(`[BT] Hot reload: ${this.sourceName} is indexized but no active palette is set; skipping.`);
            this._status = 'failed';

            return;
        }

        try {
            assertImageElementWithinLimits('sprite sheet', image);

            this.image = image;
            this._size = new Vector2i(image.width, image.height);

            if (this.imageBitmap) {
                this.imageBitmap.close();
                this.imageBitmap = null;
            }

            if (this.indexedPixels !== null && palette !== null) {
                this.indexize(palette);
            } else {
                this.invalidateTexture();
            }

            this._status = 'ready';
            this._progress = 1.0;
        } catch (error) {
            this._status = 'failed';

            throw error;
        }
    }

    /**
     * Returns whether this sprite sheet has been converted to palette indices.
     *
     * @returns True if `indexize()` has been called successfully.
     */
    isIndexed(): boolean {
        return this.indexedPixels !== null;
    }

    /**
     * Backward-compatible alias for {@link isIndexed}.
     *
     * @deprecated Deprecated since 2026-05-31. Use {@link isIndexed} instead.
     * @returns True if `indexize()` has been called successfully.
     */
    isIndexized(): boolean {
        return this.isIndexed();
    }

    /**
     * Returns a copy of the palette-indexed pixel buffer.
     *
     * @returns Indexed pixels as row-major palette indices (1 byte per pixel).
     * @throws If the sheet has not been indexized yet.
     */
    getIndexedPixels(): Uint8Array<ArrayBuffer> {
        if (this.indexedPixels === null) {
            throw new Error(
                "This sprite sheet hasn't been converted to palette indices yet. Call sheet.indexize(palette) first.",
            );
        }

        return this.indexedPixels.slice() as Uint8Array<ArrayBuffer>;
    }

    /**
     * Marks palette indices referenced by non-zero pixels in a source rectangle.
     *
     * Used by the engine to build the overlay palette grid from demo draw
     * calls. Does not allocate; writes into the supplied usage mask. Each unique
     * sheet index in the rect is resolved once.
     *
     * @param srcRect - Region to scan in sheet coordinates.
     * @param paletteOffset - Palette offset applied at draw time.
     * @param usedMask - Mutable usage mask indexed by resolved palette slot.
     */
    markPaletteIndicesInRect(srcRect: Rect2i, paletteOffset: number, usedMask: Uint8Array): void {
        const pixels = this.indexedPixels;

        if (pixels !== null) {
            const sheetWidth = this.size.x;
            const startX = Math.max(0, srcRect.x);
            const startY = Math.max(0, srcRect.y);
            const endX = Math.min(this.size.x, srcRect.x + srcRect.width);
            const endY = Math.min(this.size.y, srcRect.y + srcRect.height);
            const seenSheetIndices = MARK_INDICES_IN_RECT_SCRATCH;

            seenSheetIndices.fill(0);
            markUniqueIndicesInBounds(
                pixels,
                sheetWidth,
                startX,
                startY,
                endX,
                endY,
                paletteOffset,
                usedMask,
                seenSheetIndices,
            );
        }
    }

    /**
     * Gets the source HTMLImageElement.
     *
     * @returns The underlying image element.
     * @throws If the sheet was created from raw indexed data (no source image).
     */
    getImage(): HTMLImageElement {
        if (!this.image) {
            throw new Error('getImage: not available for sheets created from raw indexed data.');
        }

        return this.image;
    }

    /**
     * Returns a source rectangle that covers the entire sprite sheet.
     *
     * @returns Full-sheet source rectangle.
     */
    fullRect(): Rect2i {
        return new Rect2i(0, 0, this.width, this.height);
    }

    /**
     * Gets or lazily creates the GPU texture for this sprite sheet.
     *
     * If `indexize()` has been called, creates an `r8uint` texture from the
     * palette index data. Otherwise creates an `rgba8unorm` texture from the
     * original image. The result is cached until `destroy()` is called.
     *
     * @param device - WebGPU device for texture creation.
     * @returns GPU texture ready for rendering.
     */
    getTexture(device: GPUDevice): GPUTexture {
        if (this.texture === null) {
            if (this.indexedPixels === null) {
                this.createTexture(device);
            } else {
                this.createIndexedTexture(device);
            }
        }

        // Safe assertion: createTexture / createIndexedTexture always initializes this.texture.
        return this.texture as GPUTexture;
    }

    /**
     * Calculates normalized UV coordinates for a sprite region.
     * Converts pixel coordinates to 0.0-1.0 texture coordinate range.
     *
     * @param rect - Source rectangle in pixel coordinates.
     * @returns Object with u0, v0 (top-left) and u1, v1 (bottom-right) UV coordinates.
     */
    getUVs(rect: Rect2i): { u0: number; v0: number; u1: number; v1: number } {
        return {
            u0: rect.x / this.size.x,
            v0: rect.y / this.size.y,
            u1: (rect.x + rect.width) / this.size.x,
            v1: (rect.y + rect.height) / this.size.y,
        };
    }

    /**
     * Releases the GPU texture from memory and clears all retained pixel data.
     *
     * Also closes any retained `ImageBitmap` that has not yet been uploaded.
     * Clears CPU-side `rgbaPixels` and `indexedPixels`; only image-backed sheets
     * that have not been destroyed can recreate a GPU texture via a new load or
     * {@link indexize} call.
     */
    destroy(): void {
        this.invalidateTexture();
        this.unregisterFromHotReload();

        if (this.imageBitmap) {
            this.imageBitmap.close();
            this.imageBitmap = null;
        }

        this.rgbaPixels = null;
        this.indexedPixels = null;
    }

    /**
     * Creates and uploads the GPU texture from the image.
     *
     * Uses `ImageBitmap` when available, then releases it immediately after the
     * upload to avoid holding duplicate image resources in memory.
     *
     * @param device - WebGPU device for texture creation.
     */
    private createTexture(device: GPUDevice): void {
        if (!this.image) {
            throw new Error('createTexture: no source image available.');
        }

        assertDimensions('sprite sheet texture', this.size.x, this.size.y);

        this.texture = device.createTexture({
            label: 'Sprite Sheet Texture',
            size: [this.size.x, this.size.y, TEXTURE_LAYER_COUNT],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // Prefer ImageBitmap (correct alpha handling) over HTMLImageElement.
        const source = this.imageBitmap ?? this.image;

        device.queue.copyExternalImageToTexture({ source }, { texture: this.texture }, [this.size.x, this.size.y]);

        // Close ImageBitmap after the upload to free resources.
        if (this.imageBitmap) {
            this.imageBitmap.close();
            this.imageBitmap = null;
        }
    }

    /**
     * Creates and uploads an `r8uint` GPU texture from the palette index data.
     *
     * Called lazily by `getTexture()` after `indexize()` has been invoked.
     * Uses `writeTexture` because `r8uint` does not support `copyExternalImageToTexture`.
     *
     * @param device - WebGPU device for texture creation.
     */
    private createIndexedTexture(device: GPUDevice): void {
        assertDimensions('sprite sheet texture', this.size.x, this.size.y);

        const extent = [this.size.x, this.size.y, TEXTURE_LAYER_COUNT];

        this.texture = device.createTexture({
            label: 'Sprite Sheet Indexed Texture',
            size: extent,
            format: 'r8uint',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        // Safe assertion: createIndexedTexture is only called when indexedPixels !== null.
        device.queue.writeTexture(
            { texture: this.texture },
            this.indexedPixels as Uint8Array<ArrayBuffer>,
            { bytesPerRow: this.size.x },
            extent,
        );
    }

    /**
     * Destroys and clears the cached GPU texture if one is currently held.
     *
     * Called before re-creating the texture with a different format (after
     * `indexize` or `reindexize`) and by `destroy` during full teardown.
     */
    private invalidateTexture(): void {
        if (this.texture) {
            this.texture.destroy();
            this.texture = null;
        }
    }

    /**
     * Registers this sheet in the dev-only hot-reload registry under its normalized
     * source URL, when a Vite HMR context is active. Called by {@link SpriteSheet.load}.
     */
    private registerForHotReload(): void {
        if (this.sourceUrl === null || !isHotActive()) {
            return;
        }

        const key = normalizeAssetUrl(this.sourceUrl);
        const bucket = hotReloadRegistry.get(key) ?? new Set<SpriteSheet>();

        bucket.add(this);
        hotReloadRegistry.set(key, bucket);
    }

    /**
     * Removes this sheet from the hot-reload registry, pruning an empty bucket.
     * Called by {@link SpriteSheet.destroy}.
     */
    private unregisterFromHotReload(): void {
        if (this.sourceUrl === null) {
            return;
        }

        const key = normalizeAssetUrl(this.sourceUrl);
        const bucket = hotReloadRegistry.get(key);

        if (!bucket) {
            return;
        }

        bucket.delete(this);

        if (bucket.size === 0) {
            hotReloadRegistry.delete(key);
        }
    }
}
