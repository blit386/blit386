/**
 * The Claude Code and Gemini CLI guard entries fail closed when they cannot run at all (BT-775): with guard-core.cjs
 * missing beside them, and - for Claude Code, whose manifest commands wrap the entry - with no `node` on PATH. Both
 * agents let a call through on any exit code other than 2, so every such failure has to end in exit 2.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { hooksDir, runHook } from './hook-harness.mjs';

const HARD_RESET = ['git', 'reset', '--hard'].join(' ');

describe('a guard entry whose guard-core.cjs will not load', () => {
    const lone = mkdtempSync(join(tmpdir(), 'blit-lone-guard-'));

    after(() => rmSync(lone, { recursive: true, force: true }));

    /** Run `script`, copied alone into a directory without guard-core.cjs, with `input` on stdin. */
    const runAlone = (script, input) => {
        cpSync(join(hooksDir, script), join(lone, script));
        return runHook(join(lone, script), { input });
    };

    it('blocks in both of shell-safety.cjs protocols', () => {
        const result = runAlone('shell-safety.cjs', {
            hook_event_name: 'PreToolUse',
            tool_name: 'Bash',
            tool_input: { command: 'ls' },
        });

        assert.equal(result.status, 2);
        assert.match(result.stderr, /The guard could not run/);
        assert.equal(JSON.parse(result.stdout).permission, 'deny');
    });

    it('blocks in protect-files.cjs and shell-guard.cjs', () => {
        for (const [script, input] of [
            ['protect-files.cjs', { tool_input: { file_path: 'src/game.js' } }],
            ['shell-guard.cjs', { tool_input: { command: 'ls' } }],
        ]) {
            const result = runAlone(script, input);

            assert.equal(result.status, 2, script);
            assert.match(result.stderr, /\[BLOCKED\] The guard could not run/, script);
        }
    });
});

describe("the manifest's Claude Code guard commands", () => {
    const manifest = JSON.parse(readFileSync(join(hooksDir, '..', 'hooks.manifest.json'), 'utf8'));
    const commandFor = (id) => manifest.hooks.find((hook) => hook.id === id).claude.command;
    const shellCommand = commandFor('block-dangerous-shell');
    const filesCommand = commandFor('protect-generated-and-secret-files');

    const root = mkdtempSync(join(tmpdir(), 'blit-claude-guard-'));
    // A PATH with `sh` and nothing else: the shell Claude Code starts is there, `node` is not.
    const shOnlyBin = join(root, 'sh-only-bin');

    mkdirSync(join(root, '.claude', 'hooks'), { recursive: true });
    for (const script of ['shell-safety.cjs', 'protect-files.cjs', 'guard-core.cjs']) {
        cpSync(join(hooksDir, script), join(root, '.claude', 'hooks', script));
    }
    mkdirSync(shOnlyBin);
    symlinkSync('/bin/sh', join(shOnlyBin, 'sh'));

    after(() => rmSync(root, { recursive: true, force: true }));

    /** Run one settings.json command through `sh -c`, as Claude Code does, with `CLAUDE_PROJECT_DIR` set. */
    const run = (command, input, path = process.env.PATH) =>
        spawnSync('/bin/sh', ['-c', command], {
            env: { ...process.env, PATH: path, CLAUDE_PROJECT_DIR: root },
            input: JSON.stringify(input),
            encoding: 'utf8',
        });
    const bash = (command) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
    const write = (file) => ({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: file } });

    it('pass the guard verdicts through unchanged', () => {
        assert.equal(run(shellCommand, bash(HARD_RESET)).status, 2);
        assert.equal(run(shellCommand, bash('ls')).status, 0);
        assert.equal(run(filesCommand, write(join(root, '.env'))).status, 2);
        assert.equal(run(filesCommand, write(join(root, 'src', 'game.js'))).status, 0);

        const ask = run(shellCommand, bash('git push --force'));
        assert.equal(ask.status, 0);
        assert.equal(JSON.parse(ask.stdout).hookSpecificOutput.permissionDecision, 'ask');
    });

    it('still block, with a message, when node cannot be found', () => {
        for (const command of [shellCommand, filesCommand]) {
            const result = run(command, bash('ls'), shOnlyBin);

            assert.equal(result.status, 2, command);
            assert.match(result.stderr, /\[BLOCKED\] The blit386 guard could not run/, command);
        }
    });
});
