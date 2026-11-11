import { isHotActive } from '../hot/HotRuntime';
import {
    assertDimensions,
    assertImageElementWithinLimits,
    assertIndexedPixelInput,
    getDecodedImageSize,
} from '../utils/AssetLimits';
import type { Color32 } from '../utils/Color32';
import { SPRITE_NOT_INDEXIZED_MESSAGE } from '../utils/errorMessages';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { AssetLoader } from './AssetLoader';
import { HotReloadRegistry } from './hotReloadRegistry';
import type { Palette } from './Palette';
import {
    createIndexedTexture,
    mapRgbaPixelsToIndexed,
    markUniqueIndicesInRect,
    readRgbaPixels,
    registerIndexedSheet,
    sourceLabel,
    unregisterIndexedSheet,
    writePaletteColors,
} from './spriteIndexing';
import { toTileSize, writeGridTileRect } from './spriteTileGrid';

export { getIndexedSheets, registerIndexedSheet, unregisterIndexedSheet } from './spriteIndexing';
export { writeGridTileRect, writeTileRect } from './spriteTileGrid';

/**
 * Lifecycle status of a sprite sheet's backing image data.
 *
 * A sheet only ever reports `'loading'` or `'failed'` while a hot-reload
 * replacement image is in flight - normal construction always resolves an
 * image beforehand, so a sheet starts (and, once reloaded, settles back to)
 * `'ready'`.
 *
 * @since 1.8.1
 */
export type SpriteSheetStatus = 'loading' | 'ready' | 'failed';

/**
 * Normalized UV coordinates (0.0-1.0) of a sprite region: top-left (u0, v0) to bottom-right (u1, v1).
 *
 * @since 1.8.1
 */
export type SpriteUV = { u0: number; v0: number; u1: number; v1: number };

/**
 * Dev-only registry of live sprite sheets keyed by normalized source URL, so
 * `HotRuntime.handleAssetChanged` can find and hot-replace every sheet loaded from a
 * changed image. Entries are removed in {@link SpriteSheet.destroy}.
 */
const hotReloadSheets = new HotReloadRegistry<SpriteSheet>();

/**
 * Returns every registered sheet loaded from a URL matching `url` after normalization.
 *
 * Internal - used by `HotRuntime.handleAssetChanged` to route an `'image'`
 * asset-changed event to the sheets that need their texture replaced.
 *
 * @param url - Changed asset URL to look up.
 * @returns Matching sheets, or `undefined` when none are registered.
 */
export function getHotReloadSheets(url: string): ReadonlySet<SpriteSheet> | undefined {
    return hotReloadSheets.get(url);
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
 * lazily creating and caching a GPU texture for rendering.
 *
 * Drawing requires an indexed sheet: after calling `indexize()`, the sheet stores
 * palette indices rather than RGBA data, and the GPU texture is an `r8uint`
 * texture uploaded via `writeTexture`. The original RGBA bytes are retained so
 * `reindexize()` can re-convert without reloading the image. A sheet that was
 * never indexed has no GPU texture.
 *
 * @since 0.1.0
 * @changed 1.8.1 Image-backed sheets use the decoded image size (`naturalWidth`/`naturalHeight`), not the display size.
 * @changed 1.8.1 `size` is a frozen copy, so the vector passed to the constructor no longer aliases the sheet's size.
 */
export class SpriteSheet {
    /** Source HTML image element (null for sheets created from raw indexed data). */
    private image: HTMLImageElement | null;

    /** Sprite sheet dimensions in pixels. Backing field for the public {@link size} getter. */
    private _size: Vector2i;

    /** Source URL this sheet was loaded from via {@link SpriteSheet.load}, or `null` otherwise. */
    private sourceUrl: string | null = null;

    /** GPU texture created lazily on first use. */
    private texture: GPUTexture | null = null;

    /** Device {@link texture} was created on; a different device (after an engine re-init) rebuilds it. */
    private textureDevice: GPUDevice | null = null;

    /** Retained original RGBA pixel data (set by indexize, used by reindexize). */
    private rgbaPixels: Uint8Array<ArrayBuffer> | null = null;

    /** Palette index per pixel (set by indexize, uploaded as r8uint texture). */
    private indexedPixels: Uint8Array<ArrayBuffer> | null = null;

    /** Lifecycle status. Backing field for the public {@link status} getter. */
    private _status: SpriteSheetStatus = 'ready';

    /** Load progress in `[0, 1]`. Backing field for the public {@link progress} getter. */
    private _progress = 1.0;

    /** Tile grid cell size, or `null` when the sheet has no grid. Backing field for {@link tileSize}. */
    private _tileSize: Vector2i | null = null;

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
            const decoded = getDecodedImageSize(image);

            this._size = Object.freeze(new Vector2i(decoded.width, decoded.height));
        } else if (size) {
            assertDimensions('sprite sheet', size.x, size.y);
            this._size = Object.freeze(new Vector2i(size.x, size.y));
        } else {
            throw new Error('Either an image or explicit size must be provided.');
        }
    }

    /**
     * Gets the sprite-sheet dimensions in pixels.
     *
     * @returns Frozen sheet dimensions. Changes after a hot-replace image swap with
     *   different dimensions - any `srcRect` a demo holds onto is the demo's own
     *   responsibility to reconcile.
     * @changed 1.8.1 Returns a frozen copy, so the vector passed to the constructor no longer aliases the sheet's size.
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
     * @since 1.4.0
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
     * @since 1.4.0
     * @returns `1.0` once ready; `0.0` while a hot-reload replacement image is in
     *   flight. Coarse-grained - `HTMLImageElement` reports no byte-level progress.
     */
    get progress(): number {
        return this._progress;
    }

    /**
     * Gets the size of one tile in this sheet's grid, or `null` when the sheet
     * has no grid.
     *
     * The grid is what lets `BT.drawTile(sheet, index, destPos)`,
     * `BT.drawTile(sheet, col, row, destPos)`, and {@link tileRect} find a
     * tile without you computing a `Rect2i`. Tiles are counted in whole cells
     * from the top-left; a partial cell at the right or bottom edge is not a
     * tile. The returned vector is frozen - assign a new size instead of
     * mutating it. The grid survives a hot-reload image swap; bounds are
     * checked against the sheet's current size on every lookup.
     *
     * @since 1.8.0
     * @returns The tile size, or `null`.
     */
    get tileSize(): Vector2i | null {
        return this._tileSize;
    }

    /**
     * Sets the size of one tile in this sheet's grid.
     *
     * @since 1.8.0
     * @param value - A number for square tiles, a `Vector2i` for width x height, or `null` to remove the grid.
     * @throws RangeError if the size is not a positive integer on both axes (the grid is left unchanged).
     */
    set tileSize(value: number | Vector2i | null) {
        this._tileSize = value === null ? null : toTileSize(value);
    }

    /**
     * Returns a display label for the source image, used in error messages.
     *
     * @returns Quoted image `src` when available, or `(unnamed)` for sheets
     *   created from raw indexed data.
     */
    private get sourceName(): string {
        return sourceLabel(this.image);
    }

    /**
     * Loads a sprite sheet from an image URL.
     *
     * @changed 1.8.0 Added `options.tileSize`.
     * @param url - Path or URL to the image file.
     * @param options - Optional configuration.
     * @param options.tileSize - Tile grid cell size (see {@link SpriteSheet.tileSize}).
     * @returns Promise resolving to the loaded SpriteSheet.
     * @throws RangeError if `options.tileSize` is not a positive integer on both axes.
     */
    static async load(url: string, options?: { tileSize?: number | Vector2i }): Promise<SpriteSheet> {
        // Validate before any loading so a bad size fails fast with no side effects.
        const tileSize = options?.tileSize === undefined ? null : toTileSize(options.tileSize);
        const image = await AssetLoader.loadImage(url);
        const sheet = new SpriteSheet(image);

        sheet._tileSize = tileSize;

        sheet.sourceUrl = url;

        if (isHotActive()) {
            hotReloadSheets.add(url, sheet);
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
     * @changed 1.8.0 Added `options.tileSize`.
     * @param options - Optional color-sort behavior for registration and tile grid size.
     * @param options.sort - Color ordering for palette registration.
     * @param options.tileSize - Tile grid cell size (see {@link SpriteSheet.tileSize}).
     * @returns Object with `sheet`, `srcRect`, and registered `colors`.
     * @throws RangeError if `options.tileSize` is not a positive integer on both axes.
     */
    static async loadIndexed(
        url: string,
        palette: Palette,
        startSlot: number,
        options?: { sort?: 'luminance' | 'none'; tileSize?: number | Vector2i },
    ): Promise<IndexedSpriteLoadResult> {
        // Validate before loadColorsIntoPalette writes the palette, so a bad size leaves it untouched.
        const tileSize = options?.tileSize === undefined ? null : toTileSize(options.tileSize);
        const colors = await SpriteSheet.loadColorsIntoPalette(url, palette, startSlot, options);
        const sheet = await SpriteSheet.load(url);

        sheet.indexize(palette);
        sheet._tileSize = tileSize;

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

        const { width: w, height: h } = getDecodedImageSize(image);

        return writePaletteColors(readRgbaPixels(image, w, h), palette, startSlot, options?.sort ?? 'luminance');
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

        this.rgbaPixels = readRgbaPixels(this.image, w, h);
        this.indexedPixels = mapRgbaPixelsToIndexed(w, h, this.rgbaPixels, palette, this.sourceName);

        this.invalidateTexture();
        registerIndexedSheet(this);
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
     * Internal - called by `HotRuntime.handleAssetChanged` immediately before it
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
     * Internal - called by `HotRuntime.handleAssetChanged` when the replacement
     * image fetch itself throws, before {@link hotReplaceImage} is ever reached.
     */
    failHotReplace(): void {
        this._status = 'failed';
    }

    /**
     * Replaces this sheet's source image in place after a hot-reloaded asset change.
     *
     * Swaps the image reference, validates and updates {@link size} (dimension
     * changes are allowed - buffers rebuild to match), re-runs `indexize` against
     * `palette` when the sheet was already indexized so `indexedPixels` stays in
     * sync with the new pixels, and invalidates the cached GPU texture so the next
     * `getTexture()` call re-uploads it. Sets {@link status} to `'ready'` on success.
     *
     * No-op (with a console warning, and {@link status} set to `'failed'`) for sheets
     * created from raw indexed data - there is no source image to replace - and for
     * an already-indexized sheet when `palette` is `null`, since there is nothing safe
     * to reindex against.
     *
     * The new pixels are indexed before anything is swapped, so when that fails (a pixel
     * color from the new image is missing from `palette`) the sheet keeps its old image,
     * size, indices and texture. {@link status} is set to `'failed'` and the error is rethrown.
     *
     * @param image - Newly loaded replacement image.
     * @param palette - Active palette, used to re-index the new pixels when the sheet was
     *   already indexized.
     * @throws If the replacement image exceeds engine size limits, or a pixel color is not in `palette`.
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

            const { width, height } = getDecodedImageSize(image);
            let { rgbaPixels, indexedPixels } = this;

            // Index into locals first: a throw here must leave the sheet exactly as it was.
            if (indexedPixels !== null && palette !== null) {
                rgbaPixels = readRgbaPixels(image, width, height);
                indexedPixels = mapRgbaPixelsToIndexed(width, height, rgbaPixels, palette, sourceLabel(image));
            }

            this.image = image;
            this._size = Object.freeze(new Vector2i(width, height));
            this.rgbaPixels = rgbaPixels;
            this.indexedPixels = indexedPixels;
            this.invalidateTexture();

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
     * @deprecated Deprecated since 1.1.1 (2026-05-31). Use {@link isIndexed} instead.
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
     * Returns a direct reference to the internal indexed-pixel buffer.
     *
     * Unlike {@link getIndexedPixels}, this does **not** copy the buffer. Callers must not
     * mutate the returned array. This exists for hot-path CPU blitting (the software
     * renderer's sprite and bitmap-text raster loops), where copying the full sheet on every
     * blit call is unaffordable.
     *
     * @returns Direct reference to the indexed-pixel buffer, row-major, one byte per pixel.
     * @throws If the sheet has not been indexized yet.
     */
    getIndexedPixelsRef(): Uint8Array<ArrayBuffer> {
        if (this.indexedPixels === null) {
            throw new Error(
                "This sprite sheet hasn't been converted to palette indices yet. Call sheet.indexize(palette) first.",
            );
        }

        return this.indexedPixels;
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
        if (this.indexedPixels !== null) {
            markUniqueIndicesInRect(this.indexedPixels, this.size.x, this.size.y, srcRect, paletteOffset, usedMask);
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
     * Returns the source rectangle of one tile in this sheet's grid.
     *
     * Allocates a new `Rect2i` per call - build frame lists with it in
     * `init()`. For per-frame drawing, `BT.drawTile` does the same lookup
     * without allocating.
     *
     * @since 1.8.0
     * @param index - Row-major tile index: `0` is top-left, counting across each row then down.
     * @returns New source rectangle for the tile.
     * @throws Error if the sheet has no {@link tileSize}.
     * @throws RangeError if the index is negative, fractional, or past the last whole tile.
     */
    tileRect(index: number): Rect2i;
    /**
     * Returns the source rectangle of the tile at a grid column and row.
     *
     * @since 1.8.0
     * @param col - Zero-based column.
     * @param row - Zero-based row.
     * @returns New source rectangle for the tile.
     * @throws Error if the sheet has no {@link tileSize}.
     * @throws RangeError if `col` / `row` is negative, fractional, or outside the grid of whole tiles.
     */
    tileRect(col: number, row: number): Rect2i;
    /**
     * Implementation of the {@link SpriteSheet.tileRect} overloads.
     *
     * @param colOrIndex - Row-major index when `row` is omitted, otherwise the column.
     * @param row - Zero-based row, or omitted for the index form.
     * @returns New source rectangle for the tile.
     */
    tileRect(colOrIndex: number, row?: number): Rect2i {
        return writeGridTileRect(new Rect2i(), this, colOrIndex, row);
    }

    /**
     * Gets or lazily creates the GPU texture for this sprite sheet.
     *
     * Creates an `r8uint` texture from the palette index data. The result is
     * cached until `destroy()` is called or a different device is passed (the
     * engine was re-initialized).
     *
     * @changed 1.8.1 Throws for a sheet that was never indexized; the unused `rgba8unorm` texture path is gone.
     * @param device - WebGPU device for texture creation.
     * @returns GPU texture ready for rendering.
     * @throws Error if the sheet has not been indexized.
     */
    getTexture(device: GPUDevice): GPUTexture {
        if (this.indexedPixels === null) {
            throw new Error(SPRITE_NOT_INDEXIZED_MESSAGE);
        }

        // No destroy(): the texture belongs to the old device, which frees it on its own destroy().
        if (this.textureDevice !== device) {
            this.texture = null;
            this.textureDevice = device;
        }

        if (this.texture === null) {
            this.texture = createIndexedTexture(device, this.size.x, this.size.y, this.indexedPixels);
        }

        return this.texture;
    }

    /**
     * Calculates normalized UV coordinates for a sprite region.
     * Converts pixel coordinates to 0.0-1.0 texture coordinate range. A rect that runs past the
     * sheet edge is not clamped and gives values outside 0-1; both renderers draw only its
     * in-sheet part.
     *
     * @param rect - Source rectangle in pixel coordinates.
     * @returns Object with u0, v0 (top-left) and u1, v1 (bottom-right) UV coordinates.
     */
    getUVs(rect: Rect2i): SpriteUV {
        return this.getUVsTo(rect, { u0: 0, v0: 0, u1: 0, v1: 0 });
    }

    /**
     * Calculates normalized UV coordinates for a sprite region into a caller-owned object.
     * Zero-allocation variant of {@link getUVs} for per-draw hot paths. Like `getUVs`, it does
     * not clamp a rect that runs past the sheet edge.
     *
     * @param rect - Source rectangle in pixel coordinates.
     * @param out - Object to write the u0, v0, u1, v1 UV coordinates into.
     * @returns `out`, for chaining.
     */
    getUVsTo(rect: Rect2i, out: SpriteUV): SpriteUV {
        out.u0 = rect.x / this.size.x;
        out.v0 = rect.y / this.size.y;
        out.u1 = (rect.x + rect.width) / this.size.x;
        out.v1 = (rect.y + rect.height) / this.size.y;

        return out;
    }

    /**
     * Releases the GPU texture from memory and clears all retained pixel data.
     *
     * Clears CPU-side `rgbaPixels` and `indexedPixels`, so a destroyed sheet has
     * no GPU texture. An image-backed sheet can get one again by calling
     * {@link indexize}; a sheet made with {@link SpriteSheet.fromIndexedPixels}
     * has no source image and must be recreated from its indexed data.
     */
    destroy(): void {
        this.invalidateTexture();

        if (this.sourceUrl !== null) {
            hotReloadSheets.delete(this.sourceUrl, this);
        }

        unregisterIndexedSheet(this);

        this.rgbaPixels = null;
        this.indexedPixels = null;
    }

    /**
     * Destroys and clears the cached GPU texture if one is currently held.
     *
     * Called so the next `getTexture()` uploads fresh pixel data (after
     * `indexize`, `reindexize`, or a hot replace) and by `destroy` during full teardown.
     */
    private invalidateTexture(): void {
        if (this.texture) {
            this.texture.destroy();
            this.texture = null;
        }
    }
}
