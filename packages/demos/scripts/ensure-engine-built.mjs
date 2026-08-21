#!/usr/bin/env node
/**
 * Build the BLIT386 engine automatically when `packages/blit386/dist` is missing – the case for
 * every freshly created checkout or git worktree, since `dist/` is gitignored and only a build
 * produces it. `vite.config.js` imports `blit386/vite` at the top of the file, unconditionally,
 * so `dev`, `build`, `preview`, and `knip` (which loads `vite.config.js` via its own Vite plugin)
 * all crash before that import is even reached if the engine has never been built. Run before
 * each of those so the failure self-heals instead of surfacing as a confusing "Cannot find
 * module" error partway through `git push`.
 *
 * A no-op once the engine is built – existsSync is the only cost on every normal run.
 *
 * Usage:
 *   node scripts/ensure-engine-built.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));

const resolveEngineViteEntry = () => resolve(scriptDir, '..', '..', 'blit386', 'dist', 'vite.js');

const isEngineBuilt = (engineViteEntry = resolveEngineViteEntry(), exists = existsSync) => exists(engineViteEntry);

const buildEngineBuildCommand = () => ({
    command: 'pnpm',
    args: ['--filter', 'blit386', 'run', 'build'],
    cwd: resolve(scriptDir, '..'),
});

const main = () => {
    if (isEngineBuilt()) {
        return;
    }

    console.log('packages/blit386/dist is missing – building the engine first...');

    const { command, args, cwd } = buildEngineBuildCommand();
    const result = spawnSync(command, args, { stdio: 'inherit', cwd });

    if (result.status !== 0) {
        process.exitCode = result.status ?? 1;
        return;
    }

    if (!isEngineBuilt()) {
        console.error('Engine build finished but packages/blit386/dist/vite.js is still missing.');
        process.exitCode = 1;
    }
};

export { buildEngineBuildCommand, isEngineBuilt, resolveEngineViteEntry };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
