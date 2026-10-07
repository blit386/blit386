/**
 * The GitHub Copilot adapter: what `.github/hooks/blit.json`, the cloud agent's setup workflow, and the root `.mcp.json`
 * say, which scripts ship beside them, and that the guard blocks the way Copilot needs. Copilot sends two payload
 * shapes - `{toolName, toolArgs}` (CLI, cloud agent, VS Code's Copilot harness; `toolArgs` sometimes a JSON string) and
 * `{tool_name, tool_input}` (VS Code's older Local harness, which may ignore the matcher) - so every case runs through
 * the shape it arrives in. The hook commands run from the project root, as `cwd: "."` makes Copilot run them.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { classifyFile, generateCopilotAdapter, kitRoot } from '../dist/adapters.js';

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

const files = generateCopilotAdapter(kitRoot(), VARS);
const contentOf = (path) => files.find((f) => f.path === path).content;
const hooksJson = JSON.parse(contentOf('.github/hooks/blit.json'));

/** The CLI / Copilot-harness payload; `toolArgs` is sent as a JSON string when `asString` is set. */
const copilot = (toolName, toolArgs, asString = false) => ({
    sessionId: 's',
    timestamp: 0,
    cwd: '/game',
    toolName,
    toolArgs: asString ? JSON.stringify(toolArgs) : toolArgs,
});

/** The VS Code Local harness payload. */
const local = (tool_name, tool_input) => ({ cwd: '/game', hook_event_name: 'PreToolUse', tool_name, tool_input });

/** A payload as sent from `cwd`, for the commands that resolve relative paths against it. */
const from = (cwd, payload) => ({ ...payload, cwd });

/** Run `copilot-hook.cjs pre-tool` with `input` on stdin (a string is sent raw); returns status and the parsed decision. */
function guard(input) {
    const result = spawnSync(process.execPath, [join(hooksDir, 'copilot-hook.cjs'), 'pre-tool'], {
        input: typeof input === 'string' ? input : JSON.stringify(input),
        encoding: 'utf8',
    });
    const reply = result.stdout.trim() === '' ? null : JSON.parse(result.stdout);

    return { ...result, reply };
}

describe('.github/hooks/blit.json', () => {
    it('is a version 1 hooks file', () => {
        assert.deepEqual(Object.keys(hooksJson), ['version', 'hooks']);
        assert.equal(hooksJson.version, 1);
    });

    it('wires the four hooks to Copilot events and tool-name matchers, all run from the repository root', () => {
        const flat = Object.entries(hooksJson.hooks).flatMap(([event, entries]) =>
            entries.map((entry) => [event, entry.matcher ?? null, entry.type, entry.cwd, entry.timeoutSec]),
        );

        assert.deepEqual(flat.sort(), [
            ['postToolUse', 'edit|create', 'command', '.', 30],
            ['preToolUse', 'bash|powershell', 'command', '.', 10],
            ['preToolUse', 'edit|create', 'command', '.', 10],
            ['sessionStart', null, 'command', '.', 300],
        ]);
    });

    it('runs one Node entry under both shells, with its mode and the rendered install command', () => {
        const commands = Object.values(hooksJson.hooks)
            .flat()
            .map((entry) => {
                assert.equal(entry.powershell, entry.bash, 'Windows runs the same Node command');
                return entry.bash;
            });

        assert.deepEqual(commands.sort(), [
            'node .github/hooks/copilot-hook.cjs post-tool',
            'node .github/hooks/copilot-hook.cjs pre-tool',
            'node .github/hooks/copilot-hook.cjs pre-tool',
            'node .github/hooks/copilot-hook.cjs session-start "pnpm install"',
        ]);
    });

    it('ships every script a hook runs, plus guard-core, and nothing another agent needs', () => {
        const scripts = files
            .filter((f) => f.path.startsWith('.github/hooks/') && !f.path.endsWith('.json'))
            .map((f) => f.path.split('/').pop());

        assert.deepEqual(scripts.sort(), [
            'bootstrap-core.cjs',
            'copilot-hook.cjs',
            'format-file.cjs',
            'guard-core.cjs',
        ]);

        for (const { path } of files) {
            assert.equal(classifyFile(path), 'kit-owned', path);
        }
    });

    it('emits no prompt files, which the VS Code Agent Host does not load', () => {
        assert.equal(
            files.some((f) => f.path.startsWith('.github/prompts/')),
            false,
        );
    });
});

describe('.github/workflows/copilot-setup-steps.yml', () => {
    const workflow = contentOf('.github/workflows/copilot-setup-steps.yml');

    it('has the one job name GitHub looks for, and installs with the chosen package manager', () => {
        assert.match(workflow, /^jobs:\n {2}copilot-setup-steps:\n/m);
        assert.match(workflow, /node-version-file: '\.node-version'/);
        assert.match(workflow, /run: corepack enable/);
        assert.match(workflow, /run: pnpm install\n$/);
    });

    it('installs Bun through npm, since Corepack does not manage it', () => {
        const bun = generateCopilotAdapter(kitRoot(), { ...VARS, pmInstall: 'bun install', pmRunDev: 'bun run dev' });
        const content = bun.find((f) => f.path === '.github/workflows/copilot-setup-steps.yml').content;

        assert.match(content, /run: npm install --global bun/);
        assert.doesNotMatch(content, /corepack/);
        assert.match(content, /run: bun install\n$/);
    });
});

describe('the docs MCP config', () => {
    it('is the one root .mcp.json the Copilot CLI and VS Code both read, and no .vscode/mcp.json', () => {
        const root = JSON.parse(contentOf('.mcp.json'));

        assert.deepEqual(root, { mcpServers: { 'blit386-docs': { type: 'http', url: 'https://blit386.dev/mcp' } } });
        assert.equal(
            files.some((f) => f.path.startsWith('.vscode/')),
            false,
            'a .vscode/mcp.json would register the server twice',
        );
    });

    it('points at the website server card', { skip: !existsSync(WEBSITE_CARD) }, () => {
        const card = JSON.parse(readFileSync(WEBSITE_CARD, 'utf8'));
        const root = JSON.parse(contentOf('.mcp.json'));

        assert.equal(root.mcpServers[card.serverInfo.name].url, card.url);
    });
});

describe('copilot-hook.cjs pre-tool', () => {
    it('blocks a lock-file edit with exit 2, a reason on stderr, and the decision in both dialects', () => {
        const result = guard(copilot('edit', { path: 'pnpm-lock.yaml' }));

        assert.equal(result.status, 2);
        assert.match(result.stderr, /\[BLOCKED\] pnpm-lock\.yaml is written by the package manager/);
        assert.equal(result.reply.permissionDecision, 'deny');
        assert.equal(result.reply.hookSpecificOutput.permissionDecision, 'deny');
        assert.equal(result.reply.hookSpecificOutput.hookEventName, 'PreToolUse');
    });

    it('reads toolArgs whether it arrives as an object or as a JSON string', () => {
        for (const asString of [false, true]) {
            assert.equal(guard(copilot('create', { path: '.env' }, asString)).status, 2, `string: ${asString}`);
            assert.equal(guard(copilot('bash', { command: 'git reset --hard' }, asString)).status, 2);
            assert.equal(guard(copilot('edit', { path: 'src/game.js' }, asString)).status, 0);
            assert.equal(guard(copilot('bash', { command: 'ls' }, asString)).stdout, '');
        }
    });

    it('asks, without blocking, for what reflog can still bring back', () => {
        const result = guard(copilot('powershell', { command: 'git push --force' }));

        assert.equal(result.status, 0);
        assert.equal(result.reply.permissionDecision, 'ask');
    });

    it('checks the files of a patch written through the shell', () => {
        const patch = "apply_patch <<'EOF'\n*** Begin Patch\n*** Update File: yarn.lock\n*** End Patch\nEOF";

        assert.equal(guard(copilot('bash', { command: patch })).status, 2);
    });

    it('guards the Local harness edit and terminal tools by their VS Code names', () => {
        assert.equal(guard(local('replace_string_in_file', { filePath: '/game/.env' })).status, 2);
        assert.equal(guard(local('create_file', { filePath: '/game/src/new.js' })).status, 0);
        assert.equal(guard(local('insert_edit_into_file', { filePath: '/game/bun.lockb' })).status, 2);
        assert.equal(
            guard(local('multi_replace_string_in_file', { replacements: [{ filePath: '/game/.env.local' }] })).status,
            2,
        );
        assert.equal(
            guard(local('apply_patch', { input: '*** Begin Patch\n*** Add File: .env\n*** End Patch' })).status,
            2,
        );
        assert.equal(guard(local('run_in_terminal', { command: 'git clean -fd' })).status, 2);
        assert.equal(guard(local('send_to_terminal', { id: 't', command: 'git reset --hard' })).status, 2);
        assert.equal(
            guard(
                local('create_and_run_task', {
                    task: { label: 'x', type: 'shell', command: 'git', args: ['clean', '-fd'] },
                }),
            ).status,
            2,
        );
        assert.equal(
            guard(local('create_and_run_task', { task: { label: 'dev', type: 'shell', command: 'pnpm run dev' } }))
                .status,
            0,
        );
    });

    it('lets a tool it does not guard through, even one naming a protected file', () => {
        // The Local harness may ignore the matcher and send every tool; reading a lock file is fine.
        assert.equal(guard(local('read_file', { filePath: '/game/pnpm-lock.yaml' })).status, 0);
        assert.equal(guard(copilot('view', { path: '.env' })).status, 0);
    });

    it('denies on an unknown mode, so a broken hooks file never allows a call', () => {
        const result = spawnSync(process.execPath, [join(hooksDir, 'copilot-hook.cjs'), 'pre-tol'], {
            input: JSON.stringify(copilot('edit', { path: 'src/game.js' })),
            encoding: 'utf8',
        });

        assert.equal(result.status, 2);
        assert.match(result.stderr, /\[BLOCKED\] Unknown blit Copilot hook mode/);
    });

    it('fails closed on anything it cannot read', () => {
        for (const input of [
            'not json',
            '[]',
            {},
            copilot('edit', {}),
            copilot('edit', '{broken', false),
            copilot('bash', { cmd: 'ls' }),
            local('run_in_terminal', null),
        ]) {
            const result = guard(input);

            assert.equal(result.status, 2, JSON.stringify(input));
            assert.match(result.stderr, /\[BLOCKED\]/);
        }
    });
});

describe('the hook commands, run as Copilot runs them', () => {
    const root = mkdtempSync(join(tmpdir(), 'blit-copilot-'));
    const biomeDir = join(root, 'node_modules', '@biomejs', 'biome');

    for (const file of files) {
        mkdirSync(dirname(join(root, file.path)), { recursive: true });
        writeFileSync(join(root, file.path), file.content);
    }

    mkdirSync(join(root, 'src'));
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

    /** Run one entry's `bash` command from the repository root, as its `cwd: "."` asks. */
    const run = (entry, input) =>
        spawnSync('/bin/sh', ['-c', entry.bash], { cwd: root, input: JSON.stringify(input), encoding: 'utf8' });

    it('block a protected edit and a destructive command', () => {
        const [shell, edit] = hooksJson.hooks.preToolUse;

        assert.equal(run(shell, copilot('bash', { command: 'git reset --hard' })).status, 2);
        assert.equal(run(edit, copilot('edit', { path: 'package-lock.json' }, true)).status, 2);
        assert.equal(run(edit, copilot('edit', { path: 'src/game.js' })).status, 0);
    });

    it('format the edited file named in toolArgs, as an object or a string, and nothing else', () => {
        const [format] = hooksJson.hooks.postToolUse;

        for (const asString of [false, true]) {
            writeFileSync(join(root, 'src', 'game.js'), 'edited');
            writeFileSync(join(root, 'src', 'other.js'), 'untouched');

            const result = run(format, from(root, copilot('edit', { path: 'src/game.js' }, asString)));

            assert.equal(result.status, 0);
            assert.equal(readFileSync(join(root, 'src', 'game.js'), 'utf8'), 'EDITED', `string: ${asString}`);
            assert.equal(readFileSync(join(root, 'src', 'other.js'), 'utf8'), 'untouched');
        }
    });

    it('format the file the Local harness names in tool_input.filePath', () => {
        const [format] = hooksJson.hooks.postToolUse;
        writeFileSync(join(root, 'src', 'game.js'), 'local');

        assert.equal(
            run(format, from(root, local('create_file', { filePath: join(root, 'src', 'game.js') }))).status,
            0,
        );
        assert.equal(readFileSync(join(root, 'src', 'game.js'), 'utf8'), 'LOCAL');
    });

    it('never format a file a tool only read, even when the Local harness sends every tool', () => {
        const [format] = hooksJson.hooks.postToolUse;
        writeFileSync(join(root, 'src', 'game.js'), 'read only');

        for (const payload of [
            local('read_file', { filePath: join(root, 'src', 'game.js') }),
            copilot('view', { path: 'src/game.js' }),
        ]) {
            assert.equal(run(format, from(root, payload)).status, 0);
        }

        assert.equal(readFileSync(join(root, 'src', 'game.js'), 'utf8'), 'read only');
        assert.equal(run(format, 'not json').status, 0, 'a broken payload never fails the edit');
    });

    it('bootstrap with the install command it is given, run doctor, and report as additionalContext', () => {
        const [bootstrap] = hooksJson.hooks.sessionStart;
        const project = mkdtempSync(join(tmpdir(), 'blit-copilot-boot-'));
        const bin = join(project, 'node_modules', '.bin');
        const command = bootstrap.bash.replace('"pnpm install"', '"mkdir -p node_modules/.bin && echo installed"');

        try {
            mkdirSync(join(project, '.github'), { recursive: true });
            cpSync(join(root, '.github', 'hooks'), join(project, '.github', 'hooks'), { recursive: true });

            const first = spawnSync('/bin/sh', ['-c', command], { cwd: project, input: '{}', encoding: 'utf8' });
            assert.equal(first.status, 0);
            assert.match(JSON.parse(first.stdout).additionalContext, /Installed dependencies/);

            writeFileSync(join(bin, 'blit'), '#!/bin/sh\necho "doctor says hi"\n');
            chmodSync(join(bin, 'blit'), 0o755);

            const second = spawnSync('/bin/sh', ['-c', command], { cwd: project, input: '{}', encoding: 'utf8' });
            assert.equal(second.status, 0);
            assert.match(JSON.parse(second.stdout).additionalContext, /blit doctor:\ndoctor says hi/);
        } finally {
            rmSync(project, { recursive: true, force: true });
        }
    });
});
