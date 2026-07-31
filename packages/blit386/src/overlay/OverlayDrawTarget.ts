import type { BitmapFont } from '../assets/BitmapFont';
import type { IRenderer } from '../render/IRenderer';
import type { Rect2i } from '../utils/Rect2i';
import type { Vector2i } from '../utils/Vector2i';

/**
 * Internal draw port for the engine overlay HUD.
 *
 * Not part of the public {@link BT} API. {@link WebGPURenderer} and
 * {@link SoftwareRenderer} implement this alongside {@link IRenderer}.
 */
export interface OverlayDrawTarget {
    /**
     * Filled rectangles composited above demo sprites for the overlay.
     *
     * On WebGPU, batched in `overlayPrimitives` after the demo sprite pass.
     *
     * @param rect - Rectangle bounds in display coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawBarFill(rect: Rect2i, paletteIndex: number): void;

    /**
     * Filled rectangles composited above overlay labels (for example palette tooltips).
     *
     * On WebGPU, batched in `overlayTopPrimitives` after the overlay label pass.
     *
     * @param rect - Rectangle bounds in display coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawBarFillOnTop(rect: Rect2i, paletteIndex: number): void;

    /**
     * Bitmap text composited above overlay bar fills for the overlay.
     *
     * On WebGPU, batched in `overlaySprites` after overlay bar fills.
     *
     * @param font - Bitmap font with character glyphs (underlying sheet must be indexed via {@link SpriteSheet.isIndexed}).
     * @param pos - Text position (top-left corner).
     * @param text - String to render.
     * @param paletteOffset - Palette index offset applied to all glyphs (default 0).
     */
    drawLabel(font: BitmapFont, pos: Vector2i, text: string, paletteOffset?: number): void;

    /**
     * Bitmap text composited above {@link drawBarFillOnTop} fills.
     *
     * On WebGPU, batched in `overlayTopSprites` after `overlayTopPrimitives`.
     *
     * @param font - Bitmap font with character glyphs (underlying sheet must be indexed via {@link SpriteSheet.isIndexed}).
     * @param pos - Text position (top-left corner).
     * @param text - String to render.
     * @param paletteOffset - Palette index offset applied to all glyphs (default 0).
     */
    drawLabelOnTop(font: BitmapFont, pos: Vector2i, text: string, paletteOffset?: number): void;
}

/**
 * Renderer surface used by {@link Overlay.updateAndRender}.
 *
 * Combines screen-space camera helpers with overlay draw batches.
 */
export type OverlayRenderer = Pick<IRenderer, 'getCameraOffset' | 'resetCamera' | 'setCameraOffset'> &
    OverlayDrawTarget;
