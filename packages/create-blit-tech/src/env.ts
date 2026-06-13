/**
 * Environment guards for the scaffolder.
 *
 * Two checks run before any prompt: the Node version must meet the engine floor, and the wizard only starts when a
 * real interactive terminal is attached. Both are pure helpers here so they can be unit-tested without spawning the
 * CLI. The CLI wiring lives in index.ts.
 */

/** Minimum Node.js version the engine (and therefore a scaffolded game) supports. */
export const NODE_FLOOR = '22.18.0';

type Triple = [number, number, number];

/** Parse a `major.minor.patch` string into numbers; missing or non-numeric parts become 0. */
function parse(version: string): Triple {
    const core = version.split('-', 1)[0] ?? '';
    const [major = 0, minor = 0, patch = 0] = core.split('.').map((part) => Number.parseInt(part, 10) || 0);

    return [major, minor, patch];
}

/** True when `current` is greater than or equal to `floor`, compared part by part. */
export function meetsNodeFloor(current: string, floor: string = NODE_FLOOR): boolean {
    const [aMajor, aMinor, aPatch] = parse(current);
    const [bMajor, bMinor, bPatch] = parse(floor);

    if (aMajor !== bMajor) {
        return aMajor > bMajor;
    }
    if (aMinor !== bMinor) {
        return aMinor > bMinor;
    }

    return aPatch >= bPatch;
}

/** True only when both stdin and stdout are TTYs, i.e. a human can answer prompts. */
export function isInteractive(): boolean {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
