/**
 * The Codex adapter through the scaffolder: what a Codex scaffold ships, and how `blit agents add codex` merges
 * `.codex/config.toml`. Requires `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { scaffold } from '../dist/scaffold.js';
import { runBlit, scaffoldWithManifest, hasGit, scaffoldNoAgent } from './helpers.mjs';

/** The kit's one table in `.codex/config.toml`. */
const CODEX_DOCS_TABLE = '[mcp_servers.blit386-docs]\nurl = "https://blit386.dev/mcp"\n';

test('a Codex-only scaffold writes hooks, config, and shared skills, and nothing private beyond .codex/', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-codex-only-'));

    try {
        const { project, manifest } = scaffoldWithManifest(work, 'codex-only', 'codex');
        const hooks = JSON.parse(readFileSync(join(project, '.codex', 'hooks.json'), 'utf8'));

        assert.deepEqual(Object.keys(hooks.hooks).sort(), ['PostToolUse', 'PreToolUse', 'SessionStart']);
        assert.ok(readFileSync(join(project, '.codex', 'config.toml'), 'utf8').endsWith(CODEX_DOCS_TABLE));
        assert.ok(existsSync(join(project, '.codex', 'hooks', 'codex-guard.cjs')));
        assert.ok(existsSync(join(project, '.codex', 'hooks', 'guard-core.cjs')));
        assert.ok(existsSync(join(project, '.agents', 'skills', 'run', 'SKILL.md')));
        assert.ok(existsSync(join(project, 'AGENTS.md')), 'Codex reads AGENTS.md as its persona');
        assert.ok(!existsSync(join(project, '.codex', 'rules')), 'rules are experimental and not emitted');
        assert.ok(!existsSync(join(project, '.claude')) && !existsSync(join(project, '.cursor')));

        for (const entry of manifest.files.filter((f) => f.path.startsWith('.codex/'))) {
            assert.equal(entry.class, 'kit-owned', entry.path);
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('Codex plus Claude share the project without a clash, and a full sync is clean', { skip: !hasGit }, () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-codex-claude-'));

    try {
        const project = join(work, 'codex-claude');
        scaffold({
            targetDir: project,
            projectName: 'codex-claude',
            pmInstall: 'pnpm install',
            pmRunDev: 'pnpm run dev',
            pmRunBuild: 'pnpm run build',
            pmRunFormat: 'pnpm run format',
            pmRunLint: 'pnpm run lint',
            agents: ['claude', 'codex'],
            packageManager: 'pnpm@11.20.0',
        });

        assert.ok(existsSync(join(project, '.claude', 'settings.json')));
        assert.ok(existsSync(join(project, '.codex', 'hooks.json')));
        assert.ok(existsSync(join(project, '.agents', 'skills', 'run', 'SKILL.md')));

        const sync = runBlit(project, ['agents', 'sync']);
        assert.equal(sync.exitCode, 0, sync.output);

        const check = runBlit(project, ['agents', 'sync', '--check']);
        assert.equal(check.exitCode, 0, `a fresh project should have no drift after a full sync: ${check.output}`);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add codex sets up a no-agent game, and a second add is a no-op', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-codex-add-'));

    try {
        const project = scaffoldNoAgent(work, 'codex-add');
        assert.ok(!existsSync(join(project, '.codex')) && !existsSync(join(project, '.agents')));

        const added = runBlit(project, ['agents', 'add', 'codex']);
        assert.equal(added.exitCode, 0, added.output);
        assert.ok(existsSync(join(project, '.codex', 'hooks.json')));
        assert.ok(existsSync(join(project, '.codex', 'config.toml')));
        assert.ok(existsSync(join(project, '.agents', 'skills', 'run', 'SKILL.md')));

        const again = runBlit(project, ['agents', 'add', 'codex']);
        assert.equal(again.exitCode, 0, again.output);
        assert.ok(again.output.includes('already set up'));

        const sync = runBlit(project, ['agents', 'sync', '--check']);
        assert.equal(sync.exitCode, 0, `no drift after add: ${sync.output}`);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add codex appends its table to a hand-written .codex/config.toml, and sync keeps both', {
    skip: !hasGit,
}, () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-codex-merge-'));

    try {
        const project = scaffoldNoAgent(work, 'codex-merge');
        const userConfig = 'model = "gpt-5"\n\n[mcp_servers.mine]\nurl = "https://example.com/mcp"';
        mkdirSync(join(project, '.codex'), { recursive: true });
        writeFileSync(join(project, '.codex', 'config.toml'), userConfig);

        const added = runBlit(project, ['agents', 'add', 'codex']);
        assert.equal(added.exitCode, 0, added.output);
        assert.ok(!existsSync(join(project, '.codex', 'config.toml.new')), 'a clean merge needs no .new copy');

        const merged = readFileSync(join(project, '.codex', 'config.toml'), 'utf8');
        assert.ok(merged.startsWith(`${userConfig}\n\n# Source: @blit386/kit`), 'the user part stays first, untouched');
        assert.ok(merged.endsWith(CODEX_DOCS_TABLE));

        assert.equal(runBlit(project, ['agents', 'sync', '--check']).exitCode, 0, 'a merged file is tracked');

        const sync = runBlit(project, ['agents', 'sync']);
        assert.equal(sync.exitCode, 0, sync.output);
        assert.equal(readFileSync(join(project, '.codex', 'config.toml'), 'utf8'), merged);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add codex keeps a config.toml that already holds the kit table as it is', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-codex-same-'));

    try {
        const project = scaffoldNoAgent(work, 'codex-same');
        const userConfig = `# mine\n${CODEX_DOCS_TABLE}\n[mcp_servers.mine]\nurl = "https://example.com/mcp"\n`;
        mkdirSync(join(project, '.codex'), { recursive: true });
        writeFileSync(join(project, '.codex', 'config.toml'), userConfig);

        const added = runBlit(project, ['agents', 'add', 'codex']);
        assert.equal(added.exitCode, 0, added.output);
        assert.equal(readFileSync(join(project, '.codex', 'config.toml'), 'utf8'), userConfig);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add codex will not redefine a docs server the user configured differently', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-codex-clash-'));

    try {
        for (const [index, userConfig] of [
            '[mcp_servers.blit386-docs]\nurl = "https://example.com/other"\n',
            '[mcp_servers.blit386-docs]\nurl = "https://blit386.dev/mcp"\nenabled = false\n',
            'mcp_servers.blit386-docs.url = "https://blit386.dev/mcp"\n',
        ].entries()) {
            const project = scaffoldNoAgent(work, `codex-clash-${index}`);
            mkdirSync(join(project, '.codex'), { recursive: true });
            writeFileSync(join(project, '.codex', 'config.toml'), userConfig);

            const added = runBlit(project, ['agents', 'add', 'codex']);
            assert.notEqual(added.exitCode, 0, `${userConfig}: ${added.output}`);
            assert.equal(readFileSync(join(project, '.codex', 'config.toml'), 'utf8'), userConfig, 'never rewritten');
            assert.ok(existsSync(join(project, '.codex', 'config.toml.new')));
            assert.ok(!existsSync(join(project, '.codex', 'hooks.json')), 'setup is all-or-nothing');
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});
