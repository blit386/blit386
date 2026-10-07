/**
 * The Zed adapter through the scaffolder: what a Zed scaffold ships, and how `add` and `sync` merge
 * `.zed/settings.json`. Requires `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { scaffold } from '../dist/scaffold.js';
import { MCP_SERVER_NAME } from '@blit386/kit/adapters';
import { hasGit, runBlit, PNPM_SCAFFOLD_COMMANDS } from './helpers.mjs';

test('scaffolding with Zed only writes settings and the shared skills, and sync is clean', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-zed-'));

    try {
        const project = join(work, 'zed-game');
        scaffold({ targetDir: project, projectName: 'zed-game', ...PNPM_SCAFFOLD_COMMANDS, agents: ['zed'] });

        const settings = JSON.parse(readFileSync(join(project, '.zed', 'settings.json'), 'utf8'));
        assert.equal(settings.format_on_save, 'on');
        assert.equal(settings.context_servers[MCP_SERVER_NAME].url, 'https://blit386.dev/mcp');
        assert.ok(existsSync(join(project, '.agents', 'skills', 'run', 'SKILL.md')), 'Zed reads the shared skills');
        assert.ok(!existsSync(join(project, '.claude')), 'Zed alone must not add Claude files');
        assert.ok(!existsSync(join(project, '.cursor')), 'Zed alone must not add Cursor files');

        for (const hidden of ['.rules', '.cursorrules', '.windsurfrules', '.clinerules']) {
            assert.ok(!existsSync(join(project, hidden)), `${hidden} would hide AGENTS.md from Zed`);
        }

        assert.equal(runBlit(project, ['agents', 'sync', '--check']).exitCode, 0, 'a fresh Zed project is in sync');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('scaffolding with Zed and Claude keeps one shared skills folder', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-zed-claude-'));

    try {
        const project = join(work, 'zed-claude-game');
        scaffold({
            targetDir: project,
            projectName: 'zed-claude-game',
            ...PNPM_SCAFFOLD_COMMANDS,
            agents: ['claude', 'zed'],
        });

        assert.ok(existsSync(join(project, '.zed', 'settings.json')));
        assert.ok(existsSync(join(project, '.claude', 'skills', 'run', 'SKILL.md')));
        assert.ok(existsSync(join(project, '.agents', 'skills', 'run', 'SKILL.md')));
        assert.equal(runBlit(project, ['agents', 'sync', '--check']).exitCode, 0);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

// The full sync after a merged add three-way merges through `git merge-file`; skip where git is unavailable.
test('blit agents add zed sets up a no-agent game and merges the user .zed/settings.json', { skip: !hasGit }, () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-zed-add-'));

    try {
        const project = join(work, 'zed-add-game');
        scaffold({ targetDir: project, projectName: 'zed-add-game', ...PNPM_SCAFFOLD_COMMANDS, agents: [] });

        const settingsPath = join(project, '.zed', 'settings.json');
        mkdirSync(dirname(settingsPath), { recursive: true });
        writeFileSync(
            settingsPath,
            `${JSON.stringify({ theme: 'One Dark', languages: { JavaScript: { tab_size: 2 } } }, null, 2)}\n`,
        );

        const { exitCode } = runBlit(project, ['agents', 'add', 'zed']);
        assert.equal(exitCode, 0, 'a clean merge should exit 0');
        assert.ok(!existsSync(`${settingsPath}.new`), 'a clean merge leaves no .new copy');
        assert.ok(existsSync(join(project, '.agents', 'skills', 'run', 'SKILL.md')));

        const merged = JSON.parse(readFileSync(settingsPath, 'utf8'));
        assert.equal(merged.theme, 'One Dark', 'the user setting must survive');
        assert.equal(merged.languages.JavaScript.tab_size, 2, 'the user language setting must survive');
        assert.equal(merged.languages.JavaScript.formatter.language_server.name, 'biome');
        assert.equal(merged.format_on_save, 'on');
        assert.ok(merged.context_servers[MCP_SERVER_NAME]);

        assert.equal(runBlit(project, ['agents', 'sync', '--check']).exitCode, 0, 'the merge is not drift');
        assert.equal(runBlit(project, ['agents', 'sync']).exitCode, 0, 'full sync should succeed');
        assert.equal(JSON.parse(readFileSync(settingsPath, 'utf8')).theme, 'One Dark', 'full sync keeps the user key');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents sync keeps a user-edited .zed/settings.json and merges kit changes into it', {
    skip: !hasGit,
}, () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-zed-sync-'));

    try {
        const project = join(work, 'zed-sync-game');
        scaffold({ targetDir: project, projectName: 'zed-sync-game', ...PNPM_SCAFFOLD_COMMANDS, agents: ['zed'] });

        const settingsPath = join(project, '.zed', 'settings.json');
        // The user's key goes first, away from the kit block the next step changes - a text merge cannot
        // reconcile two edits on adjacent lines, and falls back to a `.new` copy instead.
        const settings = { theme: 'One Dark', ...JSON.parse(readFileSync(settingsPath, 'utf8')) };
        writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

        // Make the kit's copy differ from the recorded ancestor, so sync has a real change to merge in.
        const basePath = join(project, '.blit', 'base', '.zed', 'settings.json');
        const { context_servers: _dropped, ...older } = JSON.parse(readFileSync(basePath, 'utf8'));
        writeFileSync(basePath, `${JSON.stringify(older, null, 2)}\n`);

        const sync = runBlit(project, ['agents', 'sync']);
        assert.equal(sync.exitCode, 0, 'a clean merge should exit 0');
        assert.ok(!existsSync(`${settingsPath}.new`), 'a clean merge should not leave a .new conflict copy');

        const merged = JSON.parse(readFileSync(settingsPath, 'utf8'));
        assert.equal(merged.theme, 'One Dark', 'the user setting must survive the sync');
        assert.ok(merged.context_servers[MCP_SERVER_NAME], 'the kit server must still be there');
        assert.equal(runBlit(project, ['agents', 'sync', '--check']).exitCode, 0);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add zed aborts when the user already set format_on_save differently', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-zed-conflict-'));

    try {
        const project = join(work, 'zed-conflict-game');
        scaffold({ targetDir: project, projectName: 'zed-conflict-game', ...PNPM_SCAFFOLD_COMMANDS, agents: [] });

        const settingsPath = join(project, '.zed', 'settings.json');
        mkdirSync(dirname(settingsPath), { recursive: true });
        const userContent = `${JSON.stringify({ format_on_save: 'off' }, null, 2)}\n`;
        writeFileSync(settingsPath, userContent);

        const { exitCode } = runBlit(project, ['agents', 'add', 'zed']);

        assert.notEqual(exitCode, 0);
        assert.equal(readFileSync(settingsPath, 'utf8'), userContent, 'the user setting must win');
        assert.ok(existsSync(`${settingsPath}.new`));
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});
