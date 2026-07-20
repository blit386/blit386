/**
 * Bootstrap Utilities for BLIT386
 *
 * Provides a one-liner demo bootstrap that resolves the canvas, calls
 * {@link BTAPI.init}, and displays initialization errors on failure. Backend
 * selection and WebGPU fallback are handled inside BTAPI.
 */

import { BTAPI } from '../core/BTAPI';
import type { IBTDemo } from '../core/IBTDemo';
import { isHotActive } from '../hot/HotRuntime';
import { hotSwapDemo } from '../hot/HotSwap';
import type { ErrorContent } from './BootstrapHelpers';
import { DEFAULT_CANVAS_ID, DEFAULT_CONTAINER_ID, displayError, getCanvas } from './BootstrapHelpers';
import { CANVAS_NOT_FOUND_MESSAGE, INIT_FAILED_MESSAGE } from './errorMessages';

/**
 * Options for the bootstrap function.
 *
 * @since 0.2.0
 */
export interface BootstrapOptions {
    /**
     * Canvas element ID to use.
     * Default: 'blit386-canvas'
     */
    canvasID?: string;

    /**
     * @deprecated Deprecated since 2026-05-31. Use `canvasID` instead.
     */
    canvasId?: string;

    /**
     * Container element ID for error display.
     * Default: 'canvas-container'
     */
    containerID?: string;

    /**
     * @deprecated Deprecated since 2026-05-31. Use `containerID` instead.
     */
    containerId?: string;

    /** Custom callback on successful initialization. */
    onSuccess?: () => void;

    /** Custom callback on initialization error. */
    onError?: (error: Error) => void;

    /**
     * Whether to automatically handle DOM ready state.
     * Default: true
     */
    isWaitingForDOMReady?: boolean;

    /**
     * @deprecated Deprecated since 2026-05-31. Use `isWaitingForDOMReady` instead.
     */
    waitForDOMReady?: boolean;
}

/**
 * Constructor type for demo classes.
 */
export type DemoConstructor = new () => IBTDemo;

/**
 * Internal result type for bootstrap steps.
 */
interface Result {
    success: boolean;
    error?: Error;
}

/**
 * Waits for DOM to be ready if it's still loading.
 *
 * @returns Promise that resolves when DOM is ready.
 */
async function waitForDOM(): Promise<void> {
    if (document.readyState === 'loading') {
        await new Promise<void>((resolve) => {
            document.addEventListener('DOMContentLoaded', () => resolve());
        });
    }
}

/**
 * Handles a bootstrap error by displaying it and invoking the callback.
 *
 * @param title - Error title for display.
 * @param message - Error message for display.
 * @param error - The Error object.
 * @param containerID - Container ID for error display.
 * @param onError - Optional error callback.
 * @returns Result indicating failure.
 */
function handleError(
    title: string,
    message: ErrorContent,
    error: Error,
    containerID: string,
    onError?: (error: Error) => void,
): Result {
    displayError(title, message, containerID);
    onError?.(error);
    return { success: false, error };
}

/**
 * Validates the canvas element and returns it.
 *
 * @param canvasID - Canvas element ID.
 * @param containerID - Container ID for error display.
 * @param onError - Optional error callback.
 * @returns Canvas element or null with error handling.
 */
function validateCanvas(
    canvasID: string,
    containerID: string,
    onError?: (error: Error) => void,
): { canvas: HTMLCanvasElement | null; result: Result } {
    const canvas = getCanvas(canvasID);
    let result: Result;

    if (canvas) {
        result = { success: true };
    } else {
        result = handleError(
            'Canvas Error',
            CANVAS_NOT_FOUND_MESSAGE(canvasID),
            new Error(`Canvas element '${canvasID}' not found`),
            containerID,
            onError,
        );
    }

    return { canvas, result };
}

/**
 * Initializes the engine with the provided demo and canvas.
 *
 * @param DemoClass - Demo class constructor.
 * @param canvas - Canvas element.
 * @param containerID - Container ID for error display.
 * @param onSuccess - Optional success callback.
 * @param onError - Optional error callback.
 * @returns Result with success status.
 */
async function initDemo(
    DemoClass: DemoConstructor,
    canvas: HTMLCanvasElement,
    containerID: string,
    onSuccess?: () => void,
    onError?: (error: Error) => void,
): Promise<Result> {
    const demo = new DemoClass();

    if (typeof demo.update !== 'function' || typeof demo.render !== 'function') {
        return handleError(
            'Demo Setup Error',
            'Your Demo class is missing update() or render(). Add both methods so the engine knows what to run each frame.',
            new Error('Demo class is missing update() or render()'),
            containerID,
            onError,
        );
    }

    let initialized: boolean;
    let initError: Error | undefined;

    try {
        initialized = await BTAPI.instance.init(demo, canvas);
    } catch (err) {
        initError = err instanceof Error ? err : new Error(String(err));
        console.error('[BT] Engine initialization threw an unexpected error:', initError);
        initialized = false;
    }

    let result: Result;

    if (initialized) {
        console.log('[BT] Demo started successfully');

        onSuccess?.();

        result = { success: true };
    } else {
        const displayMessage: ErrorContent = initError
            ? { text: INIT_FAILED_MESSAGE, code: initError.message }
            : INIT_FAILED_MESSAGE;

        result = handleError(
            'Initialization Failed',
            displayMessage,
            initError ?? new Error('Engine initialization failed'),
            containerID,
            onError,
        );
    }

    return result;
}

/**
 * Routes an already-running engine's `bootstrap()` call to the hot-swap path, or logs a
 * double-bootstrap guard error when no hot-reload context is registered.
 *
 * @param DemoClass - Newly evaluated demo class constructor.
 * @returns The bootstrap result when the engine is already initialized (hot-swapped or
 *   guarded); `null` when a cold boot should proceed instead.
 */
async function routeIfAlreadyInitialized(DemoClass: DemoConstructor): Promise<boolean | null> {
    if (!BTAPI.instance.isInitialized()) {
        return null;
    }

    if (isHotActive()) {
        return hotSwapDemo(DemoClass);
    }

    console.error(
        '[BT] bootstrap() was called again while already initialized, with no hot-reload context ' +
            'registered. Reload the page instead of calling bootstrap() a second time.',
    );

    return false;
}

/**
 * One-liner bootstrap function for BLIT386 demos.
 * Handles canvas retrieval and engine initialization. Backend selection
 * (WebGPU or software fallback) is managed internally by BTAPI.
 *
 * This function provides a streamlined way to start a demo with sensible defaults
 * while allowing customization through options.
 *
 * @since 0.2.0
 * @changed 1.4.0 Calling `bootstrap()` again while already initialized now routes to a hot
 *   swap (via {@link registerHotReload}) when a Vite HMR context is registered, or logs a
 *   double-bootstrap guard and returns `false` otherwise - previously it silently started a
 *   second, unstoppable `GameLoop`.
 * @param DemoClass - Demo class constructor implementing `IBTDemo` (optional `configure()` for hardware settings).
 * @param options - Optional configuration for IDs and callbacks.
 * @returns `true` when the demo boots successfully; otherwise `false`.
 *
 * @example
 * // Simplest usage - uses default IDs.
 * bootstrap(MyDemo);
 *
 * @example
 * // With custom options.
 * bootstrap(MyDemo, {
 *     canvasID: 'custom-canvas',
 *     containerID: 'custom-container',
 *     onSuccess: () => console.log('Demo started!'),
 *     onError: (err) => analytics.trackError(err),
 * });
 *
 * @example
 * // Await the result.
 * const success = await bootstrap(MyDemo);
 * if (success) {
 *     console.log('Demo is running');
 * }
 */
export async function bootstrap(DemoClass: DemoConstructor, options: BootstrapOptions = {}): Promise<boolean> {
    // One microtask yield before anything else runs. Module top-level evaluation is
    // synchronous and this function is async, so the snippet's un-awaited
    // `registerHotReload(import.meta.hot)` call - which runs synchronously right after a
    // demo's own un-awaited `bootstrap(Game);` call, at the same module top level - always
    // completes before this function proceeds past this line, regardless of
    // `isWaitingForDOMReady`.
    await Promise.resolve();

    const routedResult = await routeIfAlreadyInitialized(DemoClass);

    if (routedResult !== null) {
        return routedResult;
    }

    const {
        canvasID: providedCanvasID,
        canvasId,
        containerID: providedContainerID,
        containerId,
        onSuccess,
        onError,
        isWaitingForDOMReady: providedIsWaitingForDOMReady,
        waitForDOMReady,
    } = options;
    const canvasID = providedCanvasID ?? canvasId ?? DEFAULT_CANVAS_ID;
    const containerID = providedContainerID ?? containerId ?? DEFAULT_CONTAINER_ID;
    const isWaitingForDOMReady = providedIsWaitingForDOMReady ?? waitForDOMReady ?? true;

    let success: boolean;

    // Wait for DOM if needed.
    if (isWaitingForDOMReady) {
        await waitForDOM();
    }

    try {
        const { canvas, result: canvasResult } = validateCanvas(canvasID, containerID, onError);

        success = canvasResult.success;

        if (success && canvas) {
            canvas.tabIndex = 0;

            try {
                canvas.focus({ preventScroll: true });
            } catch {
                canvas.focus();
            }

            const initResult = await initDemo(DemoClass, canvas, containerID, onSuccess, onError);

            success = initResult.success;
        }
    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        console.error('[BT] Bootstrap error:', error);

        handleError(
            'Unexpected Error',
            {
                text: 'An unexpected error occurred during initialization:',
                code: error.message,
            },
            error,
            containerID,
            onError,
        );

        success = false;
    }

    return success;
}
