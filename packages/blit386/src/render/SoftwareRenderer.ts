import type { BitmapFont } from '../assets/BitmapFont';
import type { Palette } from '../assets/Palette';
import type { SpriteSheet } from '../assets/SpriteSheet';
import type { OverlayDrawTarget, OverlayRendererDiagnostics } from '../overlay';
import { Color32 } from '../utils/Color32';
import {
    NO_ACTIVE_PALETTE_MESSAGE,
    RENDERER_RESET_MESSAGE,
    SOFTWARE_CANVAS_TAKEN_MESSAGE,
} from '../utils/errorMessages';
import type { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import type { ClippedLine } from './clipLine';
import { clipBresenhamLine } from './clipLine';
import type { Effect } from './effects/Effect';
import type { IRenderer } from './IRenderer';
import { SoftwareFrameCaptures } from './SoftwareFrameCaptures';
import type { DrawCommand } from './SoftwareRaster';
import { SoftwareRaster } from './SoftwareRaster';

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
    /** Reused clip result so lines allocate nothing per call. */
    private readonly clippedLine: ClippedLine = { x: 0, y: 0, err: 0, steps: 0 };
    private readonly commands: DrawCommand[] = [];
    private imageData: ImageData | null = null;
    /** The three capture slots, settled at the end of the next frame. */
    private readonly captures = new SoftwareFrameCaptures();
    /** Rasterizes the queued commands into {@link imageData}. */
    private readonly raster: SoftwareRaster;
    private primitiveSubmittedVertices = 0;
    private spriteSubmittedVertices = 0;

    /** Reused result of {@link getFrameDiagnostics}, so the overlay allocates nothing per frame. */
    private readonly frameDiagnostics = {
        primitiveOverflowCount: 0,
        spriteOverflowCount: 0,
        primitiveSubmittedVertices: 0,
        spriteSubmittedVertices: 0,
    };

    /**
     * Creates a software renderer bound to the given canvas.
     *
     * @param canvas - Target HTML canvas element to draw into.
     * @param displaySize - Logical render resolution in pixels.
     * @param outputSize - Output resolution in pixels. Defaults to `displaySize` (no upscaling).
     */
    constructor(canvas: HTMLCanvasElement, displaySize: Vector2i, outputSize?: Vector2i) {
        this.canvas = canvas;
        this.displaySize = displaySize.clone();
        this.outputSize = (outputSize ?? displaySize).clone();
        this.raster = new SoftwareRaster(this.displaySize);
    }

    /**
     * Estimates primitive vertices for a rectangle outline using {@link PrimitivePipeline.drawRect} rules.
     *
     * @param rect - Outline bounds.
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
     * Initializes the 2D canvas contexts and backing image buffer.
     *
     * @returns `true` when contexts are ready; otherwise `false`.
     */
    async init(): Promise<boolean> {
        // Re-init replaces the logical canvas; captures queued against the old one must
        // not settle from the rebuilt scene (mirrors WebGPURenderer.init()).
        this.destroy();

        this.canvas.width = this.outputSize.x;
        this.canvas.height = this.outputSize.y;

        this.outputCtx = this.canvas.getContext('2d') as Canvas2D | null;

        if (!this.outputCtx) {
            // A browser canvas refuses a 2D context only once it holds another kind (here, WebGPU's).
            console.error(`[BT] ${SOFTWARE_CANVAS_TAKEN_MESSAGE}`);

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

        this.raster.attach(this.imageData);

        return true;
    }

    /**
     * Rejects every pending capture. Called on every {@link init} and when the engine drops
     * the renderer; the canvases go with the renderer, so there is nothing else to release.
     */
    destroy(): void {
        this.captures.rejectAll(RENDERER_RESET_MESSAGE);
    }

    /**
     * Sets the active palette used for all color lookups during rendering.
     *
     * @param palette - Palette to activate.
     */
    setPalette(palette: Palette): void {
        this.palette = palette;
        this.raster.palette = palette;

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
            throw new Error(NO_ACTIVE_PALETTE_MESSAGE);
        }

        this.commands.length = 0;
        this.primitiveSubmittedVertices = 0;
        this.spriteSubmittedVertices = 0;
    }

    /**
     * Sets the palette index used to fill the background on each frame.
     *
     * @param paletteIndex - Palette entry index for the clear color.
     */
    setClearColor(paletteIndex: number): void {
        this.clearPaletteIndex = paletteIndex;
    }

    /**
     * Replays all queued draw commands into the pixel buffer and presents the frame.
     * Also resolves any pending `captureFrame` / `captureFrameAtDisplaySize` promise.
     */
    endFrame(): void {
        if (!this.imageData) {
            this.commands.length = 0;
            this.captures.rejectUninitialized();

            return;
        }

        const clearColor = this.resolveClearColor();

        this.raster.fillFrame(clearColor.r, clearColor.g, clearColor.b, clearColor.a);

        for (const command of this.commands) {
            this.raster.replay(command);
        }

        this.presentFrame();
        this.captures.settle(this.canvas, this.logicalCanvas);
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
        this.frameDiagnostics.primitiveSubmittedVertices = this.primitiveSubmittedVertices;
        this.frameDiagnostics.spriteSubmittedVertices = this.spriteSubmittedVertices;

        return this.frameDiagnostics;
    }

    /**
     * Queues a filled rectangle draw command.
     *
     * @param rect - Rectangle to fill in logical pixels.
     * @param paletteIndex - Palette entry index for the fill color.
     */
    drawRectFill(rect: Rect2i, paletteIndex: number): void {
        this.queueRectFillXY(rect.x, rect.y, rect.width, rect.height, paletteIndex);
    }

    /**
     * Queues an overlay bar fill (same FIFO queue as {@link drawRectFill}).
     *
     * @param rect - Rectangle to fill in logical pixels.
     * @param paletteIndex - Palette entry index for the fill color.
     */
    drawBarFill(rect: Rect2i, paletteIndex: number): void {
        this.drawRectFill(rect, paletteIndex);
    }

    /**
     * Queues an overlay bar fill (same FIFO draw queue as {@link drawBarFill}).
     * The software backend does not layer overlay draws above demo content;
     * `OnTop` variants are equivalent to their base methods.
     *
     * @param rect - Rectangle to fill in logical pixels.
     * @param paletteIndex - Palette entry index for the fill color.
     */
    drawBarFillOnTop(rect: Rect2i, paletteIndex: number): void {
        this.drawBarFill(rect, paletteIndex);
    }

    /**
     * Queues a single pixel draw command at the given position.
     *
     * @param pos - Pixel position in logical coordinates.
     * @param paletteIndex - Palette entry index for the pixel color.
     */
    drawPixel(pos: Vector2i, paletteIndex: number): void {
        this.queueRectFillXY(pos.x, pos.y, 1, 1, paletteIndex);
    }

    /**
     * Queues a single pixel draw command at raw coordinates.
     * More efficient than {@link drawPixel} when coordinates are already unpacked.
     *
     * @param x - X position in logical coordinates.
     * @param y - Y position in logical coordinates.
     * @param paletteIndex - Palette entry index for the pixel color.
     */
    drawPixelXY(x: number, y: number, paletteIndex: number): void {
        this.queueRectFillXY(x, y, 1, 1, paletteIndex);
    }

    /**
     * Queues a Bresenham line draw command between two points.
     *
     * @param p0 - Line start position in logical coordinates.
     * @param p1 - Line end position in logical coordinates.
     * @param paletteIndex - Palette entry index for the line color.
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
        this.primitiveSubmittedVertices += this.estimateLineVertexCount(p0.x, p0.y, p1.x, p1.y);
    }

    /**
     * Queues an outline rectangle draw command (four lines, no fill).
     *
     * @param rect - Rectangle to outline in logical pixels.
     * @param paletteIndex - Palette entry index for the border color.
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
     * @param rect - Rectangle to clear in logical pixels.
     * @param paletteIndex - Palette entry index for the fill color.
     */
    clearRect(rect: Rect2i, paletteIndex: number): void {
        this.drawRectFill(rect, paletteIndex);
    }

    /**
     * Queues a sprite blit from a source sheet rectangle to a destination position.
     *
     * @param spriteSheet - Source sprite sheet containing the indexed pixels.
     * @param srcRect - Source region within the sprite sheet in pixels.
     * @param destPos - Destination position in logical coordinates.
     * @param paletteOffset - Palette index offset applied to every non-transparent pixel.
     */
    drawSprite(spriteSheet: SpriteSheet, srcRect: Rect2i, destPos: Vector2i, paletteOffset: number = 0): void {
        this.drawSpriteOriented(spriteSheet, srcRect, destPos, paletteOffset, 0);
    }

    /**
     * Queues a flipped / quarter-turned sprite blit. `destPos` is the top-left of the post-flags
     * footprint (`sh x sw` for a 90 or 270 degree turn).
     *
     * @param spriteSheet - Source sprite sheet containing the indexed pixels.
     * @param srcRect - Source region within the sprite sheet in pixels.
     * @param destPos - Destination position in logical coordinates.
     * @param paletteOffset - Palette index offset applied to every non-transparent pixel.
     * @param orientation - Row of `SPRITE_ORIENTATIONS`, from `resolveSpriteOrientation` (`0` replays through
     *   the unchanged `SoftwareRaster` blit path).
     */
    drawSpriteOriented(
        spriteSheet: SpriteSheet,
        srcRect: Rect2i,
        destPos: Vector2i,
        paletteOffset: number,
        orientation: number,
    ): void {
        this.commands.push({
            kind: 'sprite',
            spriteSheet,
            srcRect: srcRect.clone(),
            destPos: destPos.clone(),
            paletteOffset,
            orientation,
            cameraX: this.cameraOffset.x,
            cameraY: this.cameraOffset.y,
        });
        this.spriteSubmittedVertices += SoftwareRenderer.QUAD_VERTEX_COUNT;
    }

    /**
     * Queues a stretched / scaled sprite blit: the post-flags footprint of `srcRect` sampled into the
     * `destW x destH` box at (`destX`, `destY`) with the center rule in `stretchSampleIndex`.
     *
     * @param spriteSheet - Source sprite sheet containing the indexed pixels.
     * @param srcRect - Source region within the sprite sheet in pixels.
     * @param destX - Box left edge in logical coordinates.
     * @param destY - Box top edge in logical coordinates.
     * @param destW - Box width in pixels (at least 1).
     * @param destH - Box height in pixels (at least 1).
     * @param paletteOffset - Palette index offset applied to every non-transparent pixel.
     * @param orientation - Row of `SPRITE_ORIENTATIONS`, `0`-`7`.
     */
    drawSpriteStretched(
        spriteSheet: SpriteSheet,
        srcRect: Rect2i,
        destX: number,
        destY: number,
        destW: number,
        destH: number,
        paletteOffset: number,
        orientation: number,
    ): void {
        this.commands.push({
            kind: 'spriteStretched',
            spriteSheet,
            srcX: srcRect.x,
            srcY: srcRect.y,
            srcW: srcRect.width,
            srcH: srcRect.height,
            destX,
            destY,
            destW,
            destH,
            paletteOffset,
            orientation,
            cameraX: this.cameraOffset.x,
            cameraY: this.cameraOffset.y,
        });
        this.spriteSubmittedVertices += SoftwareRenderer.QUAD_VERTEX_COUNT;
    }

    /**
     * Queues a bitmap text draw command, expanding each character to a sprite blit on replay.
     *
     * @param font - Bitmap font containing glyph sheet and metrics.
     * @param pos - Top-left position of the text in logical coordinates.
     * @param text - String to render.
     * @param paletteOffset - Palette index offset applied to every glyph pixel.
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
     * @param font - Bitmap font with character glyphs.
     * @param pos - Text origin in logical pixels.
     * @param text - String to render.
     * @param paletteOffset - Palette index offset applied to all glyphs (default 0).
     */
    drawLabel(font: BitmapFont, pos: Vector2i, text: string, paletteOffset: number = 0): void {
        this.drawBitmapText(font, pos, text, paletteOffset);
    }

    /**
     * Queues an overlay label (same FIFO draw queue as {@link drawLabel}).
     * The software backend does not layer overlay draws above demo content;
     * `OnTop` variants are equivalent to their base methods.
     *
     * @param font - Bitmap font with character glyphs.
     * @param pos - Text origin in logical pixels.
     * @param text - String to render.
     * @param paletteOffset - Palette index offset applied to all glyphs (default 0).
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
        return this.captures.output();
    }

    /**
     * Returns a promise that resolves with a PNG Blob of the logical (pre-upscale)
     * frame on the next `endFrame` call, bypassing the output canvas upscale.
     * Backs the public `BT.captureFrame({ size: 'display' })`. Any previously pending
     * `captureFrameAtDisplaySize` capture is rejected before the new one is registered;
     * the shortcut slot ({@link captureFrameForShortcut}) is unaffected.
     *
     * @returns Promise that resolves with the captured logical frame as a PNG `Blob`.
     */
    captureFrameAtDisplaySize(): Promise<Blob> {
        return this.captures.display();
    }

    /**
     * Same capture as {@link captureFrameAtDisplaySize}, from the slot reserved for the
     * F9 / Shift+F9 dev-mode shortcuts.
     *
     * @returns Promise that resolves with the captured logical frame as a PNG `Blob`.
     */
    captureFrameForShortcut(): Promise<Blob> {
        return this.captures.shortcut();
    }

    /**
     * Sets the camera scroll offset applied to all subsequent draw commands.
     *
     * @param offset - New camera offset in logical pixels.
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
     * Not supported - always throws.
     *
     * @param _effect - Ignored.
     */
    addEffect(_effect: Effect): void {
        throw new Error(SoftwareRenderer.EFFECTS_UNSUPPORTED_MESSAGE);
    }

    /**
     * Not supported - always throws.
     *
     * @param _effect - Ignored.
     */
    removeEffect(_effect: Effect): void {
        throw new Error(SoftwareRenderer.EFFECTS_UNSUPPORTED_MESSAGE);
    }

    /** Not supported - always throws. */
    clearEffects(): void {
        throw new Error(SoftwareRenderer.EFFECTS_UNSUPPORTED_MESSAGE);
    }

    /**
     * Estimates primitive vertices for a line using the same rules as {@link PrimitivePipeline.drawLine}.
     *
     * @param x0 - Start X.
     * @param y0 - Start Y.
     * @param x1 - End X.
     * @param y1 - End Y.
     * @returns Vertex count for the line draw.
     */
    private estimateLineVertexCount(x0: number, y0: number, x1: number, y1: number): number {
        const ix0 = x0 | 0;
        const iy0 = y0 | 0;
        const ix1 = x1 | 0;
        const iy1 = y1 | 0;

        if (iy0 === iy1 || ix0 === ix1) {
            return SoftwareRenderer.QUAD_VERTEX_COUNT;
        }

        // Only the visible part of the line is emitted, matching PrimitivePipeline.drawLine.
        const camera = this.cameraOffset;
        const clip = this.clippedLine;

        if (
            !clipBresenhamLine(
                ix0,
                iy0,
                ix1,
                iy1,
                camera.x,
                camera.y,
                camera.x + this.displaySize.x - 1,
                camera.y + this.displaySize.y - 1,
                clip,
            )
        ) {
            return 0;
        }

        return clip.steps * SoftwareRenderer.QUAD_VERTEX_COUNT;
    }

    /**
     * Queues a filled rectangle draw command from scalar bounds. Shared by {@link drawRectFill}
     * and {@link drawPixel} so neither has to allocate a `Rect2i` just to shuttle four numbers
     * into the command queue.
     *
     * @param x - Left edge in logical pixels.
     * @param y - Top edge in logical pixels.
     * @param width - Rectangle width in pixels.
     * @param height - Rectangle height in pixels.
     * @param paletteIndex - Palette entry index for the fill color.
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
}
