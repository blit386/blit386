/**
 * Smoke test for the scaffolder.
 *
 * Runs the built CLI end-to-end in a temp directory (with --yes --no-install --no-git so it stays offline and fast),
 * then asserts the generated project has all expected files, no leftover {{placeholders}}, and no leaked workspace:*
 * dependency. Requires `pnpm run build` first; CI runs the build before the tests.
 */

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { scaffold } from '../dist/scaffold.js';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const cli = join(packageRoot, 'dist', 'index.js');

function assertNoPlaceholders(projectDir, relativePath) {
    const content = readFileSync(join(projectDir, relativePath), 'utf8');
    assert.ok(!content.includes('{{'), `${relativePath} still has unrendered placeholders`);
}

test('scaffolds a runnable game project', () => {
    assert.ok(existsSync(cli), 'dist/index.js must be built before running tests (run `pnpm run build`)');

    const work = mkdtempSync(join(tmpdir(), 'cbt-smoke-'));

    try {
        execFileSync(process.execPath, [cli, 'my-game', '--yes', '--no-install', '--no-git'], {
            cwd: work,
            stdio: 'ignore',
        });

        const project = join(work, 'my-game');
        const expected = [
            'index.html',
            'vite.config.js',
            'README.md',
            '.gitignore',
            '.editorconfig',
            'biome.json',
            'jsconfig.json',
            'package.json',
            join('src', 'game.js'),
            'AGENTS.md',
            join('docs', 'getting-started.md'),
            join('public', '.gitkeep'),
        ];
        for (const relativePath of expected) {
            assert.ok(existsSync(join(project, relativePath)), `expected ${relativePath} to be generated`);
        }

        const manifestRaw = readFileSync(join(project, 'package.json'), 'utf8');
        assert.ok(!manifestRaw.includes('{{'), 'package.json still has unrendered placeholders');
        assert.ok(!manifestRaw.includes('workspace:*'), 'package.json leaked a workspace:* dependency');

        const manifest = JSON.parse(manifestRaw);
        assert.equal(manifest.name, 'my-game', 'package name should match the folder');
        assert.ok(manifest.dependencies?.['blit-tech'], 'blit-tech dependency is missing');
        assert.ok(manifest.devDependencies?.['@blit-tech/kit'], '@blit-tech/kit devDependency is missing');
        assert.ok(manifest.devDependencies?.['@biomejs/biome'], '@biomejs/biome devDependency is missing');
        assert.ok(manifest.scripts?.format, 'format script is missing');
        assert.ok(manifest.scripts?.lint, 'lint script is missing');

        const game = readFileSync(join(project, 'src', 'game.js'), 'utf8');
        assert.ok(game.includes('bootstrap(Game)'), 'game.js is missing the bootstrap call');
        assert.ok(!game.includes('{{'), 'game.js still has unrendered placeholders');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('scaffold copies optional CI and agent files when requested', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-opt-'));

    try {
        const project = join(work, 'optional-game');
        scaffold({
            targetDir: project,
            projectName: 'optional-game',
            pmInstall: 'pnpm install',
            pmRunDev: 'pnpm run dev',
            pmRunBuild: 'pnpm run build',
            pmRunFormat: 'pnpm run format',
            pmRunLint: 'pnpm run lint',
            includeCi: true,
            agent: 'claude',
        });

        assert.ok(existsSync(join(project, '.github', 'workflows', 'ci.yml')), 'CI workflow should be generated');
        assert.ok(existsSync(join(project, 'CLAUDE.md')), 'CLAUDE.md should be generated for Claude agent choice');
        assertNoPlaceholders(project, 'CLAUDE.md');

        const cursorProject = join(work, 'cursor-game');
        scaffold({
            targetDir: cursorProject,
            projectName: 'cursor-game',
            pmInstall: 'pnpm install',
            pmRunDev: 'pnpm run dev',
            pmRunBuild: 'pnpm run build',
            pmRunFormat: 'pnpm run format',
            pmRunLint: 'pnpm run lint',
            includeCi: false,
            agent: 'cursor',
        });

        assert.ok(
            existsSync(join(cursorProject, '.cursor', 'rules', 'blit-tech-api-names.mdc')),
            'Cursor rules should be generated',
        );
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});
