import type { BitmapFont } from '../assets/BitmapFont';
import type { Palette } from '../assets/Palette';
import type { SpriteSheet } from '../assets/SpriteSheet';
import type { OverlayDrawTarget, OverlayRendererDiagnostics } from '../overlay';
import { noActivePaletteError } from '../utils/errorMessages';
import { FrameCapture } from '../utils/FrameCapture';
import type { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import type { Effect } from './effects/Effect';
import type { IRenderer } from './IRenderer';
import { PaletteResolveUpscalePass } from './PaletteResolveUpscalePass';
import { PostProcessChain } from './PostProcessChain';
import { PrimitivePipeline } from './PrimitivePipeline';
import { SpritePipeline } from './SpritePipeline';
import type { UpscaleFilter } from './UpscalePass';

/**
 * GPU palette uniform buffer size: 256 entries x 4 floats x 4 bytes = 4096 bytes.
 */
const PALETTE_BUFFER_SIZE = 256 * 4 * 4;

/** Logical scene + pixel chain format (palette index in the red channel). */
const LOGICAL_TARGET_FORMAT: GPUTextureFormat = 'r8uint';

/**
 * WebGPU renderer implementing {@link IRenderer}.
 *
 * `WebGPURenderer` owns frame begin/end, clear color, camera state, palette
 * buffer, frame capture, and the two-tier post-process pipeline. Actual draw
 * batching is delegated to {@link PrimitivePipeline} and {@link SpritePipeline}.
 *
 * Per-frame stage flow:
 *
 * ```text
 * scene (r8uint logical) -> [pixel chain, r8uint]
 *                        -> palette resolve + upscale (rgba)
 *                        -> [display chain, rgba]
 *                        -> swap chain
 * ```
 *
 * Pixel-tier effects always run in the index-native logical domain. RGBA output
 * exists only after palette resolve/upscale, so display-tier effects remain
 * unchanged while the obsolete logical RGBA path is removed.
 */
export class WebGPURenderer implements IRenderer, OverlayDrawTarget {
    /** WebGPU device for GPU operations. */
    private readonly device: GPUDevice;

    /** WebGPU canvas context for presenting frames. */
    private context: GPUCanvasContext;

    /** Logical render target resolution in pixels (`displaySize`). */
    private readonly displaySize: Vector2i;

    /** Output drawing-buffer size in pixels (matches the swap chain). */
    private readonly outputSize: Vector2i;

    /** Magnification filter used between the pixel chain and the display chain. */
    private readonly upscaleFilterMode: UpscaleFilter;

    /**
     * True when the caller explicitly provided an `outputSize` (i.e. set
     * `drawingBufferSize` in `configure()`), enabling display-tier effects
     * regardless of whether the output resolution differs from the logical one.
     */
    private readonly isDisplayTierEnabled: boolean;

    /** Palette index used for the frame clear color. Defaults to 0 (transparent). */
    private clearPaletteIndex: number = 0;

    /** Camera offset for scrolling effects. */
    private cameraOffset: Vector2i = Vector2i.zero();

    /** Frame capture manager for PNG export. */
    private readonly frameCapture = new FrameCapture();

    /** Active palette for color lookups and GPU upload. */
    private palette: Palette | null = null;

    /** GPU uniform buffer for the 256-entry palette. */
    private paletteBuffer: GPUBuffer | null = null;

    /** Reusable staging buffer for GPU palette uploads. Avoids per-frame allocation. */
    private readonly paletteStaging = new Float32Array(256 * 4);

    /**
     * True after {@link setPalette} is called, guaranteeing at least one upload
     * even when the palette was never mutated via {@link Palette.set}.
     * Per-frame mutations are detected separately via {@link Palette.isDirty}.
     */
    private isPaletteDirty: boolean = false;

    /** Pipeline for palette-indexed geometry (pixels, lines, rectangles). */
    private readonly primitives: PrimitivePipeline;

    /**
     * Primitives encoded after the sprite pass (overlay bars, etc.).
     */
    private readonly overlayPrimitives: PrimitivePipeline;

    /** Pipeline for textured quads (sprites, bitmap text). */
    private readonly sprites: SpritePipeline;

    /**
     * Sprites encoded after overlay bar primitives (overlay labels, etc.).
     */
    private readonly overlaySprites: SpritePipeline;

    /**
     * Primitives encoded after overlay label sprites (tooltip chrome, etc.).
     */
    private readonly overlayTopPrimitives: PrimitivePipeline;

    /**
     * Sprites encoded after overlay top primitives (tooltip labels, etc.).
     */
    private readonly overlayTopSprites: SpritePipeline;

    /** Pixel-tier post-process chain (logical resolution). */
    private pixelChain: PostProcessChain | null = null;

    /** Display-tier post-process chain (output resolution). */
    private displayChain: PostProcessChain | null = null;

    /** Pass that resolves logical palette indices to RGBA and upscales to output size. */
    private resolvePass: PaletteResolveUpscalePass | null = null;

    /** Logical-resolution scene framebuffer; allocated lazily. */
    private sceneTex: GPUTexture | null = null;

    /** Stable view of the scene framebuffer. */
    private sceneTexView: GPUTextureView | null = null;

    /** Cached swap-chain format used by lazy texture creation. */
    private swapFormat: GPUTextureFormat | null = null;

    /**
     * Timestamp (ms, from `performance.now()`) of the previous `endFrame()`
     * call. Zero on the first frame so the first deltaMs is reported as 0
     * rather than a large value spanning engine startup time.
     */
    private lastFrameMs: number = 0;

    /**
     * Creates a renderer bound to an initialized device and canvas context.
     *
     * @param device - WebGPU device for GPU operations.
     * @param context - WebGPU canvas context for presenting frames.
     * @param displaySize - Logical render resolution in pixels.
     * @param outputSize - Output drawing-buffer resolution in pixels (matches the
     *   swap chain). When omitted, display-tier effects are disabled and the
     *   renderer operates at logical `displaySize` only.
     * @param upscaleFilter - Magnification filter for the upscale pass. Defaults to
     *   `'nearest'`.
     */
    constructor(
        device: GPUDevice,
        context: GPUCanvasContext,
        displaySize: Vector2i,
        outputSize?: Vector2i,
        upscaleFilter: UpscaleFilter = 'nearest',
    ) {
        this.device = device;
        this.context = context;
        this.displaySize = displaySize.clone();
        this.isDisplayTierEnabled = outputSize !== undefined;
        this.outputSize = (outputSize ?? displaySize).clone();
        this.upscaleFilterMode = upscaleFilter;
        this.primitives = new PrimitivePipeline();
        this.overlayPrimitives = new PrimitivePipeline();
        this.overlayTopPrimitives = new PrimitivePipeline();
        this.sprites = new SpritePipeline();
        this.overlaySprites = new SpritePipeline();
        this.overlayTopSprites = new SpritePipeline();
    }

    /**
     * Initializes the underlying render pipelines and GPU resources.
     *
     * @returns `true` when GPU resources are ready; otherwise `false`.
     */
    async init(): Promise<boolean> {
        try {
            // Release any GPU resources from a previous init() call (e.g.
            // device-loss recovery) so nothing leaks.
            this.paletteBuffer?.destroy();
            this.paletteBuffer = null;
            this.pixelChain?.dispose();
            this.pixelChain = null;
            this.displayChain?.dispose();
            this.displayChain = null;
            this.resolvePass?.dispose();
            this.resolvePass = null;
            this.sceneTex?.destroy();
            this.sceneTex = null;
            this.sceneTexView = null;
            this.lastFrameMs = 0;

            // Create shared palette uniform buffer (256 entries x vec4f).
            this.paletteBuffer = this.device.createBuffer({
                label: 'Palette Uniform Buffer',
                size: PALETTE_BUFFER_SIZE,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

            // Mark the palette dirty so the new buffer is populated on the first
            // endFrame(), even if the palette data has not changed since the last
            // init() call (e.g. after a WebGPU device-loss recovery).
            this.isPaletteDirty = true;

            // Primitive and sprite pipelines run at logical resolution. The
            // viewport is automatic since each pass binds a target view; only
            // the camera scaling here cares about logical size.
            await this.primitives.init(this.device, this.displaySize, this.paletteBuffer, LOGICAL_TARGET_FORMAT);
            await this.overlayPrimitives.init(this.device, this.displaySize, this.paletteBuffer, LOGICAL_TARGET_FORMAT);
            await this.overlayTopPrimitives.init(
                this.device,
                this.displaySize,
                this.paletteBuffer,
                LOGICAL_TARGET_FORMAT,
            );
            await this.sprites.init(this.device, this.displaySize, this.paletteBuffer, LOGICAL_TARGET_FORMAT);
            await this.overlaySprites.init(this.device, this.displaySize, this.paletteBuffer, LOGICAL_TARGET_FORMAT);
            await this.overlayTopSprites.init(this.device, this.displaySize, this.paletteBuffer, LOGICAL_TARGET_FORMAT);

            this.swapFormat = navigator.gpu.getPreferredCanvasFormat();

            // Pixel chain operates at logical resolution (320x240 etc.).
            this.pixelChain = new PostProcessChain(this.device, LOGICAL_TARGET_FORMAT, this.displaySize, 'pixel');

            // Display chain operates at output resolution. When there is no
            // upscale (output == logical), display-tier effects still run, but
            // they sample the same-size source. We allocate the chain regardless
            // so the rest of the engine can introspect it.
            this.displayChain = new PostProcessChain(this.device, this.swapFormat, this.outputSize, 'display');

            // Resolve + optional upscale sits between logical and display tiers.
            this.resolvePass = new PaletteResolveUpscalePass();
            this.resolvePass.init(this.device, this.swapFormat, this.upscaleFilterMode, this.paletteBuffer);

            return true;
        } catch (error) {
            console.error('[WebGPURenderer] Initialization failed:', error);

            return false;
        }
    }

    /**
     * Sets the active palette used for rendering.
     *
     * Stores a reference to the supplied palette - no clone is made. Subsequent
     * calls to {@link Palette.set} or {@link Palette.copyFrom} on the same object
     * will be detected via {@link Palette.isDirty} and uploaded automatically at the
     * start of the next frame. The internal dirty flag guarantees the initial
     * upload even when the palette has never been mutated through {@link Palette.set}.
     *
     * @param palette - Palette to use for color lookups and GPU upload.
     */
    setPalette(palette: Palette): void {
        this.palette = palette;
        this.isPaletteDirty = true;

        // If the new palette is smaller than the current clear index, reset to 0
        // (transparent) so resolveClearPaletteIndex does not warn on every endFrame().
        if (this.clearPaletteIndex >= this.palette.size) {
            this.clearPaletteIndex = 0;
        }
    }

    /**
     * Returns a snapshot of the active palette, or null if none has been set.
     *
     * Returns a clone to prevent callers from accidentally mutating the active
     * palette through the returned reference in ways that may be surprising.
     * To intentionally update palette colors, mutate the original palette object
     * that was passed to {@link setPalette} - changes will auto-propagate via the
     * dirty flag on the next frame.
     *
     * @returns Clone of the active palette instance, or null.
     */
    getPalette(): Palette | null {
        return this.palette?.clone() ?? null;
    }

    /**
     * Begins a new frame by clearing all per-frame batching state.
     *
     * @throws Error if no palette has been set via {@link setPalette}.
     */
    beginFrame(): void {
        if (!this.palette) {
            throw new Error(noActivePaletteError());
        }

        this.primitives.reset();
        this.overlayPrimitives.reset();
        this.overlayTopPrimitives.reset();
        this.sprites.reset();
        this.overlaySprites.reset();
        this.overlayTopSprites.reset();
    }

    /**
     * Sets the background clear color for this frame using a palette index.
     *
     * @param paletteIndex - Palette index for the clear color.
     */
    setClearColor(paletteIndex: number): void {
        this.clearPaletteIndex = paletteIndex;
    }

    /**
     * Ends the current frame and presents to the screen.
     *
     * Routing in priority order:
     * 1. Render scene into logical `r8uint` source (or pixel-chain input when active).
     * 2. Encode pixel chain (if active) -> logical scene texture.
     * 3. Resolve/upscale logical indices to RGBA (destination is display-chain input or swap).
     * 4. Encode display chain (if active) -> swap chain.
     */
    endFrame(): void {
        const swapTexture = this.acquireSwapTexture();

        if (!swapTexture) {
            return;
        }

        this.flushPaletteIfDirty();

        const swapChainView = swapTexture.createView();
        const commandEncoder = this.device.createCommandEncoder({ label: 'Render Commands' });
        const isPixelChainActive = this.pixelChain?.isActive() ?? false;
        const isDisplayChainActive = this.displayChain?.isActive() ?? false;
        const sceneView = this.resolveSceneView(isPixelChainActive);

        const now = performance.now();
        const deltaMs = this.lastFrameMs === 0 ? 0 : Math.max(0, now - this.lastFrameMs);
        this.lastFrameMs = now;

        this.encodeScenePass(commandEncoder, sceneView);
        this.encodePostProcess(commandEncoder, swapChainView, isPixelChainActive, isDisplayChainActive, deltaMs);
        this.submitFrame(commandEncoder, swapTexture);
    }

    /**
     * Returns aggregated per-frame renderer diagnostic counters for overlay internals.
     *
     * Call after demo and overlay draws complete and before {@link endFrame} resets
     * pipeline batch state. All six scene pipelines (demo + overlay batches) are summed.
     *
     * @returns Diagnostic counters for the current frame.
     */
    getFrameDiagnostics(): OverlayRendererDiagnostics {
        const primitivePipelines = [this.primitives, this.overlayPrimitives, this.overlayTopPrimitives];
        const spritePipelines = [this.sprites, this.overlaySprites, this.overlayTopSprites];

        let primitiveOverflowCount = 0;
        let primitiveSubmittedVertices = 0;

        for (const pipeline of primitivePipelines) {
            primitiveOverflowCount += pipeline.getFrameOverflowCount();
            primitiveSubmittedVertices += pipeline.getFrameSubmittedVertices();
        }

        let spriteOverflowCount = 0;
        let spriteSubmittedVertices = 0;

        for (const pipeline of spritePipelines) {
            spriteOverflowCount += pipeline.getFrameOverflowCount();
            spriteSubmittedVertices += pipeline.getFrameSubmittedVertices();
        }

        return {
            primitiveOverflowCount,
            spriteOverflowCount,
            primitiveSubmittedVertices,
            spriteSubmittedVertices,
        };
    }

    /**
     * Draws a filled rectangle using two triangles.
     *
     * @param rect - Rectangle bounds in pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawRectFill(rect: Rect2i, paletteIndex: number): void {
        this.primitives.drawRectFill(rect, paletteIndex);
    }

    /**
     * Draws a filled rectangle in the overlay primitive batch (above demo sprites).
     *
     * @param rect - Rectangle bounds in pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawBarFill(rect: Rect2i, paletteIndex: number): void {
        this.overlayPrimitives.drawRectFill(rect, paletteIndex);
    }

    /**
     * Draws a filled rectangle above overlay labels (tooltip chrome, etc.).
     *
     * @param rect - Rectangle bounds in pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawBarFillOnTop(rect: Rect2i, paletteIndex: number): void {
        this.overlayTopPrimitives.drawRectFill(rect, paletteIndex);
    }

    /**
     * Draws a single pixel as a 1x1 filled rectangle.
     *
     * @param pos - Pixel position.
     * @param paletteIndex - Palette color index.
     */
    drawPixel(pos: Vector2i, paletteIndex: number): void {
        this.drawPixelXYInternal(pos.x, pos.y, paletteIndex);
    }

    /**
     * Draws a line using optimized quad rendering for axis-aligned lines,
     * falling back to Bresenham's algorithm for diagonal lines.
     *
     * @param p0 - Start point.
     * @param p1 - End point.
     * @param paletteIndex - Palette color index.
     */
    drawLine(p0: Vector2i, p1: Vector2i, paletteIndex: number): void {
        this.primitives.drawLine(p0, p1, paletteIndex);
    }

    /**
     * Draws a rectangle outline using four 1-pixel quads.
     *
     * @param rect - Rectangle bounds.
     * @param paletteIndex - Palette color index.
     */
    drawRect(rect: Rect2i, paletteIndex: number): void {
        this.primitives.drawRect(rect, paletteIndex);
    }

    /**
     * Fills a rectangular region with a palette-indexed color.
     *
     * @param rect - Region to fill in pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    clearRect(rect: Rect2i, paletteIndex: number): void {
        this.primitives.clearRect(rect, paletteIndex);
    }

    /**
     * Draws a sprite region from an indexed sprite sheet.
     *
     * @param spriteSheet - Source sprite sheet (must have been indexized).
     * @param srcRect - Region to copy from the sprite sheet.
     * @param destPos - Screen position to draw at.
     * @param paletteOffset - Palette index offset applied at draw time (default 0).
     */
    drawSprite(spriteSheet: SpriteSheet, srcRect: Rect2i, destPos: Vector2i, paletteOffset: number = 0): void {
        this.sprites.drawSprite(spriteSheet, srcRect, destPos, paletteOffset);
    }

    /**
     * Draws text using a bitmap font through the indexed sprite pipeline.
     * Renders each character as a textured sprite.
     *
     * @param font - Bitmap font with character glyphs (underlying sheet must be indexized).
     * @param pos - Text position (top-left corner).
     * @param text - String to render.
     * @param paletteOffset - Palette index offset applied to all glyphs (default 0).
     */
    drawBitmapText(font: BitmapFont, pos: Vector2i, text: string, paletteOffset: number = 0): void {
        this.sprites.drawBitmapText(font, pos, text, paletteOffset);
    }

    /**
     * Draws bitmap text in the overlay sprite batch (above overlay bar fills).
     *
     * @param font - Bitmap font with character glyphs.
     * @param pos - Text position (top-left corner).
     * @param text - String to render.
     * @param paletteOffset - Palette index offset applied to all glyphs (default 0).
     */
    drawLabel(font: BitmapFont, pos: Vector2i, text: string, paletteOffset: number = 0): void {
        this.overlaySprites.drawBitmapText(font, pos, text, paletteOffset);
    }

    /**
     * Draws bitmap text above overlay top bar fills (tooltip labels, etc.).
     *
     * @param font - Bitmap font with character glyphs.
     * @param pos - Text position (top-left corner).
     * @param text - String to render.
     * @param paletteOffset - Palette index offset applied to all glyphs (default 0).
     */
    drawLabelOnTop(font: BitmapFont, pos: Vector2i, text: string, paletteOffset: number = 0): void {
        this.overlayTopSprites.drawBitmapText(font, pos, text, paletteOffset);
    }

    /**
     * Captures the next rendered frame as a PNG blob.
     * The capture happens on the next `endFrame()` call.
     * If a capture is already pending, the previous one is rejected.
     *
     * @returns Promise resolving to a PNG Blob of the rendered frame.
     */
    captureFrame(): Promise<Blob> {
        return this.frameCapture.request();
    }

    /**
     * Sets the camera offset for scrolling.
     *
     * The offset is propagated to all scene pipelines: `primitives`,
     * `overlayPrimitives`, `overlayTopPrimitives`, `sprites`, `overlaySprites`,
     * and `overlayTopSprites`.
     *
     * @param offset - Camera position in pixels.
     */
    setCameraOffset(offset: Vector2i): void {
        this.cameraOffset = offset.clone();
        this.primitives.setCameraOffset(this.cameraOffset);
        this.overlayPrimitives.setCameraOffset(this.cameraOffset);
        this.overlayTopPrimitives.setCameraOffset(this.cameraOffset);
        this.sprites.setCameraOffset(this.cameraOffset);
        this.overlaySprites.setCameraOffset(this.cameraOffset);
        this.overlayTopSprites.setCameraOffset(this.cameraOffset);
    }

    /**
     * Gets the current camera offset.
     *
     * @returns Copy of the current camera position.
     */
    getCameraOffset(): Vector2i {
        return this.cameraOffset.clone();
    }

    /**
     * Resets the camera to the origin (0, 0) on all scene pipelines.
     */
    resetCamera(): void {
        this.cameraOffset = Vector2i.zero();
        this.primitives.setCameraOffset(this.cameraOffset);
        this.overlayPrimitives.setCameraOffset(this.cameraOffset);
        this.overlayTopPrimitives.setCameraOffset(this.cameraOffset);
        this.sprites.setCameraOffset(this.cameraOffset);
        this.overlaySprites.setCameraOffset(this.cameraOffset);
        this.overlayTopSprites.setCameraOffset(this.cameraOffset);
    }

    /**
     * Appends a fullscreen post-processing effect to the chain matching its
     * declared {@link Effect.tier}.
     *
     * - `tier='pixel'` -> pixel chain (logical resolution).
     * - `tier='display'` -> display chain (output resolution); requires
     *   `drawingBufferSize` to be set in `configure()`.
     *
     * @param effect - Effect instance to append.
     * @throws If the renderer has not been initialized.
     * @throws If a `'display'` effect is added without `drawingBufferSize`
     *   set in `configure()`.
     */
    addEffect(effect: Effect): void {
        if (!this.pixelChain || !this.displayChain) {
            throw new Error('WebGPURenderer.addEffect: renderer not initialized.');
        }

        if (effect.tier === 'display' && !this.isDisplayTierEnabled) {
            throw new Error(
                'WebGPURenderer.addEffect: display-tier effects require drawingBufferSize to be set in configure().',
            );
        }

        const chain = effect.tier === 'pixel' ? this.pixelChain : this.displayChain;

        chain.add(effect);
    }

    /**
     * Removes a previously registered post-processing effect.
     *
     * Dispatches to the chain matching {@link Effect.tier}. If the effect is
     * not found in the expected chain (e.g. it was never added), a defensive
     * fallback tries the other chain. Removing an effect that was never added
     * is a no-op.
     *
     * @param effect - Effect instance to remove.
     * @throws If the renderer has not been initialized.
     */
    removeEffect(effect: Effect): void {
        if (!this.pixelChain || !this.displayChain) {
            throw new Error('WebGPURenderer.removeEffect: renderer not initialized.');
        }

        const [primary, fallback] =
            effect.tier === 'pixel' ? [this.pixelChain, this.displayChain] : [this.displayChain, this.pixelChain];

        if (!primary.remove(effect)) {
            fallback.remove(effect);
        }
    }

    /**
     * Removes every registered post-processing effect across both tiers.
     *
     * @throws If the renderer has not been initialized.
     */
    clearEffects(): void {
        if (!this.pixelChain || !this.displayChain) {
            throw new Error('WebGPURenderer.clearEffects: renderer not initialized.');
        }

        this.pixelChain.clear();
        this.displayChain.clear();
    }

    /**
     * Tries to acquire the swap-chain texture and validate its dimensions.
     * Returns null and resets pipeline state when the texture is unavailable.
     *
     * @returns Current swap-chain texture, or null when the frame must be skipped.
     */
    private acquireSwapTexture(): GPUTexture | null {
        let swapTexture: GPUTexture;

        try {
            swapTexture = this.context.getCurrentTexture();
        } catch (error) {
            console.error('[WebGPURenderer] Failed to get current texture:', error);

            this.primitives.reset();
            this.overlayPrimitives.reset();
            this.overlayTopPrimitives.reset();
            this.sprites.reset();
            this.overlaySprites.reset();
            this.overlayTopSprites.reset();

            return null;
        }

        if (swapTexture.width === 0 || swapTexture.height === 0) {
            console.warn('[WebGPURenderer] Texture has zero dimensions, skipping frame');

            this.primitives.reset();
            this.overlayPrimitives.reset();
            this.overlayTopPrimitives.reset();
            this.sprites.reset();
            this.overlaySprites.reset();
            this.overlayTopSprites.reset();

            return null;
        }

        return swapTexture;
    }

    /**
     * Uploads the palette uniform buffer when the active palette has changed
     * since the last frame.
     */
    private flushPaletteIfDirty(): void {
        if (this.palette && this.paletteBuffer && (this.isPaletteDirty || this.palette.isDirty)) {
            this.palette.toFloat32ArrayInto(this.paletteStaging);
            this.device.queue.writeBuffer(this.paletteBuffer, 0, this.paletteStaging);
            this.isPaletteDirty = false;
            this.palette.clearDirty();
        }
    }

    /**
     * Encodes the scene render pass into the supplied target view.
     *
     * Draw order: `primitives`, `sprites`, `overlayPrimitives` (overlay bars via
     * {@link drawBarFill}), `overlaySprites` (overlay labels via {@link drawLabel}),
     * `overlayTopPrimitives` ({@link drawBarFillOnTop}), then `overlayTopSprites`
     * ({@link drawLabelOnTop}).
     *
     * @param encoder - Active command encoder.
     * @param sceneView - Logical scene attachment view to render into.
     */
    private encodeScenePass(encoder: GPUCommandEncoder, sceneView: GPUTextureView): void {
        const clearPaletteIndex = this.resolveClearPaletteIndex();
        const renderPass = encoder.beginRenderPass({
            label: 'Render Pass',
            colorAttachments: [
                {
                    view: sceneView,
                    clearValue: {
                        r: clearPaletteIndex,
                        g: 0,
                        b: 0,
                        a: 0,
                    },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
        });

        this.primitives.encodePass(renderPass);
        this.sprites.encodePass(renderPass);
        this.overlayPrimitives.encodePass(renderPass);
        this.overlaySprites.encodePass(renderPass);
        this.overlayTopPrimitives.encodePass(renderPass);
        this.overlayTopSprites.encodePass(renderPass);

        renderPass.end();
    }

    /**
     * Encodes the optional pixel chain, upscale pass, and display chain in the
     * correct order based on which chains are active.
     *
     * @param encoder - Active command encoder.
     * @param swapChainView - Current swap-chain view (final destination).
     * @param isPixelChainActive - Whether the pixel chain has any registered effects.
     * @param isDisplayChainActive - Whether the display chain has any registered effects.
     * @param deltaMs - Wall-clock milliseconds since the previous frame.
     */
    private encodePostProcess(
        encoder: GPUCommandEncoder,
        swapChainView: GPUTextureView,
        isPixelChainActive: boolean,
        isDisplayChainActive: boolean,
        deltaMs: number,
    ): void {
        if (isPixelChainActive && this.pixelChain) {
            this.pixelChain.encode(encoder, deltaMs, this.pixelChainDestView());
        }

        // Resolve logical r8uint indices into RGBA (and upscale if needed) before
        // any display-tier RGBA effects run.
        if (this.resolvePass) {
            const resolveSrc = this.requireSceneTexView();
            const resolveDest = isDisplayChainActive ? this.requireDisplayChainInput() : swapChainView;

            this.resolvePass.encode(encoder, resolveSrc, resolveDest, this.displaySize);
        }

        if (isDisplayChainActive && this.displayChain) {
            this.displayChain.encode(encoder, deltaMs, swapChainView);
        }
    }

    /**
     * Adds the optional frame-capture readback, submits the command buffer,
     * and resets per-frame pipeline state.
     *
     * @param encoder - Active command encoder.
     * @param swapTexture - Current swap-chain texture (capture source).
     */
    private submitFrame(encoder: GPUCommandEncoder, swapTexture: GPUTexture): void {
        const isCapturing = this.frameCapture.hasPending();

        if (isCapturing) {
            this.frameCapture.executeInEncoder(this.device, swapTexture, encoder);
        }

        this.device.queue.submit([encoder.finish()]);

        if (isCapturing) {
            void this.frameCapture.resolve(this.device);
        }

        // Defensive reset so the pipeline state is clean even if beginFrame() is not
        // called next. beginFrame() also resets; this prevents stale data from
        // persisting across frames.
        this.primitives.reset();
        this.overlayPrimitives.reset();
        this.overlayTopPrimitives.reset();
        this.sprites.reset();
        this.overlaySprites.reset();
        this.overlayTopSprites.reset();
    }

    /**
     * Picks the texture view the scene render pass should target this frame.
     *
     * @param isPixelChainActive - Whether the pixel chain has any registered effects.
     * @returns Stable view to render the scene into.
     */
    private resolveSceneView(isPixelChainActive: boolean): GPUTextureView {
        if (isPixelChainActive && this.pixelChain) {
            return this.pixelChain.getInputView();
        }

        // Logical scene is always index-native. It must be resolved to RGBA in a
        // dedicated pass, even when output size equals logical size and no effects
        // are active.
        return this.requireSceneTexView();
    }

    /**
     * Picks the destination view for the pixel chain's last pass.
     *
     * @returns Destination view for the final pixel-chain pass.
     */
    private pixelChainDestView(): GPUTextureView {
        return this.requireSceneTexView();
    }

    /**
     * Lazily allocates the logical-resolution scene framebuffer and returns its view.
     *
     * @returns Stable view of the scene framebuffer.
     */
    private requireSceneTexView(): GPUTextureView {
        if (!this.sceneTexView) {
            this.sceneTex = this.device.createTexture({
                label: 'Renderer Scene Framebuffer',
                size: { width: this.displaySize.x, height: this.displaySize.y, depthOrArrayLayers: 1 },
                format: LOGICAL_TARGET_FORMAT,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            });

            this.sceneTexView = this.sceneTex.createView();
        }

        return this.sceneTexView;
    }

    /**
     * Returns the display chain's input view, which becomes the upscale pass's
     * destination when the display chain is active.
     *
     * @returns Stable input view of the display chain.
     */
    private requireDisplayChainInput(): GPUTextureView {
        const chain = this.displayChain;

        if (!chain?.isActive()) {
            throw new Error('WebGPURenderer.requireDisplayChainInput: display chain inactive.');
        }

        return chain.getInputView();
    }

    /**
     * Fast-path pixel draw using raw integer coordinates.
     * Avoids Vector2i unpacking overhead when coordinates are already available as numbers.
     *
     * @param x - X position.
     * @param y - Y position.
     * @param paletteIndex - Palette color index.
     */
    private drawPixelXYInternal(x: number, y: number, paletteIndex: number): void {
        this.primitives.drawPixelXY(x, y, paletteIndex);
    }

    /**
     * Resolves the clear palette index for the logical `r8uint` scene target.
     *
     * @returns Valid clear palette index, or `0` as fallback.
     */
    private resolveClearPaletteIndex(): number {
        if (!this.palette) {
            return 0;
        }

        if (this.clearPaletteIndex < 0 || this.clearPaletteIndex >= this.palette.size) {
            console.warn(
                '[WebGPURenderer] resolveClearPaletteIndex: clearPaletteIndex out of range, falling back to 0.',
            );
            return 0;
        }

        return this.clearPaletteIndex;
    }
}
