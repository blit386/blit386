/**
 * Smoke test for the scaffolder.
 *
 * Runs the built CLI end-to-end in a temp directory (with --yes --no-install --no-git so it stays offline and fast),
 * then asserts the generated project has all expected files, no leftover {{placeholders}}, and no leaked workspace:*
 * dependency. Requires `pnpm run build` first; CI runs the build before the tests.
 */

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { scaffold } from '../dist/scaffold.js';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const cli = join(packageRoot, 'dist', 'index.js');
const blitCli = join(here, '..', '..', 'kit', 'dist', 'cli.js');

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
            join('.blit', 'manifest.json'),
        ];
        for (const relativePath of expected) {
            assert.ok(existsSync(join(project, relativePath)), `expected ${relativePath} to be generated`);
        }

        // The manifest should record files with sha256 hashes and correct classes.
        const blitManifest = JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8'));
        assert.ok(Array.isArray(blitManifest.files), 'manifest.files should be an array');
        assert.ok(blitManifest.files.length > 0, 'manifest should have at least one entry');
        const agentsEntry = blitManifest.files.find((f) => f.path === 'AGENTS.md');
        assert.ok(agentsEntry, 'manifest should have an AGENTS.md entry');
        assert.equal(agentsEntry.class, 'shared', 'AGENTS.md should be classified as shared');
        const agentsBuf = readFileSync(join(project, 'AGENTS.md'));
        const expectedSha = createHash('sha256').update(agentsBuf).digest('hex');
        assert.equal(agentsEntry.sha256, expectedSha, 'manifest sha256 should match the actual AGENTS.md content');
        const baseAgents = join(project, '.blit', 'base', 'AGENTS.md');
        assert.ok(existsSync(baseAgents), '.blit/base/AGENTS.md (pristine copy) should exist');
        assert.deepStrictEqual(agentsBuf, readFileSync(baseAgents), '.blit/base/AGENTS.md bytes should match the generated file');

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

        // The base templates should use the entryFile and gameFile template vars, not hardcoded paths.
        const html = readFileSync(join(project, 'index.html'), 'utf8');
        assert.ok(html.includes('src/game.js'), 'index.html should contain the JS entry file path');
        assert.ok(!html.includes('{{'), 'index.html still has unrendered placeholders');

        const readme = readFileSync(join(project, 'README.md'), 'utf8');
        assert.ok(readme.includes('src/game.js'), 'README.md should reference the game file');
        assert.ok(!readme.includes('{{'), 'README.md still has unrendered placeholders');
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
        assert.ok(claudeGuide.includes('<!-- blit-kit:managed:start -->'), 'CLAUDE.md should have managed-region start marker');
        assert.ok(claudeGuide.includes('<!-- blit-kit:managed:end -->'), 'CLAUDE.md should have managed-region end marker');
        assert.ok(claudeGuide.includes('Your notes'), 'CLAUDE.md should have a Your notes section outside the managed region');

        // The Claude adapter should also emit .claude/rules/ and .claude/skills/.
        assert.ok(existsSync(join(project, '.claude', 'rules', 'blit-api-names.md')), '.claude/rules/blit-api-names.md should be generated');
        assert.ok(existsSync(join(project, '.claude', 'rules', 'blit-integer-coords.md')), '.claude/rules/blit-integer-coords.md should be generated');
        assert.ok(existsSync(join(project, '.claude', 'skills', 'run', 'SKILL.md')), '.claude/skills/run/SKILL.md should be generated');
        assert.ok(existsSync(join(project, '.claude', 'skills', 'fix', 'SKILL.md')), '.claude/skills/fix/SKILL.md should be generated');

        // Rule files should have frontmatter stripped (Claude reads plain markdown).
        const apiNamesRule = readFileSync(join(project, '.claude', 'rules', 'blit-api-names.md'), 'utf8');
        assert.ok(!apiNamesRule.startsWith('---'), 'Claude rule files should not have YAML frontmatter');
        assert.ok(apiNamesRule.includes('BT'), 'Claude rule file should contain the API content');

        // Skill files should have template vars rendered.
        const runSkill = readFileSync(join(project, '.claude', 'skills', 'run', 'SKILL.md'), 'utf8');
        assert.ok(runSkill.includes(pmRunBuild.replace('build', 'dev')), 'run skill should reference the dev command');
        assert.ok(!runSkill.includes('{{'), 'run skill should not have unrendered placeholders');

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

        // Cursor adapter: rules, hooks, and commands should all be generated.
        assert.ok(
            existsSync(join(cursorProject, '.cursor', 'rules', 'blit-api-names.mdc')),
            'Cursor rule blit-api-names.mdc should be generated',
        );
        assert.ok(
            existsSync(join(cursorProject, '.cursor', 'rules', 'blit-integer-coords.mdc')),
            'Cursor rule blit-integer-coords.mdc should be generated',
        );
        assert.ok(existsSync(join(cursorProject, '.cursor', 'hooks.json')), '.cursor/hooks.json should be generated');
        assert.ok(
            existsSync(join(cursorProject, '.cursor', 'hooks', 'shell-safety.sh')),
            '.cursor/hooks/shell-safety.sh should be generated',
        );
        assert.ok(
            existsSync(join(cursorProject, '.cursor', 'commands', 'run.md')),
            '.cursor/commands/run.md should be generated',
        );
        assert.ok(
            existsSync(join(cursorProject, '.cursor', 'commands', 'fix.md')),
            '.cursor/commands/fix.md should be generated',
        );

        // Cursor rule files should keep their MDC frontmatter (Cursor reads alwaysApply from it).
        const apiRule = readFileSync(join(cursorProject, '.cursor', 'rules', 'blit-api-names.mdc'), 'utf8');
        assert.ok(apiRule.startsWith('---'), 'Cursor rule files should keep YAML frontmatter');
        assert.ok(apiRule.includes('alwaysApply: true'), 'Cursor rule should include alwaysApply flag');

        // hooks.json should have the expected structure with afterFileEdit and beforeShellExecution.
        const hooksJson = JSON.parse(readFileSync(join(cursorProject, '.cursor', 'hooks.json'), 'utf8'));
        assert.equal(hooksJson.version, 1, 'hooks.json version should be 1');
        assert.ok(Array.isArray(hooksJson.hooks.afterFileEdit), 'hooks.json should have afterFileEdit entries');
        assert.ok(hooksJson.hooks.afterFileEdit.length > 0, 'afterFileEdit should contain at least one entry');
        assert.ok(
            Array.isArray(hooksJson.hooks.beforeShellExecution),
            'hooks.json should have beforeShellExecution entries',
        );
        assert.ok(
            hooksJson.hooks.beforeShellExecution.length > 0,
            'beforeShellExecution should contain at least one entry',
        );
        const safetyHook = hooksJson.hooks.beforeShellExecution[0];
        assert.ok(safetyHook.failClosed === true, 'shell safety hook should be failClosed');

        // Template vars should be rendered in hooks.json.
        const formatHook = hooksJson.hooks.afterFileEdit[0];
        assert.ok(formatHook.command.includes('format'), 'format hook should reference the format command');
        assert.ok(!formatHook.command.includes('{{'), 'format hook should not have unrendered placeholders');

        // Commands should have template vars rendered.
        const runCmd = readFileSync(join(cursorProject, '.cursor', 'commands', 'run.md'), 'utf8');
        assert.ok(!runCmd.includes('{{'), 'run command should not have unrendered placeholders');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents sync --check exits 0 when no files have drifted', () => {
    assert.ok(existsSync(blitCli), 'packages/kit/dist/cli.js must be built before running tests');

    const work = mkdtempSync(join(tmpdir(), 'cbt-sync-ok-'));

    try {
        const project = join(work, 'sync-game');
        scaffold({
            targetDir: project,
            projectName: 'sync-game',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
        });

        // Nothing has been modified — check should pass with exit code 0.
        const result = execFileSync(process.execPath, [blitCli, 'agents', 'sync', '--check'], {
            cwd: project,
            encoding: 'utf8',
        });

        assert.ok(result.includes('up to date'), 'sync --check should report files are up to date');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents sync --check exits non-zero when a kit-managed file is modified', () => {
    assert.ok(existsSync(blitCli), 'packages/kit/dist/cli.js must be built before running tests');

    const work = mkdtempSync(join(tmpdir(), 'cbt-sync-drift-'));

    try {
        const project = join(work, 'drift-game');
        scaffold({
            targetDir: project,
            projectName: 'drift-game',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            agent: 'claude',
        });

        // Simulate a user (or an AI agent) editing a kit-owned rule file.
        writeFileSync(join(project, '.claude', 'rules', 'blit-api-names.md'), '# edited by user\n');

        let exitCode = 0;
        let output = '';

        try {
            execFileSync(process.execPath, [blitCli, 'agents', 'sync', '--check'], {
                cwd: project,
                encoding: 'utf8',
            });
        } catch (err) {
            exitCode = err.status ?? 1;
            output = err.stdout ?? '';
        }

        assert.ok(exitCode !== 0, 'sync --check should exit non-zero when a kit-managed file has drifted');
        assert.ok(output.includes('blit-api-names.md'), 'output should name the drifted file');
        assert.ok(output.includes('drifted'), 'output should mention drift');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

function runBlit(project, args) {
    let exitCode = 0;
    let output = '';
    try {
        output = execFileSync(process.execPath, [blitCli, ...args], { cwd: project, encoding: 'utf8' });
    } catch (err) {
        exitCode = err.status ?? 1;
        output = (err.stdout ?? '') + (err.stderr ?? '');
    }
    return { exitCode, output };
}

test('blit agents sync (full) changes nothing on a freshly scaffolded Claude project', () => {
    assert.ok(existsSync(blitCli), 'packages/kit/dist/cli.js must be built before running tests');

    const work = mkdtempSync(join(tmpdir(), 'cbt-fullsync-claude-'));

    try {
        const project = join(work, 'sync-claude');
        scaffold({
            targetDir: project,
            projectName: 'sync-claude',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            agent: 'claude',
        });

        const ruleBefore = readFileSync(join(project, '.claude', 'rules', 'blit-api-names.md'), 'utf8');
        const claudeBefore = readFileSync(join(project, 'CLAUDE.md'), 'utf8');

        const { exitCode, output } = runBlit(project, ['agents', 'sync']);

        // The kit regenerator must reproduce the scaffolder's bytes, so nothing changes.
        assert.equal(exitCode, 0, 'full sync on a clean project should exit 0');
        assert.ok(output.includes('up to date'), 'output should report everything is up to date');
        assert.equal(
            readFileSync(join(project, '.claude', 'rules', 'blit-api-names.md'), 'utf8'),
            ruleBefore,
            'kit-owned rule should be byte-identical after sync',
        );
        assert.equal(
            readFileSync(join(project, 'CLAUDE.md'), 'utf8'),
            claudeBefore,
            'shared CLAUDE.md should be byte-identical after sync',
        );
        assert.ok(!existsSync(join(project, 'CLAUDE.md.new')), 'no .new conflict file should be created');

        // The manifest still matches the files on disk.
        const drift = runBlit(project, ['agents', 'sync', '--check']);
        assert.equal(drift.exitCode, 0, 'sync --check should be clean after a full sync of an unmodified project');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents sync (full) changes nothing on a freshly scaffolded Cursor project', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-fullsync-cursor-'));

    try {
        const project = join(work, 'sync-cursor');
        scaffold({
            targetDir: project,
            projectName: 'sync-cursor',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            agent: 'cursor',
        });

        const hooksBefore = readFileSync(join(project, '.cursor', 'hooks.json'), 'utf8');
        const ruleBefore = readFileSync(join(project, '.cursor', 'rules', 'blit-api-names.mdc'), 'utf8');

        const { exitCode, output } = runBlit(project, ['agents', 'sync']);

        assert.equal(exitCode, 0, 'full sync on a clean Cursor project should exit 0');
        assert.ok(output.includes('up to date'), 'output should report everything is up to date');
        assert.equal(
            readFileSync(join(project, '.cursor', 'hooks.json'), 'utf8'),
            hooksBefore,
            'generated hooks.json should be byte-identical after sync',
        );
        assert.equal(
            readFileSync(join(project, '.cursor', 'rules', 'blit-api-names.mdc'), 'utf8'),
            ruleBefore,
            'generated cursor rule should be byte-identical after sync',
        );
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents sync --force restores the kit version of a user-edited kit file', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-fullsync-force-'));

    try {
        const project = join(work, 'force-game');
        scaffold({
            targetDir: project,
            projectName: 'force-game',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            agent: 'claude',
        });

        const rulePath = join(project, '.claude', 'rules', 'blit-api-names.md');
        writeFileSync(rulePath, '# wrecked by user\n');

        const { exitCode } = runBlit(project, ['agents', 'sync', '--force']);
        assert.equal(exitCode, 0, 'forced sync should exit 0');

        const restored = readFileSync(rulePath, 'utf8');
        assert.ok(restored.includes('BT'), 'forced sync should restore the kit content');
        assert.ok(!restored.includes('wrecked'), 'forced sync should discard the user edit');

        // After a force, the project is back in sync.
        const drift = runBlit(project, ['agents', 'sync', '--check']);
        assert.equal(drift.exitCode, 0, 'project should be clean after --force');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents sync preserves user notes outside the managed region of CLAUDE.md', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-fullsync-shared-'));

    try {
        const project = join(work, 'shared-game');
        scaffold({
            targetDir: project,
            projectName: 'shared-game',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            agent: 'claude',
        });

        const claudePath = join(project, 'CLAUDE.md');
        const marker = 'MY-OWN-NOTE-12345';
        writeFileSync(claudePath, `${readFileSync(claudePath, 'utf8')}\n${marker}\n`);

        const { exitCode } = runBlit(project, ['agents', 'sync']);
        assert.equal(exitCode, 0, 'shared-file sync should exit 0 (managed-region merge, no conflict)');

        const after = readFileSync(claudePath, 'utf8');
        assert.ok(after.includes(marker), 'user note below the managed region must be preserved');
        assert.ok(after.includes('<!-- blit-kit:managed:start -->'), 'managed start marker should remain');
        assert.ok(after.includes('<!-- blit-kit:managed:end -->'), 'managed end marker should remain');

        // The manifest should now treat the file (with the note) as in sync.
        const drift = runBlit(project, ['agents', 'sync', '--check']);
        assert.equal(drift.exitCode, 0, 'a preserved note should not count as drift after sync');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('scaffolds a TypeScript project when language is ts', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-ts-'));

    try {
        const project = join(work, 'ts-game');
        scaffold({
            targetDir: project,
            projectName: 'ts-game',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            language: 'ts',
        });

        // TypeScript-specific files are present; JavaScript-only files are absent.
        assert.ok(existsSync(join(project, 'src', 'game.ts')), 'src/game.ts should be generated for TS');
        assert.ok(existsSync(join(project, 'tsconfig.json')), 'tsconfig.json should be generated for TS');
        assert.ok(!existsSync(join(project, 'src', 'game.js')), 'src/game.js should not be generated for TS');
        assert.ok(!existsSync(join(project, 'jsconfig.json')), 'jsconfig.json should not be generated for TS');

        // package.json should include typescript as a devDependency.
        const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));
        assert.ok(pkg.devDependencies?.typescript, 'typescript should be a devDependency for TS projects');
        assert.ok(pkg.scripts?.typecheck, 'typecheck script should be present for TS projects');
        assert.ok(!pkg.dependencies?.['blit-tech']?.includes('workspace:*'), 'no workspace:* in package.json');

        // Entry file references should point to the .ts file.
        const html = readFileSync(join(project, 'index.html'), 'utf8');
        assert.ok(html.includes('src/game.ts'), 'index.html should reference src/game.ts');
        assert.ok(!html.includes('game.js'), 'index.html should not reference game.js for TS');

        const readme = readFileSync(join(project, 'README.md'), 'utf8');
        assert.ok(readme.includes('src/game.ts'), 'README.md should reference src/game.ts');
        assert.ok(!readme.includes('game.js'), 'README.md should not reference game.js for TS');

        // game.ts should have bootstrap call and no unrendered placeholders.
        const game = readFileSync(join(project, 'src', 'game.ts'), 'utf8');
        assert.ok(game.includes('bootstrap(Game)'), 'game.ts is missing the bootstrap call');
        assert.ok(!game.includes('{{'), 'game.ts still has unrendered placeholders');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('scaffolds a TypeScript project when --ts flag is passed to the CLI', () => {
    assert.ok(existsSync(cli), 'dist/index.js must be built before running tests');

    const work = mkdtempSync(join(tmpdir(), 'cbt-ts-cli-'));

    try {
        execFileSync(process.execPath, [cli, 'ts-cli-game', '--yes', '--ts', '--no-install', '--no-git'], {
            cwd: work,
            stdio: 'ignore',
        });

        const project = join(work, 'ts-cli-game');
        assert.ok(existsSync(join(project, 'src', 'game.ts')), '--ts flag should produce src/game.ts');
        assert.ok(existsSync(join(project, 'tsconfig.json')), '--ts flag should produce tsconfig.json');
        assert.ok(!existsSync(join(project, 'src', 'game.js')), '--ts flag should not produce src/game.js');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});
