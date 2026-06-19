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
        assert.ok(manifest.dependencies?.['blit386'], 'blit386 dependency is missing');
        assert.ok(manifest.devDependencies?.['@blit386/kit'], '@blit386/kit devDependency is missing');
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

        // Claude skills keep their YAML frontmatter so Claude Code can discover and trigger them.
        assert.ok(runSkill.startsWith('---'), 'Claude skill files should keep YAML frontmatter');
        assert.ok(/\nname: run\n/.test(runSkill), 'Claude skill frontmatter should include the skill name');
        // The description may be inline or folded across lines, so match the key only.
        assert.ok(/\ndescription:/.test(runSkill), 'Claude skill frontmatter should include a description');

		const cursorProject = join(work, "cursor-game");
		scaffold({
			targetDir: cursorProject,
			projectName: "cursor-game",
			pmInstall: "pnpm install",
			pmRunDev: "pnpm run dev",
			pmRunBuild: "pnpm run build",
			pmRunFormat: "pnpm run format",
			pmRunLint: "pnpm run lint",
			includeCi: false,
			agent: "cursor",
		});

		// Cursor adapter: rules, hooks, and commands should all be generated.
		assert.ok(
			existsSync(join(cursorProject, ".cursor", "rules", "blit-api-names.mdc")),
			"Cursor rule blit-api-names.mdc should be generated",
		);
		assert.ok(
			existsSync(
				join(cursorProject, ".cursor", "rules", "blit-integer-coords.mdc"),
			),
			"Cursor rule blit-integer-coords.mdc should be generated",
		);
		assert.ok(
			existsSync(join(cursorProject, ".cursor", "hooks.json")),
			".cursor/hooks.json should be generated",
		);
		assert.ok(
			existsSync(join(cursorProject, ".cursor", "hooks", "shell-safety.sh")),
			".cursor/hooks/shell-safety.sh should be generated",
		);
		assert.ok(
			existsSync(join(cursorProject, ".cursor", "commands", "run.md")),
			".cursor/commands/run.md should be generated",
		);
		assert.ok(
			existsSync(join(cursorProject, ".cursor", "commands", "fix.md")),
			".cursor/commands/fix.md should be generated",
		);

		// Cursor commands are invoked by filename, so the skill frontmatter is stripped.
		const runCommand = readFileSync(
			join(cursorProject, ".cursor", "commands", "run.md"),
			"utf8",
		);
		assert.ok(
			!runCommand.startsWith("---"),
			"Cursor command files should not have YAML frontmatter",
		);
		assert.ok(
			runCommand.includes("# Run the game"),
			"Cursor command should contain the skill body",
		);

		// Cursor rule files should keep their MDC frontmatter (Cursor reads alwaysApply from it).
		const apiRule = readFileSync(
			join(cursorProject, ".cursor", "rules", "blit-api-names.mdc"),
			"utf8",
		);
		assert.ok(
			apiRule.startsWith("---"),
			"Cursor rule files should keep YAML frontmatter",
		);
		assert.ok(
			apiRule.includes("alwaysApply: true"),
			"Cursor rule should include alwaysApply flag",
		);

		// hooks.json should have the expected structure with afterFileEdit and beforeShellExecution.
		const hooksJson = JSON.parse(
			readFileSync(join(cursorProject, ".cursor", "hooks.json"), "utf8"),
		);
		assert.equal(hooksJson.version, 1, "hooks.json version should be 1");
		assert.ok(
			Array.isArray(hooksJson.hooks.afterFileEdit),
			"hooks.json should have afterFileEdit entries",
		);
		assert.ok(
			hooksJson.hooks.afterFileEdit.length > 0,
			"afterFileEdit should contain at least one entry",
		);
		assert.ok(
			Array.isArray(hooksJson.hooks.beforeShellExecution),
			"hooks.json should have beforeShellExecution entries",
		);
		assert.ok(
			hooksJson.hooks.beforeShellExecution.length > 0,
			"beforeShellExecution should contain at least one entry",
		);
		const safetyHook = hooksJson.hooks.beforeShellExecution[0];
		assert.ok(
			safetyHook.failClosed === true,
			"shell safety hook should be failClosed",
		);

		// Template vars should be rendered in hooks.json.
		const formatHook = hooksJson.hooks.afterFileEdit[0];
		assert.ok(
			formatHook.command.includes("format"),
			"format hook should reference the format command",
		);
		assert.ok(
			!formatHook.command.includes("{{"),
			"format hook should not have unrendered placeholders",
		);

		// Commands should have template vars rendered.
		const runCmd = readFileSync(
			join(cursorProject, ".cursor", "commands", "run.md"),
			"utf8",
		);
		assert.ok(
			!runCmd.includes("{{"),
			"run command should not have unrendered placeholders",
		);
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
});

test("blit agents sync --check exits 0 when no files have drifted", () => {
	assert.ok(
		existsSync(blitCli),
		"packages/kit/dist/cli.js must be built before running tests",
	);

	const work = mkdtempSync(join(tmpdir(), "cbt-sync-ok-"));

	try {
		const project = join(work, "sync-game");
		scaffold({
			targetDir: project,
			projectName: "sync-game",
			pmInstall: "npm install",
			pmRunDev: "npm run dev",
			pmRunBuild: "npm run build",
			pmRunFormat: "npm run format",
			pmRunLint: "npm run lint",
		});

		// Nothing has been modified — check should pass with exit code 0.
		const result = execFileSync(
			process.execPath,
			[blitCli, "agents", "sync", "--check"],
			{
				cwd: project,
				encoding: "utf8",
			},
		);

		assert.ok(
			result.includes("up to date"),
			"sync --check should report files are up to date",
		);
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
});

test("blit agents sync --check exits non-zero when a kit-managed file is modified", () => {
	assert.ok(
		existsSync(blitCli),
		"packages/kit/dist/cli.js must be built before running tests",
	);

	const work = mkdtempSync(join(tmpdir(), "cbt-sync-drift-"));

	try {
		const project = join(work, "drift-game");
		scaffold({
			targetDir: project,
			projectName: "drift-game",
			pmInstall: "npm install",
			pmRunDev: "npm run dev",
			pmRunBuild: "npm run build",
			pmRunFormat: "npm run format",
			pmRunLint: "npm run lint",
			agent: "claude",
		});

		// Simulate a user (or an AI agent) editing a kit-owned rule file.
		writeFileSync(
			join(project, ".claude", "rules", "blit-api-names.md"),
			"# edited by user\n",
		);

		let exitCode = 0;
		let output = "";

		try {
			execFileSync(process.execPath, [blitCli, "agents", "sync", "--check"], {
				cwd: project,
				encoding: "utf8",
			});
		} catch (err) {
			exitCode = err.status ?? 1;
			output = err.stdout ?? "";
		}

		assert.ok(
			exitCode !== 0,
			"sync --check should exit non-zero when a kit-managed file has drifted",
		);
		assert.ok(
			output.includes("blit-api-names.md"),
			"output should name the drifted file",
		);
		assert.ok(output.includes("drifted"), "output should mention drift");
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
});

function runBlit(project, args) {
	let exitCode = 0;
	let output = "";
	try {
		output = execFileSync(process.execPath, [blitCli, ...args], {
			cwd: project,
			encoding: "utf8",
		});
	} catch (err) {
		exitCode = err.status ?? 1;
		output = (err.stdout ?? "") + (err.stderr ?? "");
	}
	return { exitCode, output };
}

test("blit agents sync (full) changes nothing on a freshly scaffolded Claude project", () => {
	assert.ok(
		existsSync(blitCli),
		"packages/kit/dist/cli.js must be built before running tests",
	);

	const work = mkdtempSync(join(tmpdir(), "cbt-fullsync-claude-"));

	try {
		const project = join(work, "sync-claude");
		scaffold({
			targetDir: project,
			projectName: "sync-claude",
			pmInstall: "npm install",
			pmRunDev: "npm run dev",
			pmRunBuild: "npm run build",
			pmRunFormat: "npm run format",
			pmRunLint: "npm run lint",
			agent: "claude",
		});

		const ruleBefore = readFileSync(
			join(project, ".claude", "rules", "blit-api-names.md"),
			"utf8",
		);
		const claudeBefore = readFileSync(join(project, "CLAUDE.md"), "utf8");

		const { exitCode, output } = runBlit(project, ["agents", "sync"]);

		// The kit regenerator must reproduce the scaffolder's bytes, so nothing changes.
		assert.equal(exitCode, 0, "full sync on a clean project should exit 0");
		assert.ok(
			output.includes("up to date"),
			"output should report everything is up to date",
		);
		assert.equal(
			readFileSync(
				join(project, ".claude", "rules", "blit-api-names.md"),
				"utf8",
			),
			ruleBefore,
			"kit-owned rule should be byte-identical after sync",
		);
		assert.equal(
			readFileSync(join(project, "CLAUDE.md"), "utf8"),
			claudeBefore,
			"shared CLAUDE.md should be byte-identical after sync",
		);
		assert.ok(
			!existsSync(join(project, "CLAUDE.md.new")),
			"no .new conflict file should be created",
		);

		// The manifest still matches the files on disk.
		const drift = runBlit(project, ["agents", "sync", "--check"]);
		assert.equal(
			drift.exitCode,
			0,
			"sync --check should be clean after a full sync of an unmodified project",
		);
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
});

test("blit agents sync (full) changes nothing on a freshly scaffolded Cursor project", () => {
	const work = mkdtempSync(join(tmpdir(), "cbt-fullsync-cursor-"));

	try {
		const project = join(work, "sync-cursor");
		scaffold({
			targetDir: project,
			projectName: "sync-cursor",
			pmInstall: "npm install",
			pmRunDev: "npm run dev",
			pmRunBuild: "npm run build",
			pmRunFormat: "npm run format",
			pmRunLint: "npm run lint",
			agent: "cursor",
		});

		const hooksBefore = readFileSync(
			join(project, ".cursor", "hooks.json"),
			"utf8",
		);
		const ruleBefore = readFileSync(
			join(project, ".cursor", "rules", "blit-api-names.mdc"),
			"utf8",
		);

		const { exitCode, output } = runBlit(project, ["agents", "sync"]);

		assert.equal(
			exitCode,
			0,
			"full sync on a clean Cursor project should exit 0",
		);
		assert.ok(
			output.includes("up to date"),
			"output should report everything is up to date",
		);
		assert.equal(
			readFileSync(join(project, ".cursor", "hooks.json"), "utf8"),
			hooksBefore,
			"generated hooks.json should be byte-identical after sync",
		);
		assert.equal(
			readFileSync(
				join(project, ".cursor", "rules", "blit-api-names.mdc"),
				"utf8",
			),
			ruleBefore,
			"generated cursor rule should be byte-identical after sync",
		);
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
});

test("blit agents sync --force restores the kit version of a user-edited kit file", () => {
	const work = mkdtempSync(join(tmpdir(), "cbt-fullsync-force-"));

	try {
		const project = join(work, "force-game");
		scaffold({
			targetDir: project,
			projectName: "force-game",
			pmInstall: "npm install",
			pmRunDev: "npm run dev",
			pmRunBuild: "npm run build",
			pmRunFormat: "npm run format",
			pmRunLint: "npm run lint",
			agent: "claude",
		});

		const rulePath = join(project, ".claude", "rules", "blit-api-names.md");
		writeFileSync(rulePath, "# wrecked by user\n");

		const { exitCode } = runBlit(project, ["agents", "sync", "--force"]);
		assert.equal(exitCode, 0, "forced sync should exit 0");

		const restored = readFileSync(rulePath, "utf8");
		assert.ok(
			restored.includes("BT"),
			"forced sync should restore the kit content",
		);
		assert.ok(
			!restored.includes("wrecked"),
			"forced sync should discard the user edit",
		);

		// After a force, the project is back in sync.
		const drift = runBlit(project, ["agents", "sync", "--check"]);
		assert.equal(drift.exitCode, 0, "project should be clean after --force");
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
});

test("blit agents sync preserves user notes outside the managed region of CLAUDE.md", () => {
	const work = mkdtempSync(join(tmpdir(), "cbt-fullsync-shared-"));

	try {
		const project = join(work, "shared-game");
		scaffold({
			targetDir: project,
			projectName: "shared-game",
			pmInstall: "npm install",
			pmRunDev: "npm run dev",
			pmRunBuild: "npm run build",
			pmRunFormat: "npm run format",
			pmRunLint: "npm run lint",
			agent: "claude",
		});

		const claudePath = join(project, "CLAUDE.md");
		const marker = "MY-OWN-NOTE-12345";
		writeFileSync(
			claudePath,
			`${readFileSync(claudePath, "utf8")}\n${marker}\n`,
		);

		const { exitCode } = runBlit(project, ["agents", "sync"]);
		assert.equal(
			exitCode,
			0,
			"shared-file sync should exit 0 (managed-region merge, no conflict)",
		);

		const after = readFileSync(claudePath, "utf8");
		assert.ok(
			after.includes(marker),
			"user note below the managed region must be preserved",
		);
		assert.ok(
			after.includes("<!-- blit-kit:managed:start -->"),
			"managed start marker should remain",
		);
		assert.ok(
			after.includes("<!-- blit-kit:managed:end -->"),
			"managed end marker should remain",
		);

		// The manifest should now treat the file (with the note) as in sync.
		const drift = runBlit(project, ["agents", "sync", "--check"]);
		assert.equal(
			drift.exitCode,
			0,
			"a preserved note should not count as drift after sync",
		);
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
});

test("blit agents sync keeps a shared-file note across repeated syncs", () => {
	const work = mkdtempSync(join(tmpdir(), "cbt-fullsync-shared-twice-"));

	try {
		const project = join(work, "shared-twice");
		scaffold({
			targetDir: project,
			projectName: "shared-twice",
			pmInstall: "npm install",
			pmRunDev: "npm run dev",
			pmRunBuild: "npm run build",
			pmRunFormat: "npm run format",
			pmRunLint: "npm run lint",
			agent: "claude",
		});

		const claudePath = join(project, "CLAUDE.md");
		const marker = "MY-OWN-NOTE-67890";
		writeFileSync(
			claudePath,
			`${readFileSync(claudePath, "utf8")}\n${marker}\n`,
		);

		// Two consecutive syncs: the note must survive both. A baseline that recorded the merged
		// result would make the second sync misread the file as unmodified and overwrite the note.
		const first = runBlit(project, ["agents", "sync"]);
		assert.equal(first.exitCode, 0, "the first sync should exit 0");
		const second = runBlit(project, ["agents", "sync"]);
		assert.equal(second.exitCode, 0, "the second sync should exit 0");

		const after = readFileSync(claudePath, "utf8");
		assert.ok(after.includes(marker), "user note must survive a second sync");
		assert.ok(
			after.includes("<!-- blit-kit:managed:start -->"),
			"managed start marker should remain",
		);

		const drift = runBlit(project, ["agents", "sync", "--check"]);
		assert.equal(
			drift.exitCode,
			0,
			"the note should still not count as drift after two syncs",
		);
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
});

test("blit agents add claude sets up Claude files in a project that did not pick an agent", () => {
	assert.ok(
		existsSync(blitCli),
		"packages/kit/dist/cli.js must be built before running tests",
	);

	const work = mkdtempSync(join(tmpdir(), "cbt-add-claude-"));

	try {
		const project = join(work, "add-claude");
		scaffold({
			targetDir: project,
			projectName: "add-claude",
			pmInstall: "npm install",
			pmRunDev: "npm run dev",
			pmRunBuild: "npm run build",
			pmRunFormat: "npm run format",
			pmRunLint: "npm run lint",
		});

		// No agent was chosen, so none of the Claude files exist yet.
		assert.ok(
			!existsSync(join(project, "CLAUDE.md")),
			"CLAUDE.md should be absent before add",
		);

		const { exitCode, output } = runBlit(project, ["agents", "add", "claude"]);
		assert.equal(exitCode, 0, "add claude should exit 0");
		assert.ok(
			output.includes("Set up Claude Code"),
			"output should confirm the assistant was set up",
		);

		assert.ok(
			existsSync(join(project, "CLAUDE.md")),
			"CLAUDE.md should be created",
		);
		assert.ok(
			existsSync(join(project, ".claude", "rules", "blit-api-names.md")),
			".claude/rules should be created",
		);
		assert.ok(
			existsSync(join(project, ".claude", "skills", "run", "SKILL.md")),
			".claude/skills should be created",
		);

		// The new files are recorded in the manifest, so a drift check is clean.
		const manifest = JSON.parse(
			readFileSync(join(project, ".blit", "manifest.json"), "utf8"),
		);
		assert.ok(
			manifest.files.some((f) => f.path === "CLAUDE.md"),
			"CLAUDE.md should be recorded in the manifest",
		);
		assert.ok(
			existsSync(join(project, ".blit", "base", "CLAUDE.md")),
			"a pristine base copy should be written",
		);

		const drift = runBlit(project, ["agents", "sync", "--check"]);
		assert.equal(
			drift.exitCode,
			0,
			"sync --check should be clean right after add",
		);
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
});

test("blit agents add cursor sets up Cursor files and a later sync is clean", () => {
	const work = mkdtempSync(join(tmpdir(), "cbt-add-cursor-"));

	try {
		const project = join(work, "add-cursor");
		scaffold({
			targetDir: project,
			projectName: "add-cursor",
			pmInstall: "npm install",
			pmRunDev: "npm run dev",
			pmRunBuild: "npm run build",
			pmRunFormat: "npm run format",
			pmRunLint: "npm run lint",
		});

		const { exitCode } = runBlit(project, ["agents", "add", "cursor"]);
		assert.equal(exitCode, 0, "add cursor should exit 0");

		assert.ok(
			existsSync(join(project, ".cursor", "hooks.json")),
			".cursor/hooks.json should be created",
		);
		assert.ok(
			existsSync(join(project, ".cursor", "rules", "blit-api-names.mdc")),
			".cursor/rules should be created",
		);
		assert.ok(
			existsSync(join(project, ".cursor", "commands", "run.md")),
			".cursor/commands should be created",
		);

		// A full sync on the freshly added agent changes nothing.
		const sync = runBlit(project, ["agents", "sync"]);
		assert.equal(sync.exitCode, 0, "full sync after add should exit 0");
		assert.ok(
			sync.output.includes("up to date"),
			"full sync after add should report up to date",
		);
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
});

test("blit agents add is a friendly no-op when the assistant is already set up", () => {
	const work = mkdtempSync(join(tmpdir(), "cbt-add-present-"));

	try {
		const project = join(work, "present-game");
		scaffold({
			targetDir: project,
			projectName: "present-game",
			pmInstall: "npm install",
			pmRunDev: "npm run dev",
			pmRunBuild: "npm run build",
			pmRunFormat: "npm run format",
			pmRunLint: "npm run lint",
			agent: "claude",
		});

		const { exitCode, output } = runBlit(project, ["agents", "add", "claude"]);
		assert.equal(
			exitCode,
			0,
			"adding an already-present assistant should exit 0",
		);
		assert.ok(
			output.includes("already set up"),
			"output should say the assistant is already set up",
		);
		assert.ok(output.includes("sync"), "output should point the user at sync");
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
});

test("blit agents add rejects an unknown assistant name", () => {
	const work = mkdtempSync(join(tmpdir(), "cbt-add-unknown-"));

	try {
		const project = join(work, "unknown-game");
		scaffold({
			targetDir: project,
			projectName: "unknown-game",
			pmInstall: "npm install",
			pmRunDev: "npm run dev",
			pmRunBuild: "npm run build",
			pmRunFormat: "npm run format",
			pmRunLint: "npm run lint",
		});

		const { exitCode, output } = runBlit(project, ["agents", "add", "emacs"]);
		assert.notEqual(exitCode, 0, "an unknown assistant should exit non-zero");
		assert.ok(
			output.includes("emacs"),
			"output should name the unknown assistant",
		);
		assert.ok(
			output.includes("claude") && output.includes("cursor"),
			"output should list supported assistants",
		);
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
});

test("blit agents add never clobbers an existing untracked file; it writes a .new copy", () => {
	const work = mkdtempSync(join(tmpdir(), "cbt-add-collision-"));

	try {
		const project = join(work, "collision-game");
		scaffold({
			targetDir: project,
			projectName: "collision-game",
			pmInstall: "npm install",
			pmRunDev: "npm run dev",
			pmRunBuild: "npm run build",
			pmRunFormat: "npm run format",
			pmRunLint: "npm run lint",
		});

		// The user hand-wrote their own CLAUDE.md before asking to add Claude.
		const claudePath = join(project, "CLAUDE.md");
		const userContent = "# my own CLAUDE notes\n";
		writeFileSync(claudePath, userContent);

		const { exitCode, output } = runBlit(project, ["agents", "add", "claude"]);

		// The user's file is preserved; the kit version lands beside it as CLAUDE.md.new.
		assert.equal(
			readFileSync(claudePath, "utf8"),
			userContent,
			"the user CLAUDE.md must not be overwritten",
		);
		assert.ok(
			existsSync(`${claudePath}.new`),
			"the kit version should be saved as CLAUDE.md.new",
		);
		assert.ok(
			output.includes("CLAUDE.md.new"),
			"output should mention the .new copy",
		);
		assert.notEqual(
			exitCode,
			0,
			"a needs-review collision should exit non-zero",
		);

		// All-or-nothing: a collision must NOT half-activate the assistant. None of the other Claude
		// files should be written, and the manifest must not gain any Claude entries.
		assert.ok(
			!existsSync(join(project, ".claude", "rules", "blit-api-names.md")),
			"add must not write other Claude files when it aborts on a collision",
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
        assert.ok(pkg.dependencies?.['blit386'], 'blit386 should be a dependency');
        assert.ok(!pkg.dependencies['blit386'].includes('workspace:*'), 'no workspace:* in blit386 dependency');

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
