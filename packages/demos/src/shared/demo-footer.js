/**
 * Shared footer for Blit-Tech demos.
 *
 * Draws a two-line HUD strip at the bottom of the screen:
 *   - left: measured FPS and configured target FPS
 *   - right: demo name derived from the page title
 *
 * Usage in a demo's render():
 *   import { createDemoFooter } from './shared/demo-footer.js';
 *   const footer = createDemoFooter({ leftColor: C_DIM, rightColor: C_WHITE });
 *   footer.draw();
 */

import { BT, defaultConfig, Vector2i } from 'blit-tech';

// #region Constants

// Engine default when configure() is omitted or BT.targetFPS is not yet valid.
const DEFAULT_TARGET_FPS = defaultConfig().targetFPS;

// How strongly each new frame-time sample affects the smoothed FPS (0..1).
// Lower = smoother but slower to react; higher = snappier but jittery.
const FOOTER_FPS_SMOOTHING = 0.12;

// Horizontal inset from the left/right screen edges for footer text.
const FOOTER_EDGE_MARGIN_PX = 5;

// One pixel gap between the footer text baseline and the bottom of the display.
const FOOTER_BOTTOM_GAP_PX = 1;

// performance.now() returns milliseconds; divide by this to get seconds.
const MS_PER_SECOND = 1000;

// Matches titles from plugins/demo-registry.js: "Blit-Tech Demo 006 - Patterns".
const REGISTRY_TITLE_PATTERN = /^Blit-Tech Demo\s+.+?\s+-\s+(.+)$/;

// #endregion

// #region Engine Helpers

/**
 * @returns {number} Configured target FPS from the running demo, or the engine default.
 */
function resolveTargetFps() {
    const fps = BT.targetFPS;

    return Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_TARGET_FPS;
}

/** @type {number} */
let cachedSystemLineHeight = 0;

/**
 * Height of one systemPrint line in pixels, measured from the active engine font.
 *
 * @returns {number}
 */
function resolveSystemLineHeight() {
    if (cachedSystemLineHeight > 0) {
        return cachedSystemLineHeight;
    }

    const measured = BT.systemPrintMeasure('A').y;

    if (measured > 0) {
        cachedSystemLineHeight = measured;
    }

    return cachedSystemLineHeight;
}

// #endregion

// #region Title Resolution

/**
 * Turn the browser page title into a short footer label.
 * Registry titles look like "Blit-Tech Demo 006 - Patterns"; we show
 * "Blit-Tech - Patterns Demo" so the footer matches older demo style.
 *
 * @param {string | undefined} pageTitle - document.title when available
 * @returns {string}
 */
function resolveDemoLabel(pageTitle) {
    const raw = typeof pageTitle === 'string' ? pageTitle.trim() : '';

    if (raw.length === 0) {
        return 'Blit-Tech Demo';
    }

    const match = raw.match(REGISTRY_TITLE_PATTERN);

    if (match) {
        return `Blit-Tech - ${match[1]} Demo`;
    }

    return raw;
}

// #endregion

// #region FPS Sampler

/**
 * Tracks render-frame timing and exposes a smoothed measured FPS.
 */
class FpsSampler {
    /** @type {number | null} */
    #lastSampleMs = null;

    /** @type {number | null} */
    #smoothedFps = null;

    /**
     * Call once per frame (from footer draw) to ingest the latest frame delta.
     */
    sample() {
        const now = performance.now();

        if (this.#lastSampleMs === null) {
            this.#lastSampleMs = now;
            this.#smoothedFps = resolveTargetFps();
            return;
        }

        const deltaSeconds = (now - this.#lastSampleMs) / MS_PER_SECOND;
        this.#lastSampleMs = now;

        if (deltaSeconds <= 0) {
            return;
        }

        if (this.#smoothedFps === null) {
            this.#smoothedFps = resolveTargetFps();
        }

        const instantFps = 1 / deltaSeconds;
        this.#smoothedFps += (instantFps - this.#smoothedFps) * FOOTER_FPS_SMOOTHING;
    }

    /**
     * @returns {number} Smoothed frames-per-second from recent render calls.
     */
    get measuredFps() {
        return this.#smoothedFps ?? resolveTargetFps();
    }
}

// #endregion

// #region Public API

/**
 * @typedef {Object} DemoFooterOptions
 * @property {number} leftColor - Palette index for the FPS line (left).
 * @property {number} rightColor - Palette index for the demo name (right).
 * @property {number} [marginX] - Horizontal inset from screen edges in pixels.
 * @property {number} [baselineY] - Y position for both footer strings; defaults to one system font line above the bottom edge.
 */

/**
 * Create a footer helper that demos call from render() each frame.
 *
 * @param {DemoFooterOptions} options
 * @returns {{ draw: () => void }}
 */
export function createDemoFooter(options) {
    const { leftColor, rightColor, marginX = FOOTER_EDGE_MARGIN_PX, baselineY } = options;

    const fps = new FpsSampler();
    const demoLabel = resolveDemoLabel(typeof document !== 'undefined' ? document.title : undefined);

    return {
        draw() {
            fps.sample();

            const w = BT.displaySize.x;
            const h = BT.displaySize.y;
            const lineHeight = resolveSystemLineHeight();
            const y = baselineY ?? h - lineHeight - FOOTER_BOTTOM_GAP_PX;

            const measured = Math.round(fps.measuredFps);
            const target = resolveTargetFps();
            const fpsText = `FPS: ${measured} | Target: ${target}`;

            BT.systemPrint(new Vector2i(marginX, y), leftColor, fpsText);

            const titleWidth = BT.systemPrintMeasure(demoLabel).x;
            BT.systemPrint(new Vector2i(w - titleWidth - marginX, y), rightColor, demoLabel);
        },
    };
}

// #endregion
