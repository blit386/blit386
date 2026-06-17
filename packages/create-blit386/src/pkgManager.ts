/**
 * Package-manager detection for the scaffolder.
 *
 * When a user runs `npm create blit386` / `pnpm create blit386` / `yarn create blit386`, the invoking manager
 * is reported in `npm_config_user_agent`. We use it so the generated project, lockfile, and printed commands match
 * whatever the user already has.
 */

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface PmHints {
    name: PackageManager;
    /** Command a human types to install dependencies, e.g. "npm install". */
    installCmd: string;
    /** Command a human types to start the dev server, e.g. "npm run dev". */
    runDevCmd: string;
    /** Command a human types to build for production, e.g. "npm run build". */
    runBuildCmd: string;
    /** Command a human types to format source, e.g. "npm run format". */
    runFormatCmd: string;
    /** Command a human types to lint source, e.g. "npm run lint". */
    runLintCmd: string;
    /** Argument list to spawn the manager's install, e.g. ["install"] ([] for yarn). */
    installArgs: string[];
}

/** Detect the package manager from the invoking agent, defaulting to npm (which ships with Node). */
export function detectPackageManager(): PackageManager {
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

/** Human-facing commands and spawn arguments for a given package manager. */
export function pmHints(name: PackageManager): PmHints {
    switch (name) {
        case 'pnpm':
            return {
                name,
                installCmd: 'pnpm install',
                runDevCmd: 'pnpm run dev',
                runBuildCmd: 'pnpm run build',
                runFormatCmd: 'pnpm run format',
                runLintCmd: 'pnpm run lint',
                installArgs: ['install'],
            };
        case 'yarn':
            return {
                name,
                installCmd: 'yarn',
                runDevCmd: 'yarn dev',
                runBuildCmd: 'yarn build',
                runFormatCmd: 'yarn format',
                runLintCmd: 'yarn lint',
                installArgs: [],
            };
        case 'bun':
            return {
                name,
                installCmd: 'bun install',
                runDevCmd: 'bun run dev',
                runBuildCmd: 'bun run build',
                runFormatCmd: 'bun run format',
                runLintCmd: 'bun run lint',
                installArgs: ['install'],
            };
        default:
            return {
                name: 'npm',
                installCmd: 'npm install',
                runDevCmd: 'npm run dev',
                runBuildCmd: 'npm run build',
                runFormatCmd: 'npm run format',
                runLintCmd: 'npm run lint',
                installArgs: ['install'],
            };
    }
}
