import { DEFAULT_CONTAINER_ID } from './BootstrapHelpers';
import type { Vector2i } from './Vector2i';

/** Default cap for on-screen canvas CSS size (demos layout uses these as max bounds). */
export const DEFAULT_MAX_CANVAS_SIZE = { x: 960, y: 720 } as const;

/** Inputs for {@link applyCanvasLayoutStyles}. */
export interface CanvasLayoutStyleOptions {
    /** Logical render resolution (used for aspect ratio when `drawingBufferSize` is omitted). */
    displaySize: Vector2i;
    /** Optional output / drawing-buffer size (drives aspect ratio when set). */
    drawingBufferSize?: Vector2i;
    /** Maximum on-screen canvas size in CSS pixels (letterboxing still applies below this). */
    maxCanvasSize: Vector2i;
}

/**
 * Resolves the layout root element for CSS custom property injection.
 *
 * @param canvas - The canvas element to check.
 * @returns The parent container when it carries the expected ID, otherwise the canvas itself.
 */
function resolveLayoutRoot(canvas: HTMLCanvasElement): HTMLElement {
    const parent = canvas.parentElement;

    if (parent?.id === DEFAULT_CONTAINER_ID) {
        return parent;
    }

    return canvas;
}

/**
 * Publishes CSS custom properties used by demo page layout to size the canvas.
 *
 * The demos `layout.html` reads `--canvas-aspect-w/h` for aspect ratio and
 * `--canvas-max-w/h` for the largest allowed display size.
 *
 * @param canvas - Target canvas element.
 * @param options - Layout fields mirroring relevant {@link HardwareSettings} members.
 */
export function applyCanvasLayoutStyles(canvas: HTMLCanvasElement, options: CanvasLayoutStyleOptions): void {
    const aspectSource = options.drawingBufferSize ?? options.displaySize;
    const layoutRoot = resolveLayoutRoot(canvas);

    layoutRoot.style.setProperty('--canvas-aspect-w', String(aspectSource.x));
    layoutRoot.style.setProperty('--canvas-aspect-h', String(aspectSource.y));
    const maxW = `${options.maxCanvasSize.x}px`;
    const maxH = `${options.maxCanvasSize.y}px`;

    layoutRoot.style.setProperty('--canvas-max-w', maxW);
    layoutRoot.style.setProperty('--canvas-max-h', maxH);
    canvas.style.setProperty('max-width', maxW, 'important');
    canvas.style.setProperty('max-height', maxH, 'important');

    // Width/height are sized by layout.html min(100dvw, 100dvh, …); only CSS variables are needed here.
    canvas.style.width = '';
    canvas.style.height = '';
}
