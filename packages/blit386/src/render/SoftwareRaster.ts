/**
 * The software backend's command queue entries and the rasterizer that replays them into an RGBA frame.
 * BT-58 replaces this file's RGBA writes with a palette-index framebuffer.
 */

import type { Palette } from '../assets/Palette';
import { TRANSPARENT_PALETTE_INDEX } from '../assets/Palette';
import type { SpriteSheet } from '../assets/SpriteSheet';
import { clipSpriteSourceRectXYTo } from '../utils/AssetLimits';
import type { Color32 } from '../utils/Color32';
import { Rect2i } from '../utils/Rect2i';
import type { Vector2i } from '../utils/Vector2i';
import type { ClippedLine } from './clipLine';
import { clipBresenhamLine } from './clipLine';
import type { SpriteOrientation } from './SpriteOrientation';
import { SPRITE_ORIENTATIONS, stretchSampleIndex } from './SpriteOrientation';

/** A queued filled-rectangle or outline-rectangle draw command. */
type RectCommand = {
    kind: 'rectFill' | 'rect';
    x0: number;
    y0: number;
    width: number;
    height: number;
    paletteIndex: number;
    cameraX: number;
    cameraY: number;
};

/** A queued line draw command between two endpoints. */
type LineCommand = {
    kind: 'line';
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    paletteIndex: number;
    cameraX: number;
    cameraY: number;
};

/** A queued filled-rectangle, outline-rectangle, or line draw command. */
type PrimitiveCommand = RectCommand | LineCommand;

/** A queued sprite blit command, storing the source sheet and destination position. */
type SpriteCommand = {
    kind: 'sprite';
    spriteSheet: SpriteSheet;
    srcRect: Rect2i;
    destPos: Vector2i;
    paletteOffset: number;
    /** Row of {@link SPRITE_ORIENTATIONS}; `0` takes the unchanged {@link blitIndexedRect} path. */
    orientation: number;
    cameraX: number;
    cameraY: number;
};

/**
 * A queued stretched / scaled sprite blit: the post-flags footprint stretched into a destination box.
 * Stores numbers only, so queuing copies nothing the caller owns and allocates no Rect2i.
 */
type StretchedSpriteCommand = {
    kind: 'spriteStretched';
    spriteSheet: SpriteSheet;
    srcX: number;
    srcY: number;
    srcW: number;
    srcH: number;
    destX: number;
    destY: number;
    destW: number;
    destH: number;
    paletteOffset: number;
    /** Row of {@link SPRITE_ORIENTATIONS}, `0`-`7`. */
    orientation: number;
    cameraX: number;
    cameraY: number;
};

/**
 * A queued bitmap text draw command. Glyph shapes are resolved once at queue time into
 * `glyphData` (6 ints per glyph: srcX, srcY, srcWidth, srcHeight, destOffsetX, destOffsetY) so
 * replay can blit each glyph without re-walking the string or re-looking up glyph metrics.
 */
type BitmapTextCommand = {
    kind: 'bitmapText';
    spriteSheet: SpriteSheet;
    glyphData: Int32Array;
    glyphCount: number;
    pos: Vector2i;
    paletteOffset: number;
    cameraX: number;
    cameraY: number;
};

/** Union of all queued draw commands accumulated between `beginFrame` and `endFrame`. */
export type DrawCommand = PrimitiveCommand | SpriteCommand | StretchedSpriteCommand | BitmapTextCommand;

/**
 * Replays {@link DrawCommand}s into one logical-resolution `ImageData`, in queue order, with the
 * palette looked up per pixel. The renderer owns the queue, the canvases, and the clear color.
 */
export class SoftwareRaster {
    /** Active palette; `null` draws nothing. */
    palette: Palette | null = null;

    private readonly clipScratch = new Rect2i();

    /** Reused clip result so lines allocate nothing per call. */
    private readonly clippedLine: ClippedLine = { x: 0, y: 0, err: 0, steps: 0 };

    private imageData: ImageData | null = null;

    private frameWordView: Uint32Array | null = null;

    /**
     * Creates a rasterizer for the logical resolution.
     *
     * @param displaySize - Logical render resolution in pixels.
     */
    constructor(private readonly displaySize: Vector2i) {}

    /**
     * Direct reference to the logical canvas's `ImageData.data`, written into by every raster
     * method. Available once {@link attach} has run.
     *
     * @returns The frame's RGBA pixel buffer.
     * @throws If accessed before a successful {@link init} call.
     */
    private get framePixels(): Uint8ClampedArray {
        if (!this.imageData) {
            throw new Error('SoftwareRaster.framePixels: renderer not initialized.');
        }

        return this.imageData.data;
    }

    /**
     * `Uint32Array` view over the same buffer as {@link framePixels}, for word-at-a-time writes
     * (see {@link fillFrame}). Available once {@link attach} has run.
     *
     * @returns The frame buffer, viewed as one `Uint32Array` word per pixel.
     * @throws If accessed before a successful {@link init} call.
     */
    private get wordView(): Uint32Array {
        if (!this.frameWordView) {
            throw new Error('SoftwareRaster.wordView: renderer not initialized.');
        }

        return this.frameWordView;
    }

    /**
     * Points the rasterizer at the frame buffer it writes into.
     *
     * @param imageData - Logical-resolution frame, written in place.
     */
    attach(imageData: ImageData): void {
        this.imageData = imageData;
        this.frameWordView = new Uint32Array(imageData.data.buffer);
    }

    /**
     * Fills the entire `framePixels` buffer with a solid RGBA color via a single word-at-a-time
     * fill over {@link wordView}. Packing matches {@link Color32.toUint32}'s ABGR layout, which on
     * little-endian platforms lays out as byte0=r, byte1=g, byte2=b, byte3=a - the same RGBA byte
     * order `framePixels` itself uses.
     *
     * @param r - Red channel (0-255).
     * @param g - Green channel (0-255).
     * @param b - Blue channel (0-255).
     * @param a - Alpha channel (0-255).
     */
    fillFrame(r: number, g: number, b: number, a: number): void {
        const packed = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;

        this.wordView.fill(packed);
    }

    /**
     * Dispatches a single draw command to the appropriate rasterizer.
     *
     * @param command - Command to replay into `framePixels`.
     */
    replay(command: DrawCommand): void {
        switch (command.kind) {
            case 'rectFill':
                this.rasterRectFill(
                    command.x0,
                    command.y0,
                    command.width,
                    command.height,
                    command.paletteIndex,
                    command.cameraX,
                    command.cameraY,
                );
                return;

            case 'rect':
                this.rasterRect(
                    command.x0,
                    command.y0,
                    command.width,
                    command.height,
                    command.paletteIndex,
                    command.cameraX,
                    command.cameraY,
                );
                return;

            case 'line':
                this.rasterLine(
                    command.x0,
                    command.y0,
                    command.x1,
                    command.y1,
                    command.paletteIndex,
                    command.cameraX,
                    command.cameraY,
                );
                return;

            case 'sprite':
                this.rasterSprite(command);
                return;

            case 'spriteStretched':
                this.rasterSpriteStretched(command);
                return;

            case 'bitmapText':
                this.rasterBitmapText(command);
                return;
        }
    }

    /**
     * Rasterizes a filled rectangle into `framePixels`, clipped to display bounds.
     *
     * @param x - Left edge in world coordinates.
     * @param y - Top edge in world coordinates.
     * @param width - Rectangle width in pixels.
     * @param height - Rectangle height in pixels.
     * @param paletteIndex - Palette entry index for the fill color.
     * @param cameraX - Horizontal camera offset to subtract.
     * @param cameraY - Vertical camera offset to subtract.
     */
    private rasterRectFill(
        x: number,
        y: number,
        width: number,
        height: number,
        paletteIndex: number,
        cameraX: number,
        cameraY: number,
    ): void {
        const color = this.resolveColor(paletteIndex);

        if (!color || width <= 0 || height <= 0) {
            return;
        }

        const startX = Math.max(0, x - cameraX);
        const startY = Math.max(0, y - cameraY);
        const endX = Math.min(this.displaySize.x, x - cameraX + width);
        const endY = Math.min(this.displaySize.y, y - cameraY + height);
        const pixels = this.framePixels;

        for (let py = startY; py < endY; py++) {
            for (let px = startX; px < endX; px++) {
                this.writePixelUnchecked(pixels, px, py, color.r, color.g, color.b, color.a);
            }
        }
    }

    /**
     * Rasterizes a four-sided outline rectangle by drawing four lines.
     *
     * @param x - Left edge in world coordinates.
     * @param y - Top edge in world coordinates.
     * @param width - Rectangle width in pixels.
     * @param height - Rectangle height in pixels.
     * @param paletteIndex - Palette entry index for the border color.
     * @param cameraX - Horizontal camera offset to subtract.
     * @param cameraY - Vertical camera offset to subtract.
     */
    private rasterRect(
        x: number,
        y: number,
        width: number,
        height: number,
        paletteIndex: number,
        cameraX: number,
        cameraY: number,
    ): void {
        if (width <= 0 || height <= 0) {
            return;
        }

        const x1 = x + width - 1;
        const y1 = y + height - 1;

        this.rasterLine(x, y, x1, y, paletteIndex, cameraX, cameraY);
        this.rasterLine(x, y1, x1, y1, paletteIndex, cameraX, cameraY);

        // Top and bottom rows already cover a 1- or 2-pixel-tall rect; a side line from y + 1 to y1 - 1 would run
        // backwards past it. Same rule as PrimitivePipeline.drawRect.
        if (height <= 2) {
            return;
        }

        this.rasterLine(x, y + 1, x, y1 - 1, paletteIndex, cameraX, cameraY);
        this.rasterLine(x1, y + 1, x1, y1 - 1, paletteIndex, cameraX, cameraY);
    }

    /**
     * Rasterizes a line using Bresenham's algorithm.
     *
     * @param x0 - Start X in world coordinates.
     * @param y0 - Start Y in world coordinates.
     * @param x1 - End X in world coordinates.
     * @param y1 - End Y in world coordinates.
     * @param paletteIndex - Palette entry index for the line color.
     * @param cameraX - Horizontal camera offset to subtract.
     * @param cameraY - Vertical camera offset to subtract.
     */
    private rasterLine(
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        paletteIndex: number,
        cameraX: number,
        cameraY: number,
    ): void {
        const color = this.resolveColor(paletteIndex);
        if (!color) {
            return;
        }

        const sx0 = x0 - cameraX;
        const sy0 = y0 - cameraY;
        const tx = x1 - cameraX;
        const ty = y1 - cameraY;
        const clip = this.clippedLine;

        // Start at the first on-screen pixel so a huge or off-screen line costs only its visible length.
        if (!clipBresenhamLine(sx0, sy0, tx, ty, 0, 0, this.displaySize.x - 1, this.displaySize.y - 1, clip)) {
            return;
        }

        const dx = Math.abs(tx - sx0);
        const dy = Math.abs(ty - sy0);
        const sx = sx0 < tx ? 1 : -1;
        const sy = sy0 < ty ? 1 : -1;
        let err = clip.err;
        let cx = clip.x;
        let cy = clip.y;
        const pixels = this.framePixels;

        for (let i = 0; i < clip.steps; i++) {
            this.writePixel(pixels, cx, cy, color.r, color.g, color.b, color.a);

            const e2 = err * 2;

            if (e2 > -dy) {
                err -= dy;
                cx += sx;
            }

            if (e2 < dx) {
                err += dx;
                cy += sy;
            }
        }
    }

    /**
     * Rasterizes a sprite by iterating its source rect and writing palette-resolved pixels.
     * Index 0 is treated as transparent and skipped.
     *
     * @param command - Sprite draw command with sheet, source rect, destination, and camera state.
     */
    private rasterSprite(command: SpriteCommand): void {
        const indexedPixels = command.spriteSheet.getIndexedPixelsRef();

        if (command.orientation !== 0) {
            this.blitIndexedRectOriented(indexedPixels, command);
            return;
        }

        this.blitIndexedRect(
            indexedPixels,
            command.spriteSheet.width,
            command.spriteSheet.height,
            command.srcRect.x,
            command.srcRect.y,
            command.srcRect.width,
            command.srcRect.height,
            command.destPos.x - command.cameraX,
            command.destPos.y - command.cameraY,
            command.paletteOffset,
        );
    }

    /**
     * Rasterizes a bitmap text command by blitting each precomputed glyph rect. Glyph shapes
     * were resolved once at queue time (see {@link drawBitmapText}), so this loop does not
     * look up glyph metrics or allocate per glyph.
     *
     * @param command - Bitmap text command with sheet, precomputed glyph data, position, and camera state.
     */
    private rasterBitmapText(command: BitmapTextCommand): void {
        const indexedPixels = command.spriteSheet.getIndexedPixelsRef();
        const sheetWidth = command.spriteSheet.width;
        const sheetHeight = command.spriteSheet.height;

        for (let i = 0; i < command.glyphCount; i++) {
            const base = i * 6;

            this.blitIndexedRect(
                indexedPixels,
                sheetWidth,
                sheetHeight,
                // eslint-disable-next-line security/detect-object-injection
                command.glyphData[base] ?? 0,
                command.glyphData[base + 1] ?? 0,
                command.glyphData[base + 2] ?? 0,
                command.glyphData[base + 3] ?? 0,
                command.pos.x + (command.glyphData[base + 4] ?? 0) - command.cameraX,
                command.pos.y + (command.glyphData[base + 5] ?? 0) - command.cameraY,
                command.paletteOffset,
            );
        }
    }

    /**
     * Blits an indexed-pixel source rectangle to a destination position, resolving each
     * non-transparent pixel through the active palette. Shared by {@link rasterSprite} and
     * {@link rasterBitmapText} so neither call site allocates a command object per blit.
     *
     * @param indexedPixels - Source sheet's indexed-pixel buffer (row-major, one byte per pixel).
     * @param sheetWidth - Source sheet width in pixels.
     * @param sheetHeight - Source sheet height in pixels.
     * @param srcX - Source rect X in sheet coordinates.
     * @param srcY - Source rect Y in sheet coordinates.
     * @param srcWidth - Source rect width.
     * @param srcHeight - Source rect height.
     * @param destX - Destination X in logical coordinates (camera already applied).
     * @param destY - Destination Y in logical coordinates (camera already applied).
     * @param paletteOffset - Palette index offset applied to every non-transparent pixel.
     */
    private blitIndexedRect(
        indexedPixels: Uint8Array,
        sheetWidth: number,
        sheetHeight: number,
        srcX: number,
        srcY: number,
        srcWidth: number,
        srcHeight: number,
        destX: number,
        destY: number,
        paletteOffset: number,
    ): void {
        const clipped = this.clipScratch;

        if (!clipSpriteSourceRectXYTo(srcX, srcY, srcWidth, srcHeight, sheetWidth, sheetHeight, clipped)) {
            return;
        }

        const destOffsetX = clipped.x - srcX;
        const destOffsetY = clipped.y - srcY;
        const pixels = this.framePixels;

        for (let y = 0; y < clipped.height; y++) {
            for (let x = 0; x < clipped.width; x++) {
                const rawIndex = indexedPixels[(clipped.y + y) * sheetWidth + (clipped.x + x)] ?? 0;

                const color = this.resolveTexel(rawIndex, paletteOffset);

                if (!color) {
                    continue;
                }

                this.writePixel(
                    pixels,
                    destX + destOffsetX + x,
                    destY + destOffsetY + y,
                    color.r,
                    color.g,
                    color.b,
                    color.a,
                );
            }
        }
    }

    /**
     * Blits a sprite command's source rect through its orientation's point map. Same clipping,
     * transparency, and palette rules as {@link blitIndexedRect}; each source texel `(i, j)` lands on
     * the footprint texel given by the point map with `sw - 1` / `sh - 1` (texel centers).
     *
     * @param indexedPixels - Source sheet's indexed-pixel buffer.
     * @param command - Sprite command with a non-zero orientation.
     */
    private blitIndexedRectOriented(indexedPixels: Uint8Array, command: SpriteCommand): void {
        const { srcRect, spriteSheet } = command;
        const clipped = this.clipScratch;

        if (
            !clipSpriteSourceRectXYTo(
                srcRect.x,
                srcRect.y,
                srcRect.width,
                srcRect.height,
                spriteSheet.width,
                spriteSheet.height,
                clipped,
            )
        ) {
            return;
        }

        const row = SPRITE_ORIENTATIONS[command.orientation] as SpriteOrientation;
        // Full source size, not the clipped one, so clipped texels keep the placement the GPU quad gives them.
        const maxX = (row.swap ? srcRect.height : srcRect.width) - 1;
        const maxY = (row.swap ? srcRect.width : srcRect.height) - 1;
        const destX = command.destPos.x - command.cameraX;
        const destY = command.destPos.y - command.cameraY;
        const sheetWidth = spriteSheet.width;
        const pixels = this.framePixels;

        for (let y = clipped.y; y < clipped.y + clipped.height; y++) {
            const j = y - srcRect.y;

            for (let x = clipped.x; x < clipped.x + clipped.width; x++) {
                const rawIndex = indexedPixels[y * sheetWidth + x] ?? 0;

                const color = this.resolveTexel(rawIndex, command.paletteOffset);

                if (!color) {
                    continue;
                }

                const i = x - srcRect.x;
                const u = row.swap ? j : i;
                const v = row.swap ? i : j;

                this.writePixel(
                    pixels,
                    destX + (row.flipX ? maxX - u : u),
                    destY + (row.flipY ? maxY - v : v),
                    color.r,
                    color.g,
                    color.b,
                    color.a,
                );
            }
        }
    }

    /**
     * Rasterizes a stretched sprite: every destination pixel inside the screen picks its footprint texel
     * with `stretchSampleIndex`, inverts the orientation (texel centers, so `fw - 1` / `fh - 1`), and
     * reads that source texel. Same transparency and palette rules as {@link blitIndexedRect}; texels
     * outside the sheet are skipped so clipped sources keep their placement.
     *
     * @param command - Stretched sprite command.
     */
    private rasterSpriteStretched(command: StretchedSpriteCommand): void {
        const { spriteSheet } = command;
        const indexedPixels = spriteSheet.getIndexedPixelsRef();
        const sheetW = spriteSheet.width;
        const sheetH = spriteSheet.height;
        const row = SPRITE_ORIENTATIONS[command.orientation] as SpriteOrientation;
        const fw = row.swap ? command.srcH : command.srcW;
        const fh = row.swap ? command.srcW : command.srcH;
        const left = command.destX - command.cameraX;
        const top = command.destY - command.cameraY;
        const x0 = Math.max(0, left);
        const y0 = Math.max(0, top);
        const x1 = Math.min(this.displaySize.x, left + command.destW);
        const y1 = Math.min(this.displaySize.y, top + command.destH);
        const pixels = this.framePixels;

        for (let y = y0; y < y1; y++) {
            const fy = stretchSampleIndex(y - top, fh, command.destH);
            const v = row.flipY ? fh - 1 - fy : fy;

            for (let x = x0; x < x1; x++) {
                const fx = stretchSampleIndex(x - left, fw, command.destW);
                const u = row.flipX ? fw - 1 - fx : fx;
                const sx = command.srcX + (row.swap ? v : u);
                const sy = command.srcY + (row.swap ? u : v);

                if (sx < 0 || sy < 0 || sx >= sheetW || sy >= sheetH) {
                    continue;
                }

                const rawIndex = indexedPixels[sy * sheetW + sx] ?? 0;

                const color = this.resolveTexel(rawIndex, command.paletteOffset);

                if (!color) {
                    continue;
                }

                this.writePixelUnchecked(pixels, x, y, color.r, color.g, color.b, color.a);
            }
        }
    }

    /**
     * Writes one RGBA pixel into `pixels`, bounds-checked against the display size.
     *
     * `pixels` is taken as a parameter (the caller's own {@link framePixels} read, done once per
     * raster call) rather than read from `this` here, since this runs once per pixel and
     * `framePixels` is a checked accessor - re-reading it per pixel would re-run that check on
     * every call.
     *
     * @param pixels - Destination buffer, from {@link framePixels}.
     * @param x - Pixel X in logical coordinates.
     * @param y - Pixel Y in logical coordinates.
     * @param r - Red channel (0-255).
     * @param g - Green channel (0-255).
     * @param b - Blue channel (0-255).
     * @param a - Alpha channel (0-255).
     */
    private writePixel(
        pixels: Uint8ClampedArray,
        x: number,
        y: number,
        r: number,
        g: number,
        b: number,
        a: number,
    ): void {
        if (x < 0 || y < 0 || x >= this.displaySize.x || y >= this.displaySize.y) {
            return;
        }

        const index = (y * this.displaySize.x + x) * 4;

        // eslint-disable-next-line security/detect-object-injection
        pixels[index] = r;
        pixels[index + 1] = g;
        pixels[index + 2] = b;
        pixels[index + 3] = a;
    }

    /**
     * Writes one RGBA pixel into `pixels` without a bounds check. Callers must guarantee
     * `(x, y)` already lies within `[0, displaySize)` - used by loops that pre-clamp their
     * range, such as {@link rasterRectFill}. See {@link writePixel} for why `pixels` is a
     * parameter rather than a `this.framePixels` read.
     *
     * @param pixels - Destination buffer, from {@link framePixels}.
     * @param x - Pixel X in logical coordinates, already known in-bounds.
     * @param y - Pixel Y in logical coordinates, already known in-bounds.
     * @param r - Red channel (0-255).
     * @param g - Green channel (0-255).
     * @param b - Blue channel (0-255).
     * @param a - Alpha channel (0-255).
     */
    private writePixelUnchecked(
        pixels: Uint8ClampedArray,
        x: number,
        y: number,
        r: number,
        g: number,
        b: number,
        a: number,
    ): void {
        const index = (y * this.displaySize.x + x) * 4;

        // eslint-disable-next-line security/detect-object-injection
        pixels[index] = r;
        pixels[index + 1] = g;
        pixels[index + 2] = b;
        pixels[index + 3] = a;
    }

    /**
     * Resolves a palette index to a `Color32` for primitive, sprite, and text drawing.
     * Returns `null` for out-of-range indices and fully transparent colors, the same
     * texels the WebGPU sprite shader discards.
     *
     * @param paletteIndex - Palette entry index to look up.
     * @returns Resolved color, or `null` when the pixel should not be drawn.
     */
    private resolveColor(paletteIndex: number): Color32 | null {
        if (!this.palette || paletteIndex >= this.palette.size) {
            return null;
        }

        const color = this.palette.getRef(paletteIndex);

        return color.a === 0 ? null : color;
    }

    /**
     * Resolves a sprite or glyph texel: index `0` is always transparent, otherwise the
     * offset index goes through {@link resolveColor}.
     *
     * @param rawIndex - Stored texel index from the sheet.
     * @param paletteOffset - Per-draw palette offset.
     * @returns Resolved color, or `null` when the pixel should not be drawn.
     */
    private resolveTexel(rawIndex: number, paletteOffset: number): Color32 | null {
        return rawIndex === TRANSPARENT_PALETTE_INDEX ? null : this.resolveColor((rawIndex + paletteOffset) >>> 0);
    }
}
