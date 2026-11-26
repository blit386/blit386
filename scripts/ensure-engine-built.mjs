#!/usr/bin/env node
/**
 * Build the BLIT386 engine automatically when `packages/blit386/dist` is missing - the case for
 * every freshly created checkout or git worktree, since `dist/` is gitignored and only a build
 * produces it. Shared by `packages/demos` and `packages/website`, which hit this in different
 * ways: `packages/demos/vite.config.js` imports `blit386/vite` at the top of the file,
 * unconditionally, so `dev`, `build`, `preview`, and `knip` (which loads `vite.config.js` via its
 * own Vite plugin) all crash on that import - so does the engine's own `knip`, which loads that
 * config too; `packages/website`'s Twoslash pipeline compiles docs samples against the workspace
 * engine (BT-414), so its `test` and `build` fail inside that compilation with TS2307 instead. Run before any of those so the failure
 * self-heals instead of surfacing as a confusing "Cannot find module" error partway through
 * `git push`.
 *
 * Also rebuilds when `dist/` exists but is stale - older than anything in the build's inputs: the
 * `packages/blit386/src` tree plus `vite.config.ts`, `vite.node.config.ts`, `package.json`, and
 * `tsconfig.json`. The engine bundles from a couple of hundred source files under `src/`, any one of which
 * can change the public API, so - unlike a single-entry proxy that could miss a change to a file it
 * doesn't happen to re-export through - the whole tree is walked for its newest mtime; the config
 * files are single stats, since an alias or `exports` change there alters `dist/` just as a source
 * edit does. That is one `readdirSync` plus one `statSync` per file, not a build: on this
 * codebase's source tree it costs low single-digit milliseconds, negligible next to the seconds a
 * real rebuild takes, so it stays a fast no-op on every normal `demos`/`website` dev, build, test,
 * or `knip` run.
 *
 * A no-op once the engine is built and fresh - one existsSync plus one small directory walk is the
 * only cost on every normal run.
 *
 * Concurrency-safe via `build-lock.mjs` - see that file's header for why (two processes racing this
 * script's TOCTOU check-then-build against a shared `dist/` intermittently corrupted each other's
 * output) and how (an exclusive, pid-backed lock directory).
 *
 * Usage (from a package directory):
 *   node ../../scripts/ensure-engine-built.mjs
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { acquireLockOrConfirmBuilt, buildCommand, getNewestMtimeMs, isBuilt, releaseBuildLock } from './build-lock.mjs';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));

const resolveEngineViteEntry = () => resolve(scriptDir, '..', 'packages', 'blit386', 'dist', 'vite.js');

const resolveEngineSourceDir = () => resolve(scriptDir, '..', 'packages', 'blit386', 'src');

/** Every input of the engine's `build:browser` (vite.config.ts) and `build:node` (vite.node.config.ts) steps. */
const resolveEngineBuildInputs = () => [
    resolveEngineSourceDir(),
    ...['vite.config.ts', 'vite.node.config.ts', 'package.json', 'tsconfig.json'].map((file) =>
        resolve(scriptDir, '..', 'packages', 'blit386', file),
    ),
];

const resolveEngineBuildLockDir = () => resolve(scriptDir, '..', '.ensure-engine-built.lock');

const isEngineBuilt = (entry = resolveEngineViteEntry(), sources = resolveEngineBuildInputs(), ...seams) =>
    isBuilt(entry, sources, ...seams);

const buildEngineBuildCommand = () => buildCommand('blit386');

const main = () => {
    if (!acquireLockOrConfirmBuilt(resolveEngineBuildLockDir(), isEngineBuilt)) {
        return;
    }

    try {
        if (isEngineBuilt()) {
            return;
        }

        console.log('packages/blit386/dist is missing or stale - building the engine first...');

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
        releaseBuildLock(resolveEngineBuildLockDir());
    }
};

export {
    buildEngineBuildCommand,
    getNewestMtimeMs,
    isEngineBuilt,
    resolveEngineBuildInputs,
    resolveEngineBuildLockDir,
    resolveEngineSourceDir,
    resolveEngineViteEntry,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
