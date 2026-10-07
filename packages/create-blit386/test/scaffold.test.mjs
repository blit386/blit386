/**
 * Smoke tests for the scaffolder's core output.
 *
 * Runs the built CLI end-to-end in a temp directory (with --yes --no-install --no-git so it stays offline and fast),
 * then asserts the generated project has all expected files, no leftover {{placeholders}}, and no leaked workspace:*
 * dependency. The per-assistant suites live in agent-*.test.mjs, the sync and add flows in agents-*.test.mjs, and
 * the shared fixtures in helpers.mjs. Requires `pnpm run build` first; CI runs the build before the tests.
 */

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { scaffold } from '../dist/scaffold.js';
import { cli, installedKit, assertNoPlaceholders } from './helpers.mjs';

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
            '.gitattributes',
            '.node-version',
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

        // biome.json enforces LF, so the repo must force LF checkouts - otherwise Git for Windows
        // (core.autocrlf=true by default) hands the user CRLF files and format:check fails.
        assert.match(
            readFileSync(join(project, '.gitattributes'), 'utf8'),
            /^\* text=auto eol=lf$/m,
            '.gitattributes should normalize text files to LF',
        );

        // The manifest should record files with sha256 hashes and correct classes.
        const blitManifest = JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8'));
        assert.ok(Array.isArray(blitManifest.files), 'manifest.files should be an array');
        assert.ok(blitManifest.files.length > 0, 'manifest should have at least one entry');
        assert.equal(
            blitManifest.kitVersion,
            installedKit.version,
            'the manifest records the exact resolved kit version with no caret - blit agents sync reads it back',
        );
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
        assert.ok(manifest.packageManager, 'package.json should set packageManager so Corepack does not rewrite it');
        assert.match(
            manifest.packageManager,
            /^(npm|pnpm|yarn|bun)@\d+\.\d+\.\d+/,
            'packageManager should be a Corepack name@version pin',
        );
        assert.ok(manifest.dependencies?.blit386, 'blit386 dependency is missing');
        assert.equal(manifest.dependencies.blit386, '^1.7.0', 'generated games should pin blit386 ^1.7.0');
        assert.equal(
            manifest.devDependencies?.['@blit386/kit'],
            `^${installedKit.version}`,
            'generated games must pin the kit the scaffolder actually resolved',
        );
        assert.ok(manifest.devDependencies?.['@biomejs/biome'], '@biomejs/biome devDependency is missing');
        assert.equal(
            manifest.devDependencies['@biomejs/biome'],
            '^2.5.7',
            'generated games should pin @biomejs/biome ^2.5.7',
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
        // Player 0 is WASD by default; the starter promises arrow keys too, so it must remap them (BT-536).
        assert.ok(
            game.includes("BT.inputMap(0, BT.BTN_LEFT, 'KeyA', 'ArrowLeft')") &&
                game.includes("BT.inputMap(0, BT.BTN_RIGHT, 'KeyD', 'ArrowRight')"),
            'game.js should map ArrowLeft/ArrowRight onto player 0 with BT.inputMap',
        );
        assert.ok(game.includes('BT.random'), 'game.js should use the seedable BT.random');
        assert.ok(!game.includes('Math.random'), 'game.js should not use Math.random');
        assert.ok(!game.includes('{{'), 'game.js still has unrendered placeholders');
        // The test-the-game skill reads window.__game and replays runs with ?seed=, which needs BT.random.
        assert.ok(game.includes('__game'), 'game.js should expose window.__game for the test-the-game skill');

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
            agents: ['claude'],
            packageManager: 'pnpm@11.20.0',
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
        assert.ok(
            existsSync(join(project, '.claude', 'skills', 'test-the-game', 'SKILL.md')),
            '.claude/skills/test-the-game/SKILL.md should be generated',
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

        // Claude adapter: settings.json hooks and the shell-safety entry (shared with Cursor).
        assert.ok(existsSync(join(project, '.claude', 'settings.json')), '.claude/settings.json should be generated');
        assert.ok(
            existsSync(join(project, '.claude', 'hooks', 'shell-safety.cjs')),
            '.claude/hooks/shell-safety.cjs should be generated',
        );
        assert.ok(
            existsSync(join(project, '.claude', 'hooks', 'session-start.sh')),
            '.claude/hooks/session-start.sh should be generated',
        );
        for (const script of ['format-file.cjs', 'protect-files.cjs']) {
            assert.ok(
                existsSync(join(project, '.claude', 'hooks', script)),
                `.claude/hooks/${script} should be generated`,
            );
        }

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
            safetyGroup.hooks[0].command.includes('shell-safety.cjs'),
            'shell safety hook should reference shell-safety.cjs',
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
            agents: ['cursor'],
            packageManager: 'pnpm@11.20.0',
        });

        // Cursor adapter: rules, hooks, and skills should all be generated.
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
            existsSync(join(cursorProject, '.cursor', 'hooks', 'shell-safety.cjs')),
            '.cursor/hooks/shell-safety.cjs should be generated',
        );
        assert.ok(
            existsSync(join(cursorProject, '.cursor', 'skills', 'run', 'SKILL.md')),
            '.cursor/skills/run/SKILL.md should be generated',
        );
        assert.ok(
            existsSync(join(cursorProject, '.cursor', 'skills', 'fix', 'SKILL.md')),
            '.cursor/skills/fix/SKILL.md should be generated',
        );
        assert.ok(
            existsSync(join(cursorProject, '.cursor', 'skills', 'test-the-game', 'SKILL.md')),
            '.cursor/skills/test-the-game/SKILL.md should be generated',
        );
        assert.ok(
            !existsSync(join(cursorProject, '.cursor', 'commands', 'run.md')),
            '.cursor/commands/run.md should not be generated',
        );

        // Cursor reads name/description from the frontmatter to discover and trigger the skill.
        const cursorRunSkill = readFileSync(join(cursorProject, '.cursor', 'skills', 'run', 'SKILL.md'), 'utf8');
        assert.ok(cursorRunSkill.startsWith('---'), 'Cursor skill files should keep YAML frontmatter');
        assert.ok(cursorRunSkill.includes('# Run the game'), 'Cursor skill should contain the skill body');

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
        assert.ok(
            existsSync(join(cursorProject, '.cursor', 'hooks', 'format-file.cjs')),
            '.cursor/hooks/format-file.cjs should be generated',
        );
        assert.ok(
            !existsSync(join(cursorProject, '.cursor', 'hooks', 'protect-files.cjs')),
            '.cursor/hooks/protect-files.cjs should not be generated (Claude-only hook)',
        );

        // Skills should have template vars rendered.
        assert.ok(!cursorRunSkill.includes('{{'), 'run skill should not have unrendered placeholders');

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

test('scaffold omits packageManager when the option is absent', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-no-pm-field-'));

    try {
        const project = join(work, 'bun-game');
        scaffold({
            targetDir: project,
            projectName: 'bun-game',
            pmInstall: 'bun install',
            pmRunDev: 'bun run dev',
            pmRunBuild: 'bun run build',
            pmRunFormat: 'bun run format',
            pmRunLint: 'bun run lint',
            agents: [],
        });

        const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));
        assert.equal(pkg.packageManager, undefined, 'bun scaffolds must not write a Corepack packageManager pin');
        assert.ok(
            !readFileSync(join(project, 'package.json'), 'utf8').includes('{{'),
            'placeholders should be rendered',
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
            packageManager: 'npm@10.9.2',
            agents: [],
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
        assert.equal(pkg.devDependencies?.['@biomejs/biome'], '^2.5.7', 'TS scaffold should pin @biomejs/biome ^2.5.7');

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
        // Player 0 is WASD by default; the starter promises arrow keys too, so it must remap them (BT-536).
        assert.ok(
            game.includes("BT.inputMap(0, BT.BTN_LEFT, 'KeyA', 'ArrowLeft')") &&
                game.includes("BT.inputMap(0, BT.BTN_RIGHT, 'KeyD', 'ArrowRight')"),
            'game.ts should map ArrowLeft/ArrowRight onto player 0 with BT.inputMap',
        );
        assert.ok(game.includes('BT.random'), 'game.ts should use the seedable BT.random');
        assert.ok(!game.includes('Math.random'), 'game.ts should not use Math.random');
        assert.ok(!game.includes('{{'), 'game.ts still has unrendered placeholders');
        assert.ok(game.includes('__game'), 'game.ts should expose window.__game for the test-the-game skill');
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
