/**
 * CLI tests for BT-630: a `.blit/manifest.json` that is valid JSON but the wrong shape (`null`, a bad
 * entry) must give a clear message instead of a TypeError on every command that reads it, and
 * `blit migrate --write` must not rewrite a symlink target outside the project.
 *
 * Requires `pnpm run build` first (the package `pretest` script does that).
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const blitCli = join(here, '..', 'dist', 'cli.js');

const OLD_NAMES_SOURCE = 'if (BT.buttonDown(BT.BTN_A)) fire();\n';

/**
 * @param {string | null} manifestText - raw `.blit/manifest.json` content, or null to write none
 * @returns {string} project root
 */
function makeGame(manifestText) {
    const root = mkdtempSync(join(tmpdir(), 'blit-manifest-shape-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'shape-game', private: true }));
    writeFileSync(join(root, 'tsconfig.json'), '{}\n');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'game.ts'), 'class Game {}\n');
    mkdirSync(join(root, 'node_modules', 'blit386'), { recursive: true });
    writeFileSync(
        join(root, 'node_modules', 'blit386', 'package.json'),
        JSON.stringify({ name: 'blit386', version: '1.3.0' }),
    );

    if (manifestText !== null) {
        mkdirSync(join(root, '.blit'));
        writeFileSync(join(root, '.blit', 'manifest.json'), manifestText);
    }

    return root;
}

/**
 * @param {string} root
 * @param {string[]} args
 * @returns {{ status: number | null, output: string }}
 */
function runBlit(root, args) {
    const result = spawnSync(process.execPath, [blitCli, ...args], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, NO_COLOR: '1' },
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const BAD_MANIFESTS = [
    ['null', 'null'],
    ['an array', '[]'],
];

const COMMANDS = [
    ['agents sync', ['agents', 'sync']],
    ['agents sync --check', ['agents', 'sync', '--check']],
    ['agents add zed', ['agents', 'add', 'zed']],
    ['doctor', ['doctor']],
];

for (const [manifestLabel, manifestText] of BAD_MANIFESTS) {
    for (const [commandLabel, args] of COMMANDS) {
        test(`blit ${commandLabel} reports a manifest that is ${manifestLabel} instead of crashing`, () => {
            const root = makeGame(manifestText);

            try {
                const { output } = runBlit(root, args);
                assert.ok(!output.includes('Cannot read properties'), `expected no TypeError, got:\n${output}`);
                assert.ok(!output.includes('TypeError'), `expected no TypeError, got:\n${output}`);
                assert.ok(output.includes('unexpected shape'), `expected the shape message, got:\n${output}`);
            } finally {
                rmSync(root, { recursive: true, force: true });
            }
        });
    }

    test(`blit clean ignores a manifest that is ${manifestLabel}`, () => {
        const root = makeGame(manifestText);

        try {
            const { status, output } = runBlit(root, ['clean', '--yes']);
            assert.equal(status, 0, `expected success, got ${status}:\n${output}`);
            assert.ok(!output.includes('TypeError'), `expected no TypeError, got:\n${output}`);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
}

test('blit migrate --write does not rewrite a symlinked file that points outside the project', () => {
    const root = makeGame(null);
    const outside = mkdtempSync(join(tmpdir(), 'blit-outside-'));
    const target = join(outside, 'shared.ts');
    writeFileSync(target, OLD_NAMES_SOURCE);
    writeFileSync(join(root, 'src', 'game.ts'), OLD_NAMES_SOURCE);
    mkdirSync(join(root, '.git'));
    symlinkSync(target, join(root, 'src', 'shared.ts'));

    try {
        const { status, output } = runBlit(root, ['migrate', '--write']);
        assert.equal(status, 0, `expected success, got ${status}:\n${output}`);
        assert.notEqual(readFileSync(join(root, 'src', 'game.ts'), 'utf8'), OLD_NAMES_SOURCE, 'real file is migrated');
        assert.equal(readFileSync(target, 'utf8'), OLD_NAMES_SOURCE, 'the symlink target must stay untouched');
    } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
    }
});

test('blit agents sync drops manifest entries without a string path and says so', () => {
    const root = makeGame(JSON.stringify({ files: [{ path: 5 }] }));

    try {
        const { output } = runBlit(root, ['agents', 'sync', '--check']);
        assert.ok(!output.includes('TypeError'), `expected no TypeError, got:\n${output}`);
        assert.ok(output.includes('Skipping 1 entries'), `expected the dropped-entry warning, got:\n${output}`);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('blit migrate --write does not rewrite a symlinked vite.config that points outside the project', () => {
    const root = makeGame(null);
    const outside = mkdtempSync(join(tmpdir(), 'blit-outside-'));
    const target = join(outside, 'vite.config.js');
    const viteConfig = "import { defineConfig } from 'vite';\n\nexport default defineConfig({});\n";
    writeFileSync(target, viteConfig);
    mkdirSync(join(root, '.git'));
    symlinkSync(target, join(root, 'vite.config.js'));
    // Hot reload is only wired on 1.4.0 and later, so the vite config is only a write target there.
    writeFileSync(
        join(root, 'node_modules', 'blit386', 'package.json'),
        JSON.stringify({ name: 'blit386', version: '1.4.0' }),
    );

    try {
        const { status, output } = runBlit(root, ['migrate', '--write']);
        assert.equal(status, 0, `expected success, got ${status}:\n${output}`);
        assert.equal(readFileSync(target, 'utf8'), viteConfig, 'the symlink target must stay untouched');
    } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
    }
});
