/**
 * The Gemini CLI adapter through the scaffolder: what a Gemini scaffold ships, and how `add` and `sync` merge
 * `.gemini/settings.json`. Requires `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { scaffold } from '../dist/scaffold.js';
import { runBlit, scaffoldWithManifest, hasGit } from './helpers.mjs';

test('a Gemini-only scaffold writes settings, hooks, and shared skills, and no GEMINI.md or private skills', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-gemini-only-'));

    try {
        const { project, manifest } = scaffoldWithManifest(work, 'gemini-only', 'gemini');
        const settings = JSON.parse(readFileSync(join(project, '.gemini', 'settings.json'), 'utf8'));

        assert.deepEqual(settings.context.fileName, ['AGENTS.md', 'GEMINI.md']);
        assert.equal(settings.mcpServers['blit386-docs'].httpUrl, 'https://blit386.dev/mcp');
        assert.ok(existsSync(join(project, '.gemini', 'hooks', 'shell-guard.cjs')));
        assert.ok(existsSync(join(project, '.gemini', 'hooks', 'guard-core.cjs')));
        assert.ok(existsSync(join(project, '.agents', 'skills', 'run', 'SKILL.md')));
        assert.ok(!existsSync(join(project, 'GEMINI.md')), 'the persona is AGENTS.md; no GEMINI.md');
        assert.ok(!existsSync(join(project, '.gemini', 'policies')), 'workspace policies do not work');
        assert.ok(!existsSync(join(project, '.claude')) && !existsSync(join(project, '.cursor')));

        for (const entry of manifest.files.filter((f) => f.path.startsWith('.gemini/'))) {
            assert.equal(entry.class, 'kit-owned', entry.path);
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('Gemini plus Claude share the project without a clash, and a full sync is clean', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-gemini-claude-'));

    try {
        const project = join(work, 'gemini-claude');
        scaffold({
            targetDir: project,
            projectName: 'gemini-claude',
            pmInstall: 'pnpm install',
            pmRunDev: 'pnpm run dev',
            pmRunBuild: 'pnpm run build',
            pmRunFormat: 'pnpm run format',
            pmRunLint: 'pnpm run lint',
            agents: ['claude', 'gemini'],
            packageManager: 'pnpm@11.20.0',
        });

        assert.ok(existsSync(join(project, '.claude', 'settings.json')));
        assert.ok(existsSync(join(project, '.gemini', 'settings.json')));
        assert.ok(existsSync(join(project, '.agents', 'skills', 'run', 'SKILL.md')));

        const sync = runBlit(project, ['agents', 'sync', '--check']);
        assert.equal(sync.exitCode, 0, `a fresh project should have no drift: ${sync.output}`);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add gemini sets up a no-agent game, and a second add is a no-op', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-gemini-add-'));

    try {
        const project = join(work, 'gemini-add');
        scaffold({
            targetDir: project,
            projectName: 'gemini-add',
            pmInstall: 'pnpm install',
            pmRunDev: 'pnpm run dev',
            pmRunBuild: 'pnpm run build',
            pmRunFormat: 'pnpm run format',
            pmRunLint: 'pnpm run lint',
            agents: [],
            packageManager: 'pnpm@11.20.0',
        });

        assert.ok(!existsSync(join(project, '.gemini')) && !existsSync(join(project, '.agents')));

        const added = runBlit(project, ['agents', 'add', 'gemini']);
        assert.equal(added.exitCode, 0, added.output);
        assert.ok(existsSync(join(project, '.gemini', 'settings.json')));
        assert.ok(existsSync(join(project, '.agents', 'skills', 'run', 'SKILL.md')));

        const again = runBlit(project, ['agents', 'add', 'gemini']);
        assert.equal(again.exitCode, 0, again.output);
        assert.ok(again.output.includes('already set up'));

        const sync = runBlit(project, ['agents', 'sync', '--check']);
        assert.equal(sync.exitCode, 0, `no drift after add: ${sync.output}`);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add gemini merges a pre-existing .gemini/settings.json', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-gemini-merge-'));

    try {
        const project = join(work, 'gemini-merge');
        scaffold({
            targetDir: project,
            projectName: 'gemini-merge',
            pmInstall: 'pnpm install',
            pmRunDev: 'pnpm run dev',
            pmRunBuild: 'pnpm run build',
            pmRunFormat: 'pnpm run format',
            pmRunLint: 'pnpm run lint',
            agents: [],
            packageManager: 'pnpm@11.20.0',
        });

        const userHook = { matcher: 'run_shell_command', hooks: [{ name: 'mine', type: 'command', command: 'true' }] };
        mkdirSync(join(project, '.gemini'), { recursive: true });
        writeFileSync(
            join(project, '.gemini', 'settings.json'),
            JSON.stringify({
                theme: 'Dracula',
                context: { fileName: 'NOTES.md' },
                mcpServers: { mine: { httpUrl: 'https://example.com/mcp' } },
                hooks: { BeforeTool: [userHook] },
            }),
        );

        const added = runBlit(project, ['agents', 'add', 'gemini']);
        assert.equal(added.exitCode, 0, added.output);
        assert.ok(!existsSync(join(project, '.gemini', 'settings.json.new')), 'a clean merge needs no .new copy');

        const merged = JSON.parse(readFileSync(join(project, '.gemini', 'settings.json'), 'utf8'));
        assert.equal(merged.theme, 'Dracula');
        assert.deepEqual(merged.context.fileName, ['NOTES.md', 'AGENTS.md', 'GEMINI.md']);
        assert.deepEqual(Object.keys(merged.mcpServers).sort(), ['blit386-docs', 'mine']);
        assert.deepEqual(merged.hooks.BeforeTool[0], userHook, 'the user hook stays first');
        assert.equal(merged.hooks.BeforeTool.length, 3, 'the kit adds its two BeforeTool groups after it');
        assert.equal(merged.hooks.AfterTool.length, 1);

        const sync = runBlit(project, ['agents', 'sync', '--check']);
        assert.equal(sync.exitCode, 0, `a merged file is tracked, not drift: ${sync.output}`);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('a full sync after a merged add keeps the user entries in .gemini/settings.json', { skip: !hasGit }, () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-gemini-merge-sync-'));

    try {
        const project = join(work, 'gemini-merge-sync');
        scaffold({
            targetDir: project,
            projectName: 'gemini-merge-sync',
            pmInstall: 'pnpm install',
            pmRunDev: 'pnpm run dev',
            pmRunBuild: 'pnpm run build',
            pmRunFormat: 'pnpm run format',
            pmRunLint: 'pnpm run lint',
            agents: [],
            packageManager: 'pnpm@11.20.0',
        });

        mkdirSync(join(project, '.gemini'), { recursive: true });
        writeFileSync(
            join(project, '.gemini', 'settings.json'),
            JSON.stringify({ theme: 'Dracula', mcpServers: { mine: { httpUrl: 'https://example.com/mcp' } } }),
        );

        assert.equal(runBlit(project, ['agents', 'add', 'gemini']).exitCode, 0);
        const afterAdd = readFileSync(join(project, '.gemini', 'settings.json'), 'utf8');

        const sync = runBlit(project, ['agents', 'sync']);
        assert.equal(sync.exitCode, 0, sync.output);

        // The user's entries survive, and the file is exactly what the merge wrote.
        assert.equal(readFileSync(join(project, '.gemini', 'settings.json'), 'utf8'), afterAdd);
        assert.equal(JSON.parse(afterAdd).theme, 'Dracula');
        assert.ok('mine' in JSON.parse(afterAdd).mcpServers);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('a full sync after a merged add keeps the user servers in .mcp.json', { skip: !hasGit }, () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-mcp-merge-sync-'));

    try {
        const project = join(work, 'mcp-merge-sync');
        scaffold({
            targetDir: project,
            projectName: 'mcp-merge-sync',
            pmInstall: 'pnpm install',
            pmRunDev: 'pnpm run dev',
            pmRunBuild: 'pnpm run build',
            pmRunFormat: 'pnpm run format',
            pmRunLint: 'pnpm run lint',
            agents: [],
            packageManager: 'pnpm@11.20.0',
        });

        writeFileSync(
            join(project, '.mcp.json'),
            JSON.stringify({ mcpServers: { mine: { type: 'http', url: 'https://example.com/mcp' } } }),
        );

        assert.equal(runBlit(project, ['agents', 'add', 'claude']).exitCode, 0);
        assert.equal(runBlit(project, ['agents', 'sync']).exitCode, 0);

        const servers = JSON.parse(readFileSync(join(project, '.mcp.json'), 'utf8')).mcpServers;
        assert.deepEqual(Object.keys(servers).sort(), ['blit386-docs', 'mine']);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add gemini falls back to a .new copy when context.fileName is not strings', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-gemini-badname-'));

    try {
        const project = join(work, 'gemini-badname');
        scaffold({
            targetDir: project,
            projectName: 'gemini-badname',
            pmInstall: 'pnpm install',
            pmRunDev: 'pnpm run dev',
            pmRunBuild: 'pnpm run build',
            pmRunFormat: 'pnpm run format',
            pmRunLint: 'pnpm run lint',
            agents: [],
            packageManager: 'pnpm@11.20.0',
        });

        mkdirSync(join(project, '.gemini'), { recursive: true });
        const original = JSON.stringify({ context: { fileName: ['NOTES.md', 7] } });
        writeFileSync(join(project, '.gemini', 'settings.json'), original);

        const added = runBlit(project, ['agents', 'add', 'gemini']);
        assert.notEqual(added.exitCode, 0);
        assert.equal(readFileSync(join(project, '.gemini', 'settings.json'), 'utf8'), original);
        assert.ok(existsSync(join(project, '.gemini', 'settings.json.new')));
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add gemini falls back to a .new copy when the user has a conflicting server', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-gemini-conflict-'));

    try {
        const project = join(work, 'gemini-conflict');
        scaffold({
            targetDir: project,
            projectName: 'gemini-conflict',
            pmInstall: 'pnpm install',
            pmRunDev: 'pnpm run dev',
            pmRunBuild: 'pnpm run build',
            pmRunFormat: 'pnpm run format',
            pmRunLint: 'pnpm run lint',
            agents: [],
            packageManager: 'pnpm@11.20.0',
        });

        mkdirSync(join(project, '.gemini'), { recursive: true });
        const original = JSON.stringify({ mcpServers: { 'blit386-docs': { url: 'https://elsewhere.example/sse' } } });
        writeFileSync(join(project, '.gemini', 'settings.json'), original);

        const added = runBlit(project, ['agents', 'add', 'gemini']);
        assert.notEqual(added.exitCode, 0);
        assert.equal(readFileSync(join(project, '.gemini', 'settings.json'), 'utf8'), original);
        assert.ok(existsSync(join(project, '.gemini', 'settings.json.new')));
        assert.ok(!existsSync(join(project, '.gemini', 'hooks')), 'an aborted add writes no other Gemini files');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});
