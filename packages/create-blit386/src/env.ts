/**
 * Environment guards for the scaffolder.
 *
 * Two checks run before any prompt: the Node version must meet the engine floor, and the wizard only starts when a
 * real interactive terminal is attached. Both are pure helpers here so they can be unit-tested without spawning the
 * CLI. The CLI wiring lives in index.ts.
 */

import { fileURLToPath } from 'node:url';

import { compareVersions, nodeFloor } from '@blit386/kit/adapters';

/**
 * Minimum Node.js version the engine (and therefore a scaffolded game) supports: this package's own `engines.node`
 * floor, read at runtime so the friendly check cannot drift from the floor npm enforces. `dist/` sits one level below
 * the package root, both in the repo and once published. Generated games get it as their `engines.node` too.
 */
export const NODE_FLOOR = nodeFloor(fileURLToPath(new URL('..', import.meta.url)));

/** True when `current` is greater than or equal to `floor`, compared part by part (pre-release tags ignored). */
export function meetsNodeFloor(current: string, floor: string = NODE_FLOOR): boolean {
    return compareVersions(current, floor) >= 0;
}

/** True only when both stdin and stdout are TTYs, i.e. a human can answer prompts. */
export function isInteractive(): boolean {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/** Wrap a path in double quotes when it contains whitespace, so a pasted `cd` line works in sh, cmd and PowerShell. */
export function quoteIfSpaced(path: string): string {
    return /\s/.test(path) ? `"${path}"` : path;
}
