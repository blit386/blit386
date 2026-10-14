/**
 * The capture engine of the /shots page. Drives one demo at a time inside a same-origin
 * iframe: load `<demo>?embed&capture`, seek the engine clock with BT.renderAt, inject the
 * pose's input, step two ticks so the shared kit latches it, and read the exact framebuffer
 * with BT.captureFrame. The frame adapter is injectable so the state machine is unit-tested
 * without a browser.
 */

import { lintSnapshot } from '../src/shared/ui-lint.js';

const CANVAS_ID = 'blit386-canvas';
// The browser's default canvas size, before the engine resizes it (see playwright-session.mjs).
const DEFAULT_CANVAS = { width: 300, height: 150 };
const READY_TIMEOUT_MS = 10_000;
const STEP_TIMEOUT_MS = 10_000;
const CANVAS_POLL_MS = 16;
// Matches RENDER_AT_NOT_READY_MESSAGE in the engine's errorMessages.ts.
const NOT_READY_PATTERN = /game loop hasn't started/;
// Ticks stepped after an input: one for ui.tick() to latch it, one for the widget to show it.
const INPUT_TICKS = 2;

/**
 * @param {string} demoBase
 * @param {string} pageSuffix
 * @param {string} slug
 * @param {string} variant
 * @returns {string}
 */
function captureUrl(demoBase, pageSuffix, slug, variant) {
    return `${demoBase}${slug}${pageSuffix}?embed&capture${variant === 'software' ? '&backend=software' : ''}`;
}

/**
 * @param {number} at
 * @param {number} fps
 * @param {number} [ticks]
 * @returns {number}
 */
function stepAfterInput(at, fps, ticks = INPUT_TICKS) {
    return at + ticks / fps;
}

/**
 * @param {{ left: number, top: number, width: number, height: number }} rect - Canvas client rect.
 * @param {{ x: number, y: number }} display - BT.displaySize.
 * @param {{ x: number, y: number }} point - Display pixel.
 * @returns {{ clientX: number, clientY: number }}
 */
function pointerClientPoint(rect, display, point) {
    return {
        clientX: rect.left + ((point.x + 0.5) * rect.width) / display.x,
        clientY: rect.top + ((point.y + 0.5) * rect.height) / display.y,
    };
}

/**
 * @template T
 * @param {string} step
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
function withTimeout(step, promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${step}: timed out after ${ms} ms`)), ms);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Message of a thrown value. Not `instanceof Error`: errors from the iframe belong to its realm.
 *
 * @param {unknown} error
 * @returns {string}
 */
function errorText(error) {
    return String(error?.message ?? error);
}

/**
 * Run one named step with a timeout, prefixing any failure with the step name.
 *
 * @param {string} step
 * @param {() => Promise<any>} fn
 * @param {number} ms
 */
async function stage(step, fn, ms) {
    try {
        return await withTimeout(step, fn(), ms);
    } catch (error) {
        const message = errorText(error);

        throw new Error(message.startsWith(`${step}:`) ? message : `${step}: ${message}`, { cause: error });
    }
}

function dispatchKeys(frame, keys, type) {
    for (const code of keys) {
        frame.canvas().dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
    }
}

/**
 * Inject the pose's keys or pointer, then step forward so the kit latches it.
 */
async function injectInput(frame, engine, pose) {
    if (pose.keys) {
        dispatchKeys(frame, pose.keys, 'keydown');
    } else {
        const point = pointerClientPoint(frame.canvas().getBoundingClientRect(), engine.displaySize, pose.pointer);

        frame.canvas().dispatchEvent(new PointerEvent('pointermove', { ...point, bubbles: true, pointerId: 1 }));
    }

    const target = stepAfterInput(pose.at, engine.targetFPS);

    await stage('step', () => engine.renderAt(target, { from: 'current' }), STEP_TIMEOUT_MS);

    if (pose.keys) {
        dispatchKeys(frame, pose.keys, 'keyup');
    }
}

/**
 * BT.renderAt, retried while the engine's loop has not started yet. The canvas is resized and
 * window.BT exists a little before init() finishes, and BT has no ready flag to wait on, so the
 * engine's own "hasn't started yet" rejection is the readiness signal. The 'seek' stage owns the
 * timeout; a loop that outlives it can only run on until the iframe is replaced.
 *
 * @param {{ renderAt: Function }} engine
 * @param {number} seconds
 */
async function seekWhenReady(engine, seconds) {
    for (;;) {
        try {
            return await engine.renderAt(seconds);
        } catch (error) {
            if (!NOT_READY_PATTERN.test(errorText(error))) {
                throw error;
            }

            await new Promise((tick) => setTimeout(tick, CANVAS_POLL_MS));
        }
    }
}

/**
 * BT.captureFrame, copied into a Blob owned by this page. The engine's Blob dies with the iframe
 * document: once the next demo loads, the original can no longer be read or shown as an image.
 *
 * @param {{ captureFrame: Function }} engine
 * @param {string} size
 * @returns {Promise<Blob>}
 */
async function captureOwnedBlob(engine, size) {
    const blob = await engine.captureFrame({ size });

    return new Blob([await blob.arrayBuffer()], { type: blob.type });
}

/**
 * Capture one pose of the demo already addressed by `options.url`.
 *
 * @param {{ load: Function, engine: Function, ui: Function, canvas: Function }} frame
 * @param {{ id: string, at: number, keys?: string[], pointer?: { x: number, y: number }, touch?: boolean }} pose
 * @param {string} variant
 * @param {{ url: string }} options
 * @returns {Promise<{ blob: Blob, width: number, height: number, snapshot: object, lint: Array<object> }>}
 */
async function runPose(frame, pose, variant, options) {
    await stage('load', () => frame.load(options.url), READY_TIMEOUT_MS);

    const engine = frame.engine();
    const ui = frame.ui();

    if (ui) {
        ui.recording = true;
        ui.debug = variant === 'uidebug';
        ui.touchSeen = ui.touchSeen || Boolean(pose.touch);
    }

    await stage('seek', () => seekWhenReady(engine, pose.at), STEP_TIMEOUT_MS);

    if (pose.keys || pose.pointer) {
        await injectInput(frame, engine, pose);
    }

    // Before capture: BT.captureFrame re-renders the parked frame without an update tick, so the kit
    // would record every group a second time and each widget would overlap its own copy.
    const snapshot = ui ? ui.snapshot() : { display: { w: engine.displaySize.x, h: engine.displaySize.y }, groups: [] };
    const size = variant === 'output' ? 'output' : 'display';
    const blob = await stage('capture', () => captureOwnedBlob(engine, size), STEP_TIMEOUT_MS);
    const bitmap = size === 'output' ? await createImageBitmap(blob) : null;
    const width = bitmap ? bitmap.width : engine.displaySize.x;
    const height = bitmap ? bitmap.height : engine.displaySize.y;

    bitmap?.close();

    return {
        blob,
        width,
        height,
        snapshot,
        lint: lintSnapshot(snapshot),
    };
}

/**
 * Run every job in order, reporting each one. Never throws: a demo that will not boot costs
 * one tile, not the run.
 *
 * @param {object} frame
 * @param {Array<{ slug: string, pose: object, variant: string }>} jobs
 * @param {(result: object) => void} onResult
 * @param {{ demoBase: string, pageSuffix: string }} site
 */
async function captureAll(frame, jobs, onResult, site) {
    for (const job of jobs) {
        const base = { slug: job.slug, pose: job.pose.id, variant: job.variant };

        try {
            const result = await runPose(frame, job.pose, job.variant, {
                url: captureUrl(site.demoBase, site.pageSuffix, job.slug, job.variant),
            });

            onResult({ ...base, ok: true, ...result });
        } catch (error) {
            onResult({ ...base, ok: false, error: errorText(error) });
        }
    }
}

/**
 * Wait until the engine has resized the canvas away from the browser default, or time out.
 */
async function waitForCanvasResize(canvas) {
    const deadline = Date.now() + READY_TIMEOUT_MS;

    while (canvas.width === DEFAULT_CANVAS.width && canvas.height === DEFAULT_CANVAS.height && Date.now() < deadline) {
        // A timer, not requestAnimationFrame: rAF never fires while the page is in a background tab.
        await new Promise((tick) => setTimeout(tick, CANVAS_POLL_MS));
    }
}

/**
 * The real adapter over the hidden #shots-frame iframe.
 *
 * @param {HTMLIFrameElement} iframe
 */
function createFrameAdapter(iframe) {
    return {
        load(url) {
            return new Promise((resolve, reject) => {
                iframe.addEventListener(
                    'load',
                    async () => {
                        const canvas = iframe.contentDocument?.getElementById(CANVAS_ID);

                        if (!canvas) {
                            reject(new Error('canvas not found'));
                            return;
                        }

                        await waitForCanvasResize(canvas);

                        if (!iframe.contentWindow.BT) {
                            reject(new Error('window.BT missing - is ?capture in the URL?'));
                            return;
                        }

                        resolve();
                    },
                    { once: true },
                );
                iframe.src = url;
            });
        },
        engine: () => iframe.contentWindow.BT,
        ui: () => iframe.contentWindow.__blitDemoUi ?? null,
        canvas: () => iframe.contentDocument.getElementById(CANVAS_ID),
    };
}

export { captureAll, captureUrl, createFrameAdapter, pointerClientPoint, runPose, stepAfterInput };
