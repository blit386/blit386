/**
 * The Claude Code and Cursor adapters through the scaffolder: both adapter trees, the user-owned
 * `.claude/launch.json`, the guard core beside the hooks, and the kit-owned `.mcp.json`. Requires `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { scaffold } from '../dist/scaffold.js';

test('scaffold with both Claude and Cursor agents writes both adapter trees', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-both-agents-'));

    try {
        const project = join(work, 'both-game');
        scaffold({
            targetDir: project,
            projectName: 'both-game',
            pmInstall: 'pnpm install',
            pmRunDev: 'pnpm run dev',
            pmRunBuild: 'pnpm run build',
            pmRunFormat: 'pnpm run format',
            pmRunLint: 'pnpm run lint',
            packageManager: 'pnpm@11.20.0',
            agents: ['claude', 'cursor'],
        });

        assert.ok(existsSync(join(project, 'CLAUDE.md')), 'Claude CLAUDE.md should be generated');
        assert.ok(existsSync(join(project, '.cursor', 'hooks.json')), 'Cursor hooks.json should be generated');
        assert.ok(
            existsSync(join(project, '.claude', 'skills', 'play-a-sound', 'SKILL.md')),
            'both-assistant games should ship the Claude skill',
        );
        assert.ok(
            existsSync(join(project, '.cursor', 'skills', 'play-a-sound', 'SKILL.md')),
            'both-assistant games should also ship the Cursor skill',
        );

        const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));
        assert.equal(pkg.packageManager, 'pnpm@11.20.0', 'explicit packageManager option should land in package.json');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('a Claude scaffold ships a user-owned .claude/launch.json for its package manager; Cursor-only has none', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-launch-json-'));
    const launchJson = join('.claude', 'launch.json');
    const make = (pm, agents) => {
        const project = join(work, `${pm}-${agents.join('-')}`);
        scaffold({
            targetDir: project,
            projectName: 'Launch Game',
            pmInstall: `${pm} install`,
            pmRunDev: `${pm} run dev`,
            pmRunBuild: `${pm} run build`,
            pmRunFormat: `${pm} run format`,
            pmRunLint: `${pm} run lint`,
            agents,
        });
        return project;
    };

    try {
        for (const pm of ['pnpm', 'npm']) {
            const project = make(pm, ['claude']);
            const [config] = JSON.parse(readFileSync(join(project, launchJson), 'utf8')).configurations;

            assert.equal(config.runtimeExecutable, pm);
            assert.equal(config.port, 5173);

            const manifest = JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8'));
            assert.equal(manifest.files.find((f) => f.path === '.claude/launch.json')?.class, 'user-owned');
            assert.ok(!existsSync(join(project, '.blit', 'base', launchJson)), 'user-owned files keep no base copy');
        }

        assert.ok(!existsSync(join(make('pnpm', ['cursor']), launchJson)), 'Cursor does not read launch.json');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('Claude and Cursor scaffolds ship the guard core beside their hooks; only OpenCode brings .agents/', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-guard-core-'));
    const make = (agents) => {
        const project = join(work, agents.join('-') || 'none');
        scaffold({
            targetDir: project,
            projectName: 'Guard Game',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            agents,
        });
        return project;
    };

    try {
        const claude = make(['claude']);
        assert.ok(existsSync(join(claude, '.claude', 'hooks', 'guard-core.cjs')), 'protect-files.cjs needs its core');

        const blocked = spawnSync(process.execPath, [join(claude, '.claude', 'hooks', 'protect-files.cjs')], {
            input: JSON.stringify({ tool_input: { file_path: 'package-lock.json' } }),
        });
        assert.equal(blocked.status, 2, 'the generated protect-files hook still blocks a lock file');

        const cursor = make(['cursor']);
        assert.ok(existsSync(join(cursor, '.cursor', 'hooks', 'guard-core.cjs')), 'shell-safety.cjs needs its core');
        assert.ok(!existsSync(join(cursor, '.cursor', 'hooks', 'protect-files.cjs')), 'Cursor has no pre-edit guard');

        const denied = spawnSync(process.execPath, [join(cursor, '.cursor', 'hooks', 'shell-safety.cjs')], {
            input: JSON.stringify({ hook_event_name: 'beforeShellExecution', command: 'git clean -fd' }),
            encoding: 'utf8',
        });
        assert.equal(JSON.parse(denied.stdout).permission, 'deny', 'the generated shell-safety entry still blocks');

        // Claude Code and Cursor keep private skill copies; only an agent that reads the shared folder emits it.
        for (const project of [claude, cursor, make(['claude', 'cursor']), make([])]) {
            assert.ok(!existsSync(join(project, '.agents')), `${project} should have no .agents/ folder`);
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('the scaffolded MCP config is recorded as kit-owned in the manifest', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-mcp-class-'));

    try {
        for (const [agent, mcpPath] of [
            ['claude', '.mcp.json'],
            ['cursor', '.cursor/mcp.json'],
            ['gemini', '.gemini/settings.json'],
            ['codex', '.codex/config.toml'],
            ['copilot', '.mcp.json'],
        ]) {
            const project = join(work, `${agent}-mcp-class`);
            scaffold({
                targetDir: project,
                projectName: `${agent}-mcp-class`,
                pmInstall: 'npm install',
                pmRunDev: 'npm run dev',
                pmRunBuild: 'npm run build',
                pmRunFormat: 'npm run format',
                pmRunLint: 'npm run lint',
                agents: [agent],
                packageManager: 'npm@10.9.2',
            });

            const manifest = JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8'));
            const entry = manifest.files.find((f) => f.path === mcpPath);

            // A user-owned misclassification is silent: the file scaffolds fine and then never updates
            // again, so the game keeps pointing at whatever the docs server looked like on day one.
            assert.ok(entry, `${mcpPath} should be recorded in the manifest`);
            assert.equal(entry.class, 'kit-owned', `${mcpPath} should be kit-owned`);

            const onDisk = createHash('sha256')
                .update(readFileSync(join(project, ...mcpPath.split('/'))))
                .digest('hex');
            assert.equal(entry.sha256, onDisk, `${mcpPath} manifest hash should match the file on disk`);
            assert.ok(existsSync(join(project, '.blit', 'base', ...mcpPath.split('/'))), 'a base copy is needed');
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});
