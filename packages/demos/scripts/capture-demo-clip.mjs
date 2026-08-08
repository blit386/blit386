/**
 * Capture a running demo's canvas directly, bypassing agent-browser record's compositor
 * (which only manages 1280x578 at 10fps, cropping and letterboxing the canvas). Recording
 * the canvas element's own MediaStream avoids the compositor entirely: native resolution,
 * native frame rate.
 *
 * Recipe: open the demo in `?embed` mode (no banner, no chrome), capture the canvas
 * element via `captureStream()`, record with MediaRecorder, pull the recording out of the
 * browser as base64 (a direct file download does not work under headless Chrome), upscale
 * with nearest-neighbor into a lossless intermediate to keep pixel edges sharp on social
 * players that bilinear-scale everything, then hand off to encode-video.mjs for the same
 * AV1/H.264/poster renditions the blog uses.
 *
 * Usage: pnpm run capture:demo -- <slug> --duration <seconds> --out <dir> [options]
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO_ORDER } from '../plugins/demo-order.js';
import { SITE_URL } from '../plugins/sitemap.js';

// #region Configuration

export const CANVAS_ID = 'blit386-canvas';
export const CAPTURE_SESSION = 'blit386-capture';
export const B64_PULL_CHUNK_CHARS = 300_000;
export const B64_PUSH_CHUNK_CHARS = 0x8000;

export const DEFAULTS = {
    upscale: 2,
    baseUrl: SITE_URL,
    posterAt: '0',
    bitrate: 12_000_000,
    keepIntermediate: false,
    dryRun: false,
};

const NUMERIC_OPTIONS = {
    '--duration': 'duration',
    '--upscale': 'upscale',
    '--bitrate': 'bitrate',
};

const STRING_OPTIONS = {
    '--out': 'out',
    '--name': 'name',
    '--base-url': 'baseUrl',
    '--poster-at': 'posterAt',
};

const BOOLEAN_OPTIONS = {
    '--keep-intermediate': 'keepIntermediate',
    '--dry-run': 'dryRun',
};

// #endregion

// #region Argument parsing

/* eslint-disable complexity, security/detect-object-injection */

/**
 * Parse argv into a capture options object. Throws on anything malformed rather than
 * falling back to a default, matching encode-video.mjs's parseArgs.
 *
 * @param {string[]} argv Arguments after the script name, i.e. `process.argv.slice(2)`.
 * @returns {object} Parsed options, with `name` defaulted to the slug.
 * @throws {Error} When the slug is missing or unknown, a required option is missing, an
 *   option lacks its value, a numeric option is not a number, `--duration` or `--upscale`
 *   is not positive, an option is unrecognized, or a second positional argument appears.
 */
export function parseArgs(argv) {
    const options = { ...DEFAULTS };
    let slug;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (BOOLEAN_OPTIONS[arg] !== undefined) {
            options[BOOLEAN_OPTIONS[arg]] = true;
            continue;
        }

        if (STRING_OPTIONS[arg] !== undefined || NUMERIC_OPTIONS[arg] !== undefined) {
            const value = argv[index + 1];
            if (value === undefined || value.startsWith('--')) {
                throw new Error(`Missing value for ${arg}`);
            }
            index += 1;

            if (NUMERIC_OPTIONS[arg] !== undefined) {
                const parsed = Number(value);
                if (!Number.isFinite(parsed)) {
                    throw new Error(`Expected a number for ${arg}, got "${value}"`);
                }
                options[NUMERIC_OPTIONS[arg]] = parsed;
            } else {
                options[STRING_OPTIONS[arg]] = value;
            }
            continue;
        }

        if (arg.startsWith('--')) {
            throw new Error(`Unknown option ${arg}`);
        }

        if (slug !== undefined) {
            throw new Error(`Unexpected second positional argument "${arg}"`);
        }
        slug = arg;
    }

    if (slug === undefined) {
        throw new Error('Missing demo slug.');
    }
    if (!DEMO_ORDER.includes(slug)) {
        throw new Error(`Unknown demo slug "${slug}". Expected one of: ${DEMO_ORDER.join(', ')}`);
    }
    if (options.duration === undefined) {
        throw new Error('Missing --duration <seconds>.');
    }
    if (!(options.duration > 0)) {
        throw new Error('--duration must be a positive number of seconds.');
    }
    if (!(options.upscale > 0)) {
        throw new Error('--upscale must be a positive number.');
    }
    if (options.out === undefined) {
        throw new Error('Missing --out directory.');
    }

    return { ...options, slug, name: options.name ?? slug };
}

/* eslint-enable complexity, security/detect-object-injection */

// #endregion

// #region URL and dimension math

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
 * The nearest-neighbor upscale target for a captured canvas.
 *
 * @param {number} width Source canvas width in pixels.
 * @param {number} height Source canvas height in pixels.
 * @param {number} factor Upscale factor, e.g. 2.
 * @returns {{ width: number, height: number }} Rounded target dimensions.
 */
export function computeUpscaleTarget(width, height, factor) {
    return {
        width: Math.round(width * factor),
        height: Math.round(height * factor),
    };
}

/**
 * The two intermediate file paths this script writes before handing off to encode-video.mjs.
 *
 * @param {string} outDir Output directory.
 * @param {string} name Output base name.
 * @returns {{ raw: string, upscaled: string }} Raw capture and upscaled-intermediate paths.
 */
export function buildIntermediatePaths(outDir, name) {
    return {
        raw: join(outDir, `${name}.raw.webm`),
        upscaled: join(outDir, `${name}.upscaled.mp4`),
    };
}

// #endregion

// #region Command construction

/**
 * ffmpeg args for the nearest-neighbor upscale into a lossless H.264 intermediate.
 * Nearest-neighbor keeps pixel art's hard edges; any other scale filter would blur them
 * before they ever reach a social player.
 *
 * @param {string} input Source capture path (the raw canvas recording).
 * @param {string} output Destination intermediate path.
 * @param {{ width: number, height: number }} target Upscale target, from computeUpscaleTarget.
 * @returns {string[]} Arguments for `ffmpeg`, output path last.
 */
export function buildUpscaleArgs(input, output, target) {
    return [
        '-hide_banner',
        '-y',
        '-i',
        input,
        '-vf',
        `scale=${target.width}:${target.height}:flags=neighbor`,
        '-c:v',
        'libx264',
        '-qp',
        '0',
        '-preset',
        'ultrafast',
        '-an',
        output,
    ];
}

/**
 * Resolve the path to packages/website/scripts/encode-video.mjs relative to this script's
 * own location, so the capture pipeline works regardless of the caller's cwd.
 *
 * @param {string} moduleUrl This module's own `import.meta.url`.
 * @returns {string} Absolute path to encode-video.mjs.
 */
export function resolveEncodeVideoScriptPath(moduleUrl) {
    const scriptsDir = dirname(fileURLToPath(moduleUrl));
    return join(scriptsDir, '..', '..', 'website', 'scripts', 'encode-video.mjs');
}

// #endregion

// #region Browser scripts

/**
 * Browser-side script (run via `agent-browser eval --stdin`) that starts recording the
 * canvas element directly. This is what avoids agent-browser record's compositor, which
 * only manages 1280x578 at 10fps with cropping and letterboxing.
 *
 * @param {number} bitrate MediaRecorder `videoBitsPerSecond`.
 * @returns {string} JavaScript source. Evaluates to the chosen mimeType.
 */
export function buildRecorderScript(bitrate) {
    return `
(() => {
    const canvas = document.getElementById('${CANVAS_ID}');
    if (!canvas) throw new Error('Canvas #${CANVAS_ID} not found.');

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm;codecs=vp8';

    const stream = canvas.captureStream(60);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: ${bitrate} });

    window.__btChunks = [];
    recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) window.__btChunks.push(event.data);
    };
    window.__btRecorder = recorder;
    recorder.start();

    return mimeType;
})();
`.trim();
}

/**
 * Browser-side script that stops the recorder, concatenates the recorded chunks into a
 * Blob, and base64-encodes it into window.__b64 in B64_PUSH_CHUNK_CHARS-sized slices –
 * String.fromCharCode.apply blows the call stack on one giant array, so the encode has to
 * happen in pieces even though the result is one string.
 *
 * A direct file download does not work here: headless Chrome cancels it. Pulling the
 * base64 string back out through repeated eval calls (see sliceRanges) is the path that
 * works.
 *
 * @returns {string} JavaScript source. Resolves to `window.__b64.length`.
 */
export function buildStopScript() {
    return `
(async () => {
    const recorder = window.__btRecorder;
    if (!recorder) throw new Error('No active recorder (window.__btRecorder is unset).');

    await new Promise((resolve) => {
        recorder.addEventListener('stop', resolve, { once: true });
        recorder.stop();
    });

    const blob = new Blob(window.__btChunks, { type: recorder.mimeType });
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    let binary = '';
    const chunkSize = ${B64_PUSH_CHUNK_CHARS};
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }

    window.__b64 = btoa(binary);
    return window.__b64.length;
})();
`.trim();
}

/**
 * Split a total character length into chunk-sized {start, length} ranges, for pulling
 * window.__b64 back out of the browser a few hundred KB at a time (a single eval call
 * returning the whole string is what the manual recipe found unreliable).
 *
 * @param {number} totalLength Total string length to cover.
 * @param {number} chunkSize Max length per range.
 * @returns {{ start: number, length: number }[]} Ranges covering [0, totalLength).
 */
export function sliceRanges(totalLength, chunkSize) {
    const ranges = [];
    for (let start = 0; start < totalLength; start += chunkSize) {
        ranges.push({ start, length: Math.min(chunkSize, totalLength - start) });
    }
    return ranges;
}

// #endregion
