/**
 * Fixtures shared by the scaffolder test suites in this folder: where the built CLIs are, the kit the scaffolder
 * resolves, and the small scaffold-and-read helpers every suite reaches for. Not a test file - the test script
 * matches `*.test.mjs` only.
 */

import { strict as assert } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scaffold } from '../dist/scaffold.js';
import { resolveKitRoot } from '@blit386/kit/adapters';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const cli = join(packageRoot, 'dist', 'index.js');
const blitCli = join(here, '..', '..', 'kit', 'dist', 'cli.js');

// The kit the scaffolder resolves at runtime - the source of the `^x.y.z` every generated game pins
// and of the exact version stamped into `.blit/manifest.json`. Read it the same way scaffold.ts does
// rather than hardcoding a literal, so a lockstep bump never needs this file edited.
const installedKit = JSON.parse(readFileSync(join(resolveKitRoot(import.meta.url), 'package.json'), 'utf8'));

function assertNoPlaceholders(projectDir, relativePath) {
    const content = readFileSync(join(projectDir, relativePath), 'utf8');
    assert.ok(!content.includes('{{'), `${relativePath} still has unrendered placeholders`);
}

function runBlit(project, args) {
    let exitCode = 0;
    let output = '';
    try {
        output = execFileSync(process.execPath, [blitCli, ...args], {
            cwd: project,
            encoding: 'utf8',
        });
    } catch (err) {
        exitCode = err.status ?? 1;
        output = (err.stdout ?? '') + (err.stderr ?? '');
    }
    return { exitCode, output };
}

/** Scaffold one project offline with the given agent and return its path plus parsed manifest. */
function scaffoldWithManifest(work, name, agent) {
    const project = join(work, name);

    scaffold({
        targetDir: project,
        projectName: name,
        pmInstall: 'pnpm install',
        pmRunDev: 'pnpm run dev',
        pmRunBuild: 'pnpm run build',
        pmRunFormat: 'pnpm run format',
        pmRunLint: 'pnpm run lint',
        agents: [agent],
        packageManager: 'pnpm@11.20.0',
    });

    return { project, manifest: JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8')) };
}

// The clean-merge path uses `git merge-file`; skip the test where git is unavailable.
const hasGit = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;

// Shared install commands and Corepack pin for the MCP-config tests below - they only care about the
// .mcp.json merge behavior, not which package manager the scaffold fixture records.
const PNPM_SCAFFOLD_COMMANDS = {
    pmInstall: 'pnpm install',
    pmRunDev: 'pnpm run dev',
    pmRunBuild: 'pnpm run build',
    pmRunFormat: 'pnpm run format',
    pmRunLint: 'pnpm run lint',
    packageManager: 'pnpm@11.20.0',
};

/** A no-agent pnpm game at `<work>/<name>`, for the `blit agents add codex` tests. */
function scaffoldNoAgent(work, name) {
    const project = join(work, name);

    scaffold({
        targetDir: project,
        projectName: name,
        pmInstall: 'pnpm install',
        pmRunDev: 'pnpm run dev',
        pmRunBuild: 'pnpm run build',
        pmRunFormat: 'pnpm run format',
        pmRunLint: 'pnpm run lint',
        agents: [],
        packageManager: 'pnpm@11.20.0',
    });

    return project;
}

export {
    here,
    packageRoot,
    cli,
    blitCli,
    installedKit,
    assertNoPlaceholders,
    runBlit,
    scaffoldWithManifest,
    hasGit,
    PNPM_SCAFFOLD_COMMANDS,
    scaffoldNoAgent,
};
