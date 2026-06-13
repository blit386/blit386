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
        assert.ok(manifest.scripts?.build, 'build script is missing');

        const game = readFileSync(join(project, 'src', 'game.js'), 'utf8');
        assert.ok(game.includes('bootstrap(Game)'), 'game.js is missing the bootstrap call');
        assert.ok(!game.includes('{{'), 'game.js still has unrendered placeholders');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('scaffolds without --yes when no interactive terminal is attached', () => {
    // stdio: 'ignore' means stdin/stdout are not TTYs, like an AI agent or CI. The non-TTY guard should fall back to
    // the defaults instead of hanging on the wizard. The timeout fails the test if it ever blocks on a prompt.
    const work = mkdtempSync(join(tmpdir(), 'cbt-nontty-'));

    try {
        execFileSync(process.execPath, [cli, 'agent-game', '--no-install', '--no-git'], {
            cwd: work,
            stdio: 'ignore',
            timeout: 30_000,
        });

        const project = join(work, 'agent-game');
        assert.ok(existsSync(join(project, 'package.json')), 'non-TTY run should still scaffold the project');
        assert.ok(existsSync(join(project, 'src', 'game.js')), 'non-TTY run should emit the game file');
        assert.ok(!existsSync(join(project, 'CLAUDE.md')), 'non-TTY run should use the default of no AI assistant');
        assert.ok(!existsSync(join(project, '.github')), 'non-TTY run should use the default of no CI');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('scaffold copies optional CI and agent files when requested', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-opt-'));

    try {
        const project = join(work, 'optional-game');
        const pmRunBuild = 'pnpm run build';
        const pmRunFormat = 'pnpm run format';
        const pmRunLint = 'pnpm run lint';
        scaffold({
            targetDir: project,
            projectName: 'optional-game',
            pmInstall: 'pnpm install',
            pmRunDev: 'pnpm run dev',
            pmRunBuild,
            pmRunFormat,
            pmRunLint,
            includeCi: true,
            agent: 'claude',
        });

        assert.ok(existsSync(join(project, '.github', 'workflows', 'ci.yml')), 'CI workflow should be generated');
        assert.ok(existsSync(join(project, 'CLAUDE.md')), 'CLAUDE.md should be generated for Claude agent choice');
        assertNoPlaceholders(project, 'CLAUDE.md');

        const claudeGuide = readFileSync(join(project, 'CLAUDE.md'), 'utf8');
        assert.ok(claudeGuide.includes(pmRunBuild), 'CLAUDE.md should include the build command');
        assert.ok(claudeGuide.includes(pmRunFormat), 'CLAUDE.md should include the format command');
        assert.ok(claudeGuide.includes(pmRunLint), 'CLAUDE.md should include the lint command');
        assert.ok(!claudeGuide.includes('{{pmRunBuild}}'), 'CLAUDE.md should not contain pmRunBuild placeholder');
        assert.ok(!claudeGuide.includes('{{pmRunFormat}}'), 'CLAUDE.md should not contain pmRunFormat placeholder');
        assert.ok(!claudeGuide.includes('{{pmRunLint}}'), 'CLAUDE.md should not contain pmRunLint placeholder');

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
