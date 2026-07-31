/**
 * CLI tests for `blit upgrade`: no-git nag, and offline happy path that hands off to migrate.
 *
 * Never talks to the real npm registry: a stub `npm` on PATH rewrites the fake installed
 * blit386 version. Requires `pnpm run build` first (the package `pretest` script does that).
 */

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const blitCli = join(here, '..', 'dist', 'cli.js');

/**
 * @param {string} root
 * @param {string} version
 */
function writeInstalledBlit386(root, version) {
    const dir = join(root, 'node_modules', 'blit386');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'blit386', version }, null, 4));
}

/**
 * Minimal game folder. Pass `withGit: true` to create an empty `.git` directory.
 *
 * @param {{ withGit?: boolean, engineVersion?: string, gameSource?: string }} [opts]
 * @returns {string}
 */
function makeGame(opts = {}) {
    const root = mkdtempSync(join(tmpdir(), 'blit-upgrade-'));
    writeFileSync(
        join(root, 'package.json'),
        JSON.stringify(
            {
                name: 'upgrade-game',
                private: true,
                dependencies: { blit386: opts.engineVersion ?? '1.3.0' },
            },
            null,
            4,
        ),
    );
    // Force detectPackageManager to pick npm so our PATH stub is used.
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
    writeInstalledBlit386(root, opts.engineVersion ?? '1.3.0');

    if (opts.gameSource) {
        mkdirSync(join(root, 'src'), { recursive: true });
        writeFileSync(join(root, 'src', 'game.js'), opts.gameSource);
    }

    if (opts.withGit) {
        mkdirSync(join(root, '.git'));
    }

    return root;
}

/**
 * Stub `npm` that bumps the local fake blit386 on `install blit386@latest` and otherwise exits 0.
 *
 * @returns {string} bin directory to prepend to PATH
 */
function makeStubNpmBin() {
    const bin = mkdtempSync(join(tmpdir(), 'blit-stub-npm-'));
    const script = join(bin, 'npm');
    writeFileSync(
        script,
        `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
if (args[0] === 'install' && typeof args[1] === 'string' && args[1].startsWith('blit386')) {
    const dir = join(process.cwd(), 'node_modules', 'blit386');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'blit386', version: '1.4.0' }, null, 4) + '\\n',
    );
}
process.exit(0);
`,
    );
    chmodSync(script, 0o755);
    return bin;
}

/**
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} [extraEnv]
 * @returns {{ exitCode: number, output: string }}
 */
function runUpgrade(cwd, extraEnv = {}) {
    let exitCode = 0;
    let output = '';
    try {
        output = execFileSync(process.execPath, [blitCli, 'upgrade'], {
            cwd,
            encoding: 'utf8',
            env: {
                ...process.env,
                ...extraEnv,
                NO_COLOR: '1',
                // Ensure confirm() takes the non-interactive safe default (false).
                // execFileSync already gives a non-TTY stdin, but be explicit.
            },
        });
    } catch (err) {
        exitCode = err.status ?? 1;
        output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }
    return { exitCode, output };
}

test('blit upgrade nags and aborts when the game is not under git', () => {
    const root = makeGame({ withGit: false });
    try {
        const { exitCode, output } = runUpgrade(root);
        assert.equal(exitCode, 0);
        assert.ok(
            output.includes('not saved with version control'),
            `expected no-git nag, got:\n${output}`,
        );
        assert.ok(
            output.includes('No changes made. Save your work first'),
            `expected cancel message, got:\n${output}`,
        );
        // Must not have attempted a package-manager update.
        assert.ok(!output.includes('Updating blit386'), `should abort before PM update, got:\n${output}`);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit upgrade bumps blit386 offline then offers migrate when renames are pending', () => {
    const stubBin = makeStubNpmBin();
    const root = makeGame({
        withGit: true,
        engineVersion: '1.3.0',
        gameSource: 'if (BT.buttonDown(BT.BTN_A)) fire();\n',
    });

    try {
        const { exitCode, output } = runUpgrade(root, {
            PATH: `${stubBin}:${process.env.PATH ?? ''}`,
        });
        assert.equal(exitCode, 0, `upgrade should exit 0, got ${exitCode}:\n${output}`);
        assert.ok(output.includes('Updating blit386'), `expected PM update line, got:\n${output}`);
        assert.ok(
            output.includes('Checking your game for old BLIT386 names'),
            `expected migrate handoff, got:\n${output}`,
        );
        assert.ok(
            output.includes('blit migrate --write') || output.includes('Apply these updates'),
            `expected migrate apply offer or schedule hint, got:\n${output}`,
        );
        assert.ok(
            output.includes('No changes made. Run `blit migrate --write` when you are ready.'),
            `non-TTY should decline apply and schedule migrate --write, got:\n${output}`,
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(stubBin, { recursive: true, force: true });
    }
});
