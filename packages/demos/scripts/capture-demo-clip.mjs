/**
 * Capture a running demo's canvas directly. A viewport recording crops and letterboxes the
 * canvas; recording the canvas element's own MediaStream does not: native resolution,
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
 *
 * Note: --base-url must point at a host serving flattened, extensionless demo URLs
 * (production, the next channel, or `vite preview`) - the `pnpm run dev` server routes
 * demos at /demos/<slug>.html instead and is not supported by this script.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DEMO_ORDER } from '../plugins/demo-order.js';
import { SITE_URL } from '../plugins/sitemap.js';
import {
    buildCanvasReadyScript,
    buildEmbedUrl,
    buildWebGPUProbeScript,
    CANVAS_ID,
    launchCaptureBrowser,
    sleep,
} from './playwright-session.mjs';

// #region Configuration

// Re-exported so this module stays the single import site for its own tests and callers.
export { buildEmbedUrl, CANVAS_ID };
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

        if (Object.hasOwn(BOOLEAN_OPTIONS, arg)) {
            options[BOOLEAN_OPTIONS[arg]] = true;
            continue;
        }

        if (Object.hasOwn(STRING_OPTIONS, arg) || Object.hasOwn(NUMERIC_OPTIONS, arg)) {
            const value = argv[index + 1];
            if (value === undefined || value.startsWith('--')) {
                throw new Error(`Missing value for ${arg}`);
            }
            index += 1;

            if (Object.hasOwn(NUMERIC_OPTIONS, arg)) {
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
    if (!(options.bitrate > 0)) {
        throw new Error('--bitrate must be a positive number.');
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
 * The nearest-neighbor upscale target for a captured canvas.
 *
 * @param {number} width Source canvas width in pixels.
 * @param {number} height Source canvas height in pixels.
 * @param {number} factor Upscale factor, e.g. 2.
 * @returns {{ width: number, height: number }} Rounded target dimensions.
 */
export function computeUpscaleTarget(width, height, factor) {
    return {
        width: Math.round((width * factor) / 2) * 2,
        height: Math.round((height * factor) / 2) * 2,
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
 * Browser-side script that starts recording the canvas element directly, at the canvas's
 * own resolution and frame rate rather than the viewport's.
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
 * Blob, and base64-encodes it into window.__b64 in B64_PUSH_CHUNK_CHARS-sized slices -
 * String.fromCharCode.apply blows the call stack on one giant array, so the encode has to
 * happen in pieces even though the result is one string.
 *
 * A direct file download does not work here: headless Chrome cancels it. The base64 string
 * is read back with one `page.evaluate`.
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

// #endregion

// #region Runner

const USAGE = `Usage: pnpm run capture:demo -- <slug> --duration <seconds> --out <dir> [options]

  <slug>                 Demo slug, e.g. palette-cycling (must be in DEMO_ORDER)
  --duration <seconds>   Clip length (required)
  --out <dir>            Output directory (required), passed through to encode-video.mjs
  --name <base>          Output base name (default: the slug)
  --upscale <n>          Nearest-neighbor upscale factor (default: ${DEFAULTS.upscale})
  --base-url <url>       Demo site origin (default: ${DEFAULTS.baseUrl})
  --poster-at <ts>       Passed through to encode-video.mjs (default: ${DEFAULTS.posterAt})
  --bitrate <bps>        MediaRecorder videoBitsPerSecond (default: ${DEFAULTS.bitrate})
  --keep-intermediate    Keep raw.webm and the lossless upscaled.mp4 intermediate
  --dry-run              Print the planned commands and exit
`;

/**
 * Echo and run ffmpeg, inheriting stdio so progress reaches the terminal.
 *
 * @param {string[]} args Arguments for `ffmpeg`, output path last.
 * @returns {void}
 */
function runFfmpeg(args) {
    console.log(`\n$ ffmpeg ${args.join(' ')}\n`);

    const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
    if (result.error) {
        throw new Error(`Failed to run ffmpeg: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`ffmpeg exited with status ${result.status}`);
    }
}

/**
 * Parse argv, capture the demo's canvas, upscale it, and hand off to encode-video.mjs.
 *
 * @returns {Promise<void>}
 */
const main = async () => {
    let options;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(`${error.message}\n\n${USAGE}`);
        process.exitCode = 1;
        return;
    }

    const embedUrl = buildEmbedUrl(options.baseUrl, options.slug);
    const paths = buildIntermediatePaths(options.out, options.name);
    const encodeVideoPath = resolveEncodeVideoScriptPath(import.meta.url);
    const encodeArgs = [
        encodeVideoPath,
        paths.upscaled,
        '--out',
        options.out,
        '--name',
        options.name,
        '--poster-at',
        options.posterAt,
    ];

    if (options.dryRun) {
        console.log(`Would open ${embedUrl}`);
        console.log(
            `Would record ${options.duration}s at the canvas's native resolution, upscaled ${options.upscale}x`,
        );
        console.log(`Would write ${paths.raw} and ${paths.upscaled}`);
        console.log(`Would run: node ${encodeArgs.join(' ')}`);
        return;
    }

    try {
        mkdirSync(options.out, { recursive: true });

        // Fail fast on a missing ffmpeg before the timed recording, not after - ffmpeg is
        // only actually invoked post-capture (see runFfmpeg below), so without this check a
        // missing binary would waste the full --duration wait and discard a good recording.
        const ffmpegProbe = spawnSync('ffmpeg', ['-hide_banner', '-version'], { stdio: 'ignore' });
        if (ffmpegProbe.error || ffmpegProbe.status !== 0) {
            throw new Error('ffmpeg is required for the upscale step but was not found on PATH.');
        }

        let browser;

        try {
            const launched = await launchCaptureBrowser();
            browser = launched.browser;
            const { page } = launched;

            await page.goto(embedUrl);

            // The canvas starts at the browser's default backing-store size (300x150) until
            // the engine finishes async WebGPU init and resizes it (WebGPUContext.ts sets
            // canvas.width/height as part of that init). Navigation only waits for page load,
            // not engine init, so reading dimensions immediately is a race: it can read the
            // default instead of the demo's real configured size, silently producing a
            // downscale (not an upscale) once the mismatch reaches the ffmpeg scale filter.
            // The timeout throws. A canvas still at that default has not finished init, and
            // the probe below must not call getContext('webgpu') before the engine does.
            const dimensions = await page.evaluate(buildCanvasReadyScript(CANVAS_ID, 5000, true));
            await page.evaluate(buildWebGPUProbeScript(CANVAS_ID));
            const target = computeUpscaleTarget(dimensions.width, dimensions.height, options.upscale);

            await page.evaluate(buildRecorderScript(options.bitrate));

            console.log(`Recording ${options.slug} for ${options.duration}s...`);
            await sleep(options.duration);

            const totalLength = await page.evaluate(buildStopScript());
            if (!Number.isSafeInteger(totalLength) || totalLength <= 0) {
                throw new Error(`Expected a positive base64 length from the browser, got ${totalLength}.`);
            }

            const base64 = await page.evaluate('window.__b64');

            writeFileSync(paths.raw, Buffer.from(base64, 'base64'));

            runFfmpeg(buildUpscaleArgs(paths.raw, paths.upscaled, target));
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (closeError) {
                    console.error(`Warning: failed to close the browser: ${closeError.message}`);
                }
            }
        }

        const encodeResult = spawnSync('node', encodeArgs, { stdio: 'inherit' });
        if (encodeResult.error) {
            throw new Error(`Failed to run encode-video.mjs: ${encodeResult.error.message}`);
        }
        if (encodeResult.status !== 0) {
            throw new Error(`encode-video.mjs exited with status ${encodeResult.status}`);
        }

        if (!options.keepIntermediate) {
            rmSync(paths.raw, { force: true });
            rmSync(paths.upscaled, { force: true });
        }

        console.log(`\nDone. Renditions written to ${options.out}/${options.name}.*`);
    } catch (error) {
        console.error(`\n${error.message}`);
        process.exitCode = 1;
    }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}

// #endregion
