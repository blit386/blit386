#!/usr/bin/env node
// @ts-nocheck
/**
 * Check all Markdown files for dead links using markdown-link-check.
 * Recursively scans all directories from the repo root, skipping only those
 * listed in IGNORED_DIRS (node_modules, dist, .git, and other build artifacts).
 * Files are checked concurrently (bounded by CONCURRENCY); each file's output
 * prints as one block once it completes, so output order follows completion
 * order rather than file order.
 */
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const MLC_BIN = require.resolve('markdown-link-check/markdown-link-check');
const CONFIG = join(ROOT, '.github/markdown-link-check.json');
const IGNORED_DIRS = new Set([
    'node_modules',
    'dist',
    '.git',
    '.source',
    'coverage',
    'coverage-visual',
    '.nyc_output',
    'tmp',
    '.wrangler',
]);
const CONCURRENCY = 8;
const CHECK_TIMEOUT_MS = 120_000;

/**
 * Repo-relative path patterns to skip. Generated doc pages
 * (`content/docs/<section>/**`) are mirrored from blit386/docs, where they are
 * already link-checked; the hand-authored hub (`content/docs/index.mdx`) and
 * root meta stay in scope.
 */
const IGNORED_PATH_PATTERNS = [/^content\/docs\/[^/]+\//u];

/** @param {string} rel */
export const normalizeRelSep = (rel) => rel.split('\\').join('/');

/** @param {string} filePath */
export function isIgnoredFile(filePath) {
    const rel = normalizeRelSep(relative(ROOT, filePath));

    return IGNORED_PATH_PATTERNS.some((pattern) => pattern.test(rel));
}

/** @param {string} dir @param {string[]} files */
function walkMarkdownFiles(dir, files) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (IGNORED_DIRS.has(entry.name)) {
                continue;
            }
            walkMarkdownFiles(join(dir, entry.name), files);
            continue;
        }
        if (/\.(md|mdx)$/u.test(entry.name) && !isIgnoredFile(join(dir, entry.name))) {
            files.push(join(dir, entry.name));
        }
    }
}

/** @param {string} filePath @returns {Promise<boolean>} */
function checkFile(filePath) {
    const rel = relative(ROOT, filePath);

    return new Promise((settle) => {
        const child = spawn(process.execPath, [MLC_BIN, rel, '-c', CONFIG], {
            cwd: ROOT,
            signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        });
        let output = '';
        let settled = false;

        child.stdout.on('data', (chunk) => {
            output += chunk;
        });
        child.stderr.on('data', (chunk) => {
            output += chunk;
        });

        function finish(ok) {
            if (settled) {
                return;
            }
            settled = true;
            console.log(`\nFILE: ./${rel}`);
            process.stdout.write(output);
            settle(ok);
        }

        child.on('error', (err) => {
            output += `\n[spawn error] ${err.message}\n`;
            finish(false);
        });

        child.on('close', (code) => {
            finish(code === 0);
        });
    });
}

/** @param {string[]} files @returns {Promise<number>} */
async function checkAll(files) {
    let nextIndex = 0;
    let failed = 0;

    async function worker() {
        while (nextIndex < files.length) {
            const filePath = files.at(nextIndex);
            nextIndex += 1;
            const ok = await checkFile(filePath);
            if (!ok) {
                failed += 1;
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

    return failed;
}

const main = async () => {
    /** @type {string[]} */
    const files = [];
    walkMarkdownFiles(ROOT, files);
    files.sort((a, b) => a.localeCompare(b));

    const failed = await checkAll(files);

    if (failed > 0) {
        console.error(`\nERROR: ${failed} file(s) with dead links found!`);
        process.exit(1);
    }

    console.log(`\n${files.length} markdown file(s) checked.`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
