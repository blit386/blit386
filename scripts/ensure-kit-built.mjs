#!/usr/bin/env node
/**
 * Build `@blit386/kit` automatically when `packages/kit/dist` is missing – the case for every
 * freshly created checkout or git worktree, since `dist/` is gitignored and only a build produces
 * it. `packages/blit386/scripts/gen-deprecations.mjs` imports `MIGRATIONS` from
 * `packages/kit/dist/migrations/registry.js`, so a tag-less/dist-less checkout would otherwise fail
 * with a confusing "Cannot find module" error. Mirrors `ensure-engine-built.mjs`.
 *
 * A no-op once the kit is built – existsSync is the only cost on every normal run.
 *
 * Usage (from a package directory):
 *   node ../../scripts/ensure-kit-built.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));

const resolveKitRegistryEntry = () => resolve(scriptDir, '..', 'packages', 'kit', 'dist', 'migrations', 'registry.js');

const isKitBuilt = (kitRegistryEntry = resolveKitRegistryEntry(), exists = existsSync) => exists(kitRegistryEntry);

const buildKitBuildCommand = () => ({
    command: 'pnpm',
    args: ['--filter', '@blit386/kit', 'run', 'build'],
    cwd: resolve(scriptDir, '..'),
});

const main = () => {
    if (isKitBuilt()) {
        return;
    }

    console.log('packages/kit/dist is missing – building the kit first...');

    const { command, args, cwd } = buildKitBuildCommand();
    const result = spawnSync(command, args, { stdio: 'inherit', cwd });

    if (result.status !== 0) {
        process.exitCode = result.status ?? 1;
        return;
    }

    if (!isKitBuilt()) {
        console.error('Kit build finished but packages/kit/dist/migrations/registry.js is still missing.');
        process.exitCode = 1;
    }
};

export { buildKitBuildCommand, isKitBuilt, resolveKitRegistryEntry };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
