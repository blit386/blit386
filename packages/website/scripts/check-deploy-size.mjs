#!/usr/bin/env node
/**
 * Fail the build before `wrangler deploy` does, on either Cloudflare size limit:
 *
 * - Every static asset under `dist/public` must stay under Cloudflare's 25 MiB per-asset
 *   cap. The client search index `/api/search` is the one at risk - BT-557's kit pages
 *   briefly pushed it to 28.8 MiB, and only a manual dry-run caught it.
 * - The Worker upload (`dist/server`) must stay under an 8 MiB gzip budget, 80% of the
 *   10 MiB paid-plan limit, so growth shows up as a failing check with headroom left.
 *
 * The gzip number is wrangler's own (`wrangler deploy --dry-run`, no auth or network
 * needed), not a re-measurement: it is the figure Cloudflare enforces, and wrangler
 * decides which `dist/server` files are modules.
 *
 * Requires a build to have already run (`pnpm run build`) - see `preflight` in
 * package.json for the ordering.
 *
 * Usage:
 *   node scripts/check-deploy-size.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_PUBLIC_DIR = join(PACKAGE_ROOT, 'dist', 'public');
const DIST_SERVER_WRANGLER_CONFIG = join(PACKAGE_ROOT, 'dist', 'server', 'wrangler.json');

const KIB = 1024;
const MIB = 1024 * KIB;
export const MAX_ASSET_BYTES = 25 * MIB;
const WORKER_GZIP_BUDGET_BYTES = 8 * MIB;

const TOTAL_UPLOAD_PATTERN = /Total Upload:\s*([\d.]+)\s*KiB\s*\/\s*gzip:\s*([\d.]+)\s*KiB/u;

/** @param {number} bytes @returns {string} */
function formatMiB(bytes) {
    return `${(bytes / MIB).toFixed(2)} MiB`;
}

/**
 * Extracts the gzip upload size from `wrangler deploy --dry-run` output.
 *
 * @param {string} output
 * @returns {number | null} Bytes, or null when the summary line is missing.
 */
export function parseWranglerGzipBytes(output) {
    const match = TOTAL_UPLOAD_PATTERN.exec(stripVTControlCharacters(output));
    return match ? Math.round(Number(match[2]) * KIB) : null;
}

/**
 * Lists every file under `dir`, largest first.
 *
 * @param {string} dir
 * @returns {{ path: string, bytes: number }[]} Paths relative to `dir`.
 */
export function listFilesBySize(dir) {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => {
            const path = join(entry.parentPath, entry.name);
            return { path: relative(dir, path), bytes: statSync(path).size };
        })
        .sort((a, b) => b.bytes - a.bytes);
}

/**
 * @param {{ path: string, bytes: number }[]} files
 * @returns {string[]} One failure message per file over Cloudflare's per-asset limit.
 */
export function findOversizedAssets(files) {
    return files
        .filter((file) => file.bytes > MAX_ASSET_BYTES)
        .map(
            (file) =>
                `dist/public/${file.path} is ${formatMiB(file.bytes)}, over Cloudflare's ${formatMiB(MAX_ASSET_BYTES)} per-asset limit`,
        );
}

/** @param {string[]} failures @returns {never} */
function fail(failures) {
    console.error('Deploy size check failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

function main() {
    for (const required of [DIST_SERVER_WRANGLER_CONFIG, DIST_PUBLIC_DIR]) {
        if (!existsSync(required)) {
            console.error(
                `check:deploy-size requires a build first - ${required} does not exist. Run "pnpm run build".`,
            );
            process.exit(1);
        }
    }

    const [largest, ...rest] = listFilesBySize(DIST_PUBLIC_DIR);
    if (!largest) fail([`${DIST_PUBLIC_DIR} is empty - the build did not emit any static assets`]);
    console.log(
        `Largest asset: dist/public/${largest.path}, ${formatMiB(largest.bytes)} (limit ${formatMiB(MAX_ASSET_BYTES)})`,
    );
    // Checked before wrangler runs: an oversized asset makes the dry-run itself fail.
    const oversized = findOversizedAssets([largest, ...rest]);
    if (oversized.length > 0) fail(oversized);

    // Run wrangler's own bin with this Node rather than `pnpm exec`: no `.cmd` shim to need a
    // shell on Windows, and no pnpm deps check that could reinstall node_modules mid-check.
    const wranglerPackageJson = createRequire(import.meta.url).resolve('wrangler/package.json');
    const wranglerBin = join(
        dirname(wranglerPackageJson),
        JSON.parse(readFileSync(wranglerPackageJson, 'utf8')).bin.wrangler,
    );
    const wrangler = spawnSync(
        process.execPath,
        [wranglerBin, 'deploy', '--dry-run', '--config', DIST_SERVER_WRANGLER_CONFIG],
        {
            cwd: PACKAGE_ROOT,
            encoding: 'utf8',
            env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' },
        },
    );
    if (wrangler.error) fail([`could not run wrangler: ${wrangler.error.message}`]);
    const output = wrangler.stdout + wrangler.stderr;
    const gzipBytes = parseWranglerGzipBytes(output);
    if (wrangler.status !== 0 || gzipBytes === null) {
        fail([`wrangler deploy --dry-run did not report an upload size (exit ${wrangler.status}):\n${output}`]);
    }

    console.log(`Worker upload: ${formatMiB(gzipBytes)} gzip (budget ${formatMiB(WORKER_GZIP_BUDGET_BYTES)})`);
    if (gzipBytes > WORKER_GZIP_BUDGET_BYTES) {
        fail([
            `Worker upload is ${formatMiB(gzipBytes)} gzip, over the ${formatMiB(WORKER_GZIP_BUDGET_BYTES)} budget (Cloudflare's paid-plan limit is 10 MiB)`,
        ]);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
