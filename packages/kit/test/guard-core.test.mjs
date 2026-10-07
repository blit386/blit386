/**
 * The guard core (content/hooks/guard-core.cjs): the pure path and shell classifiers every agent's hook
 * entry shares, and the fail-closed wrapper around them.
 *
 * The shell table runs through both `isDangerousCommand` and shell-safety.sh (which Claude Code and Cursor
 * still run), so the Node port and the script cannot disagree on a case without failing here.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const hooksDir = join(here, '..', 'content', 'hooks');
const { failClosed, isDangerousCommand, isProtectedPath, parsePayload } = createRequire(import.meta.url)(
    join(hooksDir, 'guard-core.cjs'),
);

/** @type {[command: string, expected: 'deny' | 'ask' | 'allow'][]} */
const SHELL_CASES = [
    ['git status', 'allow'],
    ['ls -la && npm run build', 'allow'],
    ['', 'allow'],
    ['git reset --hard', 'deny'],
    ['git reset --hard HEAD~1', 'deny'],
    ["git 'reset' --hard", 'deny'],
    ['git \\reset --hard', 'deny'],
    ['git -C game reset --hard', 'deny'],
    ['git --no-pager reset --hard', 'deny'],
    ['git reset --soft HEAD~1', 'allow'],
    ['git checkout -- src/game.js', 'deny'],
    ['git checkout "--" .', 'deny'],
    ['git checkout -b feature', 'allow'],
    ['git restore src/game.js', 'deny'],
    ['git restore .', 'deny'],
    ['git restore --staged src/game.js', 'allow'],
    ['git restore -S src/game.js', 'allow'],
    ['git restore --staged --worktree src/game.js', 'deny'],
    ['git restore -S -W src/game.js', 'deny'],
    ['git clean', 'deny'],
    ['git clean -fd', 'deny'],
    ['git clean -n', 'allow'],
    ['git clean --dry-run', 'allow'],
    ['git clean -nfd', 'deny'],
    ['git -c clean.requireForce=false clean -d', 'deny'],
    ['git clean -n && rm -f build.log', 'allow'],
    ['git push', 'allow'],
    ['git push origin foo-feature', 'allow'],
    ['git push --force', 'ask'],
    ['git push -f origin main', 'ask'],
    ['git push --force-with-lease=main origin main', 'ask'],
    ['git push origin +main', 'ask'],
    ['git push --force>out.log', 'ask'],
    ['git branch -D old', 'ask'],
    ['git branch -Dq old', 'ask'],
    ['git branch --delete --force old', 'ask'],
    ['git branch -d old', 'allow'],
    ['git branch --delete old', 'allow'],
    ['git stash drop', 'ask'],
    ['git stash clear', 'ask'],
    ['git stash pop', 'allow'],
    ['echo hi\ngit reset --hard', 'deny'],
    ['git clean -fd\ngit clean -n', 'deny'],
    ['git status\ngit push --force', 'ask'],
];

/** What shell-safety.sh answers for a Claude Code PreToolUse Bash payload. */
function scriptVerdict(command) {
    const payload = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
    const result = spawnSync('sh', [join(hooksDir, 'shell-safety.sh')], { input: payload, encoding: 'utf8' });

    if (result.status === 2) {
        return 'deny';
    }

    assert.equal(result.status, 0, `shell-safety.sh failed on ${JSON.stringify(command)}: ${result.stderr}`);

    return result.stdout.includes('"permissionDecision": "ask"') ? 'ask' : 'allow';
}

describe('isDangerousCommand', () => {
    it('classifies every case the same way shell-safety.sh does', () => {
        for (const [command, expected] of SHELL_CASES) {
            assert.equal(
                isDangerousCommand(command)?.decision ?? 'allow',
                expected,
                `core: ${JSON.stringify(command)}`,
            );
            assert.equal(scriptVerdict(command), expected, `shell-safety.sh: ${JSON.stringify(command)}`);
        }
    });

    it('stays fast on a long run of options, so a hook timeout cannot be provoked', () => {
        const started = performance.now();

        isDangerousCommand(`git ${'-c x '.repeat(5000)}y`);
        isDangerousCommand(`git ${'-a  '.repeat(5000)}push`);

        assert.ok(performance.now() - started < 1000, 'classification should not backtrack exponentially');
    });
});

describe('isProtectedPath', () => {
    it('blocks lock files and .env files', () => {
        for (const file of ['pnpm-lock.yaml', '/game/package-lock.json', 'yarn.lock', 'bun.lockb', 'a/.env.local']) {
            assert.ok(isProtectedPath(file)?.message, `${file} should be protected`);
        }
    });

    it('ignores case, because the file systems most people use do', () => {
        for (const file of ['PNPM-LOCK.YAML', 'a/Package-Lock.JSON', 'YARN.LOCK', '.ENV', 'config/.Env.Local']) {
            assert.ok(isProtectedPath(file)?.message, `${file} should be protected`);
        }

        assert.equal(isProtectedPath('.ENV.EXAMPLE'), null, 'the template stays editable in any case');
        assert.match(
            isProtectedPath('PNPM-LOCK.YAML').message,
            /^PNPM-LOCK\.YAML /,
            'the message names the file as written',
        );
    });

    it('lets every other file through', () => {
        for (const file of ['src/game.ts', 'package.json', '.env.example', 'src/lock.ts']) {
            assert.equal(isProtectedPath(file), null, `${file} should be allowed`);
        }
    });
});

describe('parsePayload + failClosed', () => {
    it('parses a JSON object, BOM or not', () => {
        assert.deepEqual(parsePayload('{"a":1}'), { a: 1 });
        assert.deepEqual(parsePayload('﻿{"a":1}'), { a: 1 });
    });

    it('turns an unreadable payload or a thrown error into a deny', () => {
        for (const text of ['not json', 'null', '[]', '"text"', '']) {
            assert.equal(failClosed(() => parsePayload(text)).decision, 'deny', `${JSON.stringify(text)} should deny`);
        }

        assert.equal(
            failClosed(() => {
                throw new Error('boom');
            }).decision,
            'deny',
        );
    });

    it('passes a verdict or null through untouched', () => {
        assert.equal(
            failClosed(() => null),
            null,
        );
        assert.deepEqual(
            failClosed(() => ({ decision: 'ask' })),
            { decision: 'ask' },
        );
    });
});
