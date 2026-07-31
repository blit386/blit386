/**
 * CLI tests for `blit doctor`, focused on the D14 kit-engine range check.
 *
 * Each case is a hand-rolled game folder with a fake `node_modules/blit386` version. Requires
 * `pnpm run build` first (the package `pretest` script does that).
 */

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const blitCli = join(here, '..', 'dist', 'cli.js');

/**
 * @param {string} engineVersion
 * @returns {string} project root
 */
function makeGame(engineVersion) {
    const root = mkdtempSync(join(tmpdir(), 'blit-doctor-'));
    writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ name: 'doctor-game', private: true, dependencies: { blit386: engineVersion } }, null, 4),
    );
    mkdirSync(join(root, 'node_modules', 'blit386'), { recursive: true });
    writeFileSync(
        join(root, 'node_modules', 'blit386', 'package.json'),
        JSON.stringify({ name: 'blit386', version: engineVersion }, null, 4),
    );
    return root;
}

/**
 * @param {string} cwd
 * @returns {{ exitCode: number, output: string }}
 */
function runDoctor(cwd) {
    let exitCode = 0;
    let output = '';
    try {
        output = execFileSync(process.execPath, [blitCli, 'doctor'], {
            cwd,
            encoding: 'utf8',
            env: { ...process.env, NO_COLOR: '1' },
        });
    } catch (err) {
        exitCode = err.status ?? 1;
        output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }
    return { exitCode, output };
}

test('blit doctor reports a compatible engine range', () => {
    const root = makeGame('1.4.0');
    try {
        const { exitCode, output } = runDoctor(root);
        assert.equal(exitCode, 0);
        assert.ok(output.includes('is compatible with this kit'), `expected compatible line, got:\n${output}`);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit doctor warns when the installed engine is older than the kit range', () => {
    const root = makeGame('1.2.0');
    try {
        const { exitCode, output } = runDoctor(root);
        assert.equal(exitCode, 0);
        assert.ok(output.includes('This kit needs blit386'), `expected too-old warn, got:\n${output}`);
        assert.ok(
            output.includes('npx blit upgrade') || output.includes('npm update blit386'),
            `expected update hint, got:\n${output}`,
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit doctor warns when the installed engine is newer than the kit was written for', () => {
    const root = makeGame('2.0.0');
    try {
        const { exitCode, output } = runDoctor(root);
        assert.equal(exitCode, 0);
        assert.ok(
            output.includes('guides were written for an older BLIT386'),
            `expected stale-kit warn, got:\n${output}`,
        );
        assert.ok(
            output.includes('blit agents sync'),
            `expected kit sync hint, got:\n${output}`,
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit doctor warns when there is no game package.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'blit-doctor-empty-'));
    try {
        const { exitCode, output } = runDoctor(root);
        assert.equal(exitCode, 0);
        assert.ok(output.includes('No game found here'), `expected no-game warn, got:\n${output}`);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
