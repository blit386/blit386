/**
 * Shared browser plumbing for the demo capture scripts.
 *
 * `capture-demo-clip.mjs` (video) and `capture-og-image.mjs` (social cards) drive installed
 * Google Chrome the same way - open a demo in `?embed` mode, wait for the engine to finish
 * async WebGPU init, then read from the canvas - but produce completely different output. Only
 * that shared skeleton lives here; neither script's pipeline does.
 *
 * Each script launches its own browser, so a half-finished clip capture cannot leave page state
 * that a card capture inherits. The card script reuses the one browser it launched across every
 * demo in the run.
 */
import { chromium } from 'playwright-core';

// #region Configuration

export const CANVAS_ID = 'blit386-canvas';

// The browser's default canvas backing-store size, before the engine resizes it.
export const DEFAULT_CANVAS_WIDTH = 300;
export const DEFAULT_CANVAS_HEIGHT = 150;

// A stalled navigation or in-page script fails here instead of hanging the whole run.
const PAGE_TIMEOUT_MS = 60_000;

// The flags that give installed Chrome a real WebGPU adapter under Playwright. Headless Chrome
// otherwise comes up without `navigator.gpu`, and the engine silently falls back to software.
// Hand-kept in step with `launchOptions.args` on the `chromium-webgpu` project in
// packages/blit386/playwright.config.ts. A flag that is required for capture belongs there too,
// and the other way around.
const CHROME_WEBGPU_ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--disable-gpu-sandbox'];

// #endregion

// #region Helpers

/**
 * Sleep for a number of seconds.
 *
 * @param {number} seconds Duration in seconds.
 * @returns {Promise<void>}
 */
export function sleep(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * Build the canvas-only embed URL for a demo slug.
 *
 * @param {string} baseUrl Site origin, e.g. `https://demos.blit386.dev` (trailing slash optional).
 * @param {string} slug Demo slug.
 * @returns {string} `${baseUrl}/${slug}?embed`.
 */
export function buildEmbedUrl(baseUrl, slug) {
    return `${baseUrl.replace(/\/$/u, '')}/${slug}?embed`;
}

/**
 * Browser-side script that resolves once the engine has resized the canvas past the browser's
 * 300x150 default, returning the real drawing-buffer dimensions.
 *
 * Navigation only waits for page load, not engine init, so reading dimensions immediately is a
 * race: it can read the default instead of the demo's configured size, which silently turns a
 * downstream upscale into a downscale.
 *
 * @param {string} canvasId Canvas element id.
 * @param {number} timeoutMs How long to wait for the resize before giving up.
 * @param {boolean} [strict] Throw instead of returning the default size on timeout.
 * @returns {string} JavaScript source. Evaluates to `{ width, height }`.
 */
export function buildCanvasReadyScript(canvasId, timeoutMs, strict = false) {
    const onTimeout = strict
        ? `        throw new Error('Engine never resized the canvas past the ${DEFAULT_CANVAS_WIDTH}x${DEFAULT_CANVAS_HEIGHT} default.');`
        : '        // Fall through and report whatever the canvas currently is.';

    return `
(async () => {
    const canvas = document.getElementById('${canvasId}');
    if (!canvas) throw new Error('Canvas #${canvasId} not found.');

    const deadline = Date.now() + ${timeoutMs};
    while (canvas.width === ${DEFAULT_CANVAS_WIDTH} && canvas.height === ${DEFAULT_CANVAS_HEIGHT} && Date.now() < deadline) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    if (canvas.width === ${DEFAULT_CANVAS_WIDTH} && canvas.height === ${DEFAULT_CANVAS_HEIGHT}) {
${onTimeout}
    }

    return { width: canvas.width, height: canvas.height };
})();
`.trim();
}

/**
 * Browser-side script that throws unless renderer init has finished on the WebGPU backend.
 *
 * `initWebGPU` resizes the canvas and then acquires its context in the same turn, so a canvas
 * still at the browser's 300x150 default has not finished init. Calling `getContext('webgpu')`
 * before that would take the canvas itself. After a successful init the context is already
 * there. A software fallback has taken the canvas as 2D instead, and `getContext('webgpu')`
 * then returns null. There is no `window.BT` on a production page, so this is the check.
 *
 * @param {string} canvasId Canvas element id.
 * @returns {string} JavaScript source. Evaluates to undefined, or throws.
 */
export function buildWebGPUProbeScript(canvasId) {
    return `
(() => {
    const canvas = document.getElementById('${canvasId}');

    if (!canvas) throw new Error('Canvas #${canvasId} not found.');

    if (canvas.width === ${DEFAULT_CANVAS_WIDTH} && canvas.height === ${DEFAULT_CANVAS_HEIGHT}) {
        throw new Error(
            'Refusing to capture: #${canvasId} is still ${DEFAULT_CANVAS_WIDTH}x${DEFAULT_CANVAS_HEIGHT}, so renderer init has not finished.',
        );
    }

    if (!canvas.getContext('webgpu')) {
        throw new Error(
            'Refusing to capture: #${canvasId} has no WebGPU context, so the demo is on the software backend.',
        );
    }
})();
`.trim();
}

/**
 * Launch installed Google Chrome and a page for one capture script.
 *
 * Callers own the returned browser and close it when the run is done. Pass a viewport when
 * the capture is an element screenshot (the card script); omit it when the capture reads the
 * canvas drawing buffer directly (the clip script).
 *
 * @param {{ viewport?: { width: number, height: number }, deviceScaleFactor?: number }} [options]
 *   Viewport and device scale. Omit both to keep Playwright's defaults.
 * @returns {Promise<{ browser: import('playwright-core').Browser, page: import('playwright-core').Page }>}
 * @throws {Error} When Chrome cannot be launched. A failure while creating the page closes
 *   the browser before rethrowing, so a half-open process is not left behind.
 */
export async function launchCaptureBrowser(options = {}) {
    const browser = await chromium.launch({
        channel: 'chrome',
        args: CHROME_WEBGPU_ARGS,
    });

    try {
        /** @type {import('playwright-core').BrowserContextOptions} */
        const contextOptions = {};

        if (options.viewport) {
            contextOptions.viewport = options.viewport;
        }

        if (options.deviceScaleFactor !== undefined) {
            contextOptions.deviceScaleFactor = options.deviceScaleFactor;
        }

        const context = await browser.newContext(contextOptions);
        const page = await context.newPage();
        page.setDefaultTimeout(PAGE_TIMEOUT_MS);
        page.setDefaultNavigationTimeout(PAGE_TIMEOUT_MS);

        return { browser, page };
    } catch (error) {
        await browser.close();
        throw error;
    }
}

// #endregion
