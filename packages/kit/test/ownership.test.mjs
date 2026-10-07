/**
 * Unit tests for the shared ownership module - the single source of truth for which generated files
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

import {
    AGENT_ADAPTERS,
    agentsFile,
    collectDocs,
    generateAgentFiles,
    generateClaudeAdapter,
    generateCursorAdapter,
    generateSharedSkills,
    kitRoot,
} from '../dist/adapters.js';
import {
    AGENT_KINDS,
    AGENT_SPECS,
    CLAUDE_LAUNCH_JSON,
    classifyFile,
    hasAgentFiles,
    isAgentPath,
    isKitManaged,
    SHARED_SKILLS_DIR,
} from '../dist/ownership.js';

/** Every assistant a project-relative path belongs to, in `AGENT_KINDS` order. */
const owners = (path) => AGENT_KINDS.filter((kind) => isAgentPath(path, kind));

/** A path in the shared skills folder, which several agents may read at once. */
const SHARED_SKILL = `${SHARED_SKILLS_DIR}run/SKILL.md`;

/** Every subset of `AGENT_KINDS`, the empty one included - small enough to enumerate. */
const AGENT_SUBSETS = [[]];
for (const kind of AGENT_KINDS) {
    for (const subset of [...AGENT_SUBSETS]) {
        AGENT_SUBSETS.push([...subset, kind]);
    }
}

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
        '.claude/hooks/shell-safety.cjs',
        '.claude/settings.json',
        '.cursor/rules/blit386.mdc',
        '.cursor/hooks.json',
        '.cursor/hooks/shell-safety.cjs',
        '.cursor/hooks/guard-core.cjs',
        '.cursor/skills/run/SKILL.md',
        SHARED_SKILL,
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

test('only .agents/skills/ is kit-owned, never the bare .agents/ prefix', () => {
    // Antigravity will own exact files beside the shared skills folder; none may ride on a `.agents/` prefix.
    assert.equal(SHARED_SKILLS_DIR, '.agents/skills/');
    for (const path of [
        '.agents/hooks.json',
        '.agents/hooks/guard.cjs',
        '.agents/mcp_config.json',
        '.agents/notes.md',
    ]) {
        assert.equal(classifyFile(path), 'user-owned', `${path} must not be claimed through a .agents/ prefix`);
        assert.deepEqual(owners(path), [], `${path} must belong to no agent`);
    }
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

test('a shared skill belongs to exactly the agents that read the shared folder', () => {
    for (const kind of AGENT_KINDS) {
        assert.equal(isAgentPath(SHARED_SKILL, kind), AGENT_SPECS[kind].readsSharedSkills, kind);
    }

    assert.deepEqual(
        owners(SHARED_SKILL),
        AGENT_KINDS.filter((kind) => AGENT_SPECS[kind].readsSharedSkills),
    );
});

test('a tracked shared skill never makes any agent look set up', () => {
    // Otherwise one reader being set up would drag every other reader's files into the next sync.
    for (const kind of AGENT_KINDS) {
        assert.equal(hasAgentFiles([{ path: SHARED_SKILL }], kind), false, kind);
    }
});

test('the shared skills folder is emitted once while any reader is set up, and never otherwise', () => {
    const root = kitRoot();

    for (const agents of AGENT_SUBSETS) {
        const paths = generateAgentFiles(root, VARS, agents).map((file) => file.path);
        const shared = paths.filter((path) => path.startsWith(SHARED_SKILLS_DIR));
        const wanted = agents.some((kind) => AGENT_SPECS[kind].readsSharedSkills);

        assert.equal(shared.length > 0, wanted, `[${agents}] shared skills emitted: ${shared.length}`);
        assert.equal(new Set(paths).size, paths.length, `[${agents}] every path is emitted at most once`);
    }
});

test('Zed reads the shared skills folder and ships only a merged settings.json, with no agent key or rules file', () => {
    assert.equal(AGENT_SPECS.zed.readsSharedSkills, true);

    const files = generateAgentFiles(kitRoot(), VARS, ['zed']);
    const settingsFile = files.find((file) => file.path === '.zed/settings.json');

    assert.ok(settingsFile, 'Zed should emit .zed/settings.json');
    assert.equal(classifyFile('.zed/settings.json'), 'kit-owned');
    assert.equal(classifyFile('.zed/tasks.json'), 'user-owned', 'only settings.json is kit-owned under .zed/');

    const settings = JSON.parse(settingsFile.content);
    assert.equal(settings.format_on_save, 'on');
    assert.deepEqual(settings.languages.JavaScript, { formatter: { language_server: { name: 'biome' } } });
    for (const language of ['TypeScript', 'JSON', 'JSONC']) {
        assert.deepEqual(settings.languages[language], settings.languages.JavaScript, language);
    }
    assert.deepEqual(settings.context_servers, { 'blit386-docs': { url: 'https://blit386.dev/mcp' } });
    assert.ok(!('agent' in settings), 'project settings have no agent field; a key there is silently ignored');

    // Zed reads the first match of a fixed rules list, and each entry would hide AGENTS.md.
    for (const hidden of ['.rules', '.cursorrules', '.windsurfrules', '.clinerules']) {
        assert.ok(!files.some((file) => file.path === hidden), `${hidden} must never be emitted`);
    }
});

test('Claude Code and Cursor keep private skill copies and do not read the shared folder', () => {
    // Claude Code does not read `.agents/skills/`; Cursor is unverified. Flip only with a source.
    assert.equal(AGENT_SPECS.claude.readsSharedSkills, false);
    assert.equal(AGENT_SPECS.cursor.readsSharedSkills, false);
});

test('the registry has one entry per AgentKind, each emitting its own MCP config', () => {
    const root = kitRoot();

    assert.deepEqual(Object.keys(AGENT_ADAPTERS).sort(), [...AGENT_KINDS].sort());

    for (const kind of AGENT_KINDS) {
        const adapter = AGENT_ADAPTERS[kind];

        assert.equal(adapter.label, AGENT_SPECS[kind].label);
        assert.ok(
            adapter.generate(root, VARS).some((file) => file.path === adapter.mcpConfig),
            `${kind} should emit ${adapter.mcpConfig}`,
        );
    }
});

test('Claude ships guard-core.cjs beside protect-files.cjs; Cursor gets no protect-files.cjs', () => {
    const root = kitRoot();
    const claude = generateClaudeAdapter(root, VARS).map((file) => file.path);
    const cursor = generateCursorAdapter(root, VARS).map((file) => file.path);

    assert.ok(claude.includes('.claude/hooks/protect-files.cjs'));
    assert.ok(claude.includes('.claude/hooks/guard-core.cjs'), 'a required sibling must ship with its hook');
    assert.equal(
        cursor.some((path) => path.endsWith('protect-files.cjs')),
        false,
    );
});

test('Cursor shell safety starts through node and ships the entry with the guard core', () => {
    const root = kitRoot();
    const files = generateCursorAdapter(root, VARS);
    const hooksFile = files.find((file) => file.path === '.cursor/hooks.json');
    assert.ok(hooksFile, 'expected .cursor/hooks.json');
    const hooksJson = JSON.parse(hooksFile.content);
    const command = hooksJson.hooks.beforeShellExecution[0].command;

    assert.equal(command, 'node .cursor/hooks/shell-safety.cjs');
    assert.ok(files.some((file) => file.path === '.cursor/hooks/shell-safety.cjs'));
    assert.ok(files.some((file) => file.path === '.cursor/hooks/guard-core.cjs'));
    assert.equal(
        files.some((file) => file.path.endsWith('.sh')),
        false,
        'Cursor needs no POSIX sh',
    );
});

test('the Claude launch config is user-owned and emitted only by the Claude adapter', () => {
    const root = kitRoot();

    assert.equal(CLAUDE_LAUNCH_JSON, '.claude/launch.json');
    assert.equal(classifyFile(CLAUDE_LAUNCH_JSON), 'user-owned');
    assert.ok(generateClaudeAdapter(root, VARS).some((file) => file.path === CLAUDE_LAUNCH_JSON));
    assert.equal(
        generateCursorAdapter(root, VARS).some((file) => file.path.endsWith('launch.json')),
        false,
    );
});

test('the launch config runs vite through the package manager that leads pmRunDev', () => {
    const root = kitRoot();
    const configFor = (pmRunDev) => {
        const file = generateClaudeAdapter(root, { ...VARS, pmRunDev }).find((f) => f.path === CLAUDE_LAUNCH_JSON);
        return JSON.parse(file.content).configurations[0];
    };
    const flags = ['--port', '5173', '--strictPort', '--no-open'];

    assert.deepEqual(configFor('npm run dev'), {
        name: 'test-game-dev',
        runtimeExecutable: 'npm',
        runtimeArgs: ['exec', '--', 'vite', ...flags],
        port: 5173,
        autoPort: false,
    });
    assert.deepEqual(configFor('pnpm run dev').runtimeArgs, ['exec', 'vite', ...flags]);
    assert.deepEqual(configFor('yarn dev').runtimeArgs, ['vite', ...flags]);
    assert.deepEqual(configFor('bun run dev').runtimeArgs, ['x', 'vite', ...flags]);
    assert.equal(configFor('mystery run dev').runtimeExecutable, 'npm', 'an unknown manager falls back to npm');
});

test('every file the kit emits classifies as kit-owned or shared, except the user-owned launch config', () => {
    const root = kitRoot();
    const emitted = [
        agentsFile(root),
        ...collectDocs(root),
        ...generateClaudeAdapter(root, VARS),
        ...generateCursorAdapter(root, VARS),
        ...generateSharedSkills(root, VARS),
    ];

    assert.ok(emitted.length > 0, 'expected the kit to emit at least one file');

    for (const file of emitted) {
        if (file.path === CLAUDE_LAUNCH_JSON) {
            continue;
        }

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

    for (const file of generateAgentFiles(root, VARS, ['zed'])) {
        assert.ok(isAgentPath(file.path, 'zed'), `${file.path} is not recognized as a Zed file`);
    }

    for (const file of generateSharedSkills(root, VARS)) {
        assert.deepEqual(
            owners(file.path),
            AGENT_KINDS.filter((kind) => AGENT_SPECS[kind].readsSharedSkills),
            `${file.path} should belong to exactly the shared-folder readers`,
        );
    }
});

test('the Zed tool_permissions snippet in AGENTS.md is valid JSON that denies lock files and .env but not .env.example', () => {
    const body = agentsFile(kitRoot()).content.match(/```json\n([\s\S]*?)\n```/)?.[1];
    assert.ok(body, 'AGENTS.md should carry a json snippet');

    const { edit_file, write_file } = JSON.parse(body).agent.tool_permissions.tools;
    const denies = (rules, path) => rules.always_deny.some(({ pattern }) => new RegExp(pattern, 'i').test(path));

    for (const rules of [edit_file, write_file]) {
        for (const path of ['pnpm-lock.yaml', 'yarn.lock', 'src/.env', '.env.local']) {
            assert.ok(denies(rules, path), `${path} should be denied`);
        }

        for (const path of ['.env.example', 'src/game.js']) {
            assert.ok(!denies(rules, path), `${path} should be allowed`);
        }
    }
});
