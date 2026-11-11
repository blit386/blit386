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
 * Test fixtures (any `__fixtures__/` directory) are skipped too: they are test input,
 * and some link to missing files on purpose (the docs-mirror generator's fallback tests).
 *
 * Files are checked concurrently (bounded by CONCURRENCY); each file's output
 * prints as one block once it completes, so output order follows completion
 * order rather than file order.
 *
 * `#fragments` are checked by this script, not by markdown-link-check: the config
 * ignores `^#` links, and the tool drops the fragment of `other.md#frag`. After the
 * tool runs, `deadAnchors` resolves every relative `#frag` / `file.md#frag` against
 * the target page's headings with `headingAnchors`, the slug rule blit386.dev and
 * GitHub both use, so there is one slug rule rather than the tool's own as well.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { gitEnv } from './lib/git-env.mjs';
import { headingAnchors } from './lib/heading-anchors.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const MLC_BIN = require.resolve('markdown-link-check/markdown-link-check');
const CONFIG = join(ROOT, '.github/markdown-link-check.json');
const HOSTED_DEMOS_PATTERN = '^https://demos\\.blit386\\.dev(/|$)';
const CONCURRENCY = 8;

// Exceeds the ~170s worst-case single-link retry chain in .github/markdown-link-check.json.
const CHECK_TIMEOUT_MS = 300_000;

/** Repo-relative path patterns to skip; see the file header for what and why. */
const IGNORED_PATH_PATTERNS = [/^packages\/website\/content\/docs\/[^/]+\//u, /(?:^|\/)__fixtures__\//u];

const FENCED_BLOCK_PATTERN = /^ {0,3}(`{3,}|~{3,})[\s\S]*?^ {0,3}\1/gmu;
const CODE_SPAN_PATTERN = /`[^`\n]*`/gu;
// An inline link target, or a reference definition at the start of a line.
const LINK_TARGET_PATTERN = /\]\(\s*<?([^)\s>]+)|^ {0,3}\[[^\]]+\]:\s*<?([^\s>]+)/gmu;
// A scheme (`https:`, `mailto:`) or a site route (`/docs/...`): not a file in this repo.
const NON_FILE_TARGET_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/)/iu;
const MARKDOWN_FILE_PATTERN = /\.mdx?$/u;

/** @type {Map<string, Set<string>>} */
const anchorCache = new Map();

/** @param {string} path @returns {Set<string>} */
function anchorsOf(path) {
    let anchors = anchorCache.get(path);

    if (anchors === undefined) {
        anchors = headingAnchors(readFileSync(path, 'utf8'));
        anchorCache.set(path, anchors);
    }

    return anchors;
}

/** @param {string} fragment @returns {string} The fragment percent-decoded, or as written if it is malformed. */
function decodeFragment(fragment) {
    try {
        return decodeURIComponent(fragment);
    } catch {
        return fragment; // a stray `%` names no heading either way; report it, do not crash the run
    }
}

/**
 * Relative `#frag` and `file.md#frag` link targets in one page whose fragment names no heading
 * on the target page. A missing target file is markdown-link-check's to report, not this pass's.
 *
 * @param {string} filePath Absolute path of the page.
 * @param {string} source The page's Markdown.
 * @returns {string[]} The dead link targets, as written.
 */
export function deadAnchors(filePath, source) {
    const prose = source.replace(FENCED_BLOCK_PATTERN, '').replace(CODE_SPAN_PATTERN, '');
    const dead = [];

    for (const match of prose.matchAll(LINK_TARGET_PATTERN)) {
        const target = match[1] ?? match[2];
        const hashAt = target.indexOf('#');

        if (hashAt < 0 || NON_FILE_TARGET_PATTERN.test(target)) {
            continue;
        }

        const path = target.slice(0, hashAt);
        const page = path === '' ? filePath : resolve(dirname(filePath), path);

        if (!MARKDOWN_FILE_PATTERN.test(page) || !existsSync(page)) {
            continue;
        }

        if (!anchorsOf(page).has(decodeFragment(target.slice(hashAt + 1)))) {
            dead.push(target);
        }
    }

    return dead;
}

/**
 * Runs `deadAnchors` over every file and prints one block per file with a dead anchor.
 *
 * @param {string[]} files
 * @returns {number} the number of files with a dead anchor
 */
function checkAnchors(files) {
    let failed = 0;

    for (const filePath of files) {
        const dead = deadAnchors(filePath, readFileSync(filePath, 'utf8'));

        if (dead.length > 0) {
            failed += 1;
            console.log(`\nFILE: ./${relative(ROOT, filePath)}`);

            for (const target of dead) {
                console.log(`  [x] ${target} -> no such heading`);
            }
        }
    }

    return failed;
}

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
            env: gitEnv(),
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
    const failed = (await checkAll(files, configPath)) + checkAnchors(files);

    if (failed > 0) {
        console.error(`\nERROR: ${failed} check(s) found dead links or anchors!`);
        process.exit(1);
    }

    console.log(`\n${files.length} markdown file(s) checked.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
