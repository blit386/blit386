#!/usr/bin/env node
/**
 * Build `@blit386/kit` automatically when `packages/kit/dist` is missing - the case for every
 * freshly created checkout or git worktree, since `dist/` is gitignored and only a build produces
 * it. `packages/blit386/scripts/gen-deprecations.mjs` imports `MIGRATIONS` from
 * `packages/kit/dist/migrations/registry.js`, so a tag-less/dist-less checkout would otherwise fail
 * with a confusing "Cannot find module" error. Unlike `ensure-engine-built.mjs` this has no
 * entry point and no lock: its callers import `isKitBuilt` and `buildKitBuildCommand` and run the
 * build themselves, and pre-push runs them in sequence, so there is no concurrent kit builder.
 *
 * Also rebuilds when `dist/` exists but is stale - newer than the checked-in build, but older than
 * `packages/kit/src`. tsup bundles `migrations/registry.js` from `registry.ts` plus whatever it
 * imports, so the whole `src/` tree (not just `registry.ts`) is the honest staleness signal; the
 * kit is small enough (a handful of files) that walking it on every run stays cheap.
 *
 * A no-op once the kit is built and fresh - one existsSync plus one small directory walk is the
 * only cost on every normal run.
 * */
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getNewestMtimeMs } from './build-lock.mjs';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));

const resolveKitRegistryEntry = () => resolve(scriptDir, '..', 'packages', 'kit', 'dist', 'migrations', 'registry.js');

const resolveKitSourceDir = () => resolve(scriptDir, '..', 'packages', 'kit', 'src');

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

export { buildKitBuildCommand, getNewestMtimeMs, isKitBuilt, resolveKitRegistryEntry, resolveKitSourceDir };
