#!/usr/bin/env node
/**
 * Build `@blit386/kit` automatically when `packages/kit/dist` is missing – the case for every
 * freshly created checkout or git worktree, since `dist/` is gitignored and only a build produces
 * it. `packages/blit386/scripts/gen-deprecations.mjs` imports `MIGRATIONS` from
 * `packages/kit/dist/migrations/registry.js`, so a tag-less/dist-less checkout would otherwise fail
 * with a confusing "Cannot find module" error. Mirrors `ensure-engine-built.mjs`, including its use
 * of `build-lock.mjs` (see that file's header for why: two processes racing the same TOCTOU
 * check-then-build against a shared dist/ intermittently corrupt each other's output).
 *
 * Also rebuilds when `dist/` exists but is stale – newer than the checked-in build, but older than
 * `packages/kit/src`. tsup bundles `migrations/registry.js` from `registry.ts` plus whatever it
 * imports, so the whole `src/` tree (not just `registry.ts`) is the honest staleness signal; the
 * kit is small enough (a handful of files) that walking it on every run stays cheap.
 *
 * A no-op once the kit is built and fresh – one existsSync plus one small directory walk is the
 * only cost on every normal run.
 *
 * Usage (from a package directory):
 *   node ../../scripts/ensure-kit-built.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { acquireLockOrConfirmBuilt, releaseBuildLock } from './build-lock.mjs';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));

const resolveKitRegistryEntry = () => resolve(scriptDir, '..', 'packages', 'kit', 'dist', 'migrations', 'registry.js');

const resolveKitSourceDir = () => resolve(scriptDir, '..', 'packages', 'kit', 'src');

const resolveKitBuildLockDir = () => resolve(scriptDir, '..', '.ensure-kit-built.lock');

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

const isKitBuilt = (
    kitRegistryEntry = resolveKitRegistryEntry(),
    kitSourceDir = resolveKitSourceDir(),
    exists = existsSync,
    getBuiltMtimeMs = (entry) => statSync(entry).mtimeMs,
    getSourceMtimeMs = getNewestMtimeMs,
) => exists(kitRegistryEntry) && getBuiltMtimeMs(kitRegistryEntry) >= getSourceMtimeMs(kitSourceDir);

const buildKitBuildCommand = () => ({
    command: 'pnpm',
    args: ['--filter', '@blit386/kit', 'run', 'build'],
    cwd: resolve(scriptDir, '..'),
});

const main = () => {
    if (isKitBuilt()) {
        return;
    }

    if (!acquireLockOrConfirmBuilt(resolveKitBuildLockDir(), isKitBuilt)) {
        return;
    }

    try {
        if (isKitBuilt()) {
            return;
        }

        console.log('packages/kit/dist is missing or stale – building the kit first...');

        const { command, args, cwd } = buildKitBuildCommand();
        const result = spawnSync(command, args, { stdio: 'inherit', cwd });

        if (result.status !== 0) {
            process.exitCode = result.status ?? 1;
            return;
        }

        if (!isKitBuilt()) {
            console.error('Kit build finished but packages/kit/dist/migrations/registry.js is still missing or stale.');
            process.exitCode = 1;
        }
    } finally {
        releaseBuildLock(resolveKitBuildLockDir());
    }
};

export {
    buildKitBuildCommand,
    getNewestMtimeMs,
    isKitBuilt,
    resolveKitBuildLockDir,
    resolveKitRegistryEntry,
    resolveKitSourceDir,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
