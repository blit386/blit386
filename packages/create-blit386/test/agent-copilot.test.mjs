/**
 * The GitHub Copilot adapter through the scaffolder: what a Copilot scaffold ships, the shared `.mcp.json`, and the
 * setup-steps workflow's action pins. Requires `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { scaffold } from '../dist/scaffold.js';
import { here, runBlit, scaffoldWithManifest, hasGit, scaffoldNoAgent } from './helpers.mjs';

test('a Copilot-only scaffold writes hooks, setup steps, both MCP configs, and shared skills, and no Claude files', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-copilot-only-'));

    try {
        const { project, manifest } = scaffoldWithManifest(work, 'copilot-only', 'copilot');
        const hooks = JSON.parse(readFileSync(join(project, '.github', 'hooks', 'blit.json'), 'utf8'));
        const setup = readFileSync(join(project, '.github', 'workflows', 'copilot-setup-steps.yml'), 'utf8');

        assert.equal(hooks.version, 1);
        assert.deepEqual(Object.keys(hooks.hooks).sort(), ['postToolUse', 'preToolUse', 'sessionStart']);
        assert.match(setup, /^ {2}copilot-setup-steps:$/m);
        assert.ok(existsSync(join(project, '.github', 'hooks', 'copilot-hook.cjs')));
        assert.ok(existsSync(join(project, '.github', 'hooks', 'guard-core.cjs')));
        assert.ok(existsSync(join(project, '.mcp.json')), 'the Copilot CLI and VS Code read the root .mcp.json');
        assert.ok(!existsSync(join(project, '.vscode')), 'a .vscode/mcp.json would register the server twice');
        assert.ok(existsSync(join(project, '.agents', 'skills', 'run', 'SKILL.md')));
        assert.ok(!existsSync(join(project, '.github', 'prompts')), 'prompt files are deprecated');
        assert.ok(!existsSync(join(project, '.claude')) && !existsSync(join(project, 'CLAUDE.md')));

        for (const entry of manifest.files.filter((f) => /^\.github\/|^\.mcp\.json$/.test(f.path))) {
            assert.equal(entry.class, 'kit-owned', entry.path);
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('Copilot plus Claude share one .mcp.json, and a full sync is clean', { skip: !hasGit }, () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-copilot-claude-'));

    try {
        const project = join(work, 'copilot-claude');
        scaffold({
            targetDir: project,
            projectName: 'copilot-claude',
            pmInstall: 'pnpm install',
            pmRunDev: 'pnpm run dev',
            pmRunBuild: 'pnpm run build',
            pmRunFormat: 'pnpm run format',
            pmRunLint: 'pnpm run lint',
            agents: ['claude', 'copilot'],
            packageManager: 'pnpm@11.20.0',
        });

        const manifest = JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8'));
        assert.equal(manifest.files.filter((f) => f.path === '.mcp.json').length, 1, '.mcp.json is tracked once');
        assert.ok(existsSync(join(project, '.claude', 'settings.json')));
        assert.ok(existsSync(join(project, '.github', 'hooks', 'blit.json')));

        const sync = runBlit(project, ['agents', 'sync']);
        assert.equal(sync.exitCode, 0, sync.output);

        const check = runBlit(project, ['agents', 'sync', '--check']);
        assert.equal(check.exitCode, 0, `a fresh project should have no drift after a full sync: ${check.output}`);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add copilot sets up a no-agent game, and a second add is a no-op', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-copilot-add-'));

    try {
        const project = scaffoldNoAgent(work, 'copilot-add');
        assert.ok(!existsSync(join(project, '.github', 'hooks')) && !existsSync(join(project, '.mcp.json')));

        const added = runBlit(project, ['agents', 'add', 'copilot']);
        assert.equal(added.exitCode, 0, added.output);
        assert.ok(existsSync(join(project, '.github', 'hooks', 'blit.json')));
        assert.ok(existsSync(join(project, '.github', 'workflows', 'copilot-setup-steps.yml')));
        assert.ok(existsSync(join(project, '.mcp.json')));
        assert.ok(existsSync(join(project, '.agents', 'skills', 'run', 'SKILL.md')));

        const again = runBlit(project, ['agents', 'add', 'copilot']);
        assert.equal(again.exitCode, 0, again.output);
        assert.ok(again.output.includes('already set up'));

        const sync = runBlit(project, ['agents', 'sync', '--check']);
        assert.equal(sync.exitCode, 0, `no drift after add: ${sync.output}`);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('the Copilot setup workflow pins the same action versions as the optional CI template', () => {
    // The kit cannot read this package's templates, so `ACTIONS_CHECKOUT` / `ACTIONS_SETUP_NODE` in the kit's
    // src/adapters.ts copy these pins. Renovate bumps only the template; this keeps a bump from leaving the copy behind.
    const work = mkdtempSync(join(tmpdir(), 'cbt-copilot-pins-'));

    try {
        const { project } = scaffoldWithManifest(work, 'copilot-pins', 'copilot');
        const pins = (text) =>
            [...text.matchAll(/^\s*uses: (actions\/(?:checkout|setup-node)@\S+)/gm)].map((m) => m[1]);
        const template = readFileSync(
            join(here, '..', 'templates', 'optional', 'ci', 'github', 'workflows', 'ci.yml'),
            'utf8',
        );
        const setup = readFileSync(join(project, '.github', 'workflows', 'copilot-setup-steps.yml'), 'utf8');

        assert.equal(pins(setup).length, 2, 'the setup workflow uses checkout and setup-node');
        assert.deepEqual(pins(setup), pins(template));
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});
