/**
 * The Gemini CLI adapter: what `.gemini/settings.json` says, which scripts ship beside it, and that the entry scripts
 * block the way Gemini needs - exit code 2, because Gemini lets a call through on any other exit, bad JSON, or timeout.
 */

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { classifyFile, generateGeminiAdapter, kitRoot } from '../dist/adapters.js';
import { runHook, VARS } from './hook-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const WEBSITE_CARD = join(here, '..', '..', 'website', 'public', '.well-known', 'mcp', 'server-card.json');

const files = generateGeminiAdapter(kitRoot(), VARS);
const settings = JSON.parse(files.find((f) => f.path === '.gemini/settings.json').content);

const run = (script, input) => runHook(script, { input });

describe('.gemini/settings.json', () => {
    it('points Gemini at AGENTS.md without emitting a GEMINI.md', () => {
        assert.deepEqual(settings.context.fileName, ['AGENTS.md', 'GEMINI.md']);
        assert.ok(!files.some((f) => f.path === 'GEMINI.md'));
        assert.ok(!files.some((f) => f.path.startsWith('.gemini/policies/')), 'workspace policies do not work');
    });

    it('registers the docs server with httpUrl, never url (url selects SSE)', () => {
        assert.deepEqual(Object.keys(settings.mcpServers), ['blit386-docs']);
        assert.equal(settings.mcpServers['blit386-docs'].httpUrl, 'https://blit386.dev/mcp');
        assert.ok(!('url' in settings.mcpServers['blit386-docs']));

        if (existsSync(WEBSITE_CARD)) {
            assert.equal(
                settings.mcpServers['blit386-docs'].httpUrl,
                JSON.parse(readFileSync(WEBSITE_CARD, 'utf8')).url,
            );
        }
    });

    it('wires the four hooks to Gemini events and tool names, timeouts in milliseconds', () => {
        const flat = Object.entries(settings.hooks).flatMap(([event, groups]) =>
            groups.map((group) => [event, group.matcher, group.hooks[0].name, group.hooks[0].timeout]),
        );

        assert.deepEqual(flat.sort(), [
            ['AfterTool', 'write_file|replace', 'format-on-edit', 30000],
            ['BeforeTool', 'run_shell_command', 'block-dangerous-shell', 10000],
            ['BeforeTool', 'write_file|replace', 'protect-generated-and-secret-files', 10000],
            ['SessionStart', 'startup', 'session-start-bootstrap', 300000],
        ]);

        const bootstrap = settings.hooks.SessionStart[0].hooks[0].command;
        assert.ok(bootstrap.includes("BLIT_PM_INSTALL='pnpm install'"), 'template vars are rendered');
    });

    it('ships every script a hook runs, plus guard-core, and nothing Cursor- or Claude-only', () => {
        const scripts = files.filter((f) => f.path.startsWith('.gemini/hooks/')).map((f) => f.path.split('/').pop());

        assert.deepEqual(scripts.sort(), [
            'format-file.cjs',
            'guard-core.cjs',
            'protect-files.cjs',
            'session-start.sh',
            'shell-guard.cjs',
        ]);

        for (const { path } of files) {
            assert.equal(classifyFile(path), 'kit-owned', path);
        }
    });
});

describe('shell-guard.cjs', () => {
    const command = (text) => ({ tool_name: 'run_shell_command', tool_input: { command: text } });

    it('allows an ordinary command', () => {
        assert.equal(run('shell-guard.cjs', command('git status')).status, 0);
    });

    it('blocks a hard reset with exit 2 and a reason on stderr', () => {
        const result = run('shell-guard.cjs', command(['git', 'reset', '--hard'].join(' ')));

        assert.equal(result.status, 2);
        assert.match(result.stderr, /\[BLOCKED\]/);
    });

    it('blocks the confirm tier too, since Gemini has no ask answer', () => {
        assert.equal(run('shell-guard.cjs', command('git push --force')).status, 2);
    });

    it('fails closed on a payload it cannot read or one without a command', () => {
        assert.equal(run('shell-guard.cjs', 'not json').status, 2);
        assert.equal(run('shell-guard.cjs', '[]').status, 2);
        assert.equal(run('shell-guard.cjs', { tool_input: {} }).status, 2);
    });
});

describe('protect-files.cjs under Gemini', () => {
    const edit = (file) => ({ tool_name: 'write_file', tool_input: { file_path: file } });

    it('blocks a lock file and a .env file with exit 2', () => {
        assert.equal(run('protect-files.cjs', edit('/game/pnpm-lock.yaml')).status, 2);
        assert.equal(run('protect-files.cjs', edit('/game/.env')).status, 2);
    });

    it('allows an ordinary edit and fails closed on garbage', () => {
        assert.equal(run('protect-files.cjs', edit('/game/src/game.js')).status, 0);
        assert.equal(run('protect-files.cjs', 'not json').status, 2);
    });
});
