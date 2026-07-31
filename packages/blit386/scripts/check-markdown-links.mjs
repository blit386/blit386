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
 * Files are checked concurrently (bounded by CONCURRENCY); each file's output
 * prints as one block once it completes, so output order follows completion
 * order rather than file order.
 */
import { execFileSync, spawn } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const MLC_BIN = require.resolve('markdown-link-check/markdown-link-check');
const CONFIG = join(ROOT, '.github/markdown-link-check.json');
const CONCURRENCY = 8;
// Exceeds the ~170s worst-case single-link retry chain in .github/markdown-link-check.json.
const CHECK_TIMEOUT_MS = 300_000;

/**
 * Lists git-tracked markdown files under the repo root as absolute paths.
 *
 * @returns {string[]}
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
        .map((entry) => join(ROOT, entry));

    if (files.length === 0) {
        console.error('ERROR: docs:links found no tracked markdown files (git ls-files "*.md" "*.mdx").');
        process.exit(1);
    }

    return files;
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

const files = listTrackedMarkdownFiles();
files.sort((a, b) => a.localeCompare(b));

const failed = await checkAll(files);

if (failed > 0) {
    console.error(`\nERROR: ${failed} file(s) with dead links found!`);
    process.exit(1);
}

console.log(`\n${files.length} markdown file(s) checked.`);
