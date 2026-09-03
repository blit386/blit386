#!/usr/bin/env node
/**
 * Build the BLIT386 engine automatically when `packages/blit386/dist` is missing – the case for
 * every freshly created checkout or git worktree, since `dist/` is gitignored and only a build
 * produces it. Shared by `packages/demos` and `packages/website`, which hit this in different
 * ways: `packages/demos/vite.config.js` imports `blit386/vite` at the top of the file,
 * unconditionally, so `dev`, `build`, `preview`, and `knip` (which loads `vite.config.js` via its
 * own Vite plugin) all crash before that import is even reached; `packages/website`'s Twoslash
 * pipeline compiles docs samples against the workspace engine (BT-414), so its `test` and `build`
 * fail inside that compilation with TS2307 instead. Run before any of those so the failure
 * self-heals instead of surfacing as a confusing "Cannot find module" error partway through
 * `git push`.
 *
 * Also rebuilds when `dist/` exists but is stale – newer than the checked-in build, but older than
 * `packages/blit386/src`. The engine bundles from roughly 250 source files under `src/`, any one of
 * which can change the public API, so – unlike a single-entry proxy that could miss a change to a
 * file it doesn't happen to re-export through – the whole tree is walked for its newest mtime. That
 * walk is still one `readdirSync` plus one `statSync` per file, not a build: on this codebase's
 * source tree it costs low single-digit milliseconds, negligible next to the seconds a real rebuild
 * takes, so it stays a fast no-op on every normal `demos`/`website` dev, build, test, or `knip` run.
 *
 * A no-op once the engine is built and fresh – one existsSync plus one small directory walk is the
 * only cost on every normal run.
 *
 * Usage (from a package directory):
 *   node ../../scripts/ensure-engine-built.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));

const resolveEngineViteEntry = () => resolve(scriptDir, '..', 'packages', 'blit386', 'dist', 'vite.js');

const resolveEngineSourceDir = () => resolve(scriptDir, '..', 'packages', 'blit386', 'src');

/** Newest mtime (ms) of any file under `dir`, recursively. 0 if `dir` has no files. */
const getNewestMtimeMs = (dir) => {
    let newestMtimeMs = 0;

    for (const relativePath of readdirSync(dir, { recursive: true })) {
        const stats = statSync(resolve(dir, relativePath));

        if (stats.isFile() && stats.mtimeMs > newestMtimeMs) {
            newestMtimeMs = stats.mtimeMs;
        }
    }

    return newestMtimeMs;
};

const isEngineBuilt = (
    engineViteEntry = resolveEngineViteEntry(),
    engineSourceDir = resolveEngineSourceDir(),
    exists = existsSync,
    getBuiltMtimeMs = (entry) => statSync(entry).mtimeMs,
    getSourceMtimeMs = getNewestMtimeMs,
) => exists(engineViteEntry) && getBuiltMtimeMs(engineViteEntry) >= getSourceMtimeMs(engineSourceDir);

const buildEngineBuildCommand = () => ({
    command: 'pnpm',
    args: ['--filter', 'blit386', 'run', 'build'],
    cwd: resolve(scriptDir, '..'),
});

const main = () => {
    if (isEngineBuilt()) {
        return;
    }

    console.log('packages/blit386/dist is missing or stale – building the engine first...');

    const { command, args, cwd } = buildEngineBuildCommand();
    const result = spawnSync(command, args, { stdio: 'inherit', cwd });

    if (result.status !== 0) {
        process.exitCode = result.status ?? 1;
        return;
    }

    if (!isEngineBuilt()) {
        console.error('Engine build finished but packages/blit386/dist/vite.js is still missing or stale.');
        process.exitCode = 1;
    }
};

export { buildEngineBuildCommand, getNewestMtimeMs, isEngineBuilt, resolveEngineViteEntry, resolveEngineSourceDir };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
