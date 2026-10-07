/**
 * The OpenCode adapter through the scaffolder: what an OpenCode scaffold ships, and `blit agents add opencode`.
 * Requires `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { scaffold } from '../dist/scaffold.js';
import { MCP_SERVER_NAME } from '@blit386/kit/adapters';
import { assertNoPlaceholders, runBlit } from './helpers.mjs';

/** Scaffold options every OpenCode test below shares. */
const openCodeOptions = (targetDir, agents) => ({
    targetDir,
    projectName: 'oc-game',
    pmInstall: 'npm install',
    pmRunDev: 'npm run dev',
    pmRunBuild: 'npm run build',
    pmRunFormat: 'npm run format',
    pmRunLint: 'npm run lint',
    packageManager: 'npm@10.9.2',
    agents,
});

const OPENCODE_FILES = [
    'opencode.json',
    '.opencode/plugins/kit-guard.ts',
    '.opencode/hooks/guard-core.cjs',
    '.opencode/hooks/session-start.sh',
];

test('an OpenCode-only scaffold ships opencode.json, the guard plugin, and the shared skills - nothing else agent-shaped', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-opencode-'));

    try {
        const project = join(work, 'opencode-only');
        scaffold(openCodeOptions(project, ['opencode']));

        for (const path of [...OPENCODE_FILES, '.agents/skills/run/SKILL.md', 'AGENTS.md']) {
            assert.ok(existsSync(join(project, path)), `${path} should exist`);
        }

        for (const path of ['CLAUDE.md', '.claude', '.cursor']) {
            assert.ok(!existsSync(join(project, path)), `${path} should not exist`);
        }

        for (const path of ['opencode.json', '.opencode/plugins/kit-guard.ts']) {
            assertNoPlaceholders(project, path);
        }

        const config = JSON.parse(readFileSync(join(project, 'opencode.json'), 'utf8'));
        assert.equal(config.mcp[MCP_SERVER_NAME].url, 'https://blit386.dev/mcp');

        const manifest = JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8'));
        for (const path of [...OPENCODE_FILES, '.agents/skills/run/SKILL.md']) {
            assert.equal(manifest.files.find((f) => f.path === path)?.class, 'kit-owned', path);
            assert.ok(existsSync(join(project, '.blit', 'base', path)), `${path} should keep a pristine base copy`);
        }

        const sync = runBlit(project, ['agents', 'sync']);
        assert.equal(sync.exitCode, 0, `a fresh sync should exit 0:\n${sync.output}`);
        assert.ok(sync.output.includes('up to date'), 'a fresh sync should report up to date');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test("an OpenCode plus Claude scaffold emits the shared skills once next to Claude's private copies", () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-opencode-claude-'));

    try {
        const project = join(work, 'both');
        scaffold(openCodeOptions(project, ['claude', 'opencode']));

        for (const path of [
            ...OPENCODE_FILES,
            '.claude/settings.json',
            '.claude/skills/run/SKILL.md',
            '.agents/skills/run/SKILL.md',
        ]) {
            assert.ok(existsSync(join(project, path)), `${path} should exist`);
        }

        const manifest = JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8'));
        const paths = manifest.files.map((f) => f.path);
        assert.equal(new Set(paths).size, paths.length, 'no file is tracked twice');

        const sync = runBlit(project, ['agents', 'sync']);
        assert.equal(sync.exitCode, 0, `a fresh sync should exit 0:\n${sync.output}`);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add opencode sets up OpenCode in a no-agent game, then a sync is clean', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-add-opencode-'));

    try {
        const project = join(work, 'add-opencode');
        scaffold(openCodeOptions(project, []));
        assert.ok(!existsSync(join(project, '.agents')), 'a no-agent game starts without .agents/');

        const added = runBlit(project, ['agents', 'add', 'opencode']);
        assert.equal(added.exitCode, 0, `add opencode should exit 0:\n${added.output}`);

        for (const path of [...OPENCODE_FILES, '.agents/skills/run/SKILL.md']) {
            assert.ok(existsSync(join(project, path)), `${path} should be created`);
        }

        const manifest = JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8'));
        assert.equal(manifest.files.find((f) => f.path === 'opencode.json')?.class, 'kit-owned');

        const sync = runBlit(project, ['agents', 'sync']);
        assert.equal(sync.exitCode, 0, `sync after add should exit 0:\n${sync.output}`);
        assert.ok(sync.output.includes('up to date'), 'sync after add should report up to date');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add opencode merges into an existing opencode.json and refuses a conflicting one', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-add-opencode-merge-'));

    try {
        const mine = {
            $schema: 'https://opencode.ai/config.json',
            theme: 'tokyonight',
            permission: { edit: { 'secrets/*': 'deny' }, bash: { 'rm *': 'ask' } },
            mcp: { mine: { type: 'remote', url: 'https://example.com/mcp' } },
        };
        const merged = join(work, 'merge');
        scaffold(openCodeOptions(merged, []));
        writeFileSync(join(merged, 'opencode.json'), `${JSON.stringify(mine, null, 2)}\n`);

        const added = runBlit(merged, ['agents', 'add', 'opencode']);
        assert.equal(added.exitCode, 0, `add should merge cleanly:\n${added.output}`);

        const config = JSON.parse(readFileSync(join(merged, 'opencode.json'), 'utf8'));
        assert.equal(config.theme, 'tokyonight', "the user's own keys survive");
        assert.deepEqual(Object.keys(config.permission.edit).slice(0, 1), ['secrets/*'], 'user rules keep their place');
        assert.equal(config.permission.edit['pnpm-lock.yaml'], 'deny', 'the kit rules are added');
        const rules = Object.keys(config.permission.edit);
        assert.ok(
            rules.indexOf('.env.*') < rules.indexOf('.env.example'),
            'the .env.example allow stays after the .env deny, because the last matching rule wins',
        );
        assert.equal(config.permission.bash['rm *'], 'ask');
        assert.deepEqual(Object.keys(config.mcp).sort(), [MCP_SERVER_NAME, 'mine']);

        const clash = join(work, 'clash');
        scaffold(openCodeOptions(clash, []));
        const stricter = `${JSON.stringify({ permission: { edit: { '.env.example': 'deny' } } }, null, 2)}\n`;
        writeFileSync(join(clash, 'opencode.json'), stricter);

        const refused = runBlit(clash, ['agents', 'add', 'opencode']);
        assert.notEqual(refused.exitCode, 0, 'a user rule the kit disagrees with is never overridden');
        assert.equal(readFileSync(join(clash, 'opencode.json'), 'utf8'), stricter, "the user's file is untouched");
        assert.ok(existsSync(join(clash, 'opencode.json.new')), 'the kit version is saved beside it');
        assert.ok(!existsSync(join(clash, '.opencode')), 'nothing else is written');

        // A server the user registered under the kit's name is never extended: one extra key (`headers`, `env`,
        // `command`) changes what the assistant sends or runs, so only an identical entry is accepted.
        const extended = join(work, 'extended');
        scaffold(openCodeOptions(extended, []));
        const extra = `${JSON.stringify(
            {
                mcp: {
                    [MCP_SERVER_NAME]: {
                        type: 'remote',
                        url: 'https://blit386.dev/mcp',
                        enabled: true,
                        headers: { 'X-Mine': '1' },
                    },
                },
            },
            null,
            2,
        )}\n`;
        writeFileSync(join(extended, 'opencode.json'), extra);

        assert.notEqual(
            runBlit(extended, ['agents', 'add', 'opencode']).exitCode,
            0,
            'an extended kit server is refused',
        );
        assert.equal(readFileSync(join(extended, 'opencode.json'), 'utf8'), extra, "the user's file is untouched");
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});
