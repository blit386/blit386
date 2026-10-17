#!/usr/bin/env node
/**
 * Capture a per-demo OpenGraph card: a still frame of the running demo, nearest-neighbor
 * upscaled and centered on a 1200x630 black canvas, written to public/social/og-<slug>.png.
 *
 * The frame is deterministic: the page loads under `?embed&capture` (which puts the engine on
 * `window.BT`), and the script seeks it with `BT.renderAt(at)`, where `at` is the first pose of
 * the demo in `_shots/poses.js` - the same table the /shots gallery uses, so the two cannot
 * drift apart and no wall-clock sleep decides what the card shows.
 *
 * Why an element screenshot rather than `BT.captureFrame()`: a WebGPU swap chain does not
 * reliably read back through `canvas.toDataURL()`, and the card needs the CSS-sized canvas
 * rather than the readback path's pixels (BT-468). Playwright's element screenshot goes
 * through CDP and captures the composited surface.
 *
 * Crispness comes from doing no resampling until ffmpeg: the page is restyled so the canvas
 * occupies exactly its own drawing-buffer size in CSS pixels at deviceScaleFactor 1, making
 * the screenshot one image pixel per engine pixel. ffmpeg then scales by a whole number with
 * `flags=neighbor` and pads the remainder, so every source pixel becomes an identical square
 * block rather than a blurred one.
 *
 * This is a hand-run tool, never a build step: the output PNGs are committed. Running it in CI
 * would need a browser and ffmpeg in the deploy job for something that changes only when a demo
 * visibly changes.
 *
 * Usage: pnpm run capture:og -- <slug> [options]
 *        pnpm run capture:og -- --all [options]
 *
 * Note: --base-url must point at a host serving flattened, extensionless demo URLs
 * (production, the next channel, or `vite preview`) - the `pnpm run dev` server routes demos
 * at /demos/<slug>.html instead and is not supported. Use `pnpm run build && pnpm run preview`
 * to capture a demo that is not deployed yet.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DEMO_ORDER } from '../plugins/demo-order.js';
import { buildRegistry } from '../plugins/demo-registry.js';
import { SITE_URL } from '../plugins/sitemap.js';
import {
    OG_AUTO_FILL_THRESHOLD,
    OG_IMAGE_DIR,
    OG_IMAGE_HEIGHT,
    OG_IMAGE_WIDTH,
    OG_SCALE_DEFAULT,
    OG_SCALE_MODES,
} from '../plugins/social-meta.js';
import { posesFor } from '../_shots/poses.js';
import {
    buildCanvasReadyScript,
    buildEmbedUrl,
    buildWebGPUProbeScript,
    CANVAS_ID,
    launchCaptureBrowser,
} from './playwright-session.mjs';

// #region Configuration

// Resolved from this module's own location, so both the registry read and the default output
// directory land in packages/demos no matter where the caller invoked the script from.
const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = resolve(SCRIPTS_DIR, '..');

// Shown in the usage text and used as the fallback when --out is omitted.
export const DEFAULT_OUT_DIR = join('public', OG_IMAGE_DIR);

// Comfortably larger than the engine's 960x720 maximum canvas, so the restyled canvas is never
// clipped by the viewport. deviceScaleFactor must be 1: at 2 the element screenshot comes back
// twice the CSS box and every scale calculation below would be off by that factor.
export const VIEWPORT_WIDTH = 1600;
export const VIEWPORT_HEIGHT = 1000;
export const DEVICE_SCALE_FACTOR = 1;

// The engine's WebGPU init is async and navigation only waits for page load.
export const CANVAS_READY_TIMEOUT_MS = 10_000;

export const CARD_BACKGROUND = 'black';

export const DEFAULTS = {
    // Empty means "not passed", so the default can resolve against the package rather than the
    // caller's cwd. An explicit --out stays cwd-relative, which is what passing a path implies.
    out: '',
    baseUrl: SITE_URL,
    // Empty means "no CLI override" - each demo's own `@ogScale` tag decides, falling back to
    // OG_SCALE_DEFAULT. An explicit --scale-mode wins over both, for one-off experiments.
    scaleMode: '',
    force: false,
    keepIntermediate: false,
    dryRun: false,
};

const STRING_OPTIONS = {
    '--out': 'out',
    '--base-url': 'baseUrl',
    '--scale-mode': 'scaleMode',
};

const BOOLEAN_OPTIONS = {
    '--all': 'all',
    '--force': 'force',
    '--keep-intermediate': 'keepIntermediate',
    '--dry-run': 'dryRun',
};

// #endregion

// #region Argument parsing

/* eslint-disable complexity, security/detect-object-injection */

/**
 * Parse argv into a capture options object. Throws on anything malformed rather than falling
 * back to a default, matching capture-demo-clip.mjs's parseArgs.
 *
 * @param {string[]} argv Arguments after the script name, i.e. `process.argv.slice(2)`.
 * @returns {object} Parsed options, with `slugs` resolved to the list to capture.
 * @throws {Error} When the slug is missing or unknown, `--all` is combined with a slug, an
 *   option lacks its value, `--scale-mode` is not a known mode, an option is unrecognized, or a
 *   second positional argument appears.
 */
export function parseArgs(argv) {
    const options = { ...DEFAULTS, all: false };
    let slug;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        // pnpm forwards the separator of `pnpm run capture:og -- <slug>` to the script.
        if (arg === '--') {
            continue;
        }

        if (Object.hasOwn(BOOLEAN_OPTIONS, arg)) {
            options[BOOLEAN_OPTIONS[arg]] = true;
            continue;
        }

        if (Object.hasOwn(STRING_OPTIONS, arg)) {
            const value = argv[index + 1];

            // A following long option is a forgotten value, not the value itself. Without this,
            // `--out --force` silently sets the output directory to "--force" and drops the flag,
            // writing 46 cards into a directory named after an option.
            if (value === undefined || value.startsWith('--')) {
                throw new Error(`${arg} requires a value.`);
            }

            index += 1;

            options[STRING_OPTIONS[arg]] = value;

            continue;
        }

        if (arg.startsWith('-')) {
            throw new Error(`Unknown option: ${arg}`);
        }

        if (slug !== undefined) {
            throw new Error(`Unexpected second positional argument: ${arg}`);
        }

        slug = arg;
    }

    if (options.scaleMode !== '' && !OG_SCALE_MODES.has(options.scaleMode)) {
        throw new Error(`--scale-mode must be one of ${[...OG_SCALE_MODES].join(', ')}, got "${options.scaleMode}".`);
    }

    if (options.all && slug !== undefined) {
        throw new Error('Pass either a slug or --all, not both.');
    }

    if (!options.all) {
        if (slug === undefined) {
            throw new Error('Missing demo slug. Pass a slug or --all.');
        }

        if (!DEMO_ORDER.includes(slug)) {
            throw new Error(`Unknown demo slug: ${slug}`);
        }
    }

    options.slugs = options.all ? [...DEMO_ORDER] : [slug];

    return options;
}

/* eslint-enable complexity, security/detect-object-injection */

// #endregion

// #region Path and dimension math

/**
 * Output path for one demo's card.
 *
 * Resolve the output directory.
 *
 * The default resolves against the package, not the caller's cwd, so running the script from
 * the repo root writes cards to packages/demos/public/social rather than creating a stray
 * public/social at the root. An explicit --out stays cwd-relative, which is what passing a
 * path implies.
 *
 * @param {string} out The `--out` value, or '' when the flag was not passed.
 * @param {string} cwd The caller's working directory.
 * @param {string} [packageRoot] The packages/demos root.
 * @returns {string} Absolute output directory.
 */
export function resolveOutDir(out, cwd, packageRoot = PACKAGE_ROOT) {
    if (out === '') {
        return join(packageRoot, DEFAULT_OUT_DIR);
    }

    return resolve(cwd, out);
}

/**
 * Output path for one demo's card.
 *
 * @param {string} outDir Output directory.
 * @param {string} slug Demo slug.
 * @returns {string} `<outDir>/og-<slug>.png`.
 */
export function buildOgImagePath(outDir, slug) {
    return join(outDir, `og-${slug}.png`);
}

/**
 * Path of the native-resolution intermediate screenshot, before the ffmpeg upscale.
 *
 * @param {string} outDir Output directory.
 * @param {string} slug Demo slug.
 * @returns {string} `<outDir>/og-<slug>.native.png`.
 */
export function buildNativeImagePath(outDir, slug) {
    return join(outDir, `og-${slug}.native.png`);
}

/**
 * Pick the scale mode for one demo.
 *
 * Precedence: an explicit `--scale-mode` (so a one-off experiment does not need a source edit),
 * then the demo's own `@ogScale` header tag, then the global default.
 *
 * @param {string} cliMode `--scale-mode` value, or '' when the flag was not passed.
 * @param {string} demoMode The demo's `@ogScale` tag value, or '' when it has none.
 * @returns {string} One of OG_SCALE_MODES.
 */
export function resolveScaleMode(cliMode, demoMode) {
    if (cliMode !== '') {
        return cliMode;
    }

    if (demoMode !== '') {
        return demoMode;
    }

    return OG_SCALE_DEFAULT;
}

/**
 * How far to scale a captured canvas so it fits the card.
 *
 * `integer` mode picks the largest whole-number factor that fits, which is the point of the
 * whole pipeline: every source pixel becomes an identical square block, so pixel art keeps hard
 * edges. `fit` mode allows a fractional factor, filling the card at the cost of uneven pixel
 * widths. `auto` - the default - takes integer when it already fills most of the card and falls
 * back to fit when it would leave the demo marooned in black.
 *
 * A demo overrides the mode for its own card with an `@ogScale` header tag.
 *
 * @param {number} width Source canvas width in pixels.
 * @param {number} height Source canvas height in pixels.
 * @param {string} [mode] One of OG_SCALE_MODES.
 * @param {number} [targetWidth] Card width.
 * @param {number} [targetHeight] Card height.
 * @returns {{ scale: number, drawWidth: number, drawHeight: number }} Chosen factor and the
 *   even-numbered dimensions to scale to.
 */
export function computeOgScale(
    width,
    height,
    mode = OG_SCALE_DEFAULT,
    targetWidth = OG_IMAGE_WIDTH,
    targetHeight = OG_IMAGE_HEIGHT,
) {
    const ratio = Math.min(targetWidth / width, targetHeight / height);
    const integer = Math.floor(ratio);
    const integerFits = integer >= 1;
    const integerFillsCard = integerFits && (height * integer) / targetHeight >= OG_AUTO_FILL_THRESHOLD;

    if (integerFits && (mode === 'integer' || (mode === 'auto' && integerFillsCard))) {
        return { scale: integer, drawWidth: width * integer, drawHeight: height * integer };
    }

    // Either fitting was chosen, or the source is larger than the card and no whole-number
    // factor exists at all. Round to even so no encoder has to deal with odd sizes.
    return {
        scale: ratio,
        drawWidth: Math.max(2, Math.round((width * ratio) / 2) * 2),
        drawHeight: Math.max(2, Math.round((height * ratio) / 2) * 2),
    };
}

// #endregion

// #region Command construction

/**
 * The ffmpeg filter graph that turns a native-resolution screenshot into the finished card.
 *
 * `flags=neighbor` is what keeps pixel edges hard - any other scaler blurs them before a social
 * player ever sees the image. The pad color matches the site's own black page background, so a
 * non-16:9 demo reads as deliberately letterboxed rather than as a broken image.
 *
 * @param {{ drawWidth: number, drawHeight: number }} target Scale target from computeOgScale.
 * @param {number} [cardWidth] Card width.
 * @param {number} [cardHeight] Card height.
 * @returns {string} An ffmpeg `-vf` value.
 */
export function buildOgFilterGraph(target, cardWidth = OG_IMAGE_WIDTH, cardHeight = OG_IMAGE_HEIGHT) {
    return (
        `scale=${target.drawWidth}:${target.drawHeight}:flags=neighbor,` +
        `pad=${cardWidth}:${cardHeight}:(ow-iw)/2:(oh-ih)/2:color=${CARD_BACKGROUND}`
    );
}

/**
 * Full ffmpeg argument list for the card render.
 *
 * @param {string} input Native-resolution screenshot path.
 * @param {string} output Finished card path.
 * @param {{ drawWidth: number, drawHeight: number }} target Scale target from computeOgScale.
 * @returns {string[]} Arguments for `ffmpeg`, output path last.
 */
export function buildOgFfmpegArgs(input, output, target) {
    return [
        '-hide_banner',
        '-y',
        '-i',
        input,
        '-vf',
        buildOgFilterGraph(target),
        '-frames:v',
        '1',
        // Tells the image2 muxer this is a single file, not a numbered sequence. Without it
        // ffmpeg still writes the PNG but warns about a missing "%03d" pattern on every run.
        '-update',
        '1',
        // Slowest, smallest PNG. These are committed to the repo, so bytes matter more than
        // the fraction of a second spent squeezing them.
        '-compression_level',
        '100',
        output,
    ];
}

// #endregion

// #region Browser scripts

// Pins `BT.random` so a demo that scatters things randomly (starfield, seeded worlds) draws the
// same card on every run. `renderAt` replays from the boot seed, but without `?seed=` that seed
// is fresh per page load.
export const OG_CAPTURE_SEED = 1;

/**
 * URL of the demo page with the engine exposed on `window.BT` and its random stream pinned.
 * Keep the `capture` flag in step with `captureUrl` in `_shots/capture.js`, which builds the
 * same page for the /shots gallery (that one runs in the browser, so they cannot share code).
 *
 * @param {string} baseUrl Site origin.
 * @param {string} slug Demo slug.
 * @returns {string} `${baseUrl}/${slug}?embed&capture&seed=${OG_CAPTURE_SEED}`.
 */
export function buildCaptureUrl(baseUrl, slug) {
    return `${buildEmbedUrl(baseUrl, slug)}&capture&seed=${OG_CAPTURE_SEED}`;
}

/**
 * Browser-side script that waits for the engine to finish init, then seeks it to `at` seconds.
 * The canvas is resized and `window.BT` exists a little before `BT.isReady` flips, and
 * `renderAt` needs the game loop. Resolves after the seeked frame has had two animation frames
 * to reach the screen.
 *
 * @param {number} at Seconds on the engine clock.
 * @param {number} timeoutMs How long to wait for the engine before failing.
 * @returns {string} JavaScript source. Resolves once the frame is rendered.
 */
export function buildSeekScript(at, timeoutMs) {
    return `
(async () => {
    const deadline = Date.now() + ${timeoutMs};
    while (!window.BT?.isReady) {
        if (Date.now() >= deadline) throw new Error('engine was not ready before the seek deadline');
        await new Promise((tick) => setTimeout(tick, 16));
    }
    await window.BT.renderAt(${at});
    // renderAt resolves once the frame is submitted to the GPU, not once it is presented. Two
    // animation frames let the compositor show it before the element screenshot.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
})();
`.trim();
}

/**
 * Browser-side script that restyles the page so an element screenshot of the canvas is exactly
 * its drawing-buffer size, with no browser resampling.
 *
 * Both overrides need `!important` to land. The engine's `applyCanvasLayoutStyles` sets
 * `max-width` / `max-height` inline with `!important`, and layout.css sizes the canvas with a
 * `min(100dvw, ...)` expression - so a plain `canvas.style.width = ...` loses to both, the
 * screenshot comes back at the CSS-fit size instead, and the result is a silently resampled,
 * wrong-sized card.
 *
 * `body` also gets a defensive reset: an element screenshot captures the page at its current zoom,
 * not at zoom 1, so a stray page-level `zoom` - a browser setting, an extension, or a future
 * layout.css regression (BT-468 traced one such accidental rule) - would otherwise turn a 320x320
 * canvas into a resampled, wrong-sized PNG, and that resampling is what corrupts glyphs and gaps
 * wireframe lines on the finished card.
 *
 * @param {string} canvasId Canvas element id.
 * @returns {string} JavaScript source. Evaluates to `{ width, height }`.
 */
export function buildCanvasPrepScript(canvasId) {
    return `
(async () => {
    const canvas = document.getElementById('${canvasId}');
    if (!canvas) throw new Error('Canvas #${canvasId} not found.');

    document.body.style.setProperty('zoom', '1', 'important');

    const overrides = [
        ['max-width', 'none'],
        ['max-height', 'none'],
        ['width', canvas.width + 'px'],
        ['height', canvas.height + 'px'],
        ['image-rendering', 'pixelated'],
    ];
    for (const [property, value] of overrides) {
        canvas.style.setProperty(property, value, 'important');
    }

    // The container's top padding would otherwise offset the element box we screenshot.
    const container = document.getElementById('canvas-container');
    if (container) {
        container.style.setProperty('padding', '0', 'important');
        container.style.setProperty('align-items', 'flex-start', 'important');
    }

    // Two frames: one for the style recalculation, one for the demo to paint into it.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    return { width: canvas.width, height: canvas.height };
})();
`.trim();
}

// #endregion

// #region Execution

const USAGE = `
Usage: pnpm run capture:og -- <slug> [options]
       pnpm run capture:og -- --all [options]

  --all                  Capture every demo in DEMO_ORDER (skips slugs already captured)
  --force                Re-capture slugs that already have a committed card
  --out <dir>            Output directory, relative to your cwd
                         (default: ${DEFAULT_OUT_DIR}, resolved against packages/demos)
  --base-url <url>       Site origin (default: ${DEFAULTS.baseUrl})
  --scale-mode <mode>    auto | integer | fit. Overrides every demo's own @ogScale tag;
                         omit it to let each demo decide (default: ${OG_SCALE_DEFAULT})
  --keep-intermediate    Keep the native-resolution screenshot
  --dry-run              Print the plan and exit

--base-url must serve flattened, extensionless URLs: production, the next channel, or
\`pnpm run build && pnpm run preview\`. The dev server routes /demos/<slug>.html and will not work.
`;

/**
 * Echo and run ffmpeg, inheriting stdio so progress reaches the terminal.
 *
 * @param {string[]} args Arguments for `ffmpeg`, output path last.
 * @returns {void}
 * @throws {Error} When ffmpeg is missing or exits non-zero.
 */
function runFfmpeg(args) {
    const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });

    if (result.error) {
        throw new Error(`Failed to run ffmpeg: ${result.error.message}`);
    }

    if (result.status !== 0) {
        throw new Error(`ffmpeg exited with status ${result.status}`);
    }
}

/**
 * Capture one demo's card. Assumes the browser and viewport are already set up.
 *
 * @param {import('playwright-core').Page} page Page from {@link launchCaptureBrowser}.
 * @param {string} slug Demo slug.
 * @param {object} options Parsed options.
 * @returns {Promise<void>}
 */
async function captureOne(page, slug, options) {
    const demoScaleMode = options.ogScaleBySlug.get(slug);

    // Strict: every ordered slug has a registry entry (check:demo-registry enforces it), so a
    // miss means the registry read is broken, not "use the default".
    if (demoScaleMode === undefined) {
        throw new Error(`No registry entry for demo "${slug}".`);
    }

    const scaleMode = resolveScaleMode(options.scaleMode, demoScaleMode);

    const nativePath = buildNativeImagePath(options.out, slug);
    const cardPath = buildOgImagePath(options.out, slug);

    await page.goto(buildCaptureUrl(options.baseUrl, slug));

    // Strict: a card rendered from the browser's 300x150 default would be a silently wrong
    // image rather than a visible failure, and this runs unattended across 46 demos.
    await page.evaluate(buildCanvasReadyScript(CANVAS_ID, CANVAS_READY_TIMEOUT_MS, true));
    await page.evaluate(buildWebGPUProbeScript(CANVAS_ID));

    const dimensions = await page.evaluate(buildCanvasPrepScript(CANVAS_ID));

    // Seek after the restyle so the frame on screen was rendered for the final canvas box. The
    // first pose of the demo is the moment the card shows (the site-index tile uses it too).
    const [{ at }] = posesFor(slug);

    console.log(`  canvas ${dimensions.width}x${dimensions.height}, seeking to ${at}s...`);
    await page.evaluate(buildSeekScript(at, CANVAS_READY_TIMEOUT_MS));

    await page.locator(`#${CANVAS_ID}`).screenshot({ path: nativePath });

    const target = computeOgScale(dimensions.width, dimensions.height, scaleMode);
    console.log(
        `  ${scaleMode}: scaling ${target.scale}x to ${target.drawWidth}x${target.drawHeight}, padding to card`,
    );
    runFfmpeg(buildOgFfmpegArgs(nativePath, cardPath, target));

    if (!options.keepIntermediate) {
        rmSync(nativePath, { force: true });
    }
}

/**
 * Parse argv, capture one or every demo's card, and write them into the output directory.
 *
 * @returns {Promise<void>}
 */
async function main() {
    let options;

    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(`${error.message}\n${USAGE}`);
        process.exit(1);
    }

    const outDir = resolveOutDir(options.out, process.cwd());

    // Each demo's own `@ogScale` header tag, read once. Silence buildRegistry's soft warns: a
    // missing @description is check:demo-registry's business, not a reason to noise up a capture.
    const originalWarn = console.warn;
    console.warn = () => {};
    const registry = buildRegistry(PACKAGE_ROOT);
    console.warn = originalWarn;

    const ogScaleBySlug = new Map(registry.map((entry) => [entry.slug, entry.ogScale]));
    const pending = options.force
        ? options.slugs
        : options.slugs.filter((slug) => !existsSync(buildOgImagePath(outDir, slug)));
    const skipped = options.slugs.length - pending.length;

    if (skipped > 0) {
        console.log(`Skipping ${skipped} slug(s) that already have a card (pass --force to re-capture).`);
    }

    if (options.dryRun) {
        console.log(`Would capture ${pending.length} card(s) at ${OG_IMAGE_WIDTH}x${OG_IMAGE_HEIGHT} into ${outDir}`);
        console.log(
            `Would open ${options.baseUrl} at ${VIEWPORT_WIDTH}x${VIEWPORT_HEIGHT} (dpr ${DEVICE_SCALE_FACTOR})`,
        );

        for (const slug of pending) {
            console.log(`  ${slug} -> ${buildOgImagePath(outDir, slug)}`);
        }

        return;
    }

    if (pending.length === 0) {
        console.log('Nothing to capture.');
        return;
    }

    // Fail before opening a browser, not after 46 screenshots.
    const ffmpegProbe = spawnSync('ffmpeg', ['-hide_banner', '-version'], { stdio: 'ignore' });

    if (ffmpegProbe.error || ffmpegProbe.status !== 0) {
        throw new Error('ffmpeg is required for the card render but was not found on PATH.');
    }

    mkdirSync(outDir, { recursive: true });

    const failures = [];

    let browser;

    try {
        // One browser for the whole run: 46 cold starts would roughly triple the wall-clock
        // time, and each navigation tears the previous demo's WebGPU device down.
        const launched = await launchCaptureBrowser({
            viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
            deviceScaleFactor: DEVICE_SCALE_FACTOR,
        });
        browser = launched.browser;

        for (const [index, slug] of pending.entries()) {
            console.log(`\n[${index + 1}/${pending.length}] ${slug}`);

            try {
                await captureOne(launched.page, slug, { ...options, out: outDir, ogScaleBySlug });
            } catch (error) {
                // Keep going: one demo that will not initialize should not cost the other 45.
                console.error(`  FAILED: ${error.message}`);
                failures.push(slug);
            }
        }
    } finally {
        if (browser) {
            await browser.close();
        }
    }

    console.log(`\nCaptured ${pending.length - failures.length} card(s) into ${outDir}`);

    if (failures.length > 0) {
        console.error(`${failures.length} failed: ${failures.join(', ')}`);
        process.exit(1);
    }
}

// Only run when invoked directly, so the helpers above stay importable from tests.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    await main();
}

// #endregion
