/**
 * Engine boot steps that pick and build the renderer: reading and validating the game's hardware settings
 * (with the `?backend=` URL override) and constructing the WebGPU or software renderer. Part of {@link BTAPI};
 * not part of the BT API.
 */

import { findOverlaySettingsError } from '../../overlay';
import { SoftwareRenderer } from '../../render/SoftwareRenderer';
import { WebGPURenderer } from '../../render/WebGPURenderer';
import { applyCanvasLayoutStyles, DEFAULT_MAX_CANVAS_SIZE } from '../../utils/CanvasLayoutStyles';
import * as errorMessages from '../../utils/errorMessages';
import { RenderDimensionLimitError, validateDimensions } from '../../utils/RenderLimits';
import { Vector2i } from '../../utils/Vector2i';
import type { BTAPI } from '../BTAPI';
import type { Backend, HardwareSettings, IBTDemo } from '../IBTDemo';
import { defaultConfig, MAX_AUDIO_VOICES, mergeHardwareSettings } from '../mergeHardwareSettings';
import { initWebGPU } from '../WebGPUContext';

/** Reads hardware settings and builds the renderer for {@link BTAPI.init}. */
export class RendererSetup {
    /**
     * Creates the part for one engine.
     *
     * @param engine - The engine this part belongs to.
     */
    public constructor(private readonly engine: BTAPI) {}

    /**
     * Reads and validates demo `configure()` output into resolved hardware settings.
     *
     * @param demo - Demo implementing {@link IBTDemo}.
     * @returns `false` when hardware settings are invalid (bad dimensions, targetFPS, audioVoices, or overlay numbers).
     */
    public loadHardwareSettings(demo: IBTDemo): boolean {
        try {
            this.engine.hwSettings = mergeHardwareSettings(demo.configure?.());
        } catch (error) {
            console.error('[BT] demo.configure() threw; falling back to defaultConfig()', error);

            this.engine.hwSettings = defaultConfig();
        }

        this.applyBackendQueryOverride();

        const renderDimensionError = validateDimensions(this.engine.hwSettings);

        if (renderDimensionError) {
            console.error(`[BT] ${renderDimensionError}`);

            return false;
        }

        const { targetFPS } = this.engine.hwSettings;

        if (!Number.isFinite(targetFPS) || targetFPS <= 0) {
            console.error(`[BT] Invalid targetFPS: ${targetFPS}. Must be a finite number > 0.`);

            return false;
        }

        const { audioVoices } = this.engine.hwSettings;

        if (
            audioVoices !== undefined &&
            (!Number.isInteger(audioVoices) || audioVoices < 1 || audioVoices > MAX_AUDIO_VOICES)
        ) {
            console.error(`[BT] ${errorMessages.audioVoicesRangeError(audioVoices, MAX_AUDIO_VOICES)}`);

            return false;
        }

        const overlaySettingsError = findOverlaySettingsError(this.engine.hwSettings);

        if (overlaySettingsError) {
            console.error(`[BT] ${overlaySettingsError}`);

            return false;
        }

        return true;
    }

    /**
     * Constructs and initializes the renderer for the active hardware settings.
     *
     * Logs the selected backend name, constructs the matching {@link IRenderer},
     * calls {@link IRenderer.init}, and reports success or failure.
     *
     * @param canvas - Render target canvas.
     * @param hw - Active hardware settings.
     * @returns `true` when the renderer is ready; `false` on failure.
     */
    public async initRenderer(canvas: HTMLCanvasElement, hw: HardwareSettings): Promise<boolean> {
        applyCanvasLayoutStyles(canvas, {
            displaySize: hw.displaySize,
            maxCanvasSize: hw.maxCanvasSize ?? new Vector2i(DEFAULT_MAX_CANVAS_SIZE.x, DEFAULT_MAX_CANVAS_SIZE.y),
            ...(hw.drawingBufferSize === undefined ? {} : { drawingBufferSize: hw.drawingBufferSize }),
        });

        const requestedBackend = hw.backend ?? 'webgpu';

        if (requestedBackend !== 'software') {
            // Try WebGPU. initWebGPU returns null when navigator.gpu is absent and
            // throws when the adapter or device cannot be created. Both cases fall
            // through to the software renderer below.
            let webGPUResult: Awaited<ReturnType<typeof initWebGPU>> = null;

            try {
                webGPUResult = await initWebGPU(canvas, hw.displaySize, hw.drawingBufferSize);
            } catch (error) {
                if (error instanceof RenderDimensionLimitError) {
                    return false;
                }

                // Adapter/device unavailable; fall through to software.
            }

            if (webGPUResult) {
                this.engine.device = webGPUResult.device;
                this.engine.context = webGPUResult.context;

                console.log('[BT] Initializing renderer (backend: webgpu)');

                this.engine.renderer = new WebGPURenderer(
                    webGPUResult.device,
                    webGPUResult.context,
                    hw.displaySize,

                    // Only forward an explicit outputSize when drawingBufferSize was
                    // provided; that is the signal that unlocks the display tier.
                    hw.drawingBufferSize === undefined ? undefined : webGPUResult.drawingBufferSize,
                    hw.outputUpscaleFilter ?? 'nearest',
                    hw.isOverlayEnabled !== false,
                );

                if (!(await this.engine.renderer.init())) {
                    console.error('[BT] Failed to initialize renderer');

                    return false;
                }

                this.engine.activeBackend = 'webgpu';
                console.log('[BT] Renderer initialized');

                return true;
            }

            console.warn('[BT] WebGPU unavailable, falling back to software renderer');
        }

        // Software renderer path: explicit selection or automatic fallback.
        this.engine.device = null;
        this.engine.context = null;

        console.log('[BT] Initializing renderer (backend: software)');

        this.engine.renderer = new SoftwareRenderer(canvas, hw.displaySize, hw.drawingBufferSize);

        if (!(await this.engine.renderer.init())) {
            console.error('[BT] Failed to initialize renderer');

            return false;
        }

        this.engine.activeBackend = 'software';
        console.log('[BT] Renderer initialized');

        return true;
    }

    /**
     * Applies URL backend override from `?backend=...` when present.
     *
     * Supported values:
     * - `software`
     *
     * Unknown values are ignored so accidental query typos do not break startup.
     */
    private applyBackendQueryOverride(): void {
        if (!this.engine.hwSettings) {
            return;
        }

        const override = getBackendQueryOverride();

        if (!override) {
            return;
        }

        this.engine.hwSettings.backend = override;

        console.info(`[BT] URL override selected backend: ${override}`);
    }
}

/**
 * Reads backend override from the current URL query string.
 *
 * Also called by the hot-swap runtime ({@link tryHardReload} in `src/hot/HotSwap.ts`) so a
 * hot-swap candidate's resolved settings can be normalized the same way `init()` normalizes
 * the running settings, before the two are diffed for a Tier 3 hard reload.
 *
 * @returns Supported backend override, or null when absent/invalid.
 */
export function getBackendQueryOverride(): Backend | null {
    const search = typeof globalThis.location?.search === 'string' ? globalThis.location.search : '';

    if (!search) {
        return null;
    }

    try {
        const backend = new URLSearchParams(search).get('backend');

        if (backend === 'software') {
            return 'software';
        }
    } catch (error) {
        console.warn('[BT] Failed to parse backend query override:', error);
    }

    return null;
}
