import { WEBGPU_ADAPTER_MESSAGE, WEBGPU_DEVICE_MESSAGE, webgpuDeviceLostError } from '../utils/errorMessages';
import { RenderDimensionLimitError, validateWebGPUTextureDimension } from '../utils/RenderLimits';
import type { Vector2i } from '../utils/Vector2i';

/**
 * Result returned when WebGPU canvas initialization succeeds.
 */
export interface Result {
    /** Initialized WebGPU device. */
    device: GPUDevice;

    /** Configured WebGPU canvas context. */
    context: GPUCanvasContext;

    /** WebGPU drawing-buffer size in pixels (`configuredDrawingBufferSize ?? displaySize`). */
    drawingBufferSize: Vector2i;
}

/**
 * Initializes the WebGPU adapter, device, and canvas context for a canvas.
 *
 * Sets only the canvas backing store (`canvas.width` / `canvas.height`) to
 * `configuredDrawingBufferSize` when provided, otherwise to `displaySize`. This
 * routine does not change the canvas on-screen CSS size; {@link applyCanvasLayoutStyles}
 * publishes layout custom properties from `displaySize`, optional `drawingBufferSize`,
 * and `maxCanvasSize` before init, and demo page CSS scales the canvas within that cap.
 *
 * When `configuredDrawingBufferSize` is omitted, the drawing buffer matches
 * `displaySize` (no upscaling, no display-tier effects).
 *
 * A device lost later (anything but the engine's own `destroy()`) logs one console error; recovery is not attempted.
 *
 * @param canvas - HTML canvas element to configure for WebGPU rendering.
 * @param displaySize - Internal render resolution in pixels (`HardwareSettings.displaySize`).
 * @param configuredDrawingBufferSize - Optional drawing-buffer size from `configure()`
 *        (`HardwareSettings.drawingBufferSize`); when set, may exceed `displaySize` for
 *        display-tier post-processing (CRT scanlines, barrel distortion, etc.).
 * @returns Initialized device, context, and drawing-buffer size, or null when WebGPU
 *          is absent or the canvas context could not be obtained.
 * @throws Error with a user-friendly message when the adapter or device cannot be
 *         created (hardware acceleration disabled, drivers too old, resource exhaustion).
 */
export async function initWebGPU(
    canvas: HTMLCanvasElement,
    displaySize: Vector2i,
    configuredDrawingBufferSize?: Vector2i,
): Promise<Result | null> {
    if (!navigator.gpu) {
        console.error("[BT] WebGPU isn't supported in this browser.");
        console.error('[BT] Please use Chrome/Edge 113+ or Firefox Nightly with WebGPU enabled.');
        console.error('[BT] See: https://caniuse.com/webgpu');

        return null;
    }

    // Request adapter.
    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
        console.error('[BT] Failed to get WebGPU adapter.');
        console.error('[BT] This could mean:');
        console.error('[BT]   1. The GPU/drivers are too old');
        console.error('[BT]   2. WebGPU is disabled in browser settings');
        console.error('[BT]   3. Running in an incompatible environment (VM, remote desktop, etc.)');
        console.error('[BT] Browser:', navigator.userAgent);

        throw new Error(WEBGPU_ADAPTER_MESSAGE);
    }

    // Drawing buffer = configured size when provided, else logical size.
    const drawingBufferSize = configuredDrawingBufferSize ?? displaySize;
    const adapterLimit = adapter.limits?.maxTextureDimension2D;
    const adapterLogicalError = validateWebGPUTextureDimension('displaySize', displaySize, adapterLimit);
    const adapterOutputError =
        configuredDrawingBufferSize === undefined
            ? null
            : validateWebGPUTextureDimension('drawingBufferSize', drawingBufferSize, adapterLimit);
    const adapterDimensionError = adapterLogicalError ?? adapterOutputError;

    if (adapterDimensionError) {
        console.error(`[BT] ${adapterDimensionError}`);

        throw new RenderDimensionLimitError(adapterDimensionError);
    }

    // Request device.
    let device: GPUDevice;

    try {
        device = await adapter.requestDevice();
    } catch (err) {
        console.error('[BT] Failed to get WebGPU device:', err);

        throw new Error(WEBGPU_DEVICE_MESSAGE, { cause: err });
    }

    // Attached before any early destroy below, so every device the engine creates is watched.
    void device.lost.then(reportDeviceLoss);

    const deviceLimit = device.limits?.maxTextureDimension2D;
    const deviceLogicalError = validateWebGPUTextureDimension('displaySize', displaySize, deviceLimit);
    const deviceOutputError =
        configuredDrawingBufferSize === undefined
            ? null
            : validateWebGPUTextureDimension('drawingBufferSize', drawingBufferSize, deviceLimit);
    const deviceDimensionError = deviceLogicalError ?? deviceOutputError;

    if (deviceDimensionError) {
        console.error(`[BT] ${deviceDimensionError}`);

        device.destroy();

        throw new RenderDimensionLimitError(deviceDimensionError);
    }

    // Set canvas resolution BEFORE getting the WebGPU context so getCurrentTexture()
    // returns valid textures.
    canvas.width = drawingBufferSize.x;
    canvas.height = drawingBufferSize.y;

    // Log when an explicit drawing buffer was configured (on-screen sizing is handled by applyCanvasLayoutStyles).
    if (configuredDrawingBufferSize) {
        console.log(
            `[BT] Canvas drawing buffer: ${drawingBufferSize.x}x${drawingBufferSize.y} ` +
                `(logical render: ${displaySize.x}x${displaySize.y})`,
        );
    }

    const context = canvas.getContext('webgpu') as GPUCanvasContext;

    if (!context) {
        console.error('[BT] Failed to get WebGPU context');

        device.destroy();

        return null;
    }

    configureContext(context, device);

    console.log('[BT] WebGPU initialized successfully');

    return { device, context, drawingBufferSize: drawingBufferSize.clone() };
}

/**
 * Logs a lost device. Silent for `'destroyed'`, the engine's own teardown (a restart or a failed init).
 *
 * @param info - What the browser reported when the device's `lost` promise settled.
 */
function reportDeviceLoss(info: GPUDeviceLostInfo): void {
    if (info.reason !== 'destroyed') {
        console.error(`[BT] ${webgpuDeviceLostError(info.message)}`);
    }
}

/**
 * Configures the canvas context for the device. On a throw the device is destroyed first, because the caller never
 * receives it and nothing else could free it.
 *
 * @param context - The canvas WebGPU context to configure.
 * @param device - The device the context renders with.
 */
function configureContext(context: GPUCanvasContext, device: GPUDevice): void {
    try {
        const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

        context.configure({
            device,
            format: canvasFormat,
            alphaMode: 'premultiplied',

            // COPY_SRC is required alongside the default RENDER_ATTACHMENT so FrameCapture can
            // copy the swap-chain texture straight to a staging buffer (see WebGPURenderer.submitFrame).
            // Without it, copyTextureToBuffer on the current texture is a WebGPU validation error;
            // implementations that drop the invalid copy leave the staging buffer zero-filled,
            // which BT.captureFrame/downloadFrame then encodes as a fully transparent PNG.
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
    } catch (err) {
        device.destroy();

        throw err;
    }
}
