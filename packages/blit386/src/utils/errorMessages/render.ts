/**
 * Renderer, WebGPU, overlay, render-size and `BT.renderAt` messages.
 */

/**
 * Friendly message for a WebGPU adapter failure.
 *
 * Shown when `requestAdapter()` resolves to null (hardware acceleration
 * disabled, drivers too old, or running in a VM / remote desktop).
 */
export const WEBGPU_ADAPTER_MESSAGE =
    "Your computer's graphics card couldn't start WebGPU. Try updating your browser, or check that hardware acceleration is enabled.";

/**
 * Friendly message for a WebGPU device failure.
 *
 * Shown when `requestDevice()` rejects (GPU resource exhaustion or a
 * transient driver error).
 */
export const WEBGPU_DEVICE_MESSAGE =
    "Couldn't connect to the graphics card. Try closing other tabs or restarting the browser.";

/**
 * Friendly message for the overlay setup path when the rendering backend is unavailable.
 *
 * Shown when overlay initialization runs before a backend has been selected.
 */
export const OVERLAY_NO_BACKEND_MESSAGE =
    "Couldn't start the overlay because the rendering backend isn't ready yet. Try initializing the engine before creating the overlay.";

/**
 * Returns the error message for a render dimension that is not a positive whole-number pixel size.
 *
 * @param field - Hardware settings field that contains the invalid size.
 * @param size - Invalid size formatted as `WIDTHxHEIGHT`.
 * @returns User-facing error string.
 */
export function renderDimensionInvalidError(field: string, size: string): string {
    return (
        `${field} must use whole-number pixel dimensions greater than 0 (got ${size}). ` +
        'Update configure() to return a positive integer width and height'
    );
}

/**
 * Returns the error message for a render dimension whose width or height exceeds engine limits.
 *
 * @param field - Hardware settings field that contains the invalid size.
 * @param size - Invalid size formatted as `WIDTHxHEIGHT`.
 * @param maxWidth - Maximum accepted width in pixels.
 * @param maxHeight - Maximum accepted height in pixels.
 * @returns User-facing error string.
 */
export function renderDimensionTooLargeError(field: string, size: string, maxWidth: number, maxHeight: number): string {
    return (
        `${field} is too large (got ${size}). ` + `Use a size no larger than ${maxWidth}x${maxHeight} in configure()`
    );
}

/**
 * Returns the error message for a render dimension whose total pixel area exceeds engine limits.
 *
 * @param field - Hardware settings field that contains the invalid size.
 * @param size - Invalid size formatted as `WIDTHxHEIGHT`.
 * @param maxPixels - Maximum accepted total pixels.
 * @returns User-facing error string.
 */
export function renderDimensionAreaTooLargeError(field: string, size: string, maxPixels: number): string {
    return `${field} uses too many pixels (got ${size}). Use a size with ${maxPixels.toLocaleString('en-US')} total pixels or fewer`;
}

/**
 * Returns the error message for a render dimension that exceeds the active WebGPU texture limit.
 *
 * @param field - Hardware settings field that contains the invalid size.
 * @param size - Invalid size formatted as `WIDTHxHEIGHT`.
 * @param maxTextureDimension2D - WebGPU adapter/device texture dimension limit.
 * @returns User-facing error string.
 */
export function renderDimensionGPULimitError(field: string, size: string, maxTextureDimension2D: number): string {
    return (
        `${field} is too large for this graphics card (got ${size}). ` +
        `Use a width and height of ${maxTextureDimension2D} pixels or fewer`
    );
}

/**
 * `BT.renderAt()` called before the game loop exists - before init() finished, or while the splash is up.
 */
export const RENDER_AT_NOT_READY_MESSAGE =
    "Can't seek with BT.renderAt() because the game loop hasn't started yet. Call it after init() has finished and the splash is gone";

/** `BT.renderAt()` re-ran the game's init() for a `from: 'start'` seek and it failed. */
export const RENDER_AT_INIT_FAILED_MESSAGE =
    "BT.renderAt() re-ran your game's init() to start the seek from the beginning, and init() failed. A class game keeps its previous state and BT.resume() continues it (an object-literal game keeps any fields init() wrote before it failed), but palette and post-process effects the seek cleared are gone. Check the console for the init() error";

/** `BT.renderAt()` built a fresh game instance for a `from: 'start'` seek and its constructor threw. */
export const RENDER_AT_CONSTRUCT_FAILED_MESSAGE =
    'BT.renderAt() builds a fresh copy of your game class to start the seek from the beginning, and its constructor threw. Nothing was reset, so your game is as it was. Check the console for the constructor error';

/**
 * `BT.renderAt()` got a time that is not a finite, non-negative number of seconds, or one too large
 * to count in ticks.
 *
 * @param seconds - The value passed.
 * @returns Tier 1 error message.
 */
export function renderAtSecondsError(seconds: unknown): string {
    return `BT.renderAt() needs a time in seconds that is zero or more (and small enough to count in ticks). Got: ${String(seconds)}`;
}

/**
 * `BT.renderAt()` got a second argument that is not an options object (for example a bare `'current'`).
 *
 * @param options - The value passed.
 * @returns Tier 1 error message.
 */
export function renderAtOptionsError(options: unknown): string {
    return `BT.renderAt() takes its options as an object, like { from: 'current' }. Got: ${String(options)}`;
}

/**
 * `BT.renderAt()` got an unknown `from` option.
 *
 * @param from - The value passed.
 * @returns Tier 1 error message.
 */
export function renderAtFromError(from: unknown): string {
    return `BT.renderAt() option 'from' must be 'start' or 'current'. Got: ${String(from)}`;
}

/**
 * `BT.renderAt(..., { from: 'current' })` asked for a tick that already passed.
 *
 * @param targetTicks - Tick the seek asked for.
 * @param currentTicks - Tick the game is on.
 * @returns Tier 1 error message.
 */
export function renderAtPastError(targetTicks: number, currentTicks: number): string {
    return (
        `BT.renderAt() can't seek backwards with from: 'current' (asked for tick ${targetTicks}, the game is on tick ${currentTicks}). ` +
        "Use from: 'start' to replay from the beginning"
    );
}
