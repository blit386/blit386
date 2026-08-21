/**
 * Unit tests for the shared ownership module – the single source of truth for which generated files
 * the kit owns and which project-relative paths each AI assistant occupies.
 *
 * Both `create-blit386` (scaffold time) and `blit agents sync` / `add` (sync time) classify files
 * through this module, so a drift between them is no longer expressible. The producer/matcher tests
 * at the bottom are the ones that earn their keep: they fail if an adapter starts emitting a path
 * that no ownership prefix covers, which would otherwise mean sync silently never regenerates it.
 *
 * Imports the built dist modules; the package `pretest` script runs `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { agentsFile, collectDocs, generateClaudeAdapter, generateCursorAdapter, kitRoot } from '../dist/adapters.js';
import { classifyFile, hasAgentFiles, isAgentPath, isKitManaged } from '../dist/ownership.js';

/** Template vars sufficient to render every adapter file (package-manager commands, project name). */
const VARS = {
    projectName: 'test-game',
    packageName: 'test-game',
    pmInstall: 'npm install',
    pmRunDev: 'npm run dev',
    pmRunBuild: 'npm run build',
    pmRunFormat: 'npm run format',
    pmRunLint: 'npm run lint',
    entryFile: '/src/game.js',
    gameFile: 'src/game.js',
};

test('classifyFile returns shared for the two managed-region files', () => {
    assert.equal(classifyFile('AGENTS.md'), 'shared');
    assert.equal(classifyFile('CLAUDE.md'), 'shared');
});

test('classifyFile returns kit-owned for every managed directory and exact path', () => {
    const kitOwned = [
        'docs/getting-started.md',
        '.claude/rules/blit386.md',
        '.claude/skills/run/SKILL.md',
        '.claude/hooks/shell-safety.sh',
        '.claude/settings.json',
        '.cursor/rules/blit386.mdc',
        '.cursor/hooks.json',
        '.cursor/hooks/shell-safety.sh',
        '.cursor/commands/fix.md',
    ];

    for (const path of kitOwned) {
        assert.equal(classifyFile(path), 'kit-owned', `${path} should be kit-owned`);
    }
});

test('classifyFile returns user-owned for game sources and project config', () => {
    const userOwned = ['src/game.js', 'package.json', 'README.md', 'index.html', 'vite.config.js', 'jsconfig.json'];

    for (const path of userOwned) {
        assert.equal(classifyFile(path), 'user-owned', `${path} should be user-owned`);
    }
});

test('classifyFile classifies files nested deeper inside a managed directory', () => {
    assert.equal(classifyFile('.claude/rules/nested/deep.md'), 'kit-owned');
    assert.equal(classifyFile('docs/guides/sprites.md'), 'kit-owned');
});

test('classifyFile normalizes Windows separators', () => {
    assert.equal(classifyFile('docs\\basics.md'), 'kit-owned');
    assert.equal(classifyFile('.claude\\rules\\blit386.md'), 'kit-owned');
});

test('classifyFile does not match a sibling of a managed directory', () => {
    // The trailing slash on every directory constant is what keeps these user-owned.
    assert.equal(classifyFile('.claude/rulesbackup.md'), 'user-owned');
    assert.equal(classifyFile('docs-archive/notes.md'), 'user-owned');
    assert.equal(classifyFile('.cursorignore'), 'user-owned');
    assert.equal(classifyFile('CLAUDE.md.bak'), 'user-owned');
});

test('isKitManaged is true only for kit-owned and shared', () => {
    assert.equal(isKitManaged('kit-owned'), true);
    assert.equal(isKitManaged('shared'), true);
    assert.equal(isKitManaged('user-owned'), false);
});

test('hasAgentFiles detects Claude from CLAUDE.md or a .claude/ path alone', () => {
    assert.equal(hasAgentFiles([{ path: 'CLAUDE.md' }], 'claude'), true);
    assert.equal(hasAgentFiles([{ path: '.claude/settings.json' }], 'claude'), true);
});

test('hasAgentFiles detects Cursor without claiming the project has Claude', () => {
    const files = [{ path: '.cursor/hooks.json' }, { path: 'src/game.js' }];

    assert.equal(hasAgentFiles(files, 'cursor'), true);
    assert.equal(hasAgentFiles(files, 'claude'), false);
});

test('hasAgentFiles is false for an empty or user-owned-only file list', () => {
    assert.equal(hasAgentFiles([], 'claude'), false);
    assert.equal(hasAgentFiles([], 'cursor'), false);
    assert.equal(hasAgentFiles([{ path: 'src/game.js' }, { path: 'AGENTS.md' }], 'claude'), false);
});

test('every file the kit emits classifies as kit-owned or shared, never user-owned', () => {
    const root = kitRoot();
    const emitted = [
        agentsFile(root),
        ...collectDocs(root),
        ...generateClaudeAdapter(root, VARS),
        ...generateCursorAdapter(root, VARS),
    ];

    assert.ok(emitted.length > 0, 'expected the kit to emit at least one file');

    for (const file of emitted) {
        assert.notEqual(
            classifyFile(file.path),
            'user-owned',
            `${file.path} classifies user-owned, so sync would never regenerate it`,
        );
    }
});

test('every adapter-emitted path belongs to the agent that emitted it', () => {
    const root = kitRoot();

    for (const file of generateClaudeAdapter(root, VARS)) {
        assert.ok(isAgentPath(file.path, 'claude'), `${file.path} is not recognized as a Claude file`);
    }

    for (const file of generateCursorAdapter(root, VARS)) {
        assert.ok(isAgentPath(file.path, 'cursor'), `${file.path} is not recognized as a Cursor file`);
    }
});
