/**
 * The shell-safety entry (content/hooks/shell-safety.cjs) Claude Code and Cursor both run: every case in the
 * policy table, answered in each agent's own protocol, plus the payload edge cases.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SHELL_CASES } from './shell-cases.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'content', 'hooks', 'shell-safety.cjs');

/**
 * @param {string} payload
 */
function runRaw(payload) {
    return spawnSync(process.execPath, [entry], { input: payload, encoding: 'utf8' });
}

/** What the entry answers a Claude Code PreToolUse Bash payload, read through Claude's protocol. */
function claudeVerdict(command) {
    const result = runRaw(
        JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }),
    );

    if (result.status === 2) {
        assert.ok(result.stderr.trim(), 'a Claude deny needs a reason on stderr');
        return 'deny';
    }

    assert.equal(result.status, 0, result.stderr);

    if (!result.stdout) {
        return 'allow';
    }

    const output = JSON.parse(result.stdout).hookSpecificOutput;
    assert.equal(output.hookEventName, 'PreToolUse');
    assert.ok(output.permissionDecisionReason);

    return output.permissionDecision;
}

/** What the entry answers a Cursor beforeShellExecution payload, read through Cursor's protocol. */
function cursorVerdict(payload) {
    const result = runRaw(payload);
    assert.equal(result.status, 0, result.stderr);

    return JSON.parse(result.stdout);
}

const cursorPayload = (command) => JSON.stringify({ hook_event_name: 'beforeShellExecution', command });

describe('shell-safety entry', () => {
    it('answers every policy case in Claude Code protocol', () => {
        for (const [command, expected] of SHELL_CASES) {
            assert.equal(claudeVerdict(command), expected, JSON.stringify(command));
        }
    });

    it('answers every policy case in Cursor protocol', () => {
        for (const [command, expected] of SHELL_CASES) {
            const answer = cursorVerdict(cursorPayload(command));
            assert.equal(answer.permission, expected, JSON.stringify(command));

            if (expected !== 'allow') {
                assert.ok(answer.user_message && answer.agent_message, 'Cursor deny/ask carries both messages');
            }
        }
    });

    it('reads a Cursor payload prefixed with a UTF-8 BOM', () => {
        assert.equal(cursorVerdict(`﻿${cursorPayload('echo test')}`).permission, 'allow');
        assert.equal(cursorVerdict(`﻿${cursorPayload('git reset --hard')}`).permission, 'deny');
    });

    it('finds a raw_command nested anywhere in the payload', () => {
        const payload = JSON.stringify({
            hook_event_name: 'beforeShellExecution',
            input: [{ raw_command: 'git clean -fd' }],
        });
        assert.equal(cursorVerdict(payload).permission, 'deny');
    });

    it('allows a payload with no command in both protocols', () => {
        assert.equal(cursorVerdict(JSON.stringify({ hook_event_name: 'beforeShellExecution' })).permission, 'allow');

        const claude = runRaw(JSON.stringify({ hook_event_name: 'PreToolUse', tool_input: {} }));
        assert.equal(claude.status, 0);
        assert.equal(claude.stdout, '');
    });

    it('denies an unreadable payload in both protocols', () => {
        for (const payload of ['not-json', '', '[]']) {
            const result = runRaw(payload);
            // Exit 2 is Claude's block; Cursor reads the JSON (and its failClosed blocks on the exit code too).
            assert.equal(result.status, 2, JSON.stringify(payload));
            assert.ok(result.stderr.trim());
            assert.equal(JSON.parse(result.stdout).permission, 'deny');
        }
    });
});
