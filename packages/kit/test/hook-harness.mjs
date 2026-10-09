// Shared by the hook tests. Not a *.test.mjs file, so the test runner does not pick it up.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const hooksDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'hooks');

/** Template variables the adapter tests render the kit with. */
export const VARS = {
    pmInstall: 'pnpm install',
    pmRunDev: 'pnpm run dev',
    pmRunBuild: 'pnpm run build',
    pmRunFormat: 'pnpm run format',
    pmRunLint: 'pnpm run lint',
};

/**
 * Run a hook entry script with `input` on stdin (a string is sent as-is, anything else as JSON).
 * `script` is a name under the kit's hooks dir, or an absolute path to a copy elsewhere.
 *
 * @param {string} script
 * @param {{ args?: string[], input?: unknown }} [options]
 */
export function runHook(script, { args = [], input } = {}) {
    return spawnSync(process.execPath, [resolve(hooksDir, script), ...args], {
        input: typeof input === 'string' ? input : JSON.stringify(input),
        encoding: 'utf8',
        timeout: 30_000,
    });
}
