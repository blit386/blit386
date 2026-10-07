/**
 * `blit agents add` against a scaffolded game: setting up Claude Code and Cursor after the fact, the all-or-nothing
 * collision rule, and the `.mcp.json` merge and its edge cases. Each assistant's own add flow lives in its
 * agent-*.test.mjs. Requires `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { scaffold } from '../dist/scaffold.js';
import { classifyFile, MCP_SERVER_NAME } from '@blit386/kit/adapters';
import { blitCli, runBlit, scaffoldWithManifest, PNPM_SCAFFOLD_COMMANDS } from './helpers.mjs';

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
            packageManager: 'npm@10.9.2',
            agents: [],
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
            existsSync(join(project, '.claude', 'hooks', 'shell-safety.cjs')),
            '.claude/hooks/shell-safety.cjs should be created',
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
            packageManager: 'npm@10.9.2',
            agents: [],
        });

        const { exitCode } = runBlit(project, ['agents', 'add', 'cursor']);
        assert.equal(exitCode, 0, 'add cursor should exit 0');

        assert.ok(existsSync(join(project, '.cursor', 'hooks.json')), '.cursor/hooks.json should be created');
        assert.ok(
            existsSync(join(project, '.cursor', 'rules', 'blit-api-names.mdc')),
            '.cursor/rules should be created',
        );
        assert.ok(
            existsSync(join(project, '.cursor', 'skills', 'run', 'SKILL.md')),
            '.cursor/skills should be created',
        );
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
            agents: ['claude'],
            packageManager: 'npm@10.9.2',
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
            packageManager: 'npm@10.9.2',
            agents: [],
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
            packageManager: 'npm@10.9.2',
            agents: [],
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

test('blit agents add claude aborts safely on a conflicting .mcp.json server entry', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-mcp-collision-'));

    try {
        const project = join(work, 'mcp-collision-game');
        scaffold({
            targetDir: project,
            projectName: 'mcp-collision-game',
            ...PNPM_SCAFFOLD_COMMANDS,
            agents: [],
        });

        // The user already registered a server under the same key the kit wants to add, but pointing
        // somewhere else. That is a real conflict, not a mergeable addition, so the add is
        // all-or-nothing: nothing is written except the .new copy.
        const mcpPath = join(project, '.mcp.json');
        const userContent = `${JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { type: 'http', url: 'https://example.test/mcp' } } }, null, 2)}\n`;
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

test('blit agents add claude merges a pre-existing .mcp.json', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-mcp-merge-add-'));

    try {
        const project = join(work, 'mcp-merge-add-game');
        scaffold({
            targetDir: project,
            projectName: 'mcp-merge-add-game',
            ...PNPM_SCAFFOLD_COMMANDS,
            agents: [],
        });

        // The user already registered an unrelated MCP server before asking for Claude. .mcp.json is
        // an allowlisted structural-merge target, so the kit's server is added next to it instead of
        // aborting the whole add.
        const mcpPath = join(project, '.mcp.json');
        const userContent = `${JSON.stringify({ mcpServers: { mine: { type: 'http', url: 'https://example.test/mcp' } } }, null, 2)}\n`;
        writeFileSync(mcpPath, userContent);

        const { exitCode } = runBlit(project, ['agents', 'add', 'claude']);

        assert.equal(exitCode, 0, 'a clean merge should exit 0');
        assert.ok(!existsSync(`${mcpPath}.new`), 'a clean merge should not leave a .new conflict copy');
        assert.ok(existsSync(join(project, 'CLAUDE.md')), 'a clean merge should still set up the rest of Claude');

        const merged = JSON.parse(readFileSync(mcpPath, 'utf8'));
        assert.ok(merged.mcpServers.mine, 'the user server must survive the add');
        assert.ok(merged.mcpServers[MCP_SERVER_NAME], 'the kit server must be present');

        const check = runBlit(project, ['agents', 'sync', '--check']);
        assert.equal(check.exitCode, 0, 'a clean-merged .mcp.json must not be reported as drift');
        assert.equal(runBlit(project, ['agents', 'sync']).exitCode, 0, 'full sync should succeed');
        assert.ok(JSON.parse(readFileSync(mcpPath, 'utf8')).mcpServers.mine, 'full sync must keep the user server');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add claude aborts safely on malformed .mcp.json', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-mcp-malformed-'));

    try {
        const project = join(work, 'mcp-malformed-game');
        scaffold({
            targetDir: project,
            projectName: 'mcp-malformed-game',
            ...PNPM_SCAFFOLD_COMMANDS,
            agents: [],
        });

        // A pre-existing .mcp.json that isn't even valid JSON cannot be merged. It must fall back to
        // the same collision behavior as a file that fails to parse, not crash.
        const mcpPath = join(project, '.mcp.json');
        const userContent = '{ not valid json';
        writeFileSync(mcpPath, userContent);

        const { exitCode, output } = runBlit(project, ['agents', 'add', 'claude']);

        assert.equal(readFileSync(mcpPath, 'utf8'), userContent, 'the malformed .mcp.json must not be overwritten');
        assert.ok(existsSync(`${mcpPath}.new`), 'the kit version should be saved as .mcp.json.new');
        assert.ok(output.includes('.mcp.json.new'), 'output should mention the .new copy');
        assert.notEqual(exitCode, 0, 'a needs-review collision should exit non-zero');
        assert.ok(!existsSync(join(project, 'CLAUDE.md')), 'an aborted add must not write the other Claude files');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add claude aborts safely on a non-object .mcp.json mcpServers value', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-mcp-bad-shape-'));

    try {
        const project = join(work, 'mcp-bad-shape-game');
        scaffold({
            targetDir: project,
            projectName: 'mcp-bad-shape-game',
            ...PNPM_SCAFFOLD_COMMANDS,
            agents: [],
        });

        // Valid JSON, but `mcpServers` is an array instead of an object - not a shape the merge can
        // reason about, so it must fall back to the collision path rather than silently coercing it.
        const mcpPath = join(project, '.mcp.json');
        const userContent = `${JSON.stringify({ mcpServers: [] }, null, 2)}\n`;
        writeFileSync(mcpPath, userContent);

        const { exitCode, output } = runBlit(project, ['agents', 'add', 'claude']);

        assert.equal(readFileSync(mcpPath, 'utf8'), userContent, 'the user .mcp.json must not be overwritten');
        assert.ok(existsSync(`${mcpPath}.new`), 'the kit version should be saved as .mcp.json.new');
        assert.ok(output.includes('.mcp.json.new'), 'output should mention the .new copy');
        assert.notEqual(exitCode, 0, 'a needs-review collision should exit non-zero');
        assert.ok(!existsSync(join(project, 'CLAUDE.md')), 'an aborted add must not write the other Claude files');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add claude merges when the same server entry is written in a different key order', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-mcp-key-order-'));

    try {
        const project = join(work, 'mcp-key-order-game');
        scaffold({
            targetDir: project,
            projectName: 'mcp-key-order-game',
            ...PNPM_SCAFFOLD_COMMANDS,
            agents: [],
        });

        // Same server entry as the kit generates, but with its keys written in a different order.
        // Structural equality must treat this as identical, not as a conflict.
        const mcpPath = join(project, '.mcp.json');
        const userContent = `${JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { url: 'https://blit386.dev/mcp', type: 'http' } } }, null, 2)}\n`;
        writeFileSync(mcpPath, userContent);

        const { exitCode } = runBlit(project, ['agents', 'add', 'claude']);

        assert.equal(exitCode, 0, 'a same-entry, different-key-order file should merge cleanly, not collide');
        assert.ok(!existsSync(`${mcpPath}.new`), 'a clean merge should not leave a .new conflict copy');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add claude does not read or write through a symlinked .mcp.json', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-symlink-add-'));

    try {
        const project = join(work, 'symlink-add-game');
        scaffold({
            targetDir: project,
            projectName: 'symlink-add-game',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            packageManager: 'npm@10.9.2',
            agents: [],
        });

        // A file outside the project root, made to look like a plausible pre-existing MCP config so a
        // vulnerable merge path would happily read and rewrite it. `.mcp.json` is on the mergeable-JSON
        // allowlist, so this exercises the MCP-merge read as well as the plain collision/write paths.
        const externalPath = join(work, 'outside-the-project.mcp.json');
        const externalContent = `${JSON.stringify({ mcpServers: { 'attacker-server': { url: 'https://evil.example/mcp' } } }, null, 2)}\n`;
        writeFileSync(externalPath, externalContent);
        symlinkSync(externalPath, join(project, '.mcp.json'));

        const { exitCode, output } = runBlit(project, ['agents', 'add', 'claude']);

        assert.equal(exitCode, 0, `blit agents add claude should still succeed overall: ${output}`);
        assert.equal(
            readFileSync(externalPath, 'utf8'),
            externalContent,
            'the file outside the project must not be read, merged, or overwritten through the symlink',
        );
        assert.ok(
            lstatSync(join(project, '.mcp.json')).isSymbolicLink(),
            'the symlink itself must be left in place, not replaced with a regular file',
        );
        assert.ok(output.includes('.mcp.json'), 'output should mention the skipped unsafe path');

        // Every other Claude file the kit generates does not depend on the symlinked path and should
        // still have been written normally.
        assert.ok(existsSync(join(project, 'CLAUDE.md')), 'unrelated Claude files should still be added');

        const manifest = JSON.parse(readFileSync(join(project, '.blit', 'manifest.json'), 'utf8'));
        assert.ok(
            !manifest.files.some((f) => f.path === '.mcp.json'),
            'the skipped symlinked path must not be recorded in the manifest',
        );
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('blit agents add claude does not write through a pre-planted symlinked .new sidecar', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-symlink-new-'));

    try {
        const project = join(work, 'symlink-new-game');
        scaffold({
            targetDir: project,
            projectName: 'symlink-new-game',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            packageManager: 'npm@10.9.2',
            agents: [],
        });

        // The user hand-wrote their own CLAUDE.md (an ordinary collision), but also has CLAUDE.md.new
        // pre-planted as a symlink pointing outside the project - the sidecar `writeRel` writes when a
        // collision (or an unmerged conflict) needs saving alongside the original. Nothing before that
        // write ever validated the `.new` path itself.
        const claudePath = join(project, 'CLAUDE.md');
        const userContent = '# my own CLAUDE notes\n';
        writeFileSync(claudePath, userContent);

        const externalPath = join(work, 'outside-the-project.new');
        const externalContent = 'nothing kit-generated should ever land here\n';
        writeFileSync(externalPath, externalContent);
        symlinkSync(externalPath, `${claudePath}.new`);

        const { output } = runBlit(project, ['agents', 'add', 'claude']);

        assert.equal(
            readFileSync(externalPath, 'utf8'),
            externalContent,
            'the file outside the project must not be written through the symlinked .new sidecar',
        );
        assert.ok(
            lstatSync(`${claudePath}.new`).isSymbolicLink(),
            'the symlink itself must be left in place, not replaced with a regular file',
        );
        assert.ok(output.includes('CLAUDE.md.new'), 'output should mention the skipped unsafe .new path');
        assert.equal(readFileSync(claudePath, 'utf8'), userContent, 'the user CLAUDE.md must not be overwritten');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});
