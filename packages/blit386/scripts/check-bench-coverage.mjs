#!/usr/bin/env node
/**
 * Advisory pre-push reminder for the local benchmark workflow (see `docs/performance-testing.md`, the
 * `/perf` skill): prints a note when a push touches one of the engine's hot-path directories without
 * touching any `*.bench.ts` file. The check is push-wide, not per-file – any `*.bench.ts` touched
 * anywhere in the push counts as "benchmarks were considered," not only one colocated with the exact
 * hot file that changed (see `checkBenchCoverage`'s tests for why: per-file matching has no reliable
 * way to know which benchmark covers a given change, and a wrong guess would train people to ignore
 * the reminder). This cannot know whether a given change actually needed a benchmark either way, so it
 * never fails – it only makes the local baseline/compare loop hard to forget about. `HOT_PATH_DIRS`
 * below and the `paths:` glob in `.claude/rules/bench-coverage.md` name the same six directories;
 * update both together.
 *
 * Usage:
 *   node scripts/check-bench-coverage.mjs --base <git-ref>
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Hot-path source directories, relative to this package root. Keep in sync with `.claude/rules/bench-coverage.md`. */
export const HOT_PATH_DIRS = ['src/render/', 'src/input/', 'src/overlay/', 'src/core/', 'src/assets/', 'src/utils/'];

/**
 * @param {string[]} changedFiles Paths relative to this package root (as `git diff --name-only` reports them).
 * @returns {{ hotFiles: string[], benchFilesTouched: string[], needsReminder: boolean }} Which hot-path source files
 *   changed, which `*.bench.ts` files changed alongside them, and whether a reminder is warranted.
 */
export function checkBenchCoverage(changedFiles) {
    const hotFiles = changedFiles.filter(
        (file) =>
            HOT_PATH_DIRS.some((dir) => file.startsWith(dir)) &&
            file.endsWith('.ts') &&
            !file.endsWith('.bench.ts') &&
            !file.endsWith('.test.ts'),
    );
    const benchFilesTouched = changedFiles.filter((file) => file.endsWith('.bench.ts'));

    return { hotFiles, benchFilesTouched, needsReminder: hotFiles.length > 0 && benchFilesTouched.length === 0 };
}

/**
 * @param {string} baseRef Git ref to diff the current worktree against.
 * @returns {string[]} Changed `src/` file paths relative to this package root, or `[]` if the diff cannot be
 *   computed (for example, `baseRef` does not exist locally) – this reminder is best-effort, never fatal.
 */
function changedFilesSince(baseRef) {
    try {
        const output = execFileSync('git', ['diff', '--name-only', `${baseRef}...HEAD`, '--', 'src'], {
            cwd: ROOT,
            encoding: 'utf8',
        });

        return output.split('\n').filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * @param {{ hotFiles: string[] }} report Result of {@link checkBenchCoverage}.
 * @returns {void}
 */
function printReminder({ hotFiles }) {
    console.log('');
    console.log('[reminder] This push changes engine hot-path code, but no *.bench.ts file was touched:');

    for (const file of hotFiles) {
        console.log(`  - packages/blit386/${file}`);
    }

    console.log('  If this changed a hot method or allocation pattern, add/extend a benchmark and run the local');
    console.log('  baseline/compare loop before merging - see docs/performance-testing.md or the /perf skill.');
    console.log('  (Advisory only, this does not block the push.)');
    console.log('');
}

/**
 * CLI entry point. Always resolves to exit code 0 – see file header.
 *
 * @returns {number} Always `0`.
 */
function main() {
    const baseRefIndex = process.argv.indexOf('--base');
    const baseRef = baseRefIndex === -1 ? null : process.argv[baseRefIndex + 1];

    if (!baseRef) {
        return 0;
    }

    const report = checkBenchCoverage(changedFilesSince(baseRef));

    if (report.needsReminder) {
        printReminder(report);
    }

    return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    process.exitCode = main();
}
