import type { BitmapFont } from '../assets/BitmapFont';
import type { Palette } from '../assets/Palette';
import { TRANSPARENT_PALETTE_INDEX } from '../assets/Palette';
import type { SpriteSheet } from '../assets/SpriteSheet';
import type { OverlayDrawTarget, OverlayRendererDiagnostics } from '../overlay';
import { clipSpriteSourceRect } from '../utils/AssetLimits';
import { Color32 } from '../utils/Color32';
import { noActivePaletteError } from '../utils/errorMessages';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import type { Effect } from './effects/Effect';
import type { IRenderer } from './IRenderer';

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
type DrawCommand = PrimitiveCommand | SpriteCommand | BitmapTextCommand;

/** Pending `captureFrame` promise callbacks, held until the next `endFrame`. */
type Pending = {
    resolve: (blob: Blob) => void;
    reject: (reason?: unknown) => void;
};

/** Alias for either the offscreen or on-screen 2D rendering context variant. */
type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/**
 * Canvas-2D software fallback renderer implementing {@link IRenderer}.
 *
 * This backend rasterizes draw commands into a logical-resolution RGBA buffer
 * every frame (CPU-side palette lookup), then presents that buffer to the
 * target canvas with optional nearest-neighbor upscaling. Unlike the WebGPU
 * path, it does not use an `r8uint` index framebuffer.
 */
export class SoftwareRenderer implements IRenderer, OverlayDrawTarget {
    /**
     * Shared error text for {@link addEffect}, {@link removeEffect}, and
     * {@link clearEffects}. Kept public so unit tests can assert against the
     * single source of truth.
     */
    static readonly EFFECTS_UNSUPPORTED_MESSAGE =
        "The software renderer doesn't support fullscreen effects. To use post-process effects, set backend to 'webgpu' in configure().";

    /** Vertices emitted for one filled rect or sprite quad (matches WebGPU batching). */
    private static readonly QUAD_VERTEX_COUNT = 6;

    private readonly canvas: HTMLCanvasElement;
    private readonly displaySize: Vector2i;
    private readonly outputSize: Vector2i;

    private outputCtx: Canvas2D | null = null;
    private logicalCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
    private logicalCtx: Canvas2D | null = null;

    private palette: Palette | null = null;
    private clearPaletteIndex: number = 0;
    private cameraOffset: Vector2i = Vector2i.zero();
    private readonly commands: DrawCommand[] = [];
    private frameWordView: Uint32Array | null = null;
    private imageData: ImageData | null = null;
    private pending: Pending | null = null;
    private primitiveSubmittedVertices = 0;
    private spriteSubmittedVertices = 0;

    /**
     * Creates a software renderer bound to the given canvas.
     *
     * @param canvas – Target HTML canvas element to draw into.
     * @param displaySize – Logical render resolution in pixels.
     * @param outputSize – Output resolution in pixels. Defaults to `displaySize` (no upscaling).
     */
    constructor(canvas: HTMLCanvasElement, displaySize: Vector2i, outputSize?: Vector2i) {
        this.canvas = canvas;
        this.displaySize = displaySize.clone();
        this.outputSize = (outputSize ?? displaySize).clone();
    }

    /**
     * Direct reference to the logical canvas's `ImageData.data`, written into by every raster
     * method. Available once {@link init} has created `imageData`.
     *
     * @returns The frame's RGBA pixel buffer.
     * @throws If accessed before a successful {@link init} call.
     */
    private get framePixels(): Uint8ClampedArray {
        if (!this.imageData) {
            throw new Error('SoftwareRenderer.framePixels: renderer not initialized.');
        }

        return this.imageData.data;
    }

    /**
     * `Uint32Array` view over the same buffer as {@link framePixels}, for word-at-a-time writes
     * (see {@link fillFrame}). Available once {@link init} has created `imageData`.
     *
     * @returns The frame buffer, viewed as one `Uint32Array` word per pixel.
     * @throws If accessed before a successful {@link init} call.
     */
    private get wordView(): Uint32Array {
        if (!this.frameWordView) {
            throw new Error('SoftwareRenderer.wordView: renderer not initialized.');
        }

        return this.frameWordView;
    }

    /**
     * Estimates primitive vertices for a line using the same rules as {@link PrimitivePipeline.drawLine}.
     *
     * @param x0 – Start X.
     * @param y0 – Start Y.
     * @param x1 – End X.
     * @param y1 – End Y.
     * @returns Vertex count for the line draw.
     */
    private static estimateLineVertexCount(x0: number, y0: number, x1: number, y1: number): number {
        const ix0 = x0 | 0;
        const iy0 = y0 | 0;
        const ix1 = x1 | 0;
        const iy1 = y1 | 0;

        if (iy0 === iy1 || ix0 === ix1) {
            return SoftwareRenderer.QUAD_VERTEX_COUNT;
        }

        return SoftwareRenderer.countBresenhamSteps(ix0, iy0, ix1, iy1) * SoftwareRenderer.QUAD_VERTEX_COUNT;
    }

    /**
     * Estimates primitive vertices for a rectangle outline using {@link PrimitivePipeline.drawRect} rules.
     *
     * @param rect – Outline bounds.
     * @returns Vertex count for the outline draw.
     */
    private static estimateRectOutlineVertexCount(rect: Rect2i): number {
        const y0 = rect.y;
        const y1 = rect.y + rect.height - 1;
        let vertices = SoftwareRenderer.QUAD_VERTEX_COUNT * 2;

        if (y1 - y0 > 1) {
            vertices += SoftwareRenderer.QUAD_VERTEX_COUNT * 2;
        }

        return vertices;
    }

    /**
     * Counts Bresenham steps between two integer endpoints (inclusive).
     *
     * @param x0 – Start X.
     * @param y0 – Start Y.
     * @param x1 – End X.
     * @param y1 – End Y.
     * @returns Number of pixels visited.
     */
    private static countBresenhamSteps(x0: number, y0: number, x1: number, y1: number): number {
        let cx = x0;
        let cy = y0;
        const tx = x1;
        const ty = y1;
        const dx = Math.abs(tx - cx);
        const dy = Math.abs(ty - cy);
        const sx = cx < tx ? 1 : -1;
        const sy = cy < ty ? 1 : -1;
        let err = dx - dy;
        let steps = 1;

        while (cx !== tx || cy !== ty) {
            const e2 = err * 2;

            if (e2 > -dy) {
                err -= dy;
                cx += sx;
            }

            if (e2 < dx) {
                err += dx;
                cy += sy;
            }

            steps++;
        }

        return steps;
    }

    /**
     * Initializes the 2D canvas contexts and backing image buffer.
     *
     * @returns `true` when contexts are ready; otherwise `false`.
     */
    async init(): Promise<boolean> {
        this.canvas.width = this.outputSize.x;
        this.canvas.height = this.outputSize.y;

        this.outputCtx = this.canvas.getContext('2d') as Canvas2D | null;

        if (!this.outputCtx) {
            return false;
        }

        this.outputCtx.imageSmoothingEnabled = false;

        this.logicalCanvas = this.createLogicalCanvas();
        this.logicalCtx = this.logicalCanvas.getContext('2d') as Canvas2D | null;

        if (!this.logicalCtx) {
            return false;
        }

        this.logicalCtx.imageSmoothingEnabled = false;

        if ('createImageData' in this.logicalCtx) {
            this.imageData = this.logicalCtx.createImageData(this.displaySize.x, this.displaySize.y);
        } else {
            this.imageData = new ImageData(this.displaySize.x, this.displaySize.y);
        }

        this.frameWordView = new Uint32Array(this.imageData.data.buffer);

        return true;
    }

    /**
     * Sets the active palette used for all color lookups during rendering.
     *
     * @param palette – Palette to activate.
     */
    setPalette(palette: Palette): void {
        this.palette = palette;

        if (this.clearPaletteIndex >= this.palette.size) {
            this.clearPaletteIndex = 0;
        }
    }

    /**
     * Returns a clone of the active palette, or `null` when no palette is set.
     *
     * @returns Cloned active palette or `null`.
     */
    getPalette(): Palette | null {
        return this.palette?.clone() ?? null;
    }

    /**
     * Marks the start of a new frame and clears the draw-command queue.
     *
     * @throws When no palette has been set yet.
     */
    beginFrame(): void {
        if (!this.palette) {
            throw new Error(noActivePaletteError());
        }

        this.commands.length = 0;
        this.primitiveSubmittedVertices = 0;
        this.spriteSubmittedVertices = 0;
    }

    /**
     * Sets the palette index used to fill the background on each frame.
     *
     * @param paletteIndex – Palette entry index for the clear color.
     */
    setClearColor(paletteIndex: number): void {
        this.clearPaletteIndex = paletteIndex;
    }

    /**
     * Replays all queued draw commands into the pixel buffer and presents the frame.
     * Also resolves any pending `captureFrame` promise.
     */
    endFrame(): void {
        if (!this.imageData) {
            this.commands.length = 0;

            return;
        }

        const clearColor = this.resolveClearColor();

        this.fillFrame(clearColor.r, clearColor.g, clearColor.b, clearColor.a);

        for (const command of this.commands) {
            this.replayCommand(command);
        }

        this.presentFrame();
        this.resolvePending();
        this.commands.length = 0;
    }

    /**
     * Returns GPU-equivalent vertex counts for queued primitive and sprite work this frame.
     *
     * Counts mirror {@link PrimitivePipeline} / {@link SpritePipeline} batch semantics so
     * overlay diagnostics stay comparable across backends.
     *
     * @returns Diagnostic counters for the current frame.
     */
    getFrameDiagnostics(): OverlayRendererDiagnostics {
        return {
            primitiveOverflowCount: 0,
            spriteOverflowCount: 0,
            primitiveSubmittedVertices: this.primitiveSubmittedVertices,
            spriteSubmittedVertices: this.spriteSubmittedVertices,
        };
    }

    /**
     * Queues a filled rectangle draw command.
     *
     * @param rect – Rectangle to fill in logical pixels.
     * @param paletteIndex – Palette entry index for the fill color.
     */
    drawRectFill(rect: Rect2i, paletteIndex: number): void {
        this.queueRectFillXY(rect.x, rect.y, rect.width, rect.height, paletteIndex);
    }

    /**
     * Queues an overlay bar fill (same FIFO queue as {@link drawRectFill}).
     *
     * @param rect – Rectangle to fill in logical pixels.
     * @param paletteIndex – Palette entry index for the fill color.
     */
    drawBarFill(rect: Rect2i, paletteIndex: number): void {
        this.drawRectFill(rect, paletteIndex);
    }

    /**
     * Queues an overlay bar fill (same FIFO draw queue as {@link drawBarFill}).
     * The software backend does not layer overlay draws above demo content;
     * `OnTop` variants are equivalent to their base methods.
     *
     * @param rect – Rectangle to fill in logical pixels.
     * @param paletteIndex – Palette entry index for the fill color.
     */
    drawBarFillOnTop(rect: Rect2i, paletteIndex: number): void {
        this.drawBarFill(rect, paletteIndex);
    }

    /**
     * Queues a single pixel draw command at the given position.
     *
     * @param pos – Pixel position in logical coordinates.
     * @param paletteIndex – Palette entry index for the pixel color.
     */
    drawPixel(pos: Vector2i, paletteIndex: number): void {
        this.queueRectFillXY(pos.x, pos.y, 1, 1, paletteIndex);
    }

    /**
     * Queues a Bresenham line draw command between two points.
     *
     * @param p0 – Line start position in logical coordinates.
     * @param p1 – Line end position in logical coordinates.
     * @param paletteIndex – Palette entry index for the line color.
     */
    drawLine(p0: Vector2i, p1: Vector2i, paletteIndex: number): void {
        this.commands.push({
            kind: 'line',
            x0: p0.x,
            y0: p0.y,
            x1: p1.x,
            y1: p1.y,
            paletteIndex,
            cameraX: this.cameraOffset.x,
            cameraY: this.cameraOffset.y,
        });
        this.primitiveSubmittedVertices += SoftwareRenderer.estimateLineVertexCount(p0.x, p0.y, p1.x, p1.y);
    }

    /**
     * Queues an outline rectangle draw command (four lines, no fill).
     *
     * @param rect – Rectangle to outline in logical pixels.
     * @param paletteIndex – Palette entry index for the border color.
     */
    drawRect(rect: Rect2i, paletteIndex: number): void {
        this.commands.push({
            kind: 'rect',
            x0: rect.x,
            y0: rect.y,
            width: rect.width,
            height: rect.height,
            paletteIndex,
            cameraX: this.cameraOffset.x,
            cameraY: this.cameraOffset.y,
        });
        this.primitiveSubmittedVertices += SoftwareRenderer.estimateRectOutlineVertexCount(rect);
    }

    /**
     * Fills the given rectangle with a palette color (alias for `drawRectFill`).
     *
     * @param rect – Rectangle to clear in logical pixels.
     * @param paletteIndex – Palette entry index for the fill color.
     */
    clearRect(rect: Rect2i, paletteIndex: number): void {
        this.drawRectFill(rect, paletteIndex);
    }

    /**
     * Queues a sprite blit from a source sheet rectangle to a destination position.
     *
     * @param spriteSheet – Source sprite sheet containing the indexed pixels.
     * @param srcRect – Source region within the sprite sheet in pixels.
     * @param destPos – Destination position in logical coordinates.
     * @param paletteOffset – Palette index offset applied to every non-transparent pixel.
     */
    drawSprite(spriteSheet: SpriteSheet, srcRect: Rect2i, destPos: Vector2i, paletteOffset: number = 0): void {
        this.commands.push({
            kind: 'sprite',
            spriteSheet,
            srcRect: srcRect.clone(),
            destPos: destPos.clone(),
            paletteOffset,
            cameraX: this.cameraOffset.x,
            cameraY: this.cameraOffset.y,
        });
        this.spriteSubmittedVertices += SoftwareRenderer.QUAD_VERTEX_COUNT;
    }

    /**
     * Queues a bitmap text draw command, expanding each character to a sprite blit on replay.
     *
     * @param font – Bitmap font containing glyph sheet and metrics.
     * @param pos – Top-left position of the text in logical coordinates.
     * @param text – String to render.
     * @param paletteOffset – Palette index offset applied to every glyph pixel.
     */
    drawBitmapText(font: BitmapFont, pos: Vector2i, text: string, paletteOffset: number = 0): void {
        const glyphData = new Int32Array(text.length * 6);
        let glyphCount = 0;
        let cursorX = 0;

        for (const char of text) {
            const glyph = font.getGlyph(char);

            if (glyph) {
                const base = glyphCount * 6;

                // eslint-disable-next-line security/detect-object-injection
                glyphData[base] = glyph.rect.x;
                glyphData[base + 1] = glyph.rect.y;
                glyphData[base + 2] = glyph.rect.width;
                glyphData[base + 3] = glyph.rect.height;
                glyphData[base + 4] = cursorX + glyph.offsetX;
                glyphData[base + 5] = glyph.offsetY;
                glyphCount++;
                cursorX += glyph.advance;
            }
        }

        this.commands.push({
            kind: 'bitmapText',
            spriteSheet: font.getSpriteSheet(),
            glyphData,
            glyphCount,
            pos: pos.clone(),
            paletteOffset,
            cameraX: this.cameraOffset.x,
            cameraY: this.cameraOffset.y,
        });
        this.spriteSubmittedVertices += glyphCount * SoftwareRenderer.QUAD_VERTEX_COUNT;
    }

    /**
     * Queues an overlay label (same FIFO queue as {@link drawBitmapText}).
     *
     * @param font – Bitmap font with character glyphs.
     * @param pos – Text origin in logical pixels.
     * @param text – String to render.
     * @param paletteOffset – Palette index offset applied to all glyphs (default 0).
     */
    drawLabel(font: BitmapFont, pos: Vector2i, text: string, paletteOffset: number = 0): void {
        this.drawBitmapText(font, pos, text, paletteOffset);
    }

    /**
     * Queues an overlay label (same FIFO draw queue as {@link drawLabel}).
     * The software backend does not layer overlay draws above demo content;
     * `OnTop` variants are equivalent to their base methods.
     *
     * @param font – Bitmap font with character glyphs.
     * @param pos – Text origin in logical pixels.
     * @param text – String to render.
     * @param paletteOffset – Palette index offset applied to all glyphs (default 0).
     */
    drawLabelOnTop(font: BitmapFont, pos: Vector2i, text: string, paletteOffset: number = 0): void {
        this.drawLabel(font, pos, text, paletteOffset);
    }

    /**
     * Returns a promise that resolves with a PNG Blob on the next `endFrame` call.
     * Any previously pending capture is rejected before the new one is registered.
     *
     * @returns Promise that resolves with the captured frame as a PNG `Blob`.
     */
    captureFrame(): Promise<Blob> {
        if (this.pending) {
            this.pending.reject(
                new Error(
                    'A capture is already in progress. Wait for the first captureFrame() to finish before requesting another.',
                ),
            );
        }

        return new Promise<Blob>((resolve, reject) => {
            this.pending = { resolve, reject };
        });
    }

    /**
     * Sets the camera scroll offset applied to all subsequent draw commands.
     *
     * @param offset – New camera offset in logical pixels.
     */
    setCameraOffset(offset: Vector2i): void {
        this.cameraOffset = offset.clone();
    }

    /**
     * Returns the current camera scroll offset.
     *
     * @returns Cloned camera offset vector.
     */
    getCameraOffset(): Vector2i {
        return this.cameraOffset.clone();
    }

    /** Resets the camera offset to zero (no scrolling). */
    resetCamera(): void {
        this.cameraOffset = Vector2i.zero();
    }

    /**
     * Not supported – always throws.
     *
     * @param _effect – Ignored.
     */
    addEffect(_effect: Effect): void {
        throw new Error(SoftwareRenderer.EFFECTS_UNSUPPORTED_MESSAGE);
    }

    /**
     * Not supported – always throws.
     *
     * @param _effect – Ignored.
     */
    removeEffect(_effect: Effect): void {
        throw new Error(SoftwareRenderer.EFFECTS_UNSUPPORTED_MESSAGE);
    }

    /** Not supported – always throws. */
    clearEffects(): void {
        throw new Error(SoftwareRenderer.EFFECTS_UNSUPPORTED_MESSAGE);
    }

    /**
     * Queues a filled rectangle draw command from scalar bounds. Shared by {@link drawRectFill}
     * and {@link drawPixel} so neither has to allocate a `Rect2i` just to shuttle four numbers
     * into the command queue.
     *
     * @param x – Left edge in logical pixels.
     * @param y – Top edge in logical pixels.
     * @param width – Rectangle width in pixels.
     * @param height – Rectangle height in pixels.
     * @param paletteIndex – Palette entry index for the fill color.
     */
    private queueRectFillXY(x: number, y: number, width: number, height: number, paletteIndex: number): void {
        this.commands.push({
            kind: 'rectFill',
            x0: x,
            y0: y,
            width,
            height,
            paletteIndex,
            cameraX: this.cameraOffset.x,
            cameraY: this.cameraOffset.y,
        });
        this.primitiveSubmittedVertices += SoftwareRenderer.QUAD_VERTEX_COUNT;
    }

    /**
     * Creates an `OffscreenCanvas` when available, falling back to an off-DOM `<canvas>`.
     *
     * @returns A canvas sized to the logical display resolution.
     */
    private createLogicalCanvas(): OffscreenCanvas | HTMLCanvasElement {
        if (typeof OffscreenCanvas !== 'undefined') {
            return new OffscreenCanvas(this.displaySize.x, this.displaySize.y);
        }

        const canvas = document.createElement('canvas');

        canvas.width = this.displaySize.x;
        canvas.height = this.displaySize.y;

        return canvas;
    }

    /**
     * Fills the entire `framePixels` buffer with a solid RGBA color via a single word-at-a-time
     * fill over {@link wordView}. Packing matches {@link Color32.toUint32}'s ABGR layout, which on
     * little-endian platforms lays out as byte0=r, byte1=g, byte2=b, byte3=a – the same RGBA byte
     * order `framePixels` itself uses.
     *
     * @param r – Red channel (0-255).
     * @param g – Green channel (0-255).
     * @param b – Blue channel (0-255).
     * @param a – Alpha channel (0-255).
     */
    private fillFrame(r: number, g: number, b: number, a: number): void {
        const packed = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;

        this.wordView.fill(packed);
    }

    /**
     * Dispatches a single draw command to the appropriate rasterizer.
     *
     * @param command – Command to replay into `framePixels`.
     */
    private replayCommand(command: DrawCommand): void {
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

            case 'bitmapText':
                this.rasterBitmapText(command);
                return;
        }
    }

    /**
     * Rasterizes a filled rectangle into `framePixels`, clipped to display bounds.
     *
     * @param x – Left edge in world coordinates.
     * @param y – Top edge in world coordinates.
     * @param width – Rectangle width in pixels.
     * @param height – Rectangle height in pixels.
     * @param paletteIndex – Palette entry index for the fill color.
     * @param cameraX – Horizontal camera offset to subtract.
     * @param cameraY – Vertical camera offset to subtract.
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
        const color = this.resolvePrimitiveColor(paletteIndex);

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
                this.writePixelUnchecked(pixels, px, py, color.r, color.g, color.b, 255);
            }
        }
    }

    /**
     * Rasterizes a four-sided outline rectangle by drawing four lines.
     *
     * @param x – Left edge in world coordinates.
     * @param y – Top edge in world coordinates.
     * @param width – Rectangle width in pixels.
     * @param height – Rectangle height in pixels.
     * @param paletteIndex – Palette entry index for the border color.
     * @param cameraX – Horizontal camera offset to subtract.
     * @param cameraY – Vertical camera offset to subtract.
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
        this.rasterLine(x, y + 1, x, y1 - 1, paletteIndex, cameraX, cameraY);
        this.rasterLine(x1, y + 1, x1, y1 - 1, paletteIndex, cameraX, cameraY);
    }

    /**
     * Rasterizes a line using Bresenham's algorithm.
     *
     * @param x0 – Start X in world coordinates.
     * @param y0 – Start Y in world coordinates.
     * @param x1 – End X in world coordinates.
     * @param y1 – End Y in world coordinates.
     * @param paletteIndex – Palette entry index for the line color.
     * @param cameraX – Horizontal camera offset to subtract.
     * @param cameraY – Vertical camera offset to subtract.
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
        const color = this.resolvePrimitiveColor(paletteIndex);
        if (!color) {
            return;
        }

        let cx = x0 - cameraX;
        let cy = y0 - cameraY;
        const tx = x1 - cameraX;
        const ty = y1 - cameraY;
        const dx = Math.abs(tx - cx);
        const dy = Math.abs(ty - cy);
        const sx = cx < tx ? 1 : -1;
        const sy = cy < ty ? 1 : -1;
        let err = dx - dy;
        const pixels = this.framePixels;

        while (true) {
            this.writePixel(pixels, cx, cy, color.r, color.g, color.b, 255);

            if (cx === tx && cy === ty) {
                break;
            }

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
     * @param command – Sprite draw command with sheet, source rect, destination, and camera state.
     */
    private rasterSprite(command: SpriteCommand): void {
        const indexedPixels = command.spriteSheet.getIndexedPixelsRef();

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
     * @param command – Bitmap text command with sheet, precomputed glyph data, position, and camera state.
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
     * @param indexedPixels – Source sheet's indexed-pixel buffer (row-major, one byte per pixel).
     * @param sheetWidth – Source sheet width in pixels.
     * @param sheetHeight – Source sheet height in pixels.
     * @param srcX – Source rect X in sheet coordinates.
     * @param srcY – Source rect Y in sheet coordinates.
     * @param srcWidth – Source rect width.
     * @param srcHeight – Source rect height.
     * @param destX – Destination X in logical coordinates (camera already applied).
     * @param destY – Destination Y in logical coordinates (camera already applied).
     * @param paletteOffset – Palette index offset applied to every non-transparent pixel.
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
        const clipped = clipSpriteSourceRect(
            Rect2i.fromValuesUnchecked(srcX, srcY, srcWidth, srcHeight),
            sheetWidth,
            sheetHeight,
        );

        if (clipped === null) {
            return;
        }

        const destOffsetX = clipped.x - srcX;
        const destOffsetY = clipped.y - srcY;
        const pixels = this.framePixels;

        for (let y = 0; y < clipped.height; y++) {
            for (let x = 0; x < clipped.width; x++) {
                const rawIndex = indexedPixels[(clipped.y + y) * sheetWidth + (clipped.x + x)] ?? 0;

                if (rawIndex === TRANSPARENT_PALETTE_INDEX) {
                    continue;
                }

                const finalIndex = (rawIndex + paletteOffset) >>> 0;
                const color = this.resolveSpriteColor(finalIndex);

                this.writePixel(
                    pixels,
                    destX + destOffsetX + x,
                    destY + destOffsetY + y,
                    color.r,
                    color.g,
                    color.b,
                    255,
                );
            }
        }
    }

    /**
     * Writes one RGBA pixel into `pixels`, bounds-checked against the display size.
     *
     * `pixels` is taken as a parameter (the caller's own {@link framePixels} read, done once per
     * raster call) rather than read from `this` here, since this runs once per pixel and
     * `framePixels` is a checked accessor – re-reading it per pixel would re-run that check on
     * every call.
     *
     * @param pixels – Destination buffer, from {@link framePixels}.
     * @param x – Pixel X in logical coordinates.
     * @param y – Pixel Y in logical coordinates.
     * @param r – Red channel (0-255).
     * @param g – Green channel (0-255).
     * @param b – Blue channel (0-255).
     * @param a – Alpha channel (0-255).
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
     * `(x, y)` already lies within `[0, displaySize)` – used by loops that pre-clamp their
     * range, such as {@link rasterRectFill}. See {@link writePixel} for why `pixels` is a
     * parameter rather than a `this.framePixels` read.
     *
     * @param pixels – Destination buffer, from {@link framePixels}.
     * @param x – Pixel X in logical coordinates, already known in-bounds.
     * @param y – Pixel Y in logical coordinates, already known in-bounds.
     * @param r – Red channel (0-255).
     * @param g – Green channel (0-255).
     * @param b – Blue channel (0-255).
     * @param a – Alpha channel (0-255).
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
     * Resolves a palette index to a `Color32` for primitive drawing.
     * Returns `null` for out-of-range indices and fully transparent colors.
     *
     * @param paletteIndex – Palette entry index to look up.
     * @returns Resolved color, or `null` when the pixel should not be drawn.
     */
    private resolvePrimitiveColor(paletteIndex: number): Color32 | null {
        if (!this.palette || paletteIndex >= this.palette.size) {
            return null;
        }

        const color = this.palette.getRef(paletteIndex);

        return color.a === 0 ? null : color;
    }

    /**
     * Resolves a palette index to a `Color32` for sprite drawing.
     * Returns `Color32.black` for out-of-range indices instead of skipping.
     *
     * @param paletteIndex – Palette entry index to look up.
     * @returns Resolved color.
     */
    private resolveSpriteColor(paletteIndex: number): Color32 {
        if (!this.palette || paletteIndex >= this.palette.size) {
            return Color32.black;
        }

        return this.palette.getRef(paletteIndex);
    }

    /**
     * Returns the clear color from the palette. Falls back to `Color32.black`
     * when no palette is set or the index is out of range.
     *
     * @returns Clear color for the current frame.
     */
    private resolveClearColor(): Color32 {
        if (!this.palette) {
            return Color32.black;
        }

        try {
            return this.palette.get(this.clearPaletteIndex);
        } catch {
            return Color32.black;
        }
    }

    /**
     * Puts `imageData` (already written directly by raster methods) onto the logical canvas
     * and blits the logical canvas to the output canvas, applying nearest-neighbor upscaling.
     */
    private presentFrame(): void {
        if (!this.logicalCtx || !this.outputCtx || !this.imageData || !this.logicalCanvas) {
            return;
        }

        this.logicalCtx.putImageData(this.imageData, 0, 0);
        this.outputCtx.clearRect(0, 0, this.outputSize.x, this.outputSize.y);
        this.outputCtx.drawImage(this.logicalCanvas, 0, 0, this.outputSize.x, this.outputSize.y);
    }

    /**
     * Resolves or rejects the pending `captureFrame` promise using `canvas.toBlob`.
     * Clears `pending` after handling.
     */
    private resolvePending(): void {
        if (!this.pending) {
            return;
        }

        if (typeof this.canvas.toBlob !== 'function') {
            this.pending.reject(
                new Error(
                    "Can't save this frame - your browser doesn't support canvas image export. Try Chrome or Edge.",
                ),
            );

            this.pending = null;

            return;
        }

        const request = this.pending;

        this.pending = null;
        this.canvas.toBlob((blob) => {
            if (!blob) {
                request.reject(
                    new Error(
                        "Can't save this frame - something went wrong exporting the canvas image. Try again on the next frame.",
                    ),
                );
                return;
            }
            request.resolve(blob);
        }, 'image/png');
    }
}
