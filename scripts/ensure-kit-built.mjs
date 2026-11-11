#!/usr/bin/env node
/**
 * Build `@blit386/kit` automatically when `packages/kit/dist` is missing - the case for every
 * freshly created checkout or git worktree, since `dist/` is gitignored and only a build produces
 * it. `packages/blit386/scripts/gen-deprecations.mjs` imports `MIGRATIONS` from
 * `packages/kit/dist/migrations/registry.js`, so a tag-less/dist-less checkout would otherwise fail
 * with a confusing "Cannot find module" error. Unlike `ensure-engine-built.mjs` this has no
 * entry point and no lock: its callers import `ensureKitBuilt` and run it in-process, and pre-push
 * runs them in sequence, so there is no concurrent kit builder.
 *
 * Also rebuilds when `dist/` exists but is stale - newer than the checked-in build, but older than
 * `packages/kit/src`. tsup bundles `migrations/registry.js` from `registry.ts` plus whatever it
 * imports, so the whole `src/` tree (not just `registry.ts`) is the honest staleness signal; the
 * kit is small enough (a handful of files) that walking it on every run stays cheap.
 *
 * A no-op once the kit is built and fresh - one existsSync plus one small directory walk is the
 * only cost on every normal run.
 * */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCommand, getNewestMtimeMs, isBuilt } from './build-lock.mjs';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));

const resolveKitRegistryEntry = () => resolve(scriptDir, '..', 'packages', 'kit', 'dist', 'migrations', 'registry.js');

const resolveKitSourceDir = () => resolve(scriptDir, '..', 'packages', 'kit', 'src');

const isKitBuilt = (entry = resolveKitRegistryEntry(), sourceDir = resolveKitSourceDir(), ...seams) =>
    isBuilt(entry, sourceDir, ...seams);

const buildKitBuildCommand = () => buildCommand('@blit386/kit');

/**
 * Builds the kit when `packages/kit/dist` is missing or stale, then re-verifies it. Exits with the
 * build's status (or 1) when it fails or still leaves the kit missing or stale.
 *
 * @param {object} [seams] Injectable for tests.
 */
const ensureKitBuilt = ({
    built = isKitBuilt,
    spawn = spawnSync,
    exit = process.exit,
    log = console.log,
    logError = console.error,
} = {}) => {
    if (built()) {
        return;
    }

    log('packages/kit/dist is missing or stale - building the kit first...');
    const { command, args, cwd } = buildKitBuildCommand();
    const result = spawn(command, args, { stdio: 'inherit', cwd });

    if (result.status !== 0 || !built()) {
        logError('Could not build @blit386/kit; packages/kit/dist is still missing or stale.');
        exit(result.status || 1);
    }
};

export {
    buildKitBuildCommand,
    ensureKitBuilt,
    getNewestMtimeMs,
    isKitBuilt,
    resolveKitRegistryEntry,
    resolveKitSourceDir,
};
