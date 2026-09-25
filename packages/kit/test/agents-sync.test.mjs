/**
 * CLI tests for `blit agents sync` when a file the kit newly ships already exists, untracked, on disk.
 *
 * Requires `pnpm run build` first (the package `pretest` script does that).
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { generateClaudeAdapter, kitRoot } from '../dist/adapters.js';

const here = dirname(fileURLToPath(import.meta.url));
const blitCli = join(here, '..', 'dist', 'cli.js');

const vars = {
    pmInstall: 'npm install',
    pmRunDev: 'npm run dev',
    pmRunBuild: 'npm run build',
    pmRunFormat: 'npm run format',
    pmRunLint: 'npm run lint',
};

/** A skill the installed kit emits for Claude, standing in for "a skill added in a later kit". */
const skill = generateClaudeAdapter(kitRoot(), vars).find((f) => f.path.endsWith('/SKILL.md'));

/**
 * Game folder whose manifest uses Claude (via CLAUDE.md) but does not track `skill.path`, with
 * `onDisk` written at that path as an untracked file.
 *
 * @param {string} onDisk
 * @returns {string}
 */
function makeGame(onDisk) {
    const root = mkdtempSync(join(tmpdir(), 'blit-agents-sync-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'sync-game', private: true }));
    mkdirSync(join(root, '.blit'));
    writeFileSync(
        join(root, '.blit', 'manifest.json'),
        JSON.stringify({ kitVersion: '0.0.0', vars, files: [{ path: 'CLAUDE.md', class: 'shared', sha256: '' }] }),
    );
    mkdirSync(dirname(join(root, skill.path)), { recursive: true });
    writeFileSync(join(root, skill.path), onDisk);
    return root;
}

/** @param {string} root */
function runSync(root) {
    const result = spawnSync(process.execPath, [blitCli, 'agents', 'sync'], { cwd: root, encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** @param {string} root */
function trackedPaths(root) {
    return JSON.parse(readFileSync(join(root, '.blit', 'manifest.json'), 'utf8')).files.map((f) => f.path);
}

test('sync keeps an untracked user file at a newly shipped path and saves the kit version as .new', () => {
    assert.ok(skill, 'expected the Claude adapter to emit at least one skill');
    const mine = '---\nname: mine\n---\n\nHand-written, never tracked.\n';
    const root = makeGame(mine);

    try {
        const { status, output } = runSync(root);

        assert.equal(readFileSync(join(root, skill.path), 'utf8'), mine, 'user file must be untouched');
        assert.equal(readFileSync(join(root, `${skill.path}.new`), 'utf8'), skill.content);
        assert.ok(output.includes(`${skill.path} already exists`), `expected a collision warning, got:\n${output}`);
        assert.ok(!trackedPaths(root).includes(skill.path), 'colliding path must not be recorded as kit-owned');
        assert.equal(status, 1, 'a collision needs the user, so sync exits non-zero');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('sync silently adopts an untracked file that already matches the kit version', () => {
    const root = makeGame(skill.content);

    try {
        const { output } = runSync(root);

        assert.ok(!existsSync(join(root, `${skill.path}.new`)), 'identical file needs no .new copy');
        assert.ok(!output.includes(skill.path), `expected no mention of the adopted file, got:\n${output}`);
        assert.ok(trackedPaths(root).includes(skill.path), 'identical file is adopted into the manifest');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
