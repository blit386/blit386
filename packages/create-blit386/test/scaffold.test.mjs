/**
 * Smoke test for the scaffolder.
 *
 * Runs the built CLI end-to-end in a temp directory (with --yes --no-install --no-git so it stays offline and fast),
 * then asserts the generated project has all expected files, no leftover {{placeholders}}, and no leaked workspace:*
 * dependency. Requires `pnpm run build` first; CI runs the build before the tests.
 */

import { strict as assert } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { scaffold } from '../dist/scaffold.js';
import {
    classifyFile,
    generateClaudeAdapter,
    generateCursorAdapter,
    isKitManaged,
    kitRoot,
} from '@blit386/kit/adapters';

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
            '.prettierignore',
            'biome.json',
            'prettier.config.js',
            join('scripts', 'prettier-plugin-compact-tables.mjs'),
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
        assert.deepStrictEqual(
            agentsBuf,
            readFileSync(baseAgents),
            '.blit/base/AGENTS.md bytes should match the generated file',
        );

        const manifestRaw = readFileSync(join(project, 'package.json'), 'utf8');
        assert.ok(!manifestRaw.includes('{{'), 'package.json still has unrendered placeholders');
        assert.ok(!manifestRaw.includes('workspace:*'), 'package.json leaked a workspace:* dependency');

        const manifest = JSON.parse(manifestRaw);
        assert.equal(manifest.name, 'my-game', 'package name should match the folder');
        assert.ok(manifest.dependencies?.blit386, 'blit386 dependency is missing');
        assert.equal(manifest.dependencies.blit386, '^1.5.0', 'generated games should pin blit386 ^1.5.0');
        assert.ok(manifest.devDependencies?.['@blit386/kit'], '@blit386/kit devDependency is missing');
        assert.ok(manifest.devDependencies?.['@biomejs/biome'], '@biomejs/biome devDependency is missing');
        assert.equal(
            manifest.devDependencies['@biomejs/biome'],
            '^2.5.2',
            'generated games should pin @biomejs/biome ^2.5.2',
        );
        assert.ok(manifest.devDependencies?.prettier, 'prettier devDependency is missing');
        assert.ok(manifest.scripts?.format, 'format script is missing');
        assert.ok(manifest.scripts?.lint, 'lint script is missing');
        assert.ok(manifest.scripts?.build, 'build script is missing');

        const biomeConfig = JSON.parse(readFileSync(join(project, 'biome.json'), 'utf8'));
        assert.ok(Array.isArray(biomeConfig.files?.includes), 'biome.json files.includes should be an array');
        assert.ok(
            biomeConfig.files.includes.includes('src/**/*.js'),
            'JS scaffold biome.json should include src/**/*.js',
        );

        const viteConfig = readFileSync(join(project, 'vite.config.js'), 'utf8');
        assert.ok(viteConfig.includes("from 'blit386/vite'"), 'vite.config.js should import blit386/vite');
        assert.ok(viteConfig.includes('blit386()'), 'vite.config.js should register the blit386() plugin');

        const game = readFileSync(join(project, 'src', 'game.js'), 'utf8');
        assert.ok(game.includes('bootstrap(Game)'), 'game.js is missing the bootstrap call');
        assert.ok(game.includes('onHotReload'), 'game.js should include a commented onHotReload example');
        assert.ok(!game.includes('{{'), 'game.js still has unrendered placeholders');

        assert.ok(
            existsSync(join(project, 'docs', 'hot-reload.md')),
            'expected docs/hot-reload.md to be copied from the kit',
        );

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
        assert.ok(!existsSync(join(project, '.mcp.json')), 'no assistant means no Claude MCP config');
        assert.ok(!existsSync(join(project, '.cursor', 'mcp.json')), 'no assistant means no Cursor MCP config');
        assert.ok(!existsSync(join(project, '.github')), 'non-TTY run should use the default of no CI');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('scaffold copies optional CI and agent files when requested', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-opt-'));

    try {
        const project = join(work, 'optional-game');
        const pmInstall = 'pnpm install';
        const pmRunBuild = 'pnpm run build';
        const pmRunFormat = 'pnpm run format';
        const pmRunLint = 'pnpm run lint';
        scaffold({
            targetDir: project,
            projectName: 'optional-game',
            pmInstall,
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
        assert.ok(
            claudeGuide.includes('<!-- blit-kit:managed:start -->'),
            'CLAUDE.md should have managed-region start marker',
        );
        assert.ok(
            claudeGuide.includes('<!-- blit-kit:managed:end -->'),
            'CLAUDE.md should have managed-region end marker',
        );
        assert.ok(
            claudeGuide.includes('Your notes'),
            'CLAUDE.md should have a Your notes section outside the managed region',
        );

        // The Claude adapter should also emit .claude/rules/ and .claude/skills/.
        assert.ok(
            existsSync(join(project, '.claude', 'rules', 'blit-api-names.md')),
            '.claude/rules/blit-api-names.md should be generated',
        );
        assert.ok(
            existsSync(join(project, '.claude', 'rules', 'blit-integer-coords.md')),
            '.claude/rules/blit-integer-coords.md should be generated',
        );
        assert.ok(
            existsSync(join(project, '.claude', 'skills', 'run', 'SKILL.md')),
            '.claude/skills/run/SKILL.md should be generated',
        );
        assert.ok(
            existsSync(join(project, '.claude', 'skills', 'fix', 'SKILL.md')),
            '.claude/skills/fix/SKILL.md should be generated',
        );

        // Rule files should have frontmatter stripped (Claude reads plain markdown).
        const apiNamesRule = readFileSync(join(project, '.claude', 'rules', 'blit-api-names.md'), 'utf8');
        assert.ok(!apiNamesRule.startsWith('---'), 'Claude rule files should not have YAML frontmatter');
        assert.ok(apiNamesRule.includes('BT'), 'Claude rule file should contain the API content');

        // Skill files should have template vars rendered.
        const runSkill = readFileSync(join(project, '.claude', 'skills', 'run', 'SKILL.md'), 'utf8');
        assert.ok(runSkill.includes(pmRunBuild.replace('build', 'dev')), 'run skill should reference the dev command');
        assert.ok(!runSkill.includes('{{'), 'run skill should not have unrendered placeholders');

        // Claude skills keep their YAML frontmatter so Claude Code can discover and trigger them.
        assert.ok(runSkill.startsWith('---'), 'Claude skill files should keep YAML frontmatter');
        assert.ok(/\nname: run\n/.test(runSkill), 'Claude skill frontmatter should include the skill name');
        // The description may be inline or folded across lines, so match the key only.
        assert.ok(/\ndescription:/.test(runSkill), 'Claude skill frontmatter should include a description');

        // Claude adapter: settings.json hooks and shell-safety script (parity with Cursor).
        assert.ok(existsSync(join(project, '.claude', 'settings.json')), '.claude/settings.json should be generated');
        assert.ok(
            existsSync(join(project, '.claude', 'hooks', 'shell-safety.sh')),
            '.claude/hooks/shell-safety.sh should be generated',
        );
        assert.ok(
            existsSync(join(project, '.claude', 'hooks', 'session-start.sh')),
            '.claude/hooks/session-start.sh should be generated',
        );

        // The docs-MCP config. Claude Code skips a remote entry that has a url but no type, so the type
        // is load-bearing, not decoration.
        const claudeMcp = JSON.parse(readFileSync(join(project, '.mcp.json'), 'utf8'));
        assert.deepEqual(
            Object.keys(claudeMcp.mcpServers),
            ['blit386-docs'],
            '.mcp.json should declare exactly the blit386-docs server',
        );
        assert.equal(claudeMcp.mcpServers['blit386-docs'].type, 'http', 'Claude MCP entry needs an explicit type');
        assert.equal(claudeMcp.mcpServers['blit386-docs'].url, 'https://blit386.dev/mcp');
        assertNoPlaceholders(project, '.mcp.json');

        const claudeSettings = JSON.parse(readFileSync(join(project, '.claude', 'settings.json'), 'utf8'));
        assert.ok(Array.isArray(claudeSettings.hooks?.PostToolUse), 'settings.json should have PostToolUse entries');
        assert.ok(claudeSettings.hooks.PostToolUse.length > 0, 'PostToolUse should contain at least one matcher group');
        assert.ok(Array.isArray(claudeSettings.hooks?.PreToolUse), 'settings.json should have PreToolUse entries');
        assert.ok(claudeSettings.hooks.PreToolUse.length > 0, 'PreToolUse should contain at least one matcher group');

        const formatGroup = claudeSettings.hooks.PostToolUse[0];
        assert.ok(
            Array.isArray(formatGroup.hooks) && formatGroup.hooks.length > 0,
            'PostToolUse group should contain command hooks',
        );
        assert.equal(formatGroup.hooks[0].type, 'command', 'format hook should be type command');
        assert.ok(formatGroup.hooks[0].command.includes('format'), 'format hook should reference the format command');
        assert.ok(!formatGroup.hooks[0].command.includes('{{'), 'format hook should not have unrendered placeholders');

        const safetyGroup = claudeSettings.hooks.PreToolUse[0];
        assert.ok(
            Array.isArray(safetyGroup.hooks) && safetyGroup.hooks.length > 0,
            'PreToolUse group should contain command hooks',
        );
        assert.equal(safetyGroup.hooks[0].type, 'command', 'shell safety hook should be type command');
        assert.ok(
            safetyGroup.hooks[0].command.includes('shell-safety.sh'),
            'shell safety hook should reference shell-safety.sh',
        );
        assert.ok(
            !('continueOnError' in safetyGroup.hooks[0]),
            'Claude command hooks should not emit continueOnError (exit codes drive behavior)',
        );

        // A fresh remote/web session should install deps and run a checkup without manual setup.
        assert.ok(Array.isArray(claudeSettings.hooks?.SessionStart), 'settings.json should have SessionStart entries');
        assert.ok(
            claudeSettings.hooks.SessionStart.length > 0,
            'SessionStart should contain at least one matcher group',
        );

        const sessionStartGroup = claudeSettings.hooks.SessionStart[0];
        assert.equal(
            sessionStartGroup.matcher,
            'startup|resume|clear|compact|fork',
            'SessionStart hook should match every session-start source',
        );
        assert.ok(
            Array.isArray(sessionStartGroup.hooks) && sessionStartGroup.hooks.length > 0,
            'SessionStart group should contain command hooks',
        );
        assert.equal(sessionStartGroup.hooks[0].type, 'command', 'session-start hook should be type command');
        assert.ok(
            sessionStartGroup.hooks[0].command.includes('session-start.sh'),
            'session-start hook should reference session-start.sh',
        );
        assert.ok(
            sessionStartGroup.hooks[0].command.includes(pmInstall),
            "session-start hook should pass this project's install command to the script",
        );
        const sessionStartCommand = sessionStartGroup.hooks[0].command;
        assert.match(
            sessionStartCommand,
            /^cd "\$CLAUDE_PROJECT_DIR" && /,
            'session-start hook should cd into $CLAUDE_PROJECT_DIR before running anything',
        );
        assert.match(
            sessionStartCommand,
            / sh "\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/session-start\.sh"$/,
            'session-start hook should invoke the script by its absolute $CLAUDE_PROJECT_DIR path, not a cwd-relative one',
        );
        assert.ok(
            !sessionStartGroup.hooks[0].command.includes('{{'),
            'session-start hook should not have unrendered placeholders',
        );

        const sessionStartScript = readFileSync(join(project, '.claude', 'hooks', 'session-start.sh'), 'utf8');
        assert.ok(sessionStartScript.includes('doctor'), 'session-start.sh should run a checkup');
        assert.ok(!sessionStartScript.includes('{{'), 'session-start.sh should not have unrendered placeholders');

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

        // Cursor commands are invoked by filename, so the skill frontmatter is stripped.
        const runCommand = readFileSync(join(cursorProject, '.cursor', 'commands', 'run.md'), 'utf8');
        assert.ok(!runCommand.startsWith('---'), 'Cursor command files should not have YAML frontmatter');
        assert.ok(runCommand.includes('# Run the game'), 'Cursor command should contain the skill body');

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

        // The same docs-MCP server, in Cursor's shape: a type there would mark a local stdio server,
        // so the remote entry carries the url alone.
        const cursorMcp = JSON.parse(readFileSync(join(cursorProject, '.cursor', 'mcp.json'), 'utf8'));
        assert.deepEqual(
            Object.keys(cursorMcp.mcpServers),
            ['blit386-docs'],
            '.cursor/mcp.json should declare exactly the blit386-docs server',
        );
        assert.equal(cursorMcp.mcpServers['blit386-docs'].url, 'https://blit386.dev/mcp');
        assert.ok(!('type' in cursorMcp.mcpServers['blit386-docs']), 'Cursor MCP entry should not carry a type');

        // Each adapter ships its own assistant's config path and not the other's.
        assert.ok(!existsSync(join(cursorProject, '.mcp.json')), 'a Cursor project should not get Claude .mcp.json');
        assert.ok(
            !existsSync(join(project, '.cursor', 'mcp.json')),
            'a Claude project should not get .cursor/mcp.json',
        );

        // Cursor has no SessionStart-equivalent hook event, so the manifest's session-start
        // entry (Claude-only) should not appear here.
        assert.ok(
            !existsSync(join(cursorProject, '.cursor', 'hooks', 'session-start.sh')),
            '.cursor/hooks/session-start.sh should not be generated (Claude-only hook)',
        );
        assert.ok(
            !Object.keys(hooksJson.hooks).some((event) => event.toLowerCase().includes('session')),
            'hooks.json should not have a session-start event',
        );
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

        // Nothing has been modified – check should pass with exit code 0.
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
        output = execFileSync(process.execPath, [blitCli, ...args], {
            cwd: project,
            encoding: 'utf8',
        });
    } catch (err) {
        exitCode = err.status ?? 1;
        output = (err.stdout ?? '') + (err.stderr ?? '');
    }
    return { exitCode, output };
}

/**
 * Drift guard: scaffold writes must match `@blit386/kit/adapters` generate-to-memory for the same
 * vars. After the shared-adapter refactor this is the same code path; the test still fails if
 * scaffold reintroduces a local copy or skips writing a generated file.
 */
test('scaffold agent files match @blit386/kit/adapters memory output', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-adapter-parity-'));

    try {
        const root = kitRoot();

        for (const agent of ['claude', 'cursor']) {
            const project = join(work, `${agent}-parity`);
            scaffold({
                targetDir: project,
                projectName: `${agent}-parity`,
                pmInstall: 'pnpm install',
                pmRunDev: 'pnpm run dev',
                pmRunBuild: 'pnpm run build',
                pmRunFormat: 'pnpm run format',
                pmRunLint: 'pnpm run lint',
                agent,
            });

            const manifest = JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8'));
            assert.ok(manifest.vars, 'manifest must record scaffold-time vars');

            const generated =
                agent === 'claude'
                    ? generateClaudeAdapter(root, manifest.vars)
                    : generateCursorAdapter(root, manifest.vars);

            assert.ok(generated.length > 0, `${agent} adapter should emit files`);

            // The loop below only checks what the adapter claims to emit, so it would happily pass on an
            // adapter that stopped emitting the MCP config entirely. Pin its presence explicitly.
            const mcpPath = agent === 'claude' ? '.mcp.json' : '.cursor/mcp.json';
            assert.ok(
                generated.some((file) => file.path === mcpPath),
                `${agent} adapter should emit ${mcpPath}`,
            );

            for (const file of generated) {
                const onDisk = join(project, file.path);
                assert.ok(existsSync(onDisk), `scaffold should have written ${file.path}`);
                assert.equal(
                    readFileSync(onDisk, 'utf8'),
                    file.content,
                    `scaffold ${file.path} must match kit adapter memory output`,
                );
            }
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

/** Scaffold one project offline with the given agent and return its path plus parsed manifest. */
function scaffoldWithManifest(work, name, agent) {
    const project = join(work, name);

    scaffold({
        targetDir: project,
        projectName: name,
        pmInstall: 'pnpm install',
        pmRunDev: 'pnpm run dev',
        pmRunBuild: 'pnpm run build',
        pmRunFormat: 'pnpm run format',
        pmRunLint: 'pnpm run lint',
        agent,
    });

    return { project, manifest: JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8')) };
}

/**
 * Single-source guard: the classes the scaffolder stamps into `.blit/manifest.json` must be exactly
 * what `@blit386/kit`'s shared `classifyFile` returns. These are the same code path now; the test
 * fails if the scaffolder reintroduces a local copy and the two drift.
 */
test('manifest classes match @blit386/kit classifyFile for every generated file', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-classify-'));

    try {
        for (const agent of ['claude', 'cursor']) {
            const { manifest } = scaffoldWithManifest(work, `${agent}-classify`, agent);

            for (const entry of manifest.files) {
                assert.equal(entry.class, classifyFile(entry.path), `${entry.path} class drifted from classifyFile`);
            }

            // A classifier that returned one constant for everything would pass the check above.
            const classes = new Set(manifest.files.map((entry) => entry.class));
            for (const expected of ['kit-owned', 'shared', 'user-owned']) {
                assert.ok(classes.has(expected), `expected at least one ${expected} file in the ${agent} manifest`);
            }
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

/** The pristine `.blit/base/` copy rule is driven by isKitManaged; pin it end-to-end. */
test('every kit-managed file has a pristine .blit/base copy and no user-owned file does', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-base-copies-'));

    try {
        const { project, manifest } = scaffoldWithManifest(work, 'base-copies', 'claude');

        for (const entry of manifest.files) {
            assert.equal(
                existsSync(join(project, '.blit', 'base', entry.path)),
                isKitManaged(entry.class),
                `${entry.path} (${entry.class}) has the wrong .blit/base presence`,
            );
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

/** Covers the kit's second classifyFile call site (`blit agents add`) through the real CLI. */
test('blit agents add cursor records classes from the shared classifyFile', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-add-classify-'));

    try {
        const { project } = scaffoldWithManifest(work, 'add-classify', 'claude');

        const added = runBlit(project, ['agents', 'add', 'cursor']);
        assert.equal(added.exitCode, 0, `blit agents add cursor failed: ${added.output}`);

        const manifest = JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8'));
        const cursorEntries = manifest.files.filter((entry) => entry.path.startsWith('.cursor/'));

        assert.ok(cursorEntries.length > 0, 'blit agents add cursor should have tracked .cursor/ files');

        for (const entry of cursorEntries) {
            assert.equal(entry.class, classifyFile(entry.path), `${entry.path} class drifted from classifyFile`);
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

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
        const settingsBefore = readFileSync(join(project, '.claude', 'settings.json'), 'utf8');
        const mcpBefore = readFileSync(join(project, '.mcp.json'), 'utf8');

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
        assert.equal(
            readFileSync(join(project, '.claude', 'settings.json'), 'utf8'),
            settingsBefore,
            'generated settings.json should be byte-identical after sync',
        );
        // A .mcp.json misclassified as user-owned would go stale here instead of being refreshed.
        assert.equal(
            readFileSync(join(project, '.mcp.json'), 'utf8'),
            mcpBefore,
            'generated .mcp.json should be byte-identical after sync',
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
        const mcpBefore = readFileSync(join(project, '.cursor', 'mcp.json'), 'utf8');

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
        assert.equal(
            readFileSync(join(project, '.cursor', 'mcp.json'), 'utf8'),
            mcpBefore,
            'generated .cursor/mcp.json should be byte-identical after sync',
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

test('blit agents sync keeps a shared-file note across repeated syncs', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-fullsync-shared-twice-'));

    try {
        const project = join(work, 'shared-twice');
        scaffold({
            targetDir: project,
            projectName: 'shared-twice',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            agent: 'claude',
        });

        const claudePath = join(project, 'CLAUDE.md');
        const marker = 'MY-OWN-NOTE-67890';
        writeFileSync(claudePath, `${readFileSync(claudePath, 'utf8')}\n${marker}\n`);

        // Two consecutive syncs: the note must survive both. A baseline that recorded the merged
        // result would make the second sync misread the file as unmodified and overwrite the note.
        const first = runBlit(project, ['agents', 'sync']);
        assert.equal(first.exitCode, 0, 'the first sync should exit 0');
        const second = runBlit(project, ['agents', 'sync']);
        assert.equal(second.exitCode, 0, 'the second sync should exit 0');

        const after = readFileSync(claudePath, 'utf8');
        assert.ok(after.includes(marker), 'user note must survive a second sync');
        assert.ok(after.includes('<!-- blit-kit:managed:start -->'), 'managed start marker should remain');

        const drift = runBlit(project, ['agents', 'sync', '--check']);
        assert.equal(drift.exitCode, 0, 'the note should still not count as drift after two syncs');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add claude sets up Claude files in a project that did not pick an agent', () => {
    assert.ok(existsSync(blitCli), 'packages/kit/dist/cli.js must be built before running tests');

    const work = mkdtempSync(join(tmpdir(), 'cbt-add-claude-'));

    try {
        const project = join(work, 'add-claude');
        scaffold({
            targetDir: project,
            projectName: 'add-claude',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
        });

        // No agent was chosen, so none of the Claude files exist yet.
        assert.ok(!existsSync(join(project, 'CLAUDE.md')), 'CLAUDE.md should be absent before add');
        assert.ok(!existsSync(join(project, '.mcp.json')), '.mcp.json should be absent before add');

        const { exitCode, output } = runBlit(project, ['agents', 'add', 'claude']);
        assert.equal(exitCode, 0, 'add claude should exit 0');
        assert.ok(output.includes('Set up Claude Code'), 'output should confirm the assistant was set up');

        assert.ok(existsSync(join(project, 'CLAUDE.md')), 'CLAUDE.md should be created');
        assert.ok(
            existsSync(join(project, '.claude', 'rules', 'blit-api-names.md')),
            '.claude/rules should be created',
        );
        assert.ok(
            existsSync(join(project, '.claude', 'skills', 'run', 'SKILL.md')),
            '.claude/skills should be created',
        );
        assert.ok(existsSync(join(project, '.claude', 'settings.json')), '.claude/settings.json should be created');
        assert.ok(
            existsSync(join(project, '.claude', 'hooks', 'shell-safety.sh')),
            '.claude/hooks/shell-safety.sh should be created',
        );
        assert.ok(existsSync(join(project, '.mcp.json')), '.mcp.json should be created');

        // The new files are recorded in the manifest, so a drift check is clean.
        const manifest = JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8'));
        assert.ok(
            manifest.files.some((f) => f.path === 'CLAUDE.md'),
            'CLAUDE.md should be recorded in the manifest',
        );
        assert.ok(existsSync(join(project, '.blit', 'base', 'CLAUDE.md')), 'a pristine base copy should be written');

        const mcpEntry = manifest.files.find((f) => f.path === '.mcp.json');
        assert.ok(mcpEntry, '.mcp.json should be recorded in the manifest');
        assert.equal(mcpEntry.class, 'kit-owned', '.mcp.json should be kit-owned so sync keeps it current');
        assert.ok(existsSync(join(project, '.blit', 'base', '.mcp.json')), '.mcp.json should get a base copy');

        const drift = runBlit(project, ['agents', 'sync', '--check']);
        assert.equal(drift.exitCode, 0, 'sync --check should be clean right after add');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add cursor sets up Cursor files and a later sync is clean', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-add-cursor-'));

    try {
        const project = join(work, 'add-cursor');
        scaffold({
            targetDir: project,
            projectName: 'add-cursor',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
        });

        const { exitCode } = runBlit(project, ['agents', 'add', 'cursor']);
        assert.equal(exitCode, 0, 'add cursor should exit 0');

        assert.ok(existsSync(join(project, '.cursor', 'hooks.json')), '.cursor/hooks.json should be created');
        assert.ok(
            existsSync(join(project, '.cursor', 'rules', 'blit-api-names.mdc')),
            '.cursor/rules should be created',
        );
        assert.ok(existsSync(join(project, '.cursor', 'commands', 'run.md')), '.cursor/commands should be created');
        assert.ok(existsSync(join(project, '.cursor', 'mcp.json')), '.cursor/mcp.json should be created');

        const manifest = JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8'));
        const mcpEntry = manifest.files.find((f) => f.path === '.cursor/mcp.json');
        assert.ok(mcpEntry, '.cursor/mcp.json should be recorded in the manifest');
        assert.equal(mcpEntry.class, 'kit-owned', '.cursor/mcp.json should be kit-owned so sync keeps it current');

        // A full sync on the freshly added agent changes nothing.
        const sync = runBlit(project, ['agents', 'sync']);
        assert.equal(sync.exitCode, 0, 'full sync after add should exit 0');
        assert.ok(sync.output.includes('up to date'), 'full sync after add should report up to date');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add is a friendly no-op when the assistant is already set up', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-add-present-'));

    try {
        const project = join(work, 'present-game');
        scaffold({
            targetDir: project,
            projectName: 'present-game',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            agent: 'claude',
        });

        const { exitCode, output } = runBlit(project, ['agents', 'add', 'claude']);
        assert.equal(exitCode, 0, 'adding an already-present assistant should exit 0');
        assert.ok(output.includes('already set up'), 'output should say the assistant is already set up');
        assert.ok(output.includes('sync'), 'output should point the user at sync');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add rejects an unknown assistant name', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-add-unknown-'));

    try {
        const project = join(work, 'unknown-game');
        scaffold({
            targetDir: project,
            projectName: 'unknown-game',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
        });

        const { exitCode, output } = runBlit(project, ['agents', 'add', 'emacs']);
        assert.notEqual(exitCode, 0, 'an unknown assistant should exit non-zero');
        assert.ok(output.includes('emacs'), 'output should name the unknown assistant');
        assert.ok(output.includes('claude') && output.includes('cursor'), 'output should list supported assistants');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add never clobbers an existing untracked file; it writes a .new copy', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-add-collision-'));

    try {
        const project = join(work, 'collision-game');
        scaffold({
            targetDir: project,
            projectName: 'collision-game',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
        });

        // The user hand-wrote their own CLAUDE.md before asking to add Claude.
        const claudePath = join(project, 'CLAUDE.md');
        const userContent = '# my own CLAUDE notes\n';
        writeFileSync(claudePath, userContent);

        const { exitCode, output } = runBlit(project, ['agents', 'add', 'claude']);

        // The user's file is preserved; the kit version lands beside it as CLAUDE.md.new.
        assert.equal(readFileSync(claudePath, 'utf8'), userContent, 'the user CLAUDE.md must not be overwritten');
        assert.ok(existsSync(`${claudePath}.new`), 'the kit version should be saved as CLAUDE.md.new');
        assert.ok(output.includes('CLAUDE.md.new'), 'output should mention the .new copy');
        assert.notEqual(exitCode, 0, 'a needs-review collision should exit non-zero');

        // All-or-nothing: a collision must NOT half-activate the assistant. None of the other Claude
        // files should be written, and the manifest must not gain any Claude entries.
        assert.ok(
            !existsSync(join(project, '.claude', 'rules', 'blit-api-names.md')),
            'add must not write other Claude files when it aborts on a collision',
        );
        const manifestAfterAdd = JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8'));
        assert.ok(
            !manifestAfterAdd.files.some((f) => f.path === 'CLAUDE.md' || f.path.startsWith('.claude/')),
            'an aborted add must not record any Claude files in the manifest',
        );

        // The real regression: a later sync must not regenerate CLAUDE.md and clobber the user file.
        const sync = runBlit(project, ['agents', 'sync']);
        assert.equal(
            readFileSync(claudePath, 'utf8'),
            userContent,
            'a later sync must not overwrite the user CLAUDE.md after an aborted add',
        );
        assert.equal(sync.exitCode, 0, 'sync should still succeed after an aborted add');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

// The clean-merge path uses `git merge-file`; skip the test where git is unavailable.
const hasGit = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;

test('blit agents sync does not flag a clean-merged kit file as drift', { skip: !hasGit }, () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-merge-drift-'));

    try {
        const project = join(work, 'merge-game');
        scaffold({
            targetDir: project,
            projectName: 'merge-game',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            agent: 'claude',
        });

        // The user adds their own line to a kit-owned rule file. With the kit unchanged, a sync three-way
        // merge resolves cleanly (only the user side changed) and keeps the edit.
        const rulePath = join(project, '.claude', 'rules', 'blit-api-names.md');
        const note = 'MY-RULE-NOTE-24680';
        writeFileSync(rulePath, `${readFileSync(rulePath, 'utf8')}\n<!-- ${note} -->\n`);

        const sync = runBlit(project, ['agents', 'sync']);
        assert.equal(sync.exitCode, 0, 'a clean merge should exit 0');
        assert.ok(!existsSync(`${rulePath}.new`), 'a clean merge should not leave a .new conflict copy');
        assert.ok(readFileSync(rulePath, 'utf8').includes(note), 'the merge must keep the user edit');

        // The fix: after a clean merge, --check must report the file as in-sync, not drifted.
        const check = runBlit(project, ['agents', 'sync', '--check']);
        assert.equal(check.exitCode, 0, 'a clean-merged kit file must not be reported as drift');
        assert.ok(check.output.includes('up to date'), 'check should say files are up to date');

        // A second sync must still preserve the edit (the base copy, not the merged result, is the ancestor).
        const sync2 = runBlit(project, ['agents', 'sync']);
        assert.equal(sync2.exitCode, 0, 'the second sync should exit 0');
        assert.ok(readFileSync(rulePath, 'utf8').includes(note), 'the user edit must survive a second sync');

        const check2 = runBlit(project, ['agents', 'sync', '--check']);
        assert.equal(check2.exitCode, 0, 'still in sync after a second sync');
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
                agent,
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

test('blit agents sync keeps a user-added MCP server in .mcp.json', { skip: !hasGit }, () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-mcp-merge-'));

    try {
        const project = join(work, 'mcp-merge-game');
        scaffold({
            targetDir: project,
            projectName: 'mcp-merge-game',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            agent: 'claude',
        });

        // .mcp.json is the natural place for a user to register their own servers. Being kit-owned, it
        // goes through the three-way merge, so their entry has to survive a sync that regenerates it.
        const mcpPath = join(project, '.mcp.json');
        const config = JSON.parse(readFileSync(mcpPath, 'utf8'));
        config.mcpServers['my-server'] = { type: 'http', url: 'https://example.test/mcp' };
        writeFileSync(mcpPath, `${JSON.stringify(config, null, 2)}\n`);

        const sync = runBlit(project, ['agents', 'sync']);
        assert.equal(sync.exitCode, 0, 'a clean merge should exit 0');
        assert.ok(!existsSync(`${mcpPath}.new`), 'a clean merge should not leave a .new conflict copy');

        const merged = JSON.parse(readFileSync(mcpPath, 'utf8'));
        assert.ok(merged.mcpServers['my-server'], 'the user server must survive the sync');
        assert.ok(merged.mcpServers['blit386-docs'], 'the kit server must still be there');

        const check = runBlit(project, ['agents', 'sync', '--check']);
        assert.equal(check.exitCode, 0, 'a clean-merged .mcp.json must not be reported as drift');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add claude aborts safely on a hand-written .mcp.json', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-mcp-collision-'));

    try {
        const project = join(work, 'mcp-collision-game');
        scaffold({
            targetDir: project,
            projectName: 'mcp-collision-game',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
        });

        // The user already registered an unrelated MCP server before asking for Claude. That file is
        // theirs, so the add is all-or-nothing: nothing is written except the .new copy.
        const mcpPath = join(project, '.mcp.json');
        const userContent = `${JSON.stringify({ mcpServers: { mine: { type: 'http', url: 'https://example.test/mcp' } } }, null, 2)}\n`;
        writeFileSync(mcpPath, userContent);

        const { exitCode, output } = runBlit(project, ['agents', 'add', 'claude']);

        assert.equal(readFileSync(mcpPath, 'utf8'), userContent, 'the user .mcp.json must not be overwritten');
        assert.ok(existsSync(`${mcpPath}.new`), 'the kit version should be saved as .mcp.json.new');
        assert.ok(output.includes('.mcp.json.new'), 'output should mention the .new copy');
        assert.notEqual(exitCode, 0, 'a needs-review collision should exit non-zero');
        assert.ok(!existsSync(join(project, 'CLAUDE.md')), 'an aborted add must not write the other Claude files');

        const sync = runBlit(project, ['agents', 'sync']);
        assert.equal(sync.exitCode, 0, 'sync should still succeed after an aborted add');
        assert.equal(
            readFileSync(mcpPath, 'utf8'),
            userContent,
            'a later sync must not overwrite the user .mcp.json after an aborted add',
        );
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

const GAME_WITH_OLD_NAMES = [
    "import { bootstrap, BT } from 'blit386';",
    '',
    'class Game {',
    '    configure() {',
    '        return { overlayEnabled: true };',
    '    }',
    '    update() {',
    '        if (BT.buttonDown(BT.BTN_A)) this.fire();',
    '        if (this.box.equals(this.other)) this.stop();',
    '    }',
    '}',
    '',
    'bootstrap(Game);',
    '',
].join('\n');

test('blit migrate previews old-name renames without changing files', () => {
    assert.ok(existsSync(blitCli), 'packages/kit/dist/cli.js must be built before running tests');

    const work = mkdtempSync(join(tmpdir(), 'cbt-migrate-preview-'));

    try {
        const project = join(work, 'migrate-preview');
        scaffold({
            targetDir: project,
            projectName: 'migrate-preview',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
        });

        const gamePath = join(project, 'src', 'game.js');
        writeFileSync(gamePath, GAME_WITH_OLD_NAMES);

        const { exitCode, output } = runBlit(project, ['migrate']);
        assert.equal(exitCode, 0, 'a preview run should exit 0');
        assert.ok(output.includes('isDown'), 'preview should show the suggested new name');
        assert.ok(output.includes('preview'), 'preview should say it was only a preview');

        // A preview must not touch the file.
        assert.equal(readFileSync(gamePath, 'utf8'), GAME_WITH_OLD_NAMES, 'preview must leave the file unchanged');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit migrate --write rewrites safe names and reports ambiguous ones', { skip: !hasGit }, () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-migrate-write-'));

    try {
        const project = join(work, 'migrate-write');
        scaffold({
            targetDir: project,
            projectName: 'migrate-write',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
        });

        // A git repo means --write skips the no-git confirmation prompt and applies directly.
        spawnSync('git', ['init'], { cwd: project, stdio: 'ignore' });

        const gamePath = join(project, 'src', 'game.js');
        writeFileSync(gamePath, GAME_WITH_OLD_NAMES);

        const { exitCode, output } = runBlit(project, ['migrate', '--write']);
        assert.equal(exitCode, 0, '--write should exit 0');

        const rewritten = readFileSync(gamePath, 'utf8');
        assert.ok(rewritten.includes('BT.isDown('), 'BT.buttonDown should be renamed to BT.isDown');
        assert.ok(rewritten.includes('isOverlayEnabled:'), 'overlayEnabled key should be renamed');
        assert.ok(!rewritten.includes('buttonDown'), 'no old BT name should remain');

        // The ambiguous .equals( call is left for review, not rewritten.
        assert.ok(rewritten.includes('.equals('), 'the ambiguous equals() call should be left untouched');
        assert.ok(output.includes('closer look'), 'output should flag the ambiguous name for review');
        assert.ok(output.includes('equals'), 'output should name the ambiguous method');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

const OLD_VITE_CONFIG = `import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        open: true,
    },
});
`;

test('blit migrate --write enables hot reload in an older vite.config', { skip: !hasGit }, () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-migrate-hot-'));

    try {
        const project = join(work, 'migrate-hot');
        scaffold({
            targetDir: project,
            projectName: 'migrate-hot',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
        });

        spawnSync('git', ['init'], { cwd: project, stdio: 'ignore' });

        // Simulate a pre-1.4.0 scaffold: vite.config without the blit386 plugin.
        const vitePath = join(project, 'vite.config.js');
        writeFileSync(vitePath, OLD_VITE_CONFIG);

        const { exitCode, output } = runBlit(project, ['migrate', '--write']);
        assert.equal(exitCode, 0, '--write should exit 0');
        assert.ok(output.includes('hot reload') || output.includes('vite.config'), 'output should mention hot reload');

        const vite = readFileSync(vitePath, 'utf8');
        assert.ok(vite.includes("from 'blit386/vite'"), 'vite.config should import blit386/vite');
        assert.ok(vite.includes('blit386()'), 'vite.config should call blit386()');

        // A second migrate should be a no-op for the vite plugin.
        const second = runBlit(project, ['migrate']);
        assert.equal(second.exitCode, 0);
        assert.ok(
            second.output.includes('hot reload is wired') || second.output.includes('Nothing to change'),
            'second migrate should report nothing left to enable',
        );
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
        assert.ok(pkg.dependencies?.blit386, 'blit386 should be a dependency');
        assert.ok(!pkg.dependencies.blit386.includes('workspace:*'), 'no workspace:* in blit386 dependency');
        assert.equal(pkg.devDependencies?.['@biomejs/biome'], '^2.5.2', 'TS scaffold should pin @biomejs/biome ^2.5.2');

        const biomeConfig = JSON.parse(readFileSync(join(project, 'biome.json'), 'utf8'));
        assert.ok(Array.isArray(biomeConfig.files?.includes), 'biome.json files.includes should be an array');
        assert.ok(
            biomeConfig.files.includes.includes('src/**/*.ts'),
            'TS scaffold biome.json should include src/**/*.ts',
        );

        // Entry file references should point to the .ts file.
        const html = readFileSync(join(project, 'index.html'), 'utf8');
        assert.ok(html.includes('src/game.ts'), 'index.html should reference src/game.ts');
        assert.ok(!html.includes('game.js'), 'index.html should not reference game.js for TS');

        const readme = readFileSync(join(project, 'README.md'), 'utf8');
        assert.ok(readme.includes('src/game.ts'), 'README.md should reference src/game.ts');
        assert.ok(!readme.includes('game.js'), 'README.md should not reference game.js for TS');

        // game.ts should have bootstrap call, commented onHotReload example, and no unrendered placeholders.
        const game = readFileSync(join(project, 'src', 'game.ts'), 'utf8');
        assert.ok(game.includes('bootstrap(Game)'), 'game.ts is missing the bootstrap call');
        assert.ok(game.includes('onHotReload'), 'game.ts should include a commented onHotReload example');
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
