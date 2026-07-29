/**
 * Regression tests for both shipped shell-safety.sh hooks:
 * - .claude/hooks/shell-safety.sh (this repo's own maintainer hook)
 * - packages/kit/content/hooks/shell-safety.sh (shipped to every scaffolded game)
 *
 * Feeds a Bash-tool-shaped JSON payload on stdin, the same way Claude Code invokes the hook, and asserts
 * on the exit code / stdout / stderr the hook produces. The two hooks share the same detection regexes but
 * use different wording for the destructive-command deny message, so that message is parameterized per hook.
 */

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

/**
 * @param {string} hookPath Absolute path to the shell-safety.sh hook under test.
 * @param {string} command The raw shell command text to run the hook against.
 * @returns {{ status: number, stdout: string, stderr: string }} The hook's exit code and output streams.
 */
function runHook(hookPath, command) {
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });

    try {
        const stdout = execFileSync('sh', [hookPath], { input: payload, encoding: 'utf8' });
        return { status: 0, stdout, stderr: '' };
    } catch (error) {
        return { status: error.status, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
    }
}

const HOOKS = [
    {
        label: 'maintainer hook (.claude/hooks)',
        path: join(repoRoot, '.claude', 'hooks', 'shell-safety.sh'),
        destructiveMessage: /Destructive git command detected/,
    },
    {
        label: 'kit-shipped hook (packages/kit/content/hooks)',
        path: join(repoRoot, 'packages', 'kit', 'content', 'hooks', 'shell-safety.sh'),
        destructiveMessage: /Use safer git operations/,
    },
];

for (const hook of HOOKS) {
    describe(hook.label, () => {
        describe('destructive command detection', () => {
            it('blocks a plain reset --hard', () => {
                const result = runHook(hook.path, 'git reset --hard');

                assert.equal(result.status, 2);
                assert.match(result.stderr, hook.destructiveMessage);
            });

            it('blocks a single-quoted reset --hard (quote-based bypass)', () => {
                const result = runHook(hook.path, "git 'reset' --hard");

                assert.equal(result.status, 2);
                assert.match(result.stderr, hook.destructiveMessage);
            });

            it('blocks a double-quoted checkout -- (quote-based bypass)', () => {
                const result = runHook(hook.path, 'git checkout "--" .');

                assert.equal(result.status, 2);
                assert.match(result.stderr, hook.destructiveMessage);
            });

            it('allows an unrelated git command', () => {
                const result = runHook(hook.path, 'git status');

                assert.equal(result.status, 0);
                assert.equal(result.stdout, '');
            });
        });

        describe('force-push detection', () => {
            it('asks before a short -f push', () => {
                const result = runHook(hook.path, 'git push -f origin main');

                assert.equal(result.status, 0);
                const parsed = JSON.parse(result.stdout);

                assert.equal(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
                assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
            });

            it('asks before --force-with-lease', () => {
                const result = runHook(hook.path, 'git push --force-with-lease=origin/main:abc123');

                assert.equal(result.status, 0);
                const parsed = JSON.parse(result.stdout);

                assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
            });

            it('asks before a plus-prefixed refspec push', () => {
                const result = runHook(hook.path, 'git push origin +main');

                assert.equal(result.status, 0);
                const parsed = JSON.parse(result.stdout);

                assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
            });

            it('does not trip on a branch name that merely contains "force"', () => {
                const result = runHook(hook.path, 'git push origin foo-force-branch');

                assert.equal(result.status, 0);
                assert.equal(result.stdout, '');
            });

            it('asks before --force-with-lease chained with a shell separator', () => {
                const result = runHook(hook.path, 'git push --force-with-lease;echo done');

                assert.equal(result.status, 0);
                const parsed = JSON.parse(result.stdout);

                assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
            });
        });
    });
}
