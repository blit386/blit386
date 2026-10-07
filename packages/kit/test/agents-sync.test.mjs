/**
 * CLI tests for `blit agents sync` when a file the kit newly ships already exists, untracked, on disk.
 *
 * Requires `pnpm run build` first (the package `pretest` script does that).
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { generateClaudeAdapter, kitRoot } from '../dist/adapters.js';
import { AGENT_KINDS, AGENT_SPECS, SHARED_SKILLS_DIR } from '../dist/ownership.js';

const here = dirname(fileURLToPath(import.meta.url));
const blitCli = join(here, '..', 'dist', 'cli.js');

const vars = {
    pmInstall: 'npm install',
    pmRunDev: 'npm run dev',
    pmRunBuild: 'npm run build',
    pmRunFormat: 'npm run format',
    pmRunLint: 'npm run lint',
};

/** A skill the installed kit emits for Claude, standing in for "a skill added in a later kit". */
const skill = generateClaudeAdapter(kitRoot(), vars).find((f) => f.path.endsWith('/SKILL.md'));

/** The one user-owned file the Claude adapter emits: sync writes it when missing and never again. */
const LAUNCH_JSON = '.claude/launch.json';

/**
 * Game folder whose manifest uses Claude (via CLAUDE.md) but does not track `skill.path`, with
 * `onDisk` written at that path as an untracked file.
 *
 * @param {string | null} onDisk - content of the untracked file, or null to write none
 * @param {string} [relPath] - where the untracked file goes; defaults to `skill.path`
 * @returns {string}
 */
function makeGame(onDisk, relPath = skill.path) {
    const root = mkdtempSync(join(tmpdir(), 'blit-agents-sync-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'sync-game', private: true }));
    mkdirSync(join(root, '.blit'));
    writeFileSync(
        join(root, '.blit', 'manifest.json'),
        JSON.stringify({ kitVersion: '0.0.0', vars, files: [{ path: 'CLAUDE.md', class: 'shared', sha256: '' }] }),
    );
    if (onDisk !== null) {
        mkdirSync(dirname(join(root, relPath)), { recursive: true });
        writeFileSync(join(root, relPath), onDisk);
    }
    return root;
}

/** @param {string} root */
function runSync(root) {
    const result = spawnSync(process.execPath, [blitCli, 'agents', 'sync'], { cwd: root, encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** @param {string} root */
function trackedPaths(root) {
    return JSON.parse(readFileSync(join(root, '.blit', 'manifest.json'), 'utf8')).files.map((f) => f.path);
}

test('sync keeps an untracked user file at a newly shipped path and saves the kit version as .new', () => {
    assert.ok(skill, 'expected the Claude adapter to emit at least one skill');
    const mine = '---\nname: mine\n---\n\nHand-written, never tracked.\n';
    const root = makeGame(mine);

    try {
        const { status, output } = runSync(root);

        assert.equal(readFileSync(join(root, skill.path), 'utf8'), mine, 'user file must be untouched');
        assert.equal(readFileSync(join(root, `${skill.path}.new`), 'utf8'), skill.content);
        assert.ok(output.includes(`${skill.path} already exists`), `expected a collision warning, got:\n${output}`);
        assert.ok(!trackedPaths(root).includes(skill.path), 'colliding path must not be recorded as kit-owned');
        assert.equal(status, 1, 'a collision needs the user, so sync exits non-zero');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('sync silently adopts an untracked file that already matches the kit version', () => {
    const root = makeGame(skill.content);

    try {
        const { output } = runSync(root);

        assert.ok(!existsSync(join(root, `${skill.path}.new`)), 'identical file needs no .new copy');
        assert.ok(!output.includes(skill.path), `expected no mention of the adopted file, got:\n${output}`);
        assert.ok(trackedPaths(root).includes(skill.path), 'identical file is adopted into the manifest');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('sync leaves a pre-existing untracked .claude/launch.json alone, with no .new copy', () => {
    const mine = '{ "version": "0.0.1", "configurations": [{ "name": "hand-written", "port": 4000 }] }\n';
    const root = makeGame(mine, LAUNCH_JSON);

    try {
        const { output } = runSync(root);

        assert.equal(readFileSync(join(root, LAUNCH_JSON), 'utf8'), mine, 'user file must be untouched');
        assert.ok(!existsSync(join(root, `${LAUNCH_JSON}.new`)), 'a user-owned file gets no .new copy');
        assert.ok(!output.includes(LAUNCH_JSON), `expected no mention of the file, got:\n${output}`);
        assert.ok(!trackedPaths(root).includes(LAUNCH_JSON), 'an untracked user file stays untracked');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('sync adds .claude/launch.json when missing, then never rewrites an edited one', () => {
    const root = makeGame(null);

    try {
        runSync(root);

        const generated = JSON.parse(readFileSync(join(root, LAUNCH_JSON), 'utf8'));
        assert.equal(generated.configurations[0].runtimeExecutable, 'npm');
        assert.ok(trackedPaths(root).includes(LAUNCH_JSON));
        assert.ok(!existsSync(join(root, '.blit', 'base', LAUNCH_JSON)), 'user-owned files keep no base copy');

        // The desktop app (or the user) rewrites the file; neither a plain nor a forced sync may undo that.
        const edited = JSON.stringify({ ...generated, autoVerify: false });
        writeFileSync(join(root, LAUNCH_JSON), edited);
        runSync(root);
        spawnSync(process.execPath, [blitCli, 'agents', 'sync', '--force'], { cwd: root });

        assert.equal(readFileSync(join(root, LAUNCH_JSON), 'utf8'), edited, 'edited file must be untouched');
        assert.ok(!existsSync(join(root, `${LAUNCH_JSON}.new`)), 'an edited user-owned file gets no .new copy');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('sync drops a tracked shared skill once no set-up assistant reads the shared folder', () => {
    // Claude does not read `.agents/skills/`, so a Claude-only project has no owner left for it: sync stops
    // tracking it and tells the user, the same way it retires any file the kit no longer ships for them.
    const shared = '.agents/skills/run/SKILL.md';
    const root = makeGame(null);
    const manifestPath = join(root, '.blit', 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.files.push({ path: shared, class: 'kit-owned', sha256: '' });
    writeFileSync(manifestPath, JSON.stringify(manifest));
    mkdirSync(join(root, '.agents', 'skills', 'run'), { recursive: true });
    writeFileSync(join(root, shared), 'kept on disk');

    try {
        const { output } = runSync(root);

        assert.ok(!trackedPaths(root).includes(shared), 'an ownerless shared skill must leave the manifest');
        assert.ok(
            output.includes(`${shared} is no longer part of the kit`),
            `expected an orphan note, got:\n${output}`,
        );
        assert.equal(readFileSync(join(root, shared), 'utf8'), 'kept on disk', 'sync never deletes the file');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

/** Assistants that read the shared skills folder; the next test needs two of them. */
const sharedReaders = AGENT_KINDS.filter((kind) => AGENT_SPECS[kind].readsSharedSkills);

test('add leaves alone a shared skill another assistant already set up', {
    skip: sharedReaders.length < 2 && 'needs two assistants that read .agents/skills/ - switches on by itself',
}, () => {
    // The first reader's `add` writes and tracks the shared skills; the user then edits one. The second
    // reader emits the same path, which `add` must leave to `sync` rather than overwrite or flag as a
    // collision.
    const [first, second] = sharedReaders;
    const root = mkdtempSync(join(tmpdir(), 'blit-agents-shared-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'shared-game', private: true }));
    mkdirSync(join(root, '.blit'));
    writeFileSync(join(root, '.blit', 'manifest.json'), JSON.stringify({ kitVersion: '0.0.0', vars, files: [] }));
    const add = (agent) =>
        spawnSync(process.execPath, [blitCli, 'agents', 'add', agent], { cwd: root, encoding: 'utf8' }).status;

    try {
        assert.equal(add(first), 0);

        const shared = trackedPaths(root).find((path) => path.startsWith(SHARED_SKILLS_DIR));
        assert.ok(shared, `${first} should have set up the shared skills`);
        writeFileSync(join(root, shared), 'edited by the user');

        assert.equal(add(second), 0, 'a tracked shared skill is not a collision');
        assert.equal(readFileSync(join(root, shared), 'utf8'), 'edited by the user', 'the edit must survive');
        assert.ok(!existsSync(join(root, `${shared}.new`)), 'no .new copy for a path sync already owns');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

/** A game with a manifest but no assistant set up, plus any `files` already on disk (path -> content). */
function makeBareGame(files = {}) {
    const root = mkdtempSync(join(tmpdir(), 'blit-agents-agy-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'agy-game', private: true }));
    mkdirSync(join(root, '.blit'));
    writeFileSync(join(root, '.blit', 'manifest.json'), JSON.stringify({ kitVersion: '0.0.0', vars, files: [] }));

    for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), content);
    }

    return root;
}

const addAntigravity = (root) =>
    spawnSync(process.execPath, [blitCli, 'agents', 'add', 'antigravity'], { cwd: root, encoding: 'utf8' });

test('add antigravity on a no-agent game writes its exact paths and the shared skills, then sync is clean', () => {
    const root = makeBareGame();

    try {
        assert.equal(addAntigravity(root).status, 0);

        const tracked = trackedPaths(root);

        for (const path of ['.agents/hooks.json', '.agents/mcp_config.json', '.agents/hooks/antigravity-guard.cjs']) {
            assert.ok(tracked.includes(path), `${path} should be tracked`);
            assert.ok(existsSync(join(root, path)), `${path} should be on disk`);
        }

        assert.ok(tracked.some((path) => path.startsWith(SHARED_SKILLS_DIR)));
        assert.ok(!existsSync(join(root, '.agents', 'workflows')) && !existsSync(join(root, '.gemini')));
        assert.equal(spawnSync(process.execPath, [blitCli, 'agents', 'sync', '--check'], { cwd: root }).status, 0);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('add antigravity merges the docs server into an existing .agents/mcp_config.json', () => {
    const own = { command: 'node', args: ['mine.js'] };
    const root = makeBareGame({ '.agents/mcp_config.json': JSON.stringify({ mcpServers: { mine: own } }) });

    try {
        assert.equal(addAntigravity(root).status, 0);

        const { mcpServers } = JSON.parse(readFileSync(join(root, '.agents', 'mcp_config.json'), 'utf8'));

        assert.deepEqual(mcpServers.mine, own);
        assert.deepEqual(mcpServers['blit386-docs'], { serverUrl: 'https://blit386.dev/mcp' });
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
