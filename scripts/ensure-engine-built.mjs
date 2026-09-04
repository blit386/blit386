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
 * Concurrency-safe: `packages/demos` and `packages/website` both shell out to this script, and
 * `.husky/pre-push`'s `pnpm --filter "...[ref]" run preflight` (as well as a plain `pnpm -r build`,
 * or two dev servers started at once) runs them concurrently by default. Without a lock, a stale
 * `dist/` would race two independent `pnpm --filter blit386 run build` processes against each
 * other, both writing into `packages/blit386/dist/` at once – confirmed to intermittently fail
 * `vite-plugin-dts`/API Extractor with errors like "referenced path was not found: .../amber.d.ts"
 * when one process's declaration-bundling step reads a `.d.ts` file the other has just rewritten.
 * `acquireLockOrConfirmBuilt` serializes the actual build behind an exclusive lock directory
 * (`mkdirSync` is atomic) so only the process that wins the race builds; every other process either
 * finds the engine already fresh (built by the winner while it waited) or waits for the lock to free
 * up and then re-checks. The lock directory carries the owning pid, so a build killed mid-run
 * (crash, Ctrl-C) is detected as dead via `process.kill(pid, 0)` and cleared rather than deadlocking
 * every later run; a wall-clock ceiling (`LOCK_STALE_MS`) backstops that for the pid-reuse case.
 *
 * Usage (from a package directory):
 *   node ../../scripts/ensure-engine-built.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));

const resolveEngineViteEntry = () => resolve(scriptDir, '..', 'packages', 'blit386', 'dist', 'vite.js');

const resolveEngineSourceDir = () => resolve(scriptDir, '..', 'packages', 'blit386', 'src');

const resolveEngineBuildLockDir = () => resolve(scriptDir, '..', '.ensure-engine-built.lock');

/** Milliseconds between polls while waiting for another process's build or lock. */
const LOCK_POLL_MS = 200;

/** A lock older than this is assumed abandoned even if its owning pid looks alive (clock skew, pid reuse). */
const LOCK_STALE_MS = 10 * 60 * 1000;

/** Synchronous sleep – this script is spawnSync-based throughout, so polling has to block, not await. */
const sleepSync = (ms) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const isPidAlive = (pid) => {
    if (!Number.isInteger(pid)) {
        return false;
    }

    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

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

/**
 * Blocks until either this process holds the exclusive build lock (return `true` – the caller
 * should build) or another process's build has made the engine fresh while waiting (return
 * `false` – the caller should skip the build). A lock directory whose pid is no longer running, or
 * that has been held past `LOCK_STALE_MS`, is treated as abandoned and cleared.
 */
const acquireLockOrConfirmBuilt = (
    lockDir = resolveEngineBuildLockDir(),
    checkBuilt = isEngineBuilt,
    sleep = sleepSync,
) => {
    const waitStartedMs = Date.now();

    for (;;) {
        if (checkBuilt()) {
            return false;
        }

        try {
            mkdirSync(lockDir);
            writeFileSync(resolve(lockDir, 'pid'), String(process.pid));
            return true;
        } catch (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }
        }

        let lockOwnerPid = Number.NaN;

        try {
            lockOwnerPid = Number(readFileSync(resolve(lockDir, 'pid'), 'utf8'));
        } catch {
            // Lock directory exists but its pid file hasn't been written yet – a few-microsecond
            // window right after another process's mkdirSync, not an abandoned lock.
        }

        const isAbandoned =
            (Number.isInteger(lockOwnerPid) && !isPidAlive(lockOwnerPid)) || Date.now() - waitStartedMs > LOCK_STALE_MS;

        if (isAbandoned) {
            rmSync(lockDir, { recursive: true, force: true });
            continue;
        }

        sleep(LOCK_POLL_MS);
    }
};

const releaseEngineBuildLock = (lockDir = resolveEngineBuildLockDir()) => {
    rmSync(lockDir, { recursive: true, force: true });
};

const main = () => {
    if (isEngineBuilt()) {
        return;
    }

    if (!acquireLockOrConfirmBuilt()) {
        return;
    }

    try {
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
    } finally {
        releaseEngineBuildLock();
    }
};

export {
    acquireLockOrConfirmBuilt,
    buildEngineBuildCommand,
    getNewestMtimeMs,
    isEngineBuilt,
    releaseEngineBuildLock,
    resolveEngineBuildLockDir,
    resolveEngineSourceDir,
    resolveEngineViteEntry,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
