import type { BitmapFont } from '../assets/BitmapFont';
import type { Palette } from '../assets/Palette';
import type { SpriteSheet } from '../assets/SpriteSheet';
import type { OverlayRendererDiagnostics } from '../overlay';
import type { Rect2i } from '../utils/Rect2i';
import type { Vector2i } from '../utils/Vector2i';
import type { Effect } from './effects/Effect';

/**
 * Backend-agnostic renderer contract.
 *
 * Any rendering backend (WebGPU, software Canvas 2D, headless test stub, etc.)
 * must satisfy this interface. {@link BTAPI} holds a reference to `IRenderer`
 * and never depends on the concrete implementation directly, allowing the engine
 * to swap backends at initialization time based on {@link HardwareSettings.backend}.
 *
 * Lifecycle:
 * 1. Call {@link IRenderer.init} once after construction.
 * 2. Per frame: {@link IRenderer.beginFrame} -> draw calls -> {@link IRenderer.endFrame}.
 * 3. Palette must be set via {@link IRenderer.setPalette} before the first {@link IRenderer.beginFrame}.
 */
export interface IRenderer {
    /**
     * Initializes GPU or canvas resources for rendering.
     *
     * @returns `true` when resources are ready; `false` on failure.
     */
    init(): Promise<boolean>;

    /**
     * Sets the active palette used for all color lookups this frame and beyond.
     *
     * @param palette - Palette to activate.
     */
    setPalette(palette: Palette): void;

    /**
     * Returns a snapshot of the active palette, or `null` if none has been set.
     *
     * @returns Clone of the active palette, or `null`.
     */
    getPalette(): Palette | null;

    /**
     * Begins a new frame. Resets per-frame draw batches.
     *
     * @throws Error if no palette has been set via {@link setPalette}.
     */
    beginFrame(): void;

    /**
     * Sets the background clear color for the current frame using a palette index.
     *
     * @param paletteIndex - Palette index for the clear color.
     */
    setClearColor(paletteIndex: number): void;

    /**
     * Ends the current frame and presents the result to the display.
     */
    endFrame(): void;

    /**
     * Returns aggregated per-frame renderer diagnostic counters for overlay internals.
     *
     * Call after demo and overlay draws complete and before {@link endFrame} resets
     * per-frame batch state.
     *
     * @returns Diagnostic counters for the current frame.
     */
    getFrameDiagnostics(): OverlayRendererDiagnostics;

    /**
     * Draws a filled rectangle.
     *
     * @param rect - Rectangle bounds.
     * @param paletteIndex - Palette color index.
     */
    drawRectFill(rect: Rect2i, paletteIndex: number): void;

    /**
     * Draws a single pixel.
     *
     * @param pos - Pixel position.
     * @param paletteIndex - Palette color index.
     */
    drawPixel(pos: Vector2i, paletteIndex: number): void;

    /**
     * Draws a line between two points.
     *
     * @param p0 - Start point.
     * @param p1 - End point.
     * @param paletteIndex - Palette color index.
     */
    drawLine(p0: Vector2i, p1: Vector2i, paletteIndex: number): void;

    /**
     * Draws a rectangle outline.
     *
     * @param rect - Rectangle bounds.
     * @param paletteIndex - Palette color index.
     */
    drawRect(rect: Rect2i, paletteIndex: number): void;

    /**
     * Fills a rectangular region with a palette-indexed color.
     *
     * @param rect - Region to fill.
     * @param paletteIndex - Palette color index.
     */
    clearRect(rect: Rect2i, paletteIndex: number): void;

    /**
     * Draws a sprite region from an indexed sprite sheet.
     *
     * @param spriteSheet - Source sprite sheet (must be indexized).
     * @param srcRect - Region to copy from the sprite sheet.
     * @param destPos - Screen position to draw at.
     * @param paletteOffset - Palette index offset applied at draw time (default 0).
     */
    drawSprite(spriteSheet: SpriteSheet, srcRect: Rect2i, destPos: Vector2i, paletteOffset?: number): void;

    /**
     * Draws text using a bitmap font.
     *
     * @param font - Bitmap font with character glyphs (underlying sheet must be indexized).
     * @param pos - Text position (top-left corner).
     * @param text - String to render.
     * @param paletteOffset - Palette index offset applied to all glyphs (default 0).
     */
    drawBitmapText(font: BitmapFont, pos: Vector2i, text: string, paletteOffset?: number): void;

    /**
     * Captures the next rendered frame as a PNG blob. A second call while a
     * capture is pending rejects the prior pending promise.
     *
     * @returns Promise resolving to a PNG Blob after the next {@link IRenderer.endFrame}.
     */
    captureFrame(): Promise<Blob>;

    /**
     * Sets the camera offset for scrolling.
     *
     * @param offset - Camera position in pixels.
     */
    setCameraOffset(offset: Vector2i): void;

    /**
     * Gets the current camera offset.
     *
     * @returns Copy of the current camera position.
     */
    getCameraOffset(): Vector2i;

    /**
     * Resets the camera offset to the origin (0, 0).
     */
    resetCamera(): void;

    /**
     * Appends a fullscreen post-processing effect.
     *
     * Backends that do not support shader effects must throw with a clear message.
     *
     * @param effect - Effect instance to append.
     */
    addEffect(effect: Effect): void;

    /**
     * Removes a previously registered post-processing effect.
     *
     * @param effect - Effect instance to remove.
     */
    removeEffect(effect: Effect): void;

    /**
     * Removes every registered post-processing effect.
     */
    clearEffects(): void;
}
