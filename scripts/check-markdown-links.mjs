#!/usr/bin/env node
/**
 * Check all Markdown files for dead links using markdown-link-check.
 *
 * The file list comes from `git ls-files "*.md" "*.mdx"`, so enumeration honors
 * `.gitignore` and only covers tracked markdown (no recursive walk / denylist).
 * Symlinked `.agents/skills/*` entries are intentionally skipped: git tracks them
 * as symlink blobs and lists the underlying `.claude/skills/*` markdown directly,
 * so those files are checked exactly once and never double-processed.
 *
 * Generated doc pages under `packages/website/content/docs/<section>/**` are also
 * skipped: they are mirrored from `packages/blit386/docs/` via
 * `pnpm run sync:docs`, where the source is already link-checked. The hand-authored
 * hub (`content/docs/index.mdx`) and root `content/docs/meta.json` stay in scope.
 *
 * Files are checked concurrently (bounded by CONCURRENCY); each file's output
 * prints as one block once it completes, so output order follows completion
 * order rather than file order.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const MLC_BIN = require.resolve('markdown-link-check/markdown-link-check');
const CONFIG = join(ROOT, '.github/markdown-link-check.json');
const HOSTED_DEMOS_PATTERN = '^https://demos\\.blit386\\.dev(/|$)';
const CONCURRENCY = 8;

// Exceeds the ~170s worst-case single-link retry chain in .github/markdown-link-check.json.
const CHECK_TIMEOUT_MS = 300_000;

/** Repo-relative path patterns to skip; see the file header for what and why. */
const IGNORED_PATH_PATTERNS = [/^packages\/website\/content\/docs\/[^/]+\//u];

/** @param {string} rel @returns {string} */
export const normalizeRelSep = (rel) => rel.split('\\').join('/');

/** @param {string} filePath @returns {boolean} */
export function isIgnoredFile(filePath) {
    const rel = normalizeRelSep(relative(ROOT, filePath));

    return IGNORED_PATH_PATTERNS.some((pattern) => pattern.test(rel));
}

/**
 * Lists git-tracked markdown files under the repo root as absolute paths, excluding
 * generated doc-mirror pages (see `isIgnoredFile`).
 *
 * @returns {string[]} Absolute paths to tracked markdown files.
 */
function listTrackedMarkdownFiles() {
    let output;

    try {
        output = execFileSync('git', ['ls-files', '*.md', '*.mdx'], {
            cwd: ROOT,
            encoding: 'utf8',
        });
    } catch {
        console.error('ERROR: docs:links requires a git checkout to enumerate tracked markdown.');
        process.exit(1);
    }

    const files = output
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => join(ROOT, entry))
        .filter((filePath) => !isIgnoredFile(filePath));

    if (files.length === 0) {
        console.error('ERROR: docs:links found no tracked markdown files (git ls-files "*.md" "*.mdx").');
        process.exit(1);
    }

    return files;
}

/**
 * Cloudflare returns 403 to GitHub Actions datacenter IPs for the hosted demos site.
 * Keep local link checks; skip those URLs only in CI.
 *
 * @returns {string} Path to the markdown-link-check config file.
 */
function resolveConfigPath() {
    if (process.env.GITHUB_ACTIONS !== 'true') {
        return CONFIG;
    }

    const config = JSON.parse(readFileSync(CONFIG, 'utf8'));

    config.ignorePatterns.push({ pattern: HOSTED_DEMOS_PATTERN });

    const tempDir = mkdtempSync(join(tmpdir(), 'mlc-config-'));
    const tempConfig = join(tempDir, 'markdown-link-check.json');

    writeFileSync(tempConfig, JSON.stringify(config, null, 2));

    console.log('Note: skipping demos.blit386.dev link probes in GitHub Actions (Cloudflare blocks CI IPs).');

    return tempConfig;
}

/**
 * Runs markdown-link-check on one file and resolves whether it passed. Never rejects
 * (spawn errors and timeouts resolve `false`), and buffers stdout/stderr to print as a
 * single block on completion so concurrent workers don't interleave output.
 *
 * @param {string} filePath File path to check.
 * @param {string} configPath Path to the markdown-link-check config file.
 * @returns {Promise<boolean>} Whether the file passed the link check.
 */
function checkFile(filePath, configPath) {
    const rel = relative(ROOT, filePath);

    return new Promise((settle) => {
        const child = spawn(process.execPath, [MLC_BIN, rel, '-c', configPath], {
            cwd: ROOT,
            signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        });

        let output = '';
        let settled = false;

        const collect = (chunk) => {
            output += chunk;
        };

        child.stdout.on('data', collect);
        child.stderr.on('data', collect);

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
            output +=
                err.name === 'AbortError'
                    ? `\n[spawn error] check timed out after ${CHECK_TIMEOUT_MS}ms\n`
                    : `\n[spawn error] ${err.message}\n`;

            finish(false);
        });

        child.on('close', (code) => {
            finish(code === 0);
        });
    });
}

/**
 * Checks all files concurrently via a fixed-size worker pool (bounded by CONCURRENCY)
 * pulling from a shared index, so output order follows completion order rather than
 * `files` order.
 *
 * @param {string[]} files
 * @param {string} configPath
 * @returns {Promise<number>} the number of files that failed
 */
async function checkAll(files, configPath) {
    let nextIndex = 0;
    let failed = 0;

    async function worker() {
        while (nextIndex < files.length) {
            const filePath = files.at(nextIndex);

            nextIndex += 1;

            const ok = await checkFile(filePath, configPath);

            if (!ok) {
                failed += 1;
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

    return failed;
}

async function main() {
    const files = listTrackedMarkdownFiles();

    files.sort((a, b) => a.localeCompare(b));

    const configPath = resolveConfigPath();
    const failed = await checkAll(files, configPath);

    if (failed > 0) {
        console.error(`\nERROR: ${failed} file(s) with dead links found!`);
        process.exit(1);
    }

    console.log(`\n${files.length} markdown file(s) checked.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
