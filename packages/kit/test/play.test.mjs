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

test('blit play --help lists the drag and wheel steps', () => {
    const { output } = runPlay(blitCli, tmpdir(), ['--help']);
    assert.ok(output.includes('drag:<x1>:<y1>:<x2>:<y2>:<ms>'), output);
    assert.ok(output.includes('wheel:<dx>:<dy>'), output);
    assert.ok(output.includes('isCapturingPointerScroll'), output);
});

for (const [step, message] of [
    ['drag:1:2:3:4', 'drag needs five numbers'],
    ['drag:1:2:3:4:5:6', 'drag needs five numbers'],
    ['drag:a:2:3:4:100', 'x1 must be a number'],
    ['drag:1:2:3:4:', 'drag time must be a number'],
    ['drag:1:2:3:4:-5', 'drag time must be between 0 and 60000'],
    ['drag:1:2:3:4:60001', 'drag time must be between 0 and 60000'],
    ['wheel', 'wheel needs one or two numbers'],
    ['wheel:1:2:3', 'wheel needs one or two numbers'],
    ['wheel:x', 'dy must be a number'],
    ['wheel:x:5', 'dx must be a number'],
]) {
    test(`blit play rejects "${step}" before opening a browser`, () => {
        const { exitCode, output } = runPlay(blitCli, tmpdir(), [step]);
        assert.equal(exitCode, 1);
        assert.ok(output.includes(message), output);
    });
}

test('blit play accepts well-formed drag and wheel steps past argument checks', () => {
    // Step checks run before the playwright-core lookup, so reaching its install hint (an isolated kit has no
    // node_modules to find it in) proves the steps passed, without depending on folders above the temp dir.
    const isolated = mkdtempSync(join(tmpdir(), 'blit-play-kit-'));
    const game = makeGame();
    try {
        cpSync(join(kitRoot, 'dist'), join(isolated, 'dist'), { recursive: true });
        cpSync(join(kitRoot, 'package.json'), join(isolated, 'package.json'));

        const { output } = runPlay(join(isolated, 'dist', 'cli.js'), game, [
            'drag:1:2:3:4:100',
            'wheel:5',
            'wheel:-1:5',
        ]);
        assert.ok(output.includes('needs the playwright-core package'), output);
    } finally {
        rmSync(isolated, { recursive: true, force: true });
        rmSync(game, { recursive: true, force: true });
    }
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
