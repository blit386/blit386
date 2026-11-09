import {
    renderDimensionAreaTooLargeError,
    renderDimensionGPULimitError,
    renderDimensionInvalidError,
    renderDimensionTooLargeError,
} from './errorMessages';
import type { Vector2i } from './Vector2i';

/** Maximum render dimension accepted on either axis before renderer allocation. */
export const MAX_RENDER_DIMENSION = 8192;

/** Maximum total pixels accepted for a render-sized buffer before renderer allocation. */
export const MAX_RENDER_PIXELS = 4096 * 4096;

/** Shared render allocation policy for logical, output, and canvas-layout dimensions. */
export const RENDER_DIMENSION_LIMITS = {
    maxWidth: MAX_RENDER_DIMENSION,
    maxHeight: MAX_RENDER_DIMENSION,
    maxPixels: MAX_RENDER_PIXELS,
} as const;

/** Hardware settings fields that carry render or canvas dimensions. */
export type RenderDimensionField = 'displaySize' | 'drawingBufferSize' | 'maxCanvasSize';

/** Which allocation-size check {@link checkSize} failed. */
export type SizeProblem = 'invalid' | 'too-large' | 'area';

/** Error type for render-dimension failures that must abort instead of falling back to another backend. */
export class RenderDimensionLimitError extends Error {
    /**
     * Creates a render-dimension limit error.
     *
     * @param message - User-facing validation message.
     */
    constructor(message: string) {
        super(message);
        this.name = 'RenderDimensionLimitError';
    }
}

/** Minimal settings shape needed for render-dimension validation. */
export interface RenderDimensionSettings {
    /** Logical render resolution in pixels. */
    displaySize: Vector2i;
    /** Optional output drawing-buffer size in pixels. */
    drawingBufferSize?: Vector2i;
    /** Optional maximum on-screen canvas CSS size in pixels. */
    maxCanvasSize?: Vector2i;
}

/**
 * Formats a render dimension for error messages.
 *
 * @param size - Size value to format.
 * @returns Size formatted as `WIDTHxHEIGHT`.
 */
function formatSize(size: Vector2i | undefined | null): string {
    if (size === undefined) {
        return 'missing';
    }

    if (size === null) {
        return 'null';
    }

    return `${size.x}x${size.y}`;
}

/**
 * Validates a single render dimension against integer and engine allocation limits.
 *
 * @param field - Hardware settings field being checked.
 * @param size - Size value to validate.
 * @returns A user-facing error message when invalid, otherwise `null`.
 */
export function validateDimension(field: RenderDimensionField, size: Vector2i | undefined | null): string | null {
    const problem = checkSize(size?.x ?? Number.NaN, size?.y ?? Number.NaN);

    if (problem === 'invalid') {
        return renderDimensionInvalidError(field, formatSize(size));
    }

    if (problem === 'too-large') {
        return renderDimensionTooLargeError(
            field,
            formatSize(size),
            RENDER_DIMENSION_LIMITS.maxWidth,
            RENDER_DIMENSION_LIMITS.maxHeight,
        );
    }

    if (problem === 'area') {
        return renderDimensionAreaTooLargeError(field, formatSize(size), RENDER_DIMENSION_LIMITS.maxPixels);
    }

    return null;
}

/**
 * Checks a width and height against the shared render and asset allocation limits
 * ({@link RENDER_DIMENSION_LIMITS}). Each caller maps the result to its own error text.
 *
 * @param width - Width in pixels.
 * @param height - Height in pixels.
 * @returns `'invalid'` for a non-integer or non-positive size, `'too-large'` past the per-axis
 *   limit, `'area'` past the pixel-count limit, or `null` when the size can be allocated.
 */
export function checkSize(width: number, height: number): SizeProblem | null {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        return 'invalid';
    }

    if (width > RENDER_DIMENSION_LIMITS.maxWidth || height > RENDER_DIMENSION_LIMITS.maxHeight) {
        return 'too-large';
    }

    // Both axes are at most 8192 here, so the product is an exact integer.
    if (width * height > RENDER_DIMENSION_LIMITS.maxPixels) {
        return 'area';
    }

    return null;
}

/**
 * Validates all render dimensions in hardware settings before renderer allocation.
 *
 * @param settings - Hardware settings returned by `configure()` or defaults.
 * @returns A user-facing error message when invalid, otherwise `null`.
 */
export function validateDimensions(settings: RenderDimensionSettings): string | null {
    const logicalError = validateDimension('displaySize', settings.displaySize);
    if (logicalError) {
        return logicalError;
    }

    if (settings.drawingBufferSize !== undefined) {
        const maxCanvasError = validateDimension('drawingBufferSize', settings.drawingBufferSize);
        if (maxCanvasError) {
            return maxCanvasError;
        }
    }

    if (settings.maxCanvasSize !== undefined) {
        const maxCanvasError = validateDimension('maxCanvasSize', settings.maxCanvasSize);
        if (maxCanvasError) {
            return maxCanvasError;
        }
    }

    return null;
}

/**
 * Validates a render texture size against the current WebGPU adapter/device limit.
 *
 * @param field - Hardware settings field being checked.
 * @param size - Requested texture or drawing-buffer size.
 * @param maxTextureDimension2D - WebGPU `maxTextureDimension2D`, when exposed.
 * @returns A user-facing error message when invalid, otherwise `null`.
 */
export function validateWebGPUTextureDimension(
    field: RenderDimensionField,
    size: Vector2i,
    maxTextureDimension2D: number | undefined,
): string | null {
    if (maxTextureDimension2D === undefined || !Number.isInteger(maxTextureDimension2D) || maxTextureDimension2D <= 0) {
        return null;
    }

    if (size.x > maxTextureDimension2D || size.y > maxTextureDimension2D) {
        return renderDimensionGPULimitError(field, formatSize(size), maxTextureDimension2D);
    }

    return null;
}
