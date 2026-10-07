/**
 * `blit agents sync` against a scaffolded game: the drift check, the full write path (kit-owned, shared, forced,
 * and user-edited files), and the symlink guards. Requires `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import {
    existsSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { scaffold } from '../dist/scaffold.js';
import { blitCli, runBlit, hasGit } from './helpers.mjs';

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
            packageManager: 'npm@10.9.2',
            agents: [],
        });

        // Nothing has been modified - check should pass with exit code 0.
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
            agents: ['claude'],
            packageManager: 'npm@10.9.2',
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
            agents: ['claude'],
            packageManager: 'npm@10.9.2',
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
            agents: ['cursor'],
            packageManager: 'npm@10.9.2',
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
            agents: ['claude'],
            packageManager: 'npm@10.9.2',
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
            agents: ['claude'],
            packageManager: 'npm@10.9.2',
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
            agents: ['claude'],
            packageManager: 'npm@10.9.2',
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
            agents: ['claude'],
            packageManager: 'npm@10.9.2',
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
            agents: ['claude'],
            packageManager: 'npm@10.9.2',
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

test('blit agents sync does not write through a symlinked kit-owned directory', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-symlink-sync-'));

    try {
        const project = join(work, 'symlink-sync-game');
        scaffold({
            targetDir: project,
            projectName: 'symlink-sync-game',
            pmInstall: 'npm install',
            pmRunDev: 'npm run dev',
            pmRunBuild: 'npm run build',
            pmRunFormat: 'npm run format',
            pmRunLint: 'npm run lint',
            agents: ['claude'],
            packageManager: 'npm@10.9.2',
        });

        // Replace the kit-owned rules directory (already tracked in the manifest from scaffolding) with
        // a symlink pointing outside the project. The external target starts empty; if sync ever wrote
        // through the symlink, regenerated kit rule files would land there.
        const rulesDir = join(project, '.claude', 'rules');
        rmSync(rulesDir, { recursive: true, force: true });
        const externalDir = join(work, 'outside-the-project-rules');
        mkdirSync(externalDir, { recursive: true });
        symlinkSync(externalDir, rulesDir);

        const { exitCode, output } = runBlit(project, ['agents', 'sync']);

        assert.equal(exitCode, 0, `blit agents sync should still succeed overall: ${output}`);
        assert.deepEqual(
            readdirSync(externalDir),
            [],
            'sync must not write kit rule files through the symlinked directory',
        );
        assert.ok(
            lstatSync(rulesDir).isSymbolicLink(),
            'the symlink itself must be left in place, not replaced with a regular directory',
        );
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});
