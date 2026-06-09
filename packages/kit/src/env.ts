/**
 * Environment helpers shared by the `blit` commands: package-manager detection, project lookup, git presence,
 * Node version check, and a thin wrapper for spawning the package manager.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/** Minimum Node version the engine supports (matches blit-tech `engines`). */
const MIN_NODE: readonly [number, number, number] = [22, 18, 0];

/** True when the running Node is at least the minimum supported version. */
export function nodeVersionOk(): boolean {
    const parts = process.versions.node.split('.').map((n) => Number.parseInt(n, 10));
    const major = parts[0] ?? 0;
    const minor = parts[1] ?? 0;
    const patch = parts[2] ?? 0;
    const [reqMajor, reqMinor, reqPatch] = MIN_NODE;

    if (major !== reqMajor) {
        return major > reqMajor;
    }
    if (minor !== reqMinor) {
        return minor > reqMinor;
    }

    return patch >= reqPatch;
}

/** Walk up from `start` to the nearest folder containing a package.json, or null if none. */
export function findProjectRoot(start: string): string | null {
    let dir = start;

    for (;;) {
        if (existsSync(join(dir, 'package.json'))) {
            return dir;
        }

        const parent = dirname(dir);
        if (parent === dir) {
            return null;
        }

        dir = parent;
    }
}

/** True when `start` (or any parent) is inside a git working tree. Checks for `.git` so it works without the git binary. */
export function isGitRepo(start: string): boolean {
    let dir = start;

    for (;;) {
        if (existsSync(join(dir, '.git'))) {
            return true;
        }

        const parent = dirname(dir);
        if (parent === dir) {
            return false;
        }

        dir = parent;
    }
}

/** Detect the package manager from the project's lockfile, then the invoking agent, defaulting to npm. */
export function detectPackageManager(root: string): PackageManager {
    if (existsSync(join(root, 'pnpm-lock.yaml'))) {
        return 'pnpm';
    }
    if (existsSync(join(root, 'yarn.lock'))) {
        return 'yarn';
    }
    if (existsSync(join(root, 'bun.lockb')) || existsSync(join(root, 'bun.lock'))) {
        return 'bun';
    }
    if (existsSync(join(root, 'package-lock.json'))) {
        return 'npm';
    }

    const agent = process.env.npm_config_user_agent ?? '';
    if (agent.startsWith('pnpm')) {
        return 'pnpm';
    }
    if (agent.startsWith('yarn')) {
        return 'yarn';
    }
    if (agent.startsWith('bun')) {
        return 'bun';
    }

    return 'npm';
}

/** Argument list to run a package.json script (yarn omits the `run` keyword). */
export function pmRunArgs(pm: PackageManager, script: string): string[] {
    return pm === 'yarn' ? [script] : ['run', script];
}

/** Argument list to add/update a dependency (npm uses `install`, the others use `add`). */
export function pmAddArgs(pm: PackageManager, pkg: string): string[] {
    return pm === 'npm' ? ['install', pkg] : ['add', pkg];
}

/** Spawn the package manager inheriting stdio. Returns the exit code (1 if it could not start). */
export function runPm(root: string, pm: PackageManager, args: string[]): number {
    const result = spawnSync(pm, args, {
        cwd: root,
        stdio: 'inherit',
        shell: process.platform === 'win32',
    });

    return result.status ?? 1;
}

export interface ProjectInfo {
    root: string;
    name: string;
}

/** Read the project name from its package.json, with a friendly fallback. */
export function readProject(root: string): ProjectInfo {
    try {
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name?: unknown };
        const name = typeof pkg.name === 'string' && pkg.name.length > 0 ? pkg.name : 'your game';
        return { root, name };
    } catch {
        return { root, name: 'your game' };
    }
}

/** The installed version of a dependency (read from node_modules), or null if it is not installed. */
export function installedVersion(root: string, dep: string): string | null {
    try {
        const pkgPath = join(root, 'node_modules', ...dep.split('/'), 'package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
        return typeof pkg.version === 'string' ? pkg.version : null;
    } catch {
        return null;
    }
}
