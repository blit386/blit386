/**
 * `blit migrate` against a scaffolded game: the old-name preview and rewrite, and the hot-reload upgrade of an
 * older vite.config. Requires `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { scaffold } from '../dist/scaffold.js';
import { blitCli, runBlit, hasGit } from './helpers.mjs';

const GAME_WITH_OLD_NAMES = [
    "import { bootstrap, BT } from 'blit386';",
    '',
    'class Game {',
    '    configure() {',
    '        return { overlayEnabled: true };',
    '    }',
    '    update() {',
    '        if (BT.buttonDown(BT.BTN_A)) this.fire();',
    '        if (this.box.equals(this.other)) this.stop();',
    '    }',
    '}',
    '',
    'bootstrap(Game);',
    '',
].join('\n');

test('blit migrate previews old-name renames without changing files', () => {
    assert.ok(existsSync(blitCli), 'packages/kit/dist/cli.js must be built before running tests');

    const work = mkdtempSync(join(tmpdir(), 'cbt-migrate-preview-'));

    try {
        const project = join(work, 'migrate-preview');
        scaffold({
            targetDir: project,
            projectName: 'migrate-preview',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            packageManager: 'npm@10.9.2',
            agents: [],
        });

        const gamePath = join(project, 'src', 'game.js');
        writeFileSync(gamePath, GAME_WITH_OLD_NAMES);

        const { exitCode, output } = runBlit(project, ['migrate']);
        assert.equal(exitCode, 0, 'a preview run should exit 0');
        assert.ok(output.includes('isDown'), 'preview should show the suggested new name');
        assert.ok(output.includes('preview'), 'preview should say it was only a preview');

        // A preview must not touch the file.
        assert.equal(readFileSync(gamePath, 'utf8'), GAME_WITH_OLD_NAMES, 'preview must leave the file unchanged');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit migrate --write rewrites safe names and reports ambiguous ones', { skip: !hasGit }, () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-migrate-write-'));

    try {
        const project = join(work, 'migrate-write');
        scaffold({
            targetDir: project,
            projectName: 'migrate-write',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            packageManager: 'npm@10.9.2',
            agents: [],
        });

        // A git repo means --write skips the no-git confirmation prompt and applies directly.
        spawnSync('git', ['init'], { cwd: project, stdio: 'ignore' });

        const gamePath = join(project, 'src', 'game.js');
        writeFileSync(gamePath, GAME_WITH_OLD_NAMES);

        const { exitCode, output } = runBlit(project, ['migrate', '--write']);
        assert.equal(exitCode, 0, '--write should exit 0');

        const rewritten = readFileSync(gamePath, 'utf8');
        assert.ok(rewritten.includes('BT.isDown('), 'BT.buttonDown should be renamed to BT.isDown');
        assert.ok(rewritten.includes('isOverlayEnabled:'), 'overlayEnabled key should be renamed');
        assert.ok(!rewritten.includes('buttonDown'), 'no old BT name should remain');

        // The ambiguous .equals( call is left for review, not rewritten.
        assert.ok(rewritten.includes('.equals('), 'the ambiguous equals() call should be left untouched');
        assert.ok(output.includes('closer look'), 'output should flag the ambiguous name for review');
        assert.ok(output.includes('equals'), 'output should name the ambiguous method');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

const OLD_VITE_CONFIG = `import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        open: true,
    },
});
`;

test('blit migrate --write enables hot reload in an older vite.config', { skip: !hasGit }, () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-migrate-hot-'));

    try {
        const project = join(work, 'migrate-hot');
        scaffold({
            targetDir: project,
            projectName: 'migrate-hot',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            packageManager: 'npm@10.9.2',
            agents: [],
        });

        spawnSync('git', ['init'], { cwd: project, stdio: 'ignore' });

        // Simulate a pre-1.4.0 scaffold: vite.config without the blit386 plugin.
        const vitePath = join(project, 'vite.config.js');
        writeFileSync(vitePath, OLD_VITE_CONFIG);

        const { exitCode, output } = runBlit(project, ['migrate', '--write']);
        assert.equal(exitCode, 0, '--write should exit 0');
        assert.ok(output.includes('hot reload') || output.includes('vite.config'), 'output should mention hot reload');

        const vite = readFileSync(vitePath, 'utf8');
        assert.ok(vite.includes("from 'blit386/vite'"), 'vite.config should import blit386/vite');
        assert.ok(vite.includes('blit386()'), 'vite.config should call blit386()');

        // A second migrate should be a no-op for the vite plugin.
        const second = runBlit(project, ['migrate']);
        assert.equal(second.exitCode, 0);
        assert.ok(
            second.output.includes('hot reload is wired') || second.output.includes('Nothing to change'),
            'second migrate should report nothing left to enable',
        );
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});
