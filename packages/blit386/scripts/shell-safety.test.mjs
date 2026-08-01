/**
 * Regression tests for the monorepo-wide Claude Code shell-safety hook (root .claude/hooks/shell-safety.sh –
 * one copy for every package since BT-404).
 *
 * Feeds a Bash-tool-shaped JSON payload on stdin, the same way Claude Code invokes the hook, and asserts
 * on the exit code / stdout / stderr the hook produces.
 */

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const hookPath = join(here, '..', '..', '..', '.claude', 'hooks', 'shell-safety.sh');

/**
 * @param {string} command The raw shell command text to run the hook against.
 * @returns {{ status: number, stdout: string, stderr: string }} The hook's exit code and output streams.
 */
function runHook(command) {
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });

    try {
        const stdout = execFileSync('sh', [hookPath], { input: payload, encoding: 'utf8' });
        return { status: 0, stdout, stderr: '' };
    } catch (error) {
        return { status: error.status, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
    }
}

describe('destructive command detection', () => {
    it('blocks a plain reset --hard', () => {
        const result = runHook('git reset --hard');

        assert.equal(result.status, 2);
        assert.match(result.stderr, /Destructive git command detected/);
    });

    it('blocks a single-quoted reset --hard (quote-based bypass)', () => {
        const result = runHook("git 'reset' --hard");

        assert.equal(result.status, 2);
        assert.match(result.stderr, /Destructive git command detected/);
    });

    it('blocks a double-quoted checkout -- (quote-based bypass)', () => {
        const result = runHook('git checkout "--" .');

        assert.equal(result.status, 2);
        assert.match(result.stderr, /Destructive git command detected/);
    });

    it('blocks a backslash-escaped reset --hard (escape-based bypass)', () => {
        const result = runHook('git \\reset --hard');

        assert.equal(result.status, 2);
        assert.match(result.stderr, /Destructive git command detected/);
    });

    it('allows an unrelated git command', () => {
        const result = runHook('git status');

        assert.equal(result.status, 0);
        assert.equal(result.stdout, '');
    });
});

describe('git clean detection', () => {
    it('blocks a bare -f, which already deletes untracked files', () => {
        const result = runHook('git clean -f');

        assert.equal(result.status, 2);
        assert.match(result.stderr, /Destructive git command detected/);
    });

    it('blocks the long --force spelling', () => {
        const result = runHook('git clean --force');

        assert.equal(result.status, 2);
        assert.match(result.stderr, /Destructive git command detected/);
    });

    it('blocks a bundled -xdf', () => {
        const result = runHook('git clean -xdf');

        assert.equal(result.status, 2);
        assert.match(result.stderr, /Destructive git command detected/);
    });

    it('blocks a force flag in a later argument position', () => {
        const result = runHook('git clean --exclude=build -d -f');

        assert.equal(result.status, 2);
        assert.match(result.stderr, /Destructive git command detected/);
    });

    it('blocks a clean behind a global git option', () => {
        const result = runHook('git -C /tmp/repo clean -fd');

        assert.equal(result.status, 2);
        assert.match(result.stderr, /Destructive git command detected/);
    });

    it('blocks a quoted -f (quote-based bypass)', () => {
        const result = runHook('git clean "-f"');

        assert.equal(result.status, 2);
        assert.match(result.stderr, /Destructive git command detected/);
    });

    it('blocks a clean that turns off requireForce instead of passing -f', () => {
        const result = runHook('git -c clean.requireForce=false clean -d');

        assert.equal(result.status, 2);
        assert.match(result.stderr, /Destructive git command detected/);
    });

    it('blocks any clean that is not a preview, force flag or not', () => {
        const result = runHook('git clean -d');

        assert.equal(result.status, 2);
        assert.match(result.stderr, /Destructive git command detected/);
    });

    it('allows a -n dry run', () => {
        const result = runHook('git clean -n');

        assert.equal(result.status, 0);
        assert.equal(result.stdout, '');
    });

    it('allows a --dry-run preview with an exclude pattern', () => {
        const result = runHook('git clean --dry-run --exclude=dist');

        assert.equal(result.status, 0);
        assert.equal(result.stdout, '');
    });

    it('does not trip on a force flag belonging to a later command', () => {
        const result = runHook('git clean -n && rm -f build.log');

        assert.equal(result.status, 0);
        assert.equal(result.stdout, '');
    });
});

describe('force-push detection', () => {
    it('asks before a short -f push', () => {
        const result = runHook('git push -f origin main');

        assert.equal(result.status, 0);
        const parsed = JSON.parse(result.stdout);

        assert.equal(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
        assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
    });

    it('asks before --force-with-lease', () => {
        const result = runHook('git push --force-with-lease=origin/main:abc123');

        assert.equal(result.status, 0);
        const parsed = JSON.parse(result.stdout);

        assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
    });

    it('asks before a plus-prefixed refspec push', () => {
        const result = runHook('git push origin +main');

        assert.equal(result.status, 0);
        const parsed = JSON.parse(result.stdout);

        assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
    });

    it('asks before a backslash-escaped plus-prefixed refspec push (escape-based bypass)', () => {
        const result = runHook('git push origin \\+main');

        assert.equal(result.status, 0);
        const parsed = JSON.parse(result.stdout);

        assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
    });

    it('does not trip on a branch name that merely contains "force"', () => {
        const result = runHook('git push origin foo-force-branch');

        assert.equal(result.status, 0);
        assert.equal(result.stdout, '');
    });

    it('asks before --force-with-lease chained with a shell separator', () => {
        const result = runHook('git push --force-with-lease;echo done');

        assert.equal(result.status, 0);
        const parsed = JSON.parse(result.stdout);

        assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
    });

    it('asks before --force-with-lease chained with a background-job separator', () => {
        const result = runHook('git push --force-with-lease&echo done');

        assert.equal(result.status, 0);
        const parsed = JSON.parse(result.stdout);

        assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
    });

    it('asks before --force-with-lease chained with a pipe separator', () => {
        const result = runHook('git push --force-with-lease|cat');

        assert.equal(result.status, 0);
        const parsed = JSON.parse(result.stdout);

        assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
    });

    it('asks before a quoted -f push (quote-based bypass)', () => {
        const result = runHook('git push origin main "-f"');

        assert.equal(result.status, 0);
        const parsed = JSON.parse(result.stdout);

        assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
    });

    it('asks before --force followed by an output redirect (redirection-based bypass)', () => {
        const result = runHook('git push --force>/tmp/out');

        assert.equal(result.status, 0);
        const parsed = JSON.parse(result.stdout);

        assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
    });

    it('asks before --force-with-lease followed by an input redirect (redirection-based bypass)', () => {
        const result = runHook('git push --force-with-lease</dev/null');

        assert.equal(result.status, 0);
        const parsed = JSON.parse(result.stdout);

        assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
    });
});
