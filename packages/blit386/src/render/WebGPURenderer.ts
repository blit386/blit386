import type { BitmapFont } from '../assets/BitmapFont';
import type { Palette } from '../assets/Palette';
import { MAX_PALETTE_SIZE } from '../assets/Palette';
import type { SpriteSheet } from '../assets/SpriteSheet';
import type { OutputUpscaleFilter } from '../core/IBTDemo';
import type { OverlayDrawTarget, OverlayRendererDiagnostics } from '../overlay';
import { NO_ACTIVE_PALETTE_MESSAGE, RENDERER_RESET_MESSAGE } from '../utils/errorMessages';
import { FrameCapture } from '../utils/FrameCapture';
import type { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import type { Effect } from './effects/Effect';
import type { IRenderer } from './IRenderer';
import { OverlayPipelines } from './OverlayPipelines';
import { PaletteResolveUpscalePass } from './PaletteResolveUpscalePass';
import { PostProcessChain } from './PostProcessChain';
import { SceneBatch } from './SceneBatch';

/**
 * GPU palette uniform buffer size: {@link MAX_PALETTE_SIZE} entries x 4 floats x 4 bytes.
 */
const PALETTE_BUFFER_SIZE = MAX_PALETTE_SIZE * 4 * 4;

/** Logical scene + pixel chain format (palette index in the red channel). */
const LOGICAL_TARGET_FORMAT: GPUTextureFormat = 'r8uint';

/**
 * WebGPU renderer implementing {@link IRenderer}.
 *
 * `WebGPURenderer` owns frame begin/end, clear color, camera state, palette
 * buffer, frame capture, and the two-tier post-process pipeline. Demo draws go
 * through {@link SceneBatch}, which keeps primitives and sprites in call order;
 * overlay draws go to the fixed-order {@link OverlayPipelines} tiers.
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
    private readonly upscaleFilterMode: OutputUpscaleFilter;

    /**
     * True when the caller explicitly provided an `outputSize` (i.e. set
     * `drawingBufferSize` in `configure()`), enabling display-tier effects
     * regardless of whether the output resolution differs from the logical one.
     */
    private readonly isDisplayTierEnabled: boolean;

    /** Palette index used for the frame clear color. Defaults to 0 (transparent). */
    private clearPaletteIndex: number = 0;

    /**
     * Camera offset for scrolling effects. A persistent mutable scratch object - its
     * identity never changes after construction, only its contents (see {@link setCameraOffset}
     * / {@link resetCamera}), so it must never be initialized to the frozen {@link Vector2i.zero}
     * singleton.
     */
    private readonly cameraOffset: Vector2i = new Vector2i(0, 0);

    /** Frame capture manager for PNG export at `outputSize` (public `captureFrame()`). */
    private readonly frameCapture = new FrameCapture();

    /**
     * Frame capture manager for the public `captureFrame({ size: 'display' })` path, which
     * captures at logical `displaySize` rather than `outputSize`. Kept separate from
     * {@link frameCapture} and {@link shortcutFrameCapture} so the three capture paths
     * never contend for the same pending-request slot.
     */
    private readonly displayFrameCapture = new FrameCapture();

    /**
     * Frame capture manager for the F9 / Shift+F9 dev-mode shortcuts, which capture at
     * logical `displaySize` like {@link displayFrameCapture} but from their own slot, so
     * a keypress and a public display-size capture never supersede each other.
     */
    private readonly shortcutFrameCapture = new FrameCapture();

    /** Both display-size slots, so {@link submitFrame} can service them with one resolve pass. */
    private readonly displayCaptureSlots: readonly FrameCapture[] = [
        this.displayFrameCapture,
        this.shortcutFrameCapture,
    ];

    /** Active palette for color lookups and GPU upload. */
    private palette: Palette | null = null;

    /** GPU uniform buffer for the {@link MAX_PALETTE_SIZE}-entry palette. */
    private paletteBuffer: GPUBuffer | null = null;

    /** Reusable staging buffer for GPU palette uploads. Avoids per-frame allocation. */
    private readonly paletteStaging = new Float32Array(MAX_PALETTE_SIZE * 4);

    /** Reusable result object for {@link getFrameDiagnostics}. Avoids allocating a literal per call. */
    private readonly frameDiagnostics: {
        primitiveOverflowCount: number;
        spriteOverflowCount: number;
        primitiveSubmittedVertices: number;
        spriteSubmittedVertices: number;
    } = {
        primitiveOverflowCount: 0,
        spriteOverflowCount: 0,
        primitiveSubmittedVertices: 0,
        spriteSubmittedVertices: 0,
    };

    /**
     * True after {@link setPalette} is called, guaranteeing at least one upload
     * even when the palette was never mutated via {@link Palette.set}.
     * Per-frame mutations are detected separately via {@link Palette.isDirty}.
     */
    private isPaletteDirty: boolean = false;

    /** Demo-tier primitives and sprites, encoded in call order. */
    private readonly scene = new SceneBatch();

    /** Overlay bars and labels, encoded after the demo tier in a fixed tier order. */
    private readonly overlay: OverlayPipelines;

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

    /**
     * Display-size (logical) RGBA capture target for the Shift+F9 shortcut; allocated
     * lazily. Resolved directly from the `r8uint` scene texture, bypassing the drawing-
     * buffer upscale and any display-tier post-process effects.
     */
    private displayCaptureTex: GPUTexture | null = null;

    /** Stable view of {@link displayCaptureTex}. */
    private displayCaptureTexView: GPUTextureView | null = null;

    /** Cached swap-chain format used by lazy texture creation. */
    private swapFormat: GPUTextureFormat | null = null;

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
     * @param isOverlayEnabled - Mirrors `HardwareSettings.isOverlayEnabled`. When `true`
     *   (the default), the four overlay pipelines are eagerly allocated in {@link init}.
     *   When `false`, they stay unallocated until the first overlay draw call.
     */
    constructor(
        device: GPUDevice,
        context: GPUCanvasContext,
        displaySize: Vector2i,
        outputSize?: Vector2i,
        upscaleFilter: OutputUpscaleFilter = 'nearest',
        isOverlayEnabled: boolean = true,
    ) {
        this.device = device;
        this.context = context;
        this.displaySize = displaySize.clone();
        this.isDisplayTierEnabled = outputSize !== undefined;
        this.outputSize = (outputSize ?? displaySize).clone();
        this.upscaleFilterMode = upscaleFilter;
        this.overlay = new OverlayPipelines(device, this.displaySize, LOGICAL_TARGET_FORMAT, isOverlayEnabled);
    }

    /**
     * Initializes the underlying render pipelines and GPU resources.
     *
     * @returns `true` when GPU resources are ready; otherwise `false`.
     */
    async init(): Promise<boolean> {
        try {
            // Release any GPU resources from a previous init() call so nothing leaks.
            this.destroy();

            // Create shared palette uniform buffer (MAX_PALETTE_SIZE entries x vec4f).
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
            await this.scene.init(this.device, this.displaySize, this.paletteBuffer, LOGICAL_TARGET_FORMAT);

            // Overlay pipelines are lazily allocated: eagerly (re)initialize them here only
            // when overlay is enabled, or when a prior lazy draw call (or a prior init()
            // before a device-loss recovery) already allocated one.
            await this.overlay.init(this.paletteBuffer);

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
     * Rejects every pending capture and releases the palette buffer, effect chains, resolve
     * pass, and frame textures. Called on every {@link init} and when the engine drops the renderer.
     */
    destroy(): void {
        if (this.frameCapture.hasPending()) {
            this.frameCapture.reject(new Error(RENDERER_RESET_MESSAGE));
        }

        this.rejectPendingDisplayCaptures(RENDERER_RESET_MESSAGE);
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
        this.displayCaptureTex?.destroy();
        this.displayCaptureTex = null;
        this.displayCaptureTexView = null;
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
            throw new Error(NO_ACTIVE_PALETTE_MESSAGE);
        }

        this.scene.reset();
        this.overlay.reset();
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
     *
     * @param deltaMs - Effect time since the previous frame, from the caller (the engine's tick clock).
     */
    endFrame(deltaMs: number): void {
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
        const diagnostics = this.frameDiagnostics;
        const { primitives, sprites } = this.scene;

        diagnostics.primitiveOverflowCount = primitives.getFrameOverflowCount();
        diagnostics.primitiveSubmittedVertices = primitives.getFrameSubmittedVertices();
        diagnostics.spriteOverflowCount = sprites.getFrameOverflowCount();
        diagnostics.spriteSubmittedVertices = sprites.getFrameSubmittedVertices();
        this.overlay.addDiagnostics(diagnostics);

        return this.frameDiagnostics;
    }

    /**
     * Draws a filled rectangle using two triangles.
     *
     * @param rect - Rectangle bounds in pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawRectFill(rect: Rect2i, paletteIndex: number): void {
        this.scene.usePrimitives().drawRectFill(rect, paletteIndex);
    }

    /**
     * Draws a filled rectangle in the overlay primitive batch (above demo sprites).
     *
     * @param rect - Rectangle bounds in pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawBarFill(rect: Rect2i, paletteIndex: number): void {
        this.overlay.bars().drawRectFill(rect, paletteIndex);
    }

    /**
     * Draws a filled rectangle above overlay labels (tooltip chrome, etc.).
     *
     * @param rect - Rectangle bounds in pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawBarFillOnTop(rect: Rect2i, paletteIndex: number): void {
        this.overlay.topBars().drawRectFill(rect, paletteIndex);
    }

    /**
     * Draws a single pixel as a 1x1 filled rectangle.
     *
     * @param pos - Pixel position.
     * @param paletteIndex - Palette color index.
     */
    drawPixel(pos: Vector2i, paletteIndex: number): void {
        this.drawPixelXY(pos.x, pos.y, paletteIndex);
    }

    /**
     * Fast-path pixel draw using raw integer coordinates.
     * Avoids Vector2i unpacking overhead when coordinates are already available as numbers.
     *
     * @param x - X position.
     * @param y - Y position.
     * @param paletteIndex - Palette color index.
     */
    drawPixelXY(x: number, y: number, paletteIndex: number): void {
        this.scene.usePrimitives().drawPixelXY(x, y, paletteIndex);
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
        this.scene.usePrimitives().drawLine(p0, p1, paletteIndex);
    }

    /**
     * Draws a rectangle outline using four 1-pixel quads.
     *
     * @param rect - Rectangle bounds.
     * @param paletteIndex - Palette color index.
     */
    drawRect(rect: Rect2i, paletteIndex: number): void {
        this.scene.usePrimitives().drawRect(rect, paletteIndex);
    }

    /**
     * Fills a rectangular region with a palette-indexed color.
     *
     * @param rect - Region to fill in pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    clearRect(rect: Rect2i, paletteIndex: number): void {
        this.scene.usePrimitives().clearRect(rect, paletteIndex);
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
        this.scene.useSprites().drawSprite(spriteSheet, srcRect, destPos, paletteOffset);
    }

    /**
     * Draws a flipped / quarter-turned sprite region (see {@link IRenderer.drawSpriteOriented}).
     *
     * @param spriteSheet - Source sprite sheet (must be indexized).
     * @param srcRect - Region to copy from the sprite sheet.
     * @param destPos - Screen position of the footprint's top-left corner.
     * @param paletteOffset - Palette index offset applied at draw time.
     * @param orientation - Orientation index from `resolveSpriteOrientation`.
     */
    drawSpriteOriented(
        spriteSheet: SpriteSheet,
        srcRect: Rect2i,
        destPos: Vector2i,
        paletteOffset: number,
        orientation: number,
    ): void {
        this.scene.useSprites().drawSpriteOriented(spriteSheet, srcRect, destPos, paletteOffset, orientation);
    }

    /**
     * Draws a stretched sprite region (see {@link IRenderer.drawSpriteStretched}).
     *
     * @param spriteSheet - Source sprite sheet (must be indexized).
     * @param srcRect - Region to copy from the sprite sheet.
     * @param destX - Box left edge.
     * @param destY - Box top edge.
     * @param destW - Box width.
     * @param destH - Box height.
     * @param paletteOffset - Palette index offset applied at draw time.
     * @param orientation - Orientation index from `resolveSpriteOrientation`.
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
        this.scene
            .useSprites()
            .drawSpriteStretched(spriteSheet, srcRect, destX, destY, destW, destH, paletteOffset, orientation);
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
        this.scene.useSprites().drawBitmapText(font, pos, text, paletteOffset);
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
        this.overlay.labels().drawBitmapText(font, pos, text, paletteOffset);
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
        this.overlay.topLabels().drawBitmapText(font, pos, text, paletteOffset);
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
     * Captures the next rendered frame at logical `displaySize`, resolved directly
     * from the palette-indexed scene texture and bypassing the drawing-buffer upscale
     * and any display-tier post-process effects. Backs the public
     * `BT.captureFrame({ size: 'display' })`; unlike {@link captureFrame}, this does not
     * match `outputSize` when `drawingBufferSize` is set. The capture happens on the next
     * `endFrame()` call. If a capture is already pending in this slot, the previous one is
     * rejected; the shortcut slot ({@link captureFrameForShortcut}) is unaffected.
     *
     * @returns Promise resolving to a PNG Blob of the rendered frame at `displaySize`.
     */
    captureFrameAtDisplaySize(): Promise<Blob> {
        return this.displayFrameCapture.request();
    }

    /**
     * Same capture as {@link captureFrameAtDisplaySize}, from the slot reserved for the
     * F9 / Shift+F9 dev-mode shortcuts.
     *
     * @returns Promise resolving to a PNG Blob of the rendered frame at `displaySize`.
     */
    captureFrameForShortcut(): Promise<Blob> {
        return this.shortcutFrameCapture.request();
    }

    /**
     * Sets the camera offset for scrolling.
     *
     * The offset is propagated to the demo-tier {@link SceneBatch} and the four
     * overlay pipelines.
     *
     * @param offset - Camera position in pixels.
     */
    setCameraOffset(offset: Vector2i): void {
        // Zero-alloc copy into the persistent scratch field - cloneTo() mutates
        // this.cameraOffset in place instead of allocating a new Vector2i, while still
        // keeping the stored offset independent of the caller's `offset` object.
        offset.cloneTo(this.cameraOffset);
        this.scene.setCameraOffset(this.cameraOffset);
        this.overlay.setCameraOffset(this.cameraOffset);
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
        // Zero in place - this.cameraOffset is a fixed persistent object, not reassignable
        // to the frozen Vector2i.zero() singleton (setCameraOffset()'s cloneTo() would then
        // try to mutate a frozen object on the next call).
        this.cameraOffset.set(0, 0);
        this.scene.setCameraOffset(this.cameraOffset);
        this.overlay.setCameraOffset(this.cameraOffset);
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
     * Rejects any pending display-size capture (public or shortcut slot). Called when
     * {@link resolvePass} is gone - during teardown / device-loss re-init, and from
     * {@link submitFrame} when a frame is submitted without it - so an awaited capture
     * fails with a clear message instead of hanging forever.
     *
     * @param message - Rejection message.
     */
    private rejectPendingDisplayCaptures(message: string): void {
        for (const capture of this.displayCaptureSlots) {
            if (capture.hasPending()) {
                capture.reject(new Error(message));
            }
        }
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

            this.scene.reset();
            this.overlay.reset();

            return null;
        }

        if (swapTexture.width === 0 || swapTexture.height === 0) {
            console.warn('[WebGPURenderer] Texture has zero dimensions, skipping frame');

            this.scene.reset();
            this.overlay.reset();

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
            // Zero slots past size (alpha 0, so the shader discards them) instead of leaving a larger old palette's colors.
            this.paletteStaging.fill(0);
            this.palette.toFloat32ArrayInto(this.paletteStaging);
            this.device.queue.writeBuffer(this.paletteBuffer, 0, this.paletteStaging);
            this.isPaletteDirty = false;
            this.palette.clearDirty();
        }
    }

    /**
     * Encodes the scene render pass into the supplied target view.
     *
     * Draw order: the demo tier ({@link SceneBatch}, primitives and sprites in call
     * order), then the overlay tiers ({@link OverlayPipelines}): bars ({@link drawBarFill}),
     * labels ({@link drawLabel}), top bars ({@link drawBarFillOnTop}), top labels
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

        this.scene.encode(renderPass);
        this.overlay.encode(renderPass);

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
     * @param deltaMs - Milliseconds of effect time since the previous frame.
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

        const isCapturingDisplaySize = this.encodeDisplayCaptures(encoder);

        this.device.queue.submit([encoder.finish()]);

        if (isCapturing) {
            void this.frameCapture.resolve(this.device);
        }

        if (isCapturingDisplaySize) {
            for (const capture of this.displayCaptureSlots) {
                if (capture.hasPending()) {
                    void capture.resolve(this.device);
                }
            }
        }

        // Defensive reset so the pipeline state is clean even if beginFrame() is not
        // called next. beginFrame() also resets; this prevents stale data from
        // persisting across frames.
        this.scene.reset();
        this.overlay.reset();
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
     * Records the display-size readback for every pending slot in
     * {@link displayCaptureSlots}: one resolve pass into the shared capture target, then
     * one texture-to-buffer copy per pending slot. Without {@link resolvePass} (teardown /
     * device-loss window) the pending captures are rejected instead of left hanging.
     *
     * @param encoder - Active command encoder.
     * @returns `true` when at least one display-size capture was recorded.
     */
    private encodeDisplayCaptures(encoder: GPUCommandEncoder): boolean {
        if (!this.displayCaptureSlots.some((capture) => capture.hasPending())) {
            return false;
        }

        if (!this.resolvePass) {
            this.rejectPendingDisplayCaptures("Can't capture frame: renderer resolve pass not initialized");

            return false;
        }

        const destView = this.requireDisplayCaptureTexView();

        this.resolvePass.encode(encoder, this.requireSceneTexView(), destView, this.displaySize);

        if (this.displayCaptureTex) {
            for (const capture of this.displayCaptureSlots) {
                if (capture.hasPending()) {
                    capture.executeInEncoder(this.device, this.displayCaptureTex, encoder);
                }
            }
        }

        return true;
    }

    /**
     * Lazily allocates the display-size (logical) RGBA capture target used by
     * {@link captureFrameAtDisplaySize} and returns its view.
     *
     * @returns Stable view of the display-size capture target.
     */
    private requireDisplayCaptureTexView(): GPUTextureView {
        if (!this.displayCaptureTexView) {
            if (!this.swapFormat) {
                throw new Error('WebGPURenderer.requireDisplayCaptureTexView: swap format not initialized.');
            }

            this.displayCaptureTex = this.device.createTexture({
                label: 'Renderer Display-Size Capture Target',
                size: { width: this.displaySize.x, height: this.displaySize.y, depthOrArrayLayers: 1 },
                format: this.swapFormat,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            });

            this.displayCaptureTexView = this.displayCaptureTex.createView();
        }

        return this.displayCaptureTexView;
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
