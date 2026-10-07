/**
 * The Codex adapter: what `.codex/hooks.json` and `.codex/config.toml` say, which scripts ship beside them, and that
 * the hooks block the way Codex needs. Codex lets a call through on any exit but 2, on exit 2 with an empty stderr, on
 * a crash, and on a timeout, and it runs each command through the user's shell in the session's working directory - so
 * the hook commands are also run here exactly as written, from a subdirectory and with no `node` on the PATH.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { classifyFile, generateCodexAdapter, kitRoot } from '../dist/adapters.js';

const here = dirname(fileURLToPath(import.meta.url));
const hooksDir = join(here, '..', 'content', 'hooks');
const WEBSITE_CARD = join(here, '..', '..', 'website', 'public', '.well-known', 'mcp', 'server-card.json');

const VARS = {
    pmInstall: 'pnpm install',
    pmRunDev: 'pnpm run dev',
    pmRunBuild: 'pnpm run build',
    pmRunFormat: 'pnpm run format',
    pmRunLint: 'pnpm run lint',
};

const files = generateCodexAdapter(kitRoot(), VARS);
const hooksJson = JSON.parse(files.find((f) => f.path === '.codex/hooks.json').content);
const configToml = files.find((f) => f.path === '.codex/config.toml').content;

/** The one command handler the kit wires to `event` for `matcher`. */
const commandFor = (event, matcher) =>
    hooksJson.hooks[event].find((group) => group.matcher === matcher).hooks[0].command;

/** A Codex payload for `tool` carrying `text` in `tool_input.command`, as both Bash and apply_patch send it. */
const payload = (tool, text, cwd = '/game') => ({
    session_id: 's',
    turn_id: 't',
    cwd,
    hook_event_name: 'PreToolUse',
    tool_name: tool,
    tool_input: { command: text },
});

/** An apply_patch text that updates `file`. */
const updatePatch = (file) => `*** Begin Patch\n*** Update File: ${file}\n@@\n-a\n+b\n*** End Patch`;

/** Run `codex-guard.cjs <mode>` from the kit's content with `input` on stdin (a string is sent raw). */
function guard(mode, input) {
    return spawnSync(process.execPath, [join(hooksDir, 'codex-guard.cjs'), ...(mode ? [mode] : [])], {
        input: typeof input === 'string' ? input : JSON.stringify(input),
        encoding: 'utf8',
    });
}

describe('.codex/hooks.json', () => {
    it('holds nothing but hooks, since Codex skips a hooks file with an unknown key', () => {
        assert.deepEqual(Object.keys(hooksJson), ['hooks']);
    });

    it('wires the four hooks to Codex events and tool names', () => {
        const flat = Object.entries(hooksJson.hooks).flatMap(([event, groups]) =>
            groups.map((group) => [event, group.matcher, group.hooks[0].type, group.hooks[0].timeout]),
        );

        assert.deepEqual(flat.sort(), [
            ['PostToolUse', 'apply_patch', 'command', 30],
            ['PreToolUse', 'Bash', 'command', 10],
            ['PreToolUse', 'apply_patch', 'command', 10],
            ['SessionStart', 'startup', 'command', 300],
        ]);

        assert.ok(commandFor('SessionStart', 'startup').includes('BLIT_PM_INSTALL="pnpm install"'), 'vars rendered');
    });

    it('ships every script a hook runs, plus guard-core, and nothing another agent needs', () => {
        const scripts = files.filter((f) => f.path.startsWith('.codex/hooks/')).map((f) => f.path.split('/').pop());

        assert.deepEqual(scripts.sort(), ['codex-guard.cjs', 'format-file.cjs', 'guard-core.cjs', 'session-start.sh']);

        for (const { path } of files) {
            assert.equal(classifyFile(path), 'kit-owned', path);
        }
    });
});

describe('.codex/config.toml', () => {
    it('is one docs-server table with a streamable HTTP url', () => {
        const settings = configToml.split('\n').filter((line) => line !== '' && !line.startsWith('#'));

        assert.deepEqual(settings, ['[mcp_servers.blit386-docs]', 'url = "https://blit386.dev/mcp"']);

        if (existsSync(WEBSITE_CARD)) {
            const card = JSON.parse(readFileSync(WEBSITE_CARD, 'utf8'));

            assert.equal(settings[0], `[mcp_servers.${card.serverInfo.name}]`);
            assert.equal(settings[1], `url = "${card.url}"`);
        }
    });
});

describe('AGENTS.md', () => {
    it('fits in the 32 KiB Codex reads of it, so the end of the guide is never cut off', () => {
        assert.ok(readFileSync(join(here, '..', 'content', 'AGENTS.md')).length < 32 * 1024);
    });
});

describe('codex-guard.cjs shell', () => {
    it('allows an ordinary command', () => {
        assert.equal(guard('shell', payload('Bash', 'git status')).status, 0);
    });

    it('blocks a hard reset with exit 2 and a reason on stderr', () => {
        const result = guard('shell', payload('Bash', ['git', 'reset', '--hard'].join(' ')));

        assert.equal(result.status, 2);
        assert.match(result.stderr, /^\[BLOCKED\] \S/);
    });

    it('blocks the confirm tier too, since Codex has no ask answer, and says the user has to run it', () => {
        const result = guard('shell', payload('Bash', 'git push --force'));

        assert.equal(result.status, 2);
        assert.match(result.stderr, /ask the user to run the command themselves/);
    });

    it('blocks an apply_patch heredoc run through the shell when it touches a protected file', () => {
        const command = `apply_patch <<'EOF'\n${updatePatch('pnpm-lock.yaml')}\nEOF`;

        assert.equal(guard('shell', payload('Bash', command)).status, 2);
        assert.equal(guard('shell', payload('Bash', command.replace('pnpm-lock.yaml', 'src/game.js'))).status, 0);
    });
});

describe('codex-guard.cjs patch', () => {
    it('blocks an update to a lock file and a move onto a .env file', () => {
        assert.equal(guard('patch', payload('apply_patch', updatePatch('pnpm-lock.yaml'))).status, 2);

        const move = '*** Begin Patch\n*** Update File: src/keys.js\n*** Move to: .env.local\n*** End Patch';
        const result = guard('patch', payload('apply_patch', move));

        assert.equal(result.status, 2);
        assert.match(result.stderr, /\.env\.local holds secrets/);
    });

    it('allows an ordinary edit and keeps .env.example editable', () => {
        assert.equal(guard('patch', payload('apply_patch', updatePatch('src/game.js'))).status, 0);
        assert.equal(guard('patch', payload('apply_patch', updatePatch('.env.example'))).status, 0);
    });

    it('fails closed with a message on anything it cannot read', () => {
        for (const [mode, input] of [
            ['patch', 'not json'],
            ['patch', { tool_input: {} }],
            ['patch', payload('apply_patch', 'no headers here')],
            ['bogus', payload('Bash', 'git status')],
            [undefined, payload('Bash', 'git status')],
        ]) {
            const result = guard(mode, input);

            assert.equal(result.status, 2, `${mode} ${JSON.stringify(input)}`);
            assert.match(result.stderr, /^\[BLOCKED\] \S/);
        }
    });
});

describe('the hook commands, run as Codex runs them', () => {
    const root = mkdtempSync(join(tmpdir(), 'blit-codex-'));
    const src = join(root, 'src');
    // A PATH with `sh` and nothing else: the shell Codex starts is there, `node` is not.
    const shOnlyBin = join(root, 'sh-only-bin');
    const biomeDir = join(root, 'node_modules', '@biomejs', 'biome');

    for (const file of files) {
        mkdirSync(dirname(join(root, file.path)), { recursive: true });
        writeFileSync(join(root, file.path), file.content);
    }

    mkdirSync(src);
    mkdirSync(shOnlyBin);
    symlinkSync('/bin/sh', join(shOnlyBin, 'sh'));
    mkdirSync(join(biomeDir, 'bin'), { recursive: true });
    writeFileSync(
        join(biomeDir, 'package.json'),
        JSON.stringify({ name: '@biomejs/biome', bin: { biome: 'bin/biome' } }),
    );
    writeFileSync(
        join(biomeDir, 'bin', 'biome'),
        "const fs = require('node:fs'); const f = process.argv.at(-1); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').toUpperCase());",
    );

    after(() => rmSync(root, { recursive: true, force: true }));

    /** Run one hooks.json command through `sh -c` from `cwd`, the session directory Codex would run it in. */
    const runCommand = (command, input, { cwd = src, env = process.env } = {}) =>
        spawnSync('/bin/sh', ['-c', command], { cwd, env, input: JSON.stringify(input), encoding: 'utf8' });

    it('find the project from a subdirectory and block there', () => {
        const shell = runCommand(commandFor('PreToolUse', 'Bash'), payload('Bash', 'git reset --hard', src));
        const patch = runCommand(
            commandFor('PreToolUse', 'apply_patch'),
            payload('apply_patch', updatePatch('../pnpm-lock.yaml'), src),
        );

        assert.equal(shell.status, 2);
        assert.equal(patch.status, 2);
        assert.match(patch.stderr, /pnpm-lock\.yaml is written by the package manager/);
    });

    it('allow an ordinary command and an ordinary patch', () => {
        assert.equal(runCommand(commandFor('PreToolUse', 'Bash'), payload('Bash', 'ls', src)).status, 0);
        assert.equal(
            runCommand(commandFor('PreToolUse', 'apply_patch'), payload('apply_patch', updatePatch('game.js'), src))
                .status,
            0,
        );
    });

    it('still block, with a message, when node cannot be found', () => {
        for (const matcher of ['Bash', 'apply_patch']) {
            const result = runCommand(commandFor('PreToolUse', matcher), payload('Bash', 'ls', src), {
                env: { PATH: shOnlyBin },
            });

            assert.equal(result.status, 2, matcher);
            assert.match(result.stderr, /\[BLOCKED\] The blit386 guard could not run/);
        }
    });

    it('still block outside any project, where the guard script is missing', () => {
        const result = runCommand(commandFor('PreToolUse', 'Bash'), payload('Bash', 'ls', tmpdir()), {
            cwd: tmpdir(),
        });

        assert.equal(result.status, 2);
        assert.match(result.stderr, /\[BLOCKED\]/);
    });

    it('let the format and bootstrap hooks stop quietly outside any project, unlike the guards', () => {
        for (const [event, matcher] of [
            ['PostToolUse', 'apply_patch'],
            ['SessionStart', 'startup'],
        ]) {
            const result = runCommand(
                commandFor(event, matcher),
                payload('apply_patch', updatePatch('x.js'), tmpdir()),
                {
                    cwd: tmpdir(),
                },
            );

            assert.equal(result.status, 0, event);
            assert.equal(result.stderr, '', event);
        }
    });

    it('format each file a patch touches, resolved against the session cwd, and never exit 2', () => {
        writeFileSync(join(src, 'game.js'), 'edited');
        writeFileSync(join(src, 'other.js'), 'untouched');

        const patch = `*** Begin Patch\n*** Update File: game.js\n@@\n-a\n+b\n*** Delete File: gone.js\n*** End Patch`;
        const result = runCommand(commandFor('PostToolUse', 'apply_patch'), payload('apply_patch', patch, src));

        assert.equal(result.status, 0);
        assert.equal(readFileSync(join(src, 'game.js'), 'utf8'), 'EDITED');
        assert.equal(readFileSync(join(src, 'other.js'), 'utf8'), 'untouched');
        assert.equal(runCommand(commandFor('PostToolUse', 'apply_patch'), 'not json').status, 0);
    });
});
