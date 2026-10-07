/**
 * The Antigravity adapter through the scaffolder: what an Antigravity scaffold ships. Requires `pnpm run build`
 * first.
 */

import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { scaffold } from '../dist/scaffold.js';

test('scaffold with Antigravity only emits its hooks, MCP config, and the shared skills', () => {
    const work = mkdtempSync(join(tmpdir(), 'blit-scaffold-agy-'));
    const project = join(work, 'agy-game');

    try {
        scaffold({
            targetDir: project,
            projectName: 'agy-game',
            pmInstall: 'pnpm install',
            pmRunDev: 'pnpm run dev',
            pmRunBuild: 'pnpm run build',
            pmRunFormat: 'pnpm run format',
            pmRunLint: 'pnpm run lint',
            includeCi: false,
            agents: ['antigravity'],
            packageManager: 'pnpm@11.20.0',
        });

        for (const path of [
            '.agents/hooks.json',
            '.agents/mcp_config.json',
            '.agents/hooks/antigravity-guard.cjs',
            '.agents/hooks/guard-core.cjs',
            '.agents/skills/run/SKILL.md',
        ]) {
            assert.ok(existsSync(join(project, path)), `${path} should be generated`);
        }

        assert.ok(!existsSync(join(project, '.claude')) && !existsSync(join(project, '.cursor')));
        assert.ok(!existsSync(join(project, '.gemini')) && !existsSync(join(project, '.agents', 'workflows')));

        const manifest = JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8'));
        const classOf = (path) => manifest.files.find((file) => file.path === path)?.class;

        assert.equal(classOf('.agents/hooks.json'), 'kit-owned');
        assert.equal(classOf('.agents/skills/run/SKILL.md'), 'kit-owned');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});
