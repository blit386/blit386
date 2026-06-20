#!/usr/bin/env node
/**
 * Check all Markdown files for dead links using markdown-link-check.
 * Recursively scans all directories from the repo root, skipping only those
 * listed in IGNORED_DIRS (node_modules, dist, .git, and other build artifacts).
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
        if (/\.(md|mdx)$/u.test(entry.name)) {
            files.push(join(dir, entry.name));
        }
    }
}

/** @type {string[]} */
const files = [];
walkMarkdownFiles(ROOT, files);
files.sort((a, b) => a.localeCompare(b));

let failed = 0;

for (const filePath of files) {
    const rel = relative(ROOT, filePath);
    console.log(`\nFILE: ./${rel}`);
    const result = spawnSync(process.execPath, [MLC_BIN, rel, '-c', CONFIG], {
        cwd: ROOT,
        stdio: 'inherit',
    });
    if (result.error || result.status !== 0) {
        failed += 1;
    }
}

if (failed > 0) {
    console.error(`\nERROR: ${failed} file(s) with dead links found!`);
    process.exit(1);
}

console.log(`\n${files.length} markdown file(s) checked.`);
