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
export function detectPackageManager(userAgent: string): PackageManager {
    if (userAgent.startsWith('pnpm')) {
        return 'pnpm';
    }

    if (userAgent.startsWith('yarn')) {
        return 'yarn';
    }

    if (userAgent.startsWith('bun')) {
        return 'bun';
    }

    return 'npm';
}

/**
 * Exact semver (major.minor.patch, optional prerelease and build). Corepack rejects a pin that is not
 * one of these, including a truncated `11.0.0` taken from `11.0.0-dev.1005`.
 */
const EXACT_SEMVER =
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Corepack `packageManager` field value (`name@version`) for a generated game's `package.json`.
 *
 * Writing this before the first install stops Corepack from auto-adding a field that pins whatever
 * version happened to run the install. Returns undefined for bun: Corepack accepts only npm, pnpm, and yarn,
 * and a `bun@` pin is rejected. A missing or non-exact version throws rather than writing a guessed pin.
 */
export function packageManagerField(name: PackageManager, userAgent: string): string | undefined {
    if (name === 'bun') {
        return undefined;
    }

    // Leading boundary so `npm` does not match the same letters inside `pnpm/x.y.z`. The token after
    // the slash is the whole version, so a prerelease or build suffix is not cut off.
    const version = userAgent.match(new RegExp(`(?:^|[\\s/])${name}/(\\S+)`))?.[1];

    if (version === undefined || !EXACT_SEMVER.test(version)) {
        throw new Error(
            `Could not read an exact ${name} version from the package-manager user agent. ` +
                'Run create-blit386 with npm, pnpm, or yarn.',
        );
    }

    return `${name}@${version}`;
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
                // --ignore-workspace: the scaffold target may sit under an ancestor directory that has its own
                // pnpm-workspace.yaml (e.g. a monorepo of unrelated projects). Without this flag pnpm silently
                // installs for that ancestor workspace instead of the new project, leaving it without a
                // node_modules or lockfile while still reporting a successful exit code.
                installArgs: ['install', '--ignore-workspace'],
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
