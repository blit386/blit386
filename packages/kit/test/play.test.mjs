/**
 * CLI tests for `blit play` - the paths that fail before a browser opens: help, argument checks, no game folder, and
 * the install hint when `playwright-core` is missing. Driving a real browser is verified by hand (see the
 * `test-the-game` skill). Requires `pnpm run build` first (the package `pretest` script does that).
 */

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const kitRoot = join(here, '..');
const blitCli = join(kitRoot, 'dist', 'cli.js');

/** @returns {string} a game folder with just a package.json */
function makeGame() {
    const root = mkdtempSync(join(tmpdir(), 'blit-play-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'play-game', private: true }, null, 4));
    return root;
}

/**
 * @param {string} cli
 * @param {string} cwd
 * @param {string[]} args
 * @returns {{ exitCode: number, output: string }}
 */
function runPlay(cli, cwd, args) {
    try {
        const output = execFileSync(process.execPath, [cli, 'play', ...args], {
            cwd,
            encoding: 'utf8',
            stdio: 'pipe',
            env: { ...process.env, NO_COLOR: '1' },
        });
        return { exitCode: 0, output };
    } catch (err) {
        return { exitCode: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    }
}

test('blit play --help lists the steps and exits 0', () => {
    const { exitCode, output } = runPlay(blitCli, tmpdir(), ['--help']);
    assert.equal(exitCode, 0);
    assert.ok(output.includes('hold:<key>:<ms>'), output);
});

test('blit play with no steps shows help and exits 1', () => {
    const { exitCode, output } = runPlay(blitCli, tmpdir(), []);
    assert.equal(exitCode, 1);
    assert.ok(output.includes('Usage: blit play'), output);
});

test('blit play rejects a seed that is not a whole number', () => {
    const { exitCode, output } = runPlay(blitCli, tmpdir(), ['--seed', '4.5', 'state']);
    assert.equal(exitCode, 1);
    assert.ok(output.includes('--seed must be a whole number'), output);
});

test('blit play rejects a backend other than software', () => {
    const { exitCode, output } = runPlay(blitCli, tmpdir(), ['--backend', 'webgl', 'state']);
    assert.equal(exitCode, 1);
    assert.ok(output.includes('--backend only accepts "software"'), output);
});

test('blit play explains how to add playwright-core when the game does not have it', () => {
    // A copy of the built kit outside this repo, so `import('playwright-core')` has no node_modules to find it in.
    const isolated = mkdtempSync(join(tmpdir(), 'blit-play-kit-'));
    const game = makeGame();
    try {
        cpSync(join(kitRoot, 'dist'), join(isolated, 'dist'), { recursive: true });
        cpSync(join(kitRoot, 'package.json'), join(isolated, 'package.json'));
        writeFileSync(join(game, 'pnpm-lock.yaml'), '');

        const { exitCode, output } = runPlay(join(isolated, 'dist', 'cli.js'), game, ['state']);
        assert.equal(exitCode, 1);
        assert.ok(output.includes('needs the playwright-core package'), output);
        assert.ok(output.includes('pnpm add playwright-core -D'), output);
    } finally {
        rmSync(isolated, { recursive: true, force: true });
        rmSync(game, { recursive: true, force: true });
    }
});
