/**
 * Shared agent-browser plumbing for the demo capture scripts.
 *
 * `capture-demo-clip.mjs` (video) and `capture-og-image.mjs` (social cards) drive the same
 * browser the same way – open a demo in `?embed` mode, wait for the engine to finish async
 * WebGPU init, then read from the canvas – but produce completely different output. Only that
 * shared skeleton lives here; neither script's pipeline does.
 *
 * The session name is a parameter rather than a constant so the two scripts never share a
 * browser session: a half-finished clip capture must not leave state a card capture inherits.
 */
import { spawnSync } from 'node:child_process';

// #region Configuration

export const CANVAS_ID = 'blit386-canvas';

// Well above the largest expected agent-browser JSON envelope, and a generous per-call ceiling
// so a stalled agent-browser process fails loudly instead of hanging the whole run.
export const AGENT_BROWSER_MAX_BUFFER = 10 * 1024 * 1024;
export const AGENT_BROWSER_TIMEOUT_MS = 60_000;

// The browser's default canvas backing-store size, before the engine resizes it.
export const DEFAULT_CANVAS_WIDTH = 300;
export const DEFAULT_CANVAS_HEIGHT = 150;

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
 * `open` only waits for page load, not engine init, so reading dimensions immediately is a
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
 * Run one agent-browser command and unwrap its JSON envelope.
 *
 * @param {string} session Session name, so concurrent capture scripts stay isolated.
 * @param {string[]} args Command arguments, after `--session <session>`.
 * @param {{ stdin?: string, quiet?: boolean }} [options] Optional stdin payload and log control.
 * @returns {unknown} The envelope's `data.result`, or `data` when there is no `result`.
 * @throws {Error} When the process fails to start, exits non-zero, returns non-JSON, or
 *   reports `success: false`.
 */
export function runAgentBrowser(session, args, options = {}) {
    const fullArgs = ['--session', session, ...args];

    if (!options.quiet) {
        console.log(`\n$ agent-browser ${fullArgs.join(' ')}\n`);
    }

    const result = spawnSync('agent-browser', fullArgs, {
        encoding: 'utf8',
        input: options.stdin,
        maxBuffer: AGENT_BROWSER_MAX_BUFFER,
        timeout: AGENT_BROWSER_TIMEOUT_MS,
    });

    if (result.error) {
        throw new Error(`Failed to run agent-browser: ${result.error.message}`);
    }

    if (result.status !== 0) {
        throw new Error(`agent-browser exited with status ${result.status}: ${result.stderr}`);
    }

    let envelope;

    try {
        envelope = JSON.parse(result.stdout);
    } catch {
        throw new Error(`agent-browser returned non-JSON output: ${result.stdout.slice(0, 200)}`);
    }

    if (!envelope.success) {
        throw new Error(`agent-browser reported failure: ${JSON.stringify(envelope.error)}`);
    }

    return envelope.data?.result !== undefined ? envelope.data?.result : envelope.data;
}

// #endregion
