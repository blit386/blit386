/**
 * The OpenCode adapter: what it emits, that its permission lists in `opencode.json` stay in step with the guard core
 * (`content/hooks/guard-core.cjs`), and that the generated `kit-guard.ts` plugin blocks what the guard core says to.
 *
 * Imports the built dist module; the package `pretest` script runs `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { classifyFile, generateAgentFiles, generateOpenCodeAdapter, kitRoot } from '../dist/adapters.js';

const here = dirname(fileURLToPath(import.meta.url));
const { isDangerousCommand, isProtectedPath } = createRequire(import.meta.url)(
    join(here, '..', 'content', 'hooks', 'guard-core.cjs'),
);

const VARS = {
    pmInstall: 'pnpm install',
    pmRunDev: 'pnpm run dev',
    pmRunBuild: 'pnpm run build',
    pmRunFormat: 'pnpm run format',
    pmRunLint: 'pnpm run lint',
};

const files = generateOpenCodeAdapter(kitRoot(), VARS);
const byPath = new Map(files.map((file) => [file.path, file.content]));
const config = JSON.parse(byPath.get('opencode.json'));

/** OpenCode's rule evaluation: `*` matches anything including `/`, the last matching rule wins, no match is allow. */
function evaluate(rules, subject) {
    let verdict = 'allow';

    for (const [pattern, action] of Object.entries(rules)) {
        const source = pattern
            .split('*')
            .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
            .join('.*');

        if (new RegExp(`^${source}$`).test(subject)) {
            verdict = action;
        }
    }

    return verdict;
}

describe('emitted files', () => {
    it('are opencode.json, the plugin, the guard core, and the bootstrap script', () => {
        assert.deepEqual(
            [...byPath.keys()].sort(),
            [
                '.opencode/hooks/guard-core.cjs',
                '.opencode/hooks/session-start.sh',
                '.opencode/plugins/kit-guard.ts',
                'opencode.json',
            ].sort(),
        );

        for (const path of byPath.keys()) {
            assert.equal(classifyFile(path), 'kit-owned', path);
        }
    });

    it('render the package manager into the plugin and leave no placeholder behind', () => {
        const plugin = byPath.get('.opencode/plugins/kit-guard.ts');

        assert.ok(plugin.includes("BLIT_PM_INSTALL: 'pnpm install'"));
        assert.ok(!plugin.includes('{{'));
    });

    it('add the shared skills folder once and no private skill copies', () => {
        const paths = generateAgentFiles(kitRoot(), VARS, ['opencode']).map((file) => file.path);

        assert.ok(paths.some((path) => path.startsWith('.agents/skills/run/')));
        assert.ok(!paths.some((path) => path.includes('/skills/') && !path.startsWith('.agents/')));
        assert.equal(new Set(paths).size, paths.length);
    });

    it('declare the schema, one formatter per file type, and the remote docs server', () => {
        assert.equal(config.$schema, 'https://opencode.ai/config.json');
        const { biome, prettier } = config.formatter;

        // Each tool owns its own file types: no extension is formatted twice, and the split is the format hook's.
        assert.deepEqual(
            biome.extensions.filter((ext) => prettier.extensions.includes(ext)),
            [],
        );
        assert.ok(biome.extensions.includes('.ts') && prettier.extensions.includes('.md'));
        assert.deepEqual(config.mcp, {
            'blit386-docs': { type: 'remote', url: 'https://blit386.dev/mcp', enabled: true },
        });
    });
});

describe('opencode.json permissions agree with the guard core', () => {
    const PATHS = [
        'package.json',
        'src/game.js',
        'pnpm-lock.yaml',
        'nested/dir/pnpm-lock.yaml',
        'package-lock.json',
        'bun.lockb',
        'yarn.lock',
        'Cargo.lock',
        '.env',
        '.env.local',
        '.env.production',
        'config/.env',
        '.env.example',
        'config/.env.example',
        'src/environment.js',
        'game.env.js',
        'my-pnpm-lock.yaml',
        'package-lock.json.bak',
    ];

    // Lock files are not secrets, so `read` is only held to the `.env` half of the rule.
    for (const rules of ['edit', 'read']) {
        it(`${rules}: denies exactly what isProtectedPath blocks`, () => {
            for (const path of rules === 'edit' ? PATHS : PATHS.filter((name) => name.includes('.env'))) {
                assert.equal(
                    evaluate(config.permission[rules], path) === 'deny',
                    isProtectedPath(path) !== null,
                    `${rules} ${path}`,
                );
            }
        });
    }

    // Every command the guard core denies, in the plain form a pattern can see. Quoting, `-C`, and `bash -c` tricks
    // are the plugin's job and are covered by the plugin tests below.
    const DENIED = [
        'git reset --hard',
        'git reset --hard HEAD~1',
        'git checkout -- src/game.js',
        'git restore src/game.js',
        'git restore .',
        'git clean -fd',
        'git clean',
    ];
    const ASKED = [
        'git push --force',
        'git push -f origin main',
        'git push origin main --force-with-lease',
        'git push origin +main',
        'git branch -D old',
        'git stash drop',
        'git stash clear',
    ];
    const ALLOWED = [
        'git status',
        'git reset --soft HEAD~1',
        'git checkout -b feature',
        'git restore --staged src/game.js',
        'git clean -n',
        'git clean --dry-run',
        'git push origin foo-feature',
        'git push --follow-tags',
        'git branch -d old',
        'git stash pop',
    ];

    it('bash: maps each guard-core verdict to the same permission', () => {
        for (const [commands, decision, permission] of [
            [DENIED, 'deny', 'deny'],
            [ASKED, 'ask', 'ask'],
            [ALLOWED, undefined, 'allow'],
        ]) {
            for (const command of commands) {
                assert.equal(isDangerousCommand(command)?.decision, decision, `guard core: ${command}`);
                assert.equal(evaluate(config.permission.bash, command), permission, `permission: ${command}`);
            }
        }
    });
});

describe('the kit-guard.ts plugin', () => {
    /** Load the generated plugin next to its guard core, the way a game has them. */
    async function loadPlugin() {
        const root = mkdtempSync(join(tmpdir(), 'blit-opencode-plugin-'));

        for (const file of files) {
            mkdirSync(dirname(join(root, file.path)), { recursive: true });
            writeFileSync(join(root, file.path), file.content);
        }

        const module = await import(pathToFileURL(join(root, '.opencode', 'plugins', 'kit-guard.ts')).href);
        const calls = [];
        // Bun's `$`: a tagged template whose result is a chain of modifiers, awaited at the end.
        const $ = (strings) => {
            const call = { command: strings.join(''), cwd: null, env: null };
            const chain = {
                cwd: (cwd) => {
                    call.cwd = cwd;
                    return chain;
                },
                env: (env) => {
                    call.env = env;
                    return chain;
                },
                quiet: () => chain,
                throws: () => chain,
                // biome-ignore lint/suspicious/noThenProperty: Bun's `$` result is a thenable, and the plugin awaits it.
                then: (resolve) => {
                    calls.push(call);
                    resolve();
                },
            };

            return chain;
        };
        const hooks = await module.KitGuard({ $, directory: root });

        return { hooks, calls, root, dispose: () => rmSync(root, { recursive: true, force: true }) };
    }

    const tool = (hooks, name, args) => hooks['tool.execute.before']({ tool: name }, { args });

    it('blocks destructive git commands, including the ones a pattern misses', async () => {
        const { hooks, dispose } = await loadPlugin();

        try {
            for (const command of [
                'git reset --hard',
                'bash -c "git reset --hard"',
                "git 'reset' --hard",
                'git -C . clean -fd',
            ]) {
                await assert.rejects(tool(hooks, 'bash', { command }), /destructive git command/, command);
            }

            for (const command of ['git status', 'git push --force', 'git clean -n']) {
                await tool(hooks, 'bash', { command });
            }
        } finally {
            dispose();
        }
    });

    it('blocks edits to lock files and .env files through every edit tool, and allows .env.example', async () => {
        const { hooks, dispose } = await loadPlugin();

        try {
            for (const name of ['edit', 'write', 'multiedit']) {
                await assert.rejects(tool(hooks, name, { filePath: 'pnpm-lock.yaml' }), /package manager/, name);
                await assert.rejects(tool(hooks, name, { filePath: 'config/.env.local' }), /secrets/, name);
                await tool(hooks, name, { filePath: '.env.example' });
            }

            const patch = (...lines) => ({ patchText: ['*** Begin Patch', ...lines, '*** End Patch'].join('\n') });

            await tool(hooks, 'apply_patch', patch('*** Update File: src/game.js', '@@', '-a', '+b'));
            await tool(hooks, 'apply_patch', patch('*** Add File: .env.example', '+X=1'));
            await assert.rejects(
                tool(hooks, 'apply_patch', patch('*** Update File: src/game.js', '*** Delete File: package-lock.json')),
                /package manager/,
            );
            await assert.rejects(tool(hooks, 'apply_patch', patch('*** Move to: .env')), /secrets/);

            // OpenCode's parser takes whatever follows the colon, trimmed, so a header need not have a space.
            for (const header of [
                '*** Update File:.env',
                '*** Add File:\t.env.local',
                '  *** Delete File:pnpm-lock.yaml',
            ]) {
                await assert.rejects(tool(hooks, 'apply_patch', patch(header)), /secrets|package manager/, header);
            }
        } finally {
            dispose();
        }
    });

    it('fails closed when it cannot tell what a call would do', async () => {
        const { hooks, dispose } = await loadPlugin();

        try {
            await assert.rejects(tool(hooks, 'edit', {}), /could not read/);
            await assert.rejects(tool(hooks, 'write', { filePath: 42 }), /could not read/);
            await assert.rejects(tool(hooks, 'apply_patch', { patchText: 'nothing useful' }), /could not read/);
            await assert.rejects(tool(hooks, 'apply_patch', {}), /could not read/);
            await assert.rejects(tool(hooks, 'bash', { command: ['git', 'status'] }), /could not read/);
            await assert.rejects(tool(hooks, 'bash', undefined), /could not read/);
            await tool(hooks, 'read', {});
        } finally {
            dispose();
        }
    });

    it('runs the bootstrap script for a session you open, not for a subagent or any other event', async () => {
        const { hooks, calls, root, dispose } = await loadPlugin();
        const created = (parentID) => ({ event: { type: 'session.created', properties: { info: { parentID } } } });

        try {
            await hooks.event({ event: { type: 'session.idle', properties: {} } });
            await hooks.event(created('ses_parent'));
            assert.equal(calls.length, 0);

            await hooks.event(created(undefined));
            assert.equal(calls.length, 1);
            assert.equal(calls[0].command, 'sh .opencode/hooks/session-start.sh');
            assert.equal(calls[0].cwd, root);
            assert.equal(calls[0].env.BLIT_PM_INSTALL, 'pnpm install');
        } finally {
            dispose();
        }
    });

    it('is wired in the hooks manifest for exactly the events it handles', () => {
        const manifest = JSON.parse(readFileSync(join(here, '..', 'content', 'hooks.manifest.json'), 'utf8'));
        const events = new Set(manifest.hooks.flatMap((hook) => (hook.opencode ? [hook.opencode.event] : [])));

        assert.deepEqual([...events].sort(), ['session.created', 'tool.execute.before']);
    });
});
