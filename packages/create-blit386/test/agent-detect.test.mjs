/**
 * How a run without a terminal (an AI agent or CI) picks its assistant files: `detectCallingAgents` reads the agent's
 * environment marker and never fires in CI, and `--agent` names the assistants outright. Requires `pnpm run build`
 * first (imports the built dist modules and spawns the built CLI).
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { detectCallingAgents } from '../dist/env.js';
import { cli } from './helpers.mjs';

/** Every variable `detectCallingAgents` reads (mirrors `AGENT_ENV_MARKERS` in src/env.ts), plus CI - removed so the suite
 * behaves the same inside any agent. */
const DETECTION_VARS = [
    'CI',
    'CLAUDECODE',
    'CURSOR_AGENT',
    'CODEX_THREAD_ID',
    'COPILOT_AGENT',
    'COPILOT_CLI',
    'GEMINI_CLI',
    'OPENCODE',
];

function cleanEnv(extra = {}) {
    const env = { ...process.env, npm_config_user_agent: 'npm/10.9.2 node/v22.18.0 linux x64' };
    for (const name of DETECTION_VARS) {
        delete env[name];
    }
    return { ...env, ...extra };
}

/** Run the CLI with no TTY (piped stdio), offline, and report what landed in the project. */
function runCli(args, env) {
    const work = mkdtempSync(join(tmpdir(), 'cbt-agent-detect-'));

    try {
        const result = spawnSync(process.execPath, [cli, 'game', ...args, '--no-install', '--no-git'], {
            cwd: work,
            encoding: 'utf8',
            env,
            timeout: 30_000,
        });
        const has = (path) => existsSync(join(work, 'game', path));

        return {
            status: result.status,
            output: `${result.stdout}${result.stderr}`,
            claude: has('CLAUDE.md') && has('.mcp.json'),
            cursor: has(join('.cursor', 'mcp.json')),
        };
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
}

test('detectCallingAgents names the assistant from the variable its agent shell sets', () => {
    assert.deepEqual(detectCallingAgents({ CLAUDECODE: '1' }), ['claude']);
    assert.deepEqual(detectCallingAgents({ CURSOR_AGENT: '1' }), ['cursor']);
    assert.deepEqual(detectCallingAgents({ CODEX_THREAD_ID: 'abc' }), ['codex']);
    assert.deepEqual(detectCallingAgents({ COPILOT_AGENT: '1' }), ['copilot']);
    assert.deepEqual(detectCallingAgents({ COPILOT_CLI: '1' }), ['copilot']);
    assert.deepEqual(detectCallingAgents({ GEMINI_CLI: '1' }), ['gemini']);
    assert.deepEqual(detectCallingAgents({ OPENCODE: '1' }), ['opencode']);
});

test('detectCallingAgents returns every match in AGENT_KINDS order, and nothing without a marker', () => {
    assert.deepEqual(detectCallingAgents({ OPENCODE: '1', CLAUDECODE: '1' }), ['claude', 'opencode']);
    assert.deepEqual(detectCallingAgents({}), []);
    assert.deepEqual(detectCallingAgents({ CLAUDECODE: '0', TERM_PROGRAM: 'vscode' }), []);
});

test('detectCallingAgents never fires in CI', () => {
    assert.deepEqual(detectCallingAgents({ CI: 'true', CLAUDECODE: '1', GEMINI_CLI: '1' }), []);
    assert.deepEqual(detectCallingAgents({ CI: '1', CODEX_THREAD_ID: 'abc' }), []);
});

test('without a terminal, the agent found in the environment gets its files and a new-session hint', () => {
    const run = runCli([], cleanEnv({ CLAUDECODE: '1' }));

    assert.equal(run.status, 0, run.output);
    assert.ok(run.claude, 'a Claude Code agent run should write CLAUDE.md and .mcp.json');
    assert.ok(!run.cursor, 'only the detected assistant is set up');
    assert.match(run.output, /found in your environment/);
    assert.match(run.output, /Start a new assistant session \(Claude Code\)/);
});

test('without a terminal in CI, an agent marker writes no assistant files', () => {
    const run = runCli(['--yes'], cleanEnv({ CI: 'true', CLAUDECODE: '1' }));

    assert.equal(run.status, 0, run.output);
    assert.ok(!run.claude && !run.cursor, 'CI must never get assistant files unasked');
});

test('without a terminal and no agent marker, the next steps point at blit agents add', () => {
    const run = runCli([], cleanEnv());

    assert.equal(run.status, 0, run.output);
    assert.ok(!run.claude && !run.cursor);
    assert.match(run.output, /no assistant files \(pass --agent/);
    assert.match(run.output, /npx blit agents add <name>/);
});

test('--agent sets up exactly the named assistants, comma-separated or repeated, even in CI', () => {
    const run = runCli(['--agent', 'claude,cursor'], cleanEnv({ CI: 'true' }));
    assert.equal(run.status, 0, run.output);
    assert.ok(run.claude && run.cursor);

    const repeated = runCli(['--agent', 'cursor', '--agent', 'cursor'], cleanEnv({ CLAUDECODE: '1' }));
    assert.equal(repeated.status, 0, repeated.output);
    assert.ok(repeated.cursor && !repeated.claude, '--agent replaces detection rather than adding to it');
});

test('--agent with an unknown or missing name stops with the list of assistants', () => {
    for (const args of [['--agent', 'bogus'], ['--agent'], ['--agent', '--ts']]) {
        const run = runCli(args, cleanEnv());

        assert.equal(run.status, 1, `${args.join(' ')} should fail`);
        assert.match(run.output, /claude, cursor, antigravity, codex, copilot, gemini, opencode, zed/);
    }
});

test('a forwarded -- before the flags does not turn them into positionals', () => {
    const run = runCli(['--', '--agent', 'cursor'], cleanEnv());

    assert.equal(run.status, 0, run.output);
    assert.ok(run.cursor, '--agent after a forwarded -- is still read as a flag');
});
