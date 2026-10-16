#!/usr/bin/env node
/**
 * Headless driver for the /shots capture page.
 *
 * Opens `/shots?auto&demos=...&variants=...` in installed Chrome through Playwright (the same
 * session helpers the OG and clip scripts use), waits for the page to finish its run, and
 * writes the PNGs plus a merged manifest.json into public/shots/. The page is the capture
 * engine; this script only ferries bytes to disk, so a capture made here is byte-identical
 * to one saved from the page.
 *
 * --changed compares the working tree against the merge base of origin/main and HEAD (so commits that
 * only landed on main do not count) and includes untracked files. A change under src/shared/ or to
 * _shots/poses.js selects every demo; otherwise only the demos whose src/<slug>.js changed.
 *
 * Usage: pnpm run capture:shots -- --all | --demos a,b | --changed [--variants display,uidebug]
 *        [--out <dir>] [--base-url http://localhost:5173] [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { COMMITTED_VARIANTS, VARIANTS } from '../_shots/poses.js';
import { DEMO_ORDER } from '../plugins/demo-order.js';
import { launchCaptureBrowser } from './playwright-session.mjs';

// #region Configuration

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = resolve(SCRIPTS_DIR, '..');
export const DEFAULT_OUT_DIR = join('public', 'shots');
const SHOTS_PATH = 'shots';
const RESULT_TIMEOUT_MS = 20 * 60 * 1000;
// A src/shared change can move every panel, so every demo is re-captured.
const SHARED_PREFIX = 'packages/demos/src/shared/';
// The pose table decides what every demo captures, so an edit to it re-captures every demo.
const POSES_PATH = 'packages/demos/_shots/poses.js';
const DEMO_SOURCE_PATTERN = /^packages\/demos\/src\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\.js$/;

export const DEFAULTS = {
    out: '',
    baseUrl: 'http://localhost:5173',
};

const STRING_OPTIONS = { '--out': 'out', '--base-url': 'baseUrl', '--demos': 'demos', '--variants': 'variantList' };
const BOOLEAN_OPTIONS = { '--all': 'all', '--changed': 'changed', '--dry-run': 'dryRun' };

// #endregion

// #region Pure helpers

/* eslint-disable complexity, security/detect-object-injection */

/**
 * @param {string[]} argv
 * @returns {{ slugs: string[], variants: string[], out: string, baseUrl: string, all: boolean, changed: boolean, dryRun: boolean }}
 */
export function parseArgs(argv) {
    const options = { ...DEFAULTS, all: false, changed: false, dryRun: false, demos: '', variantList: '' };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        // pnpm forwards the separator of `pnpm run capture:shots -- --all` to the script.
        if (arg === '--') {
            continue;
        }

        if (Object.hasOwn(BOOLEAN_OPTIONS, arg)) {
            options[BOOLEAN_OPTIONS[arg]] = true;
            continue;
        }

        if (Object.hasOwn(STRING_OPTIONS, arg)) {
            const value = argv[index + 1];

            if (value === undefined || value.startsWith('--')) {
                throw new Error(`${arg} requires a value.`);
            }

            options[STRING_OPTIONS[arg]] = value;
            index += 1;
            continue;
        }

        throw new Error(`Unknown option: ${arg}`);
    }

    const selections = [options.all, options.changed, options.demos !== ''].filter(Boolean).length;

    if (selections === 0) {
        throw new Error('Pass --all, --demos, or --changed.');
    }

    if (selections > 1) {
        throw new Error('Pass only one of --all, --demos, --changed.');
    }

    const slugs = options.demos ? options.demos.split(',').filter(Boolean) : options.all ? [...DEMO_ORDER] : [];

    if (options.demos && slugs.length === 0) {
        throw new Error('--demos requires at least one slug.');
    }

    for (const slug of slugs) {
        if (!DEMO_ORDER.includes(slug)) {
            throw new Error(`Unknown demo slug: ${slug}`);
        }
    }

    const variants = options.variantList ? options.variantList.split(',').filter(Boolean) : [...COMMITTED_VARIANTS];

    for (const variant of variants) {
        if (!VARIANTS.includes(variant)) {
            throw new Error(`Unknown variant: ${variant}`);
        }
    }

    return {
        slugs,
        variants,
        out: options.out,
        baseUrl: options.baseUrl,
        all: options.all,
        changed: options.changed,
        dryRun: options.dryRun,
    };
}

/* eslint-enable complexity, security/detect-object-injection */

/**
 * Demos to re-capture for a set of changed files (repo-relative paths).
 *
 * @param {string[]} changedPaths
 * @param {string[]} order - DEMO_ORDER.
 * @returns {string[]}
 */
export function selectChanged(changedPaths, order) {
    if (changedPaths.some((path) => path.startsWith(SHARED_PREFIX) || path === POSES_PATH)) {
        return [...order];
    }

    const changed = new Set(
        changedPaths.map((path) => path.match(DEMO_SOURCE_PATTERN)?.[1]).filter((slug) => slug !== undefined),
    );

    return order.filter((slug) => changed.has(slug));
}

/**
 * @param {string} baseUrl
 * @param {string[]} slugs
 * @param {string[]} variants
 * @returns {string}
 */
export function buildAutoUrl(baseUrl, slugs, variants) {
    const params = new URLSearchParams({ demos: slugs.join(','), variants: variants.join(',') });

    return `${baseUrl.replace(/\/$/u, '')}/${SHOTS_PATH}?auto&${params.toString()}`;
}

/**
 * Resolve an image path from the page against the output directory.
 *
 * @param {string} outDir - Absolute output directory.
 * @param {string} imagePath - Path reported by the page, relative to outDir.
 * @returns {string | null} The absolute target, or null when it would land outside outDir.
 */
export function resolveImageTarget(outDir, imagePath) {
    const target = resolve(outDir, imagePath);

    return target.startsWith(outDir + sep) ? target : null;
}

/**
 * One line per captured tile plus the lint total, for the demos of this run.
 *
 * @param {Array<{ slug: string, pose: string, variants: object, lint: unknown[], error?: string | null }>} entries
 * @param {string[]} slugs
 * @returns {string[]}
 */
export function summarizeEntries(entries, slugs) {
    const lines = [];
    let total = 0;

    for (const entry of entries.filter((item) => slugs.includes(item.slug))) {
        const count = entry.lint.length;
        const variants = Object.keys(entry.variants).join(', ');

        total += count;
        lines.push(
            `  ${entry.slug}/${entry.pose}: ${variants || 'no variants'}, lint ${count}${entry.error ? `, ${entry.error}` : ''}`,
        );
    }

    lines.push(`lint findings in total: ${total}`);

    return lines;
}

/**
 * Whether a directory really lives inside outDir once symlinks are followed, which the lexical
 * check in resolveImageTarget cannot see. The directory need not exist yet: its nearest existing
 * parent decides, so nothing has to be created before the check.
 *
 * @param {string} outDir - Existing directory.
 * @param {string} dir
 * @returns {boolean}
 */
export function isInsideRealDir(outDir, dir) {
    let existing = dir;

    while (!existsSync(existing)) {
        existing = dirname(existing);
    }

    const root = realpathSync(outDir);
    const real = realpathSync(existing);

    return real === root || real.startsWith(root + sep);
}

// #endregion

// #region Main

function changedPathsFromGit() {
    const git = (args) => execFileSync('git', args, { cwd: PACKAGE_ROOT, encoding: 'utf8' });
    const mergeBase = git(['merge-base', 'origin/main', 'HEAD']).trim();
    // --full-name keeps untracked paths repo-relative, like diff --name-only.
    const untracked = git(['ls-files', '--others', '--exclude-standard', '--full-name']);

    return [...git(['diff', '--name-only', mergeBase]).split('\n'), ...untracked.split('\n')].filter(Boolean);
}

function engineVersion() {
    return JSON.parse(readFileSync(resolve(PACKAGE_ROOT, '../blit386/package.json'), 'utf8')).version;
}

/**
 * Open the auto URL and return the page's `window.__shotsResult`, or null on timeout.
 *
 * @param {string} url
 * @returns {Promise<{ manifest: object | null, images: { path: string, base64: string }[], failures: string[] } | null>}
 */
async function runPage(url) {
    const { browser, page } = await launchCaptureBrowser();

    try {
        try {
            await page.goto(url);
        } catch (error) {
            // Thrown, not process.exit: the finally below still closes the browser.
            throw new Error(`Could not reach ${new URL(url).origin} - is the dev server running? (${error.message})`, {
                cause: error,
            });
        }

        try {
            await page.waitForFunction('window.__shotsResult !== undefined', null, { timeout: RESULT_TIMEOUT_MS });
        } catch {
            return null;
        }

        return await page.evaluate('window.__shotsResult');
    } finally {
        await browser.close();
    }
}

/**
 * Write the page's images under outDir, adding each refused or unwritable one to `failures`.
 *
 * @param {string} outDir
 * @param {{ path: string, base64: string }[]} images
 * @param {string[]} failures
 */
function writeImages(outDir, images, failures) {
    for (const image of images) {
        if (typeof image?.path !== 'string' || typeof image.base64 !== 'string') {
            failures.push('refused a malformed image entry (it needs a string path and a string base64)');
            continue;
        }

        const target = resolveImageTarget(outDir, image.path);

        if (target === null) {
            failures.push(`refused path outside output dir: ${image.path}`);
            continue;
        }

        if (!isInsideRealDir(outDir, dirname(target))) {
            failures.push(`refused path that leaves the output dir through a symlink: ${image.path}`);
            continue;
        }

        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, Buffer.from(image.base64, 'base64'));
        console.log(`  wrote ${image.path}`);
    }
}

async function main() {
    let options;

    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }

    const slugs = options.changed ? selectChanged(changedPathsFromGit(), DEMO_ORDER) : options.slugs;
    const outDir = options.out ? resolve(process.cwd(), options.out) : resolve(PACKAGE_ROOT, DEFAULT_OUT_DIR);

    if (slugs.length === 0) {
        console.log('Nothing changed - no demos to capture.');
        return;
    }

    const url = buildAutoUrl(options.baseUrl, slugs, options.variants);

    if (options.dryRun) {
        console.log(`Would open ${url} and write into ${outDir}`);
        return;
    }

    let result;

    try {
        result = await runPage(url);
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }

    if (result === null) {
        console.error(`The page never produced window.__shotsResult within ${RESULT_TIMEOUT_MS / 1000}s (${url}).`);
        process.exit(1);
    }

    const failures = [...(result.failures ?? [])];

    if (!Array.isArray(result.manifest?.entries) || !Array.isArray(result.images)) {
        console.error(
            `The capture run failed:\n  ${failures.length > 0 ? failures.join('\n  ') : 'malformed __shotsResult'}`,
        );
        process.exit(1);
    }

    mkdirSync(outDir, { recursive: true });

    writeImages(outDir, result.images, failures);

    const manifest = { ...result.manifest, engineVersion: engineVersion() };

    writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`\n${result.images.length} image(s), manifest with ${manifest.entries.length} entries in ${outDir}`);
    console.log(summarizeEntries(manifest.entries, slugs).join('\n'));

    if (failures.length > 0) {
        console.error(`${failures.length} failed:\n  ${failures.join('\n  ')}`);
        process.exit(1);
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    await main();
}

// #endregion
