#!/usr/bin/env node
/**
 * Check all Markdown files for dead links using markdown-link-check.
 * Scans README, docs/, .claude/, and any other tracked-style paths (skips build artifacts).
 * Files are checked concurrently (bounded by CONCURRENCY); each file's output
 * prints as one block once it completes, so output order follows completion
 * order rather than file order.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const MLC_BIN = require.resolve('markdown-link-check/markdown-link-check');
const CONFIG = join(ROOT, '.github/markdown-link-check.json');
const HOSTED_DEMOS_PATTERN = '^https://demos\\.blit386\\.dev(/|$)';
const IGNORED_DIRS = new Set([
    'node_modules',
    'dist',
    '.git',
    'coverage',
    'coverage-visual',
    '.nyc_output',
    'tmp',
    'test-results',
    'playwright-report',
]);
const CONCURRENCY = 8;

/**
 * Cloudflare returns 403 to GitHub Actions datacenter IPs for the hosted demos site.
 * Keep local link checks; skip those URLs only in CI.
 *
 * @returns {string}
 */
function resolveConfigPath() {
    if (process.env.GITHUB_ACTIONS !== 'true') {
        return CONFIG;
    }

    const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
    const alreadyIgnored = config.ignorePatterns.some(({ pattern }) => pattern === HOSTED_DEMOS_PATTERN);

    if (!alreadyIgnored) {
        config.ignorePatterns.push({ pattern: HOSTED_DEMOS_PATTERN });
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'mlc-config-'));
    const tempConfig = join(tempDir, 'markdown-link-check.json');

    writeFileSync(tempConfig, JSON.stringify(config, null, 2));

    console.log('Note: skipping demos.blit386.dev link probes in GitHub Actions (Cloudflare blocks CI IPs).');

    return tempConfig;
}

const configPath = resolveConfigPath();

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

/** @param {string} filePath @returns {Promise<boolean>} */
function checkFile(filePath) {
    const rel = relative(ROOT, filePath);

    return new Promise((settle) => {
        const child = spawn(process.execPath, [MLC_BIN, rel, '-c', configPath], { cwd: ROOT });
        let output = '';
        child.stdout.on('data', (chunk) => {
            output += chunk;
        });
        child.stderr.on('data', (chunk) => {
            output += chunk;
        });

        child.on('error', () => {
            console.log(`\nFILE: ./${rel}`);
            process.stdout.write(output);
            settle(false);
        });

        child.on('close', (code) => {
            console.log(`\nFILE: ./${rel}`);
            process.stdout.write(output);
            settle(code === 0);
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
