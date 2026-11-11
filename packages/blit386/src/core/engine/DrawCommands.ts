/**
 * The `BT` draw calls: clearing, pixels, lines, rectangles, system and bitmap text, sprites, tiles and
 * nine-slice panels, plus the per-frame palette-usage marks the overlay palette grid reads.
 * Part of {@link BTAPI}; not part of the BT API.
 */

import type { BitmapFont } from '../../assets/BitmapFont';
import { NineSlice, type NineSliceMode, splitNineSliceAxis } from '../../assets/NineSlice';
import { TRANSPARENT_PALETTE_INDEX } from '../../assets/Palette';
import { type SpriteSheet, writeGridTileRect, writeTileRect } from '../../assets/SpriteSheet';
import {
    mapSpritePoint,
    resolveSpriteOrientation,
    resolveSpriteScale,
    SPRITE_ORIENTATIONS,
    type SpriteDrawParams,
    type SpriteOrientation,
} from '../../render/SpriteOrientation';
import {
    paletteIndexNegativeError,
    paletteIndexOutOfRangeError,
    SPRITE_NOT_INDEXIZED_MESSAGE,
} from '../../utils/errorMessages';
import { Rect2i } from '../../utils/Rect2i';
import { Vector2i } from '../../utils/Vector2i';
import type { BTAPI } from '../BTAPI';
import { markIndexUsed, USAGE_CAPACITY } from '../RenderPaletteUsage';

/** Draw calls and the per-frame palette-usage marks they leave for the overlay. */
export class DrawCommands {
    /** Bitmask of palette indices referenced by demo draw calls this frame. */
    public readonly framePaletteUsageMask = new Uint8Array(USAGE_CAPACITY);

    /**
     * Source rect reused by every `drawTile*` call. Safe to share: the WebGPU
     * sprite pipeline consumes `srcRect` before returning and the software
     * renderer clones it into its command list.
     */
    private readonly scratchTileRect = new Rect2i();

    /** Source rect reused by every `drawNineSlice` quad. Safe to share for the same reason as `scratchTileRect`. */
    private readonly scratchNineSliceSrc = new Rect2i();

    /** Destination point reused by every 1:1 `drawNineSlice` quad (both renderers copy or consume it). */
    private readonly scratchNineSliceDest = new Vector2i();

    /** `[left, middle, right]` column widths of the current `drawNineSlice` box. */
    private readonly nineSliceColumns = new Int32Array(3);

    /** `[top, middle, bottom]` row heights of the current `drawNineSlice` box. */
    private readonly nineSliceRows = new Int32Array(3);

    /** Sheet x of each `drawNineSlice` column strip; end caps crop from their outer side. */
    private readonly nineSliceSrcX = new Int32Array(3);

    /** Sheet y of each `drawNineSlice` row strip; end caps crop from their outer side. */
    private readonly nineSliceSrcY = new Int32Array(3);

    /** Screen x of each `drawNineSlice` column box. */
    private readonly nineSliceBoxX = new Int32Array(3);

    /** Screen y of each `drawNineSlice` row box. */
    private readonly nineSliceBoxY = new Int32Array(3);

    /** Scratch for the resolved `SpriteDrawParams.scale`, so params draws allocate nothing. */
    private readonly spriteScaleScratch = new Vector2i(1, 1);

    /** Footprint corner for params draws with a `Vector2i` dest; renderers copy it when they queue the draw. */
    private readonly spriteCornerScratch = new Vector2i();

    /**
     * Creates the part for one engine.
     *
     * @param engine - The engine this part belongs to.
     */
    public constructor(private readonly engine: BTAPI) {}

    /**
     * Sets the background clear color for each frame using a palette index.
     *
     * @param paletteIndex - Palette index for the clear color.
     */
    public setClearColor(paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.engine.renderer?.setClearColor(paletteIndex);
    }

    /**
     * Fills a rectangular region with a palette-indexed color.
     *
     * @param rect - Region to fill in pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    public clearRect(rect: Rect2i, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.engine.renderer?.clearRect(rect, paletteIndex);
    }

    /**
     * Draws a single pixel at the specified position.
     *
     * Coordinates are integers: a `Vector2i` truncates toward zero when constructed, and the
     * components are truncated again here because they are mutable after construction.
     *
     * @param pos - Pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    public drawPixel(pos: Vector2i, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.engine.renderer?.drawPixelXY(pos.x | 0, pos.y | 0, paletteIndex);
    }

    /**
     * Draws a single pixel at raw coordinates.
     * More efficient than {@link drawPixel} when coordinates are already unpacked -
     * avoids constructing a `Vector2i` just to shuttle two numbers.
     *
     * Fractional coordinates are truncated toward zero, the same rule `Vector2i` applies,
     * so both backends draw the same pixel.
     *
     * @param x - X coordinate (truncated toward zero).
     * @param y - Y coordinate (truncated toward zero).
     * @param paletteIndex - Palette color index.
     */
    public drawPixelXY(x: number, y: number, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.engine.renderer?.drawPixelXY(x | 0, y | 0, paletteIndex);
    }

    /**
     * Draws a line between two points using Bresenham's algorithm.
     * Produces pixel-perfect lines without antialiasing.
     *
     * @param p0 - Start point.
     * @param p1 - End point.
     * @param paletteIndex - Palette color index.
     */
    public drawLine(p0: Vector2i, p1: Vector2i, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.engine.renderer?.drawLine(p0, p1, paletteIndex);
    }

    /**
     * Draws a rectangle outline (unfilled).
     *
     * @param rect - Rectangle bounds.
     * @param paletteIndex - Palette color index.
     */
    public drawRect(rect: Rect2i, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.engine.renderer?.drawRect(rect, paletteIndex);
    }

    /**
     * Draws a filled rectangle.
     *
     * @param rect - Rectangle bounds.
     * @param paletteIndex - Palette color index.
     */
    public drawRectFill(rect: Rect2i, paletteIndex: number): void {
        this.assertPaletteIndex(paletteIndex);
        this.trackPaletteIndexUsed(paletteIndex);

        this.markDrawCall();

        this.engine.renderer?.drawRectFill(rect, paletteIndex);
    }

    /**
     * Draws text using the built-in 6x14 system font.
     *
     * The system font stores foreground pixels as palette index 1. The
     * `paletteIndex` parameter is converted to a sprite pipeline palette
     * offset so that each foreground pixel maps to `palette[paletteIndex]`.
     *
     * @param pos - Text position (top-left corner).
     * @param paletteIndex - Palette color index for the text.
     * @param text - String to display.
     */
    public drawSystemText(pos: Vector2i, paletteIndex: number, text: string): void {
        this.assertPaletteIndex(paletteIndex);

        // Palette index 0 is transparent - nothing to draw.
        if (paletteIndex === TRANSPARENT_PALETTE_INDEX) {
            return;
        }

        if (this.engine.systemFont) {
            this.trackPaletteIndexUsed(paletteIndex);
            this.markDrawCall();

            // Offset math: font stores foreground as index 1.
            // Shader computes 1 + (paletteIndex - 1) = paletteIndex.
            this.engine.renderer?.drawBitmapText(this.engine.systemFont, pos, text, paletteIndex - 1);
        }
    }

    /**
     * Draws a sprite region from an indexed sprite sheet.
     * The renderer batches compatible sprite draws internally.
     *
     * @param spriteSheet - Source sprite sheet (must have been indexized via spriteSheet.indexize()).
     * @param srcRect - Region to copy from the sprite sheet.
     * @param destPos - Screen position to draw in (the top-left corner).
     * @param paletteOffset - Palette index offset applied at draw time (default 0).
     * @throws If the sprite sheet has not been indexized, or (dev mode only) if `destPos` is a `Rect2i`.
     */
    public drawSprite(spriteSheet: SpriteSheet, srcRect: Rect2i, destPos: Vector2i, paletteOffset: number = 0): void {
        // Untyped callers passing a Rect2i here would get a silent unscaled draw at its top-left.
        // Dev builds only: release pays one boolean read.
        if (this.engine.isDevGuardActive && (destPos as unknown) instanceof Rect2i) {
            throw new Error(
                'drawSprite with a Rect2i destination needs a params object: drawSprite(sheet, src, destRect, {})',
            );
        }

        this.submitSprite(spriteSheet, srcRect, destPos, paletteOffset, 0);
    }

    /**
     * Draws a sprite region with a params object (the params form of `BT.drawSprite`).
     * The params are read once into locals, never mutated or retained.
     *
     * @param spriteSheet - Source sprite sheet (must have been indexized via spriteSheet.indexize()).
     * @param srcRect - Region to copy from the sprite sheet.
     * @param dest - A `Vector2i` (where the pivot lands, or the top-left of the post-flags, post-scale
     *   footprint without one) or a `Rect2i` (the box the footprint is stretched into).
     * @param params - Flags, pivot, scale, and palette offset.
     * @throws If `params` is null or an array, `dest` is neither a `Vector2i` nor a `Rect2i`, the flags,
     *   pivot, or scale are invalid, a `Rect2i` dest has a pivot or a non-neutral scale, or anything
     *   {@link drawSprite} rejects.
     */
    public drawSpriteWithParams(
        spriteSheet: SpriteSheet,
        srcRect: Rect2i,
        dest: Vector2i | Rect2i,
        params: SpriteDrawParams,
    ): void {
        if (params === null || Array.isArray(params)) {
            throw new Error(
                `drawSprite params must be a SpriteDrawParams object like { flags: BT.FLIP_H }, got ${params === null ? 'null' : 'an array'}`,
            );
        }

        // Absent fields take the documented defaults (no flip, scale 1, no palette shift).
        const orientation = resolveSpriteOrientation(params.flags ?? 0);
        const paletteOffset = params.paletteOffset ?? 0;
        const scale = resolveSpriteScale(params.scale, this.spriteScaleScratch);
        const isUnscaled = scale.x === 1 && scale.y === 1;
        const pivot = params.pivot;

        if (dest instanceof Rect2i) {
            if (pivot !== undefined) {
                throw new Error(
                    'drawSprite with a Rect2i destination takes no pivot: the rectangle already places the sprite. Leave pivot undefined',
                );
            }

            if (!isUnscaled) {
                throw new Error(
                    'drawSprite with a Rect2i destination takes no scale: the rectangle already sets the size. Pass scale: 1 or leave it out',
                );
            }

            this.submitSpriteStretched(
                spriteSheet,
                srcRect,
                // Rect2i fields are public and mutable: truncate like the constructor (NaN -> 0 draws nothing).
                dest.x | 0,
                dest.y | 0,
                dest.width | 0,
                dest.height | 0,
                paletteOffset,
                orientation,
            );
            return;
        }

        if (!(dest instanceof Vector2i)) {
            throw new Error('drawSprite with params takes a Vector2i or Rect2i destination');
        }

        const corner = this.resolveSpriteCorner(dest, pivot, orientation, srcRect, scale);

        // An unscaled point keeps the 1:1 / oriented path, so its output stays identical to overload 1.
        if (isUnscaled) {
            this.submitSprite(spriteSheet, srcRect, corner, paletteOffset, orientation);
            return;
        }

        // Scale multiplies the post-flags footprint in screen axes.
        // eslint-disable-next-line security/detect-object-injection
        const swap = (SPRITE_ORIENTATIONS[orientation] as SpriteOrientation).swap;
        const footprintW = swap ? srcRect.height : srcRect.width;
        const footprintH = swap ? srcRect.width : srcRect.height;

        this.submitSpriteStretched(
            spriteSheet,
            srcRect,
            corner.x,
            corner.y,
            footprintW * scale.x,
            footprintH * scale.y,
            paletteOffset,
            orientation,
        );
    }

    /**
     * Draws one tile from a sheet's own grid ({@link SpriteSheet.tileSize}).
     *
     * @param spriteSheet - Indexized sheet with a tile grid.
     * @param colOrIndex - Row-major index when `row` is `undefined`, otherwise the column.
     * @param row - Zero-based row, or `undefined` for the index form.
     * @param destPos - Screen position of the tile's top-left corner.
     * @param paletteOffset - Palette index offset applied at draw time (default 0).
     * @throws If the sheet has no grid, the tile is outside it, or anything {@link drawSprite} rejects.
     */
    public drawTile(
        spriteSheet: SpriteSheet,
        colOrIndex: number,
        row: number | undefined,
        destPos: Vector2i,
        paletteOffset: number = 0,
    ): void {
        this.drawSprite(
            spriteSheet,
            writeGridTileRect(this.scratchTileRect, spriteSheet, colOrIndex, row),
            destPos,
            paletteOffset,
        );
    }

    /**
     * Draws one tile using a tile size given per call instead of the sheet's grid.
     *
     * @param spriteSheet - Indexized sheet.
     * @param col - Zero-based column.
     * @param row - Zero-based row.
     * @param tileW - Tile width in pixels.
     * @param tileH - Tile height in pixels.
     * @param destPos - Screen position of the tile's top-left corner.
     * @param paletteOffset - Palette index offset applied at draw time (default 0).
     * @throws If the size or tile is invalid, or anything {@link drawSprite} rejects.
     */
    public drawTileSized(
        spriteSheet: SpriteSheet,
        col: number,
        row: number,
        tileW: number,
        tileH: number,
        destPos: Vector2i,
        paletteOffset: number = 0,
    ): void {
        this.drawSprite(
            spriteSheet,
            writeTileRect(this.scratchTileRect, spriteSheet, col, row, tileW, tileH),
            destPos,
            paletteOffset,
        );
    }

    /**
     * Draws a nine-slice panel into a box: corners at 1:1, edges and center stretched or tiled per the
     * nine-slice's modes. A box smaller than the corners crops them from their outer side.
     *
     * @param nineSlice - Panel from `NineSlice.fromSheet`.
     * @param destRect - Box to fill; empty, negative, or NaN sizes draw nothing.
     * @param paletteOffset - Palette index offset applied at draw time (default 0).
     * @throws If `nineSlice` is not a `NineSlice`, `destRect` is not a `Rect2i`, the palette offset is invalid,
     *   or the sheet has not been indexized. Validation runs before any quad is emitted.
     */
    public drawNineSlice(nineSlice: NineSlice, destRect: Rect2i, paletteOffset: number = 0): void {
        if (!(nineSlice instanceof NineSlice)) {
            throw new Error(
                'drawNineSlice expects a NineSlice; build one with NineSlice.fromSheet(sheet, outer, inner)',
            );
        }

        if (!(destRect instanceof Rect2i)) {
            throw new Error('drawNineSlice expects a Rect2i destination box');
        }

        const sheet = nineSlice.sheet;

        this.assertPaletteIndex(paletteOffset);
        this.requireIndexizedSheet(sheet);

        // Rect2i fields are public and mutable: truncate like the constructor (NaN -> 0 draws nothing).
        const destX = destRect.x | 0;
        const destY = destRect.y | 0;
        const destW = destRect.width | 0;
        const destH = destRect.height | 0;

        if (destW <= 0 || destH <= 0) {
            return;
        }

        // One count per API call (like drawBitmapText), however many quads it emits.
        this.markDrawCall();

        const { outer, inner } = nineSlice;
        const columns = this.nineSliceColumns;
        const rows = this.nineSliceRows;

        splitNineSliceAxis(destW, inner.x - outer.x, outer.right - inner.right, columns);
        splitNineSliceAxis(destH, inner.y - outer.y, outer.bottom - inner.bottom, rows);

        const right = columns[2] as number;
        const bottom = rows[2] as number;
        const srcXs = this.nineSliceSrcX;
        const srcYs = this.nineSliceSrcY;
        const boxXs = this.nineSliceBoxX;
        const boxYs = this.nineSliceBoxY;

        srcXs[0] = outer.x;
        srcXs[1] = inner.x;
        srcXs[2] = outer.right - right;
        srcYs[0] = outer.y;
        srcYs[1] = inner.y;
        srcYs[2] = outer.bottom - bottom;
        boxXs[0] = destX;
        boxXs[1] = destX + (columns[0] as number);
        boxXs[2] = destX + destW - right;
        boxYs[0] = destY;
        boxYs[1] = destY + (rows[0] as number);
        boxYs[2] = destY + destH - bottom;

        for (let row = 0; row < 3; row++) {
            // eslint-disable-next-line security/detect-object-injection
            const boxH = rows[row] as number;

            if (boxH === 0) {
                continue;
            }

            // eslint-disable-next-line security/detect-object-injection
            const srcY = srcYs[row] as number;
            const srcH = row === 1 ? inner.height : boxH;
            // eslint-disable-next-line security/detect-object-injection
            const boxY = boxYs[row] as number;

            for (let col = 0; col < 3; col++) {
                // eslint-disable-next-line security/detect-object-injection
                const boxW = columns[col] as number;

                if (boxW === 0) {
                    continue;
                }

                // eslint-disable-next-line security/detect-object-injection
                const srcX = srcXs[col] as number;
                const srcW = col === 1 ? inner.width : boxW;
                // eslint-disable-next-line security/detect-object-injection
                const boxX = boxXs[col] as number;
                const mode = nineSliceRegionMode(nineSlice, row, col);

                this.emitNineSliceRegion(sheet, srcX, srcY, srcW, srcH, boxX, boxY, boxW, boxH, mode, paletteOffset);
            }
        }
    }

    /**
     * Draws text using a bitmap font with variable-width glyphs.
     * Supports Unicode characters and per-glyph render offsets.
     *
     * @param font - Bitmap font containing character glyphs (underlying sheet must be indexized).
     * @param pos - Text position (top-left corner).
     * @param text - String to render.
     * @param paletteOffset - Palette index offset applied to all glyphs (default 0).
     * @throws If the font's sprite sheet has not been indexized.
     */
    public drawBitmapText(font: BitmapFont, pos: Vector2i, text: string, paletteOffset: number = 0): void {
        this.assertPaletteIndex(paletteOffset);
        this.requireIndexizedSheet(font.getSpriteSheet());

        if (this.engine.renderer) {
            this.markBitmapTextPaletteUsage(font, text, paletteOffset);
        }

        this.markDrawCall();

        this.engine.renderer?.drawBitmapText(font, pos, text, paletteOffset);
    }

    /**
     * Whether demo draw calls should populate {@link framePaletteUsageMask} this frame.
     *
     * @returns `true` when the overlay palette grid is active and visible.
     */
    public isTrackingFramePaletteUsage(): boolean {
        return this.engine.overlay?.isTrackingPaletteUsage ?? false;
    }

    /**
     * Top-left of the post-flags, post-scale footprint for a `Vector2i` destination: `dest`, minus the pivot
     * sent through the orientation's point map and multiplied by `scale` when one is set. Every draw takes
     * this one path. Components are truncated, since `Vector2i` fields are public and mutable.
     *
     * @param dest - Destination point.
     * @param pivot - `SpriteDrawParams.pivot`.
     * @param orientation - Orientation index from `resolveSpriteOrientation`.
     * @param srcRect - Source region (its size is the point map's `sw x sh`).
     * @param scale - Resolved integer scale.
     * @returns A shared scratch vector; renderers copy it when they queue the draw.
     * @throws If `pivot` is neither `undefined` nor a `Vector2i`.
     */
    private resolveSpriteCorner(
        dest: Vector2i,
        pivot: Vector2i | undefined,
        orientation: number,
        srcRect: Rect2i,
        scale: Vector2i,
    ): Vector2i {
        const corner = this.spriteCornerScratch;

        if (pivot === undefined) {
            return corner.set(dest.x | 0, dest.y | 0);
        }

        if (!(pivot instanceof Vector2i)) {
            throw new Error('drawSprite params.pivot must be a Vector2i or undefined');
        }

        mapSpritePoint(orientation, pivot.x | 0, pivot.y | 0, srcRect.width, srcRect.height, corner);

        return corner.set((dest.x | 0) - corner.x * scale.x, (dest.y | 0) - corner.y * scale.y);
    }

    /**
     * Validates and submits one sprite draw shared by {@link drawSprite} and {@link drawSpriteWithParams}.
     * Orientation `0` goes to the renderer's plain `drawSprite`, so overload 1 output stays unchanged.
     *
     * @param spriteSheet - Source sprite sheet (must have been indexized).
     * @param srcRect - Region to copy from the sprite sheet.
     * @param destPos - Top-left of the (post-flags) footprint.
     * @param paletteOffset - Palette index offset applied at draw time.
     * @param orientation - Orientation index from `resolveSpriteOrientation`.
     * @throws If the palette offset is invalid or the sprite sheet has not been indexized.
     */
    private submitSprite(
        spriteSheet: SpriteSheet,
        srcRect: Rect2i,
        destPos: Vector2i,
        paletteOffset: number,
        orientation: number,
    ): void {
        this.assertPaletteIndex(paletteOffset);
        this.requireIndexizedSheet(spriteSheet);

        if (this.engine.renderer && this.isTrackingFramePaletteUsage()) {
            spriteSheet.markPaletteIndicesInRect(srcRect, paletteOffset, this.framePaletteUsageMask);
        }

        this.markDrawCall();

        if (orientation === 0) {
            this.engine.renderer?.drawSprite(spriteSheet, srcRect, destPos, paletteOffset);
        } else {
            this.engine.renderer?.drawSpriteOriented(spriteSheet, srcRect, destPos, paletteOffset, orientation);
        }
    }

    /**
     * Validates and submits one stretched draw (integer scale or a `Rect2i` destination). An empty box draws
     * nothing: a computed size of 0 (an empty bar) is normal layout, not an error.
     *
     * @param spriteSheet - Source sprite sheet (must have been indexized).
     * @param srcRect - Region to copy from the sprite sheet.
     * @param destX - Box left edge.
     * @param destY - Box top edge.
     * @param destW - Box width; `<= 0` draws nothing.
     * @param destH - Box height; `<= 0` draws nothing.
     * @param paletteOffset - Palette index offset applied at draw time.
     * @param orientation - Orientation index from `resolveSpriteOrientation`.
     * @throws If the palette offset is invalid or the sprite sheet has not been indexized.
     */
    private submitSpriteStretched(
        spriteSheet: SpriteSheet,
        srcRect: Rect2i,
        destX: number,
        destY: number,
        destW: number,
        destH: number,
        paletteOffset: number,
        orientation: number,
    ): void {
        this.assertPaletteIndex(paletteOffset);
        this.requireIndexizedSheet(spriteSheet);

        if (destW <= 0 || destH <= 0 || srcRect.width <= 0 || srcRect.height <= 0) {
            return;
        }

        if (this.engine.renderer && this.isTrackingFramePaletteUsage()) {
            spriteSheet.markPaletteIndicesInRect(srcRect, paletteOffset, this.framePaletteUsageMask);
        }

        this.markDrawCall();

        this.engine.renderer?.drawSpriteStretched(
            spriteSheet,
            srcRect,
            destX,
            destY,
            destW,
            destH,
            paletteOffset,
            orientation,
        );
    }

    /**
     * Emits one nine-slice region straight to the renderer (validation already ran in `drawNineSlice`).
     * Stretch is one stretched quad; tile is 1:1 quads stepping by the strip size from the box's top-left,
     * with the last column and row cropped.
     *
     * @param sheet - Indexized source sheet.
     * @param srcX - Strip left edge in the sheet.
     * @param srcY - Strip top edge in the sheet.
     * @param srcW - Strip width (at least 1).
     * @param srcH - Strip height (at least 1).
     * @param boxX - Box left edge.
     * @param boxY - Box top edge.
     * @param boxW - Box width (at least 1).
     * @param boxH - Box height (at least 1).
     * @param mode - Fill mode (corners arrive as `'tile'`).
     * @param paletteOffset - Validated palette offset.
     */
    private emitNineSliceRegion(
        sheet: SpriteSheet,
        srcX: number,
        srcY: number,
        srcW: number,
        srcH: number,
        boxX: number,
        boxY: number,
        boxW: number,
        boxH: number,
        mode: NineSliceMode,
        paletteOffset: number,
    ): void {
        const src = this.scratchNineSliceSrc;
        const isStretch = mode === 'stretch';

        src.x = srcX;
        src.y = srcY;
        // A stretch samples the whole strip; tiles never reach past the box, so mark only what shows.
        src.width = isStretch ? srcW : Math.min(srcW, boxW);
        src.height = isStretch ? srcH : Math.min(srcH, boxH);

        if (this.engine.renderer && this.isTrackingFramePaletteUsage()) {
            sheet.markPaletteIndicesInRect(src, paletteOffset, this.framePaletteUsageMask);
        }

        if (isStretch) {
            this.engine.renderer?.drawSpriteStretched(sheet, src, boxX, boxY, boxW, boxH, paletteOffset, 0);
            return;
        }

        const dest = this.scratchNineSliceDest;

        for (let tileY = 0; tileY < boxH; tileY += srcH) {
            for (let tileX = 0; tileX < boxW; tileX += srcW) {
                src.width = Math.min(srcW, boxW - tileX);
                src.height = Math.min(srcH, boxH - tileY);
                dest.x = boxX + tileX;
                dest.y = boxY + tileY;
                this.engine.renderer?.drawSprite(sheet, src, dest, paletteOffset);
            }
        }
    }

    /**
     * Validates that a sprite sheet has been indexized.
     *
     * @param sheet - Sprite sheet to validate.
     * @throws If the sprite sheet has not been indexized.
     */
    private requireIndexizedSheet(sheet: SpriteSheet): void {
        if (!sheet.isIndexed()) {
            throw new Error(SPRITE_NOT_INDEXIZED_MESSAGE);
        }
    }

    /**
     * Tracks one demo-issued draw API call for the current frame snapshot.
     */
    private markDrawCall(): void {
        this.engine.pendingDrawCalls++;
    }

    /**
     * Marks a palette index as used for the current frame.
     *
     * @param index - Palette index to track.
     */
    private trackPaletteIndexUsed(index: number): void {
        if (!this.isTrackingFramePaletteUsage() || !this.engine.renderer) {
            return;
        }

        markIndexUsed(this.framePaletteUsageMask, index);
    }

    /**
     * Marks palette indices referenced by bitmap text glyphs in a string.
     *
     * @param font - Bitmap font whose glyph atlas is scanned.
     * @param text - Text about to be drawn.
     * @param paletteOffset - Palette offset applied at draw time.
     */
    private markBitmapTextPaletteUsage(font: BitmapFont, text: string, paletteOffset: number): void {
        if (!this.isTrackingFramePaletteUsage()) {
            return;
        }

        const sheet = font.getSpriteSheet();

        for (const char of text) {
            const glyph = font.getGlyph(char);

            if (glyph !== null) {
                sheet.markPaletteIndicesInRect(glyph.rect, paletteOffset, this.framePaletteUsageMask);
            }
        }
    }

    /**
     * Validates that a palette index is a non-negative integer and, when a palette
     * is active, that the index is within its range.
     *
     * The non-integer/negative check always runs regardless of palette state.
     * The range check only runs when a palette has been set.
     *
     * @param index - Palette index to validate.
     * @throws Error if the index is not a non-negative integer.
     * @throws Error if a palette is active and the index is out of its range.
     */
    private assertPaletteIndex(index: number): void {
        if (!Number.isInteger(index) || index < 0) {
            throw new Error(paletteIndexNegativeError(index));
        }

        // getPalette() so the range check follows the game's captured palette during
        // the splash rather than the splash's own ramp, which has a different size.
        const palette = this.engine.palettes.getPalette();

        if (palette && index >= palette.size) {
            throw new Error(paletteIndexOutOfRangeError(index, palette.size));
        }
    }
}

/**
 * Fill mode of a nine-slice region: `center` for the middle, `edges` for the edges, and `'tile'` for a corner -
 * a corner's box always equals its strip, so one 1:1 tile draws it.
 *
 * @param nineSlice - Panel being drawn.
 * @param row - Row index 0-2.
 * @param col - Column index 0-2.
 * @returns The region's fill mode.
 */
function nineSliceRegionMode(nineSlice: NineSlice, row: number, col: number): NineSliceMode {
    if (row === 1 && col === 1) {
        return nineSlice.center;
    }

    return row === 1 || col === 1 ? nineSlice.edges : 'tile';
}
