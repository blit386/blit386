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
/* eslint-disable no-unused-vars */
// biome-ignore lint/correctness/noUnusedImports: scaffolding for future tasks
import { spawnSync } from 'node:child_process';
// biome-ignore lint/correctness/noUnusedImports: scaffolding for future tasks
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
// biome-ignore lint/correctness/noUnusedImports: scaffolding for future tasks
import { dirname, join } from 'node:path';
// biome-ignore lint/correctness/noUnusedImports: scaffolding for future tasks
import { fileURLToPath, pathToFileURL } from 'node:url';
/* eslint-enable no-unused-vars */

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

/* eslint-disable no-unused-vars */
// biome-ignore lint/correctness/noUnusedVariables: scaffolding for future tasks
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
/* eslint-enable no-unused-vars */

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
