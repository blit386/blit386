/**
 * The guard core (content/hooks/guard-core.cjs): the pure path and shell classifiers every agent's hook
 * entry shares, and the fail-closed wrapper around them.
 */

import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SHELL_CASES } from './shell-cases.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const hooksDir = join(here, '..', 'content', 'hooks');
const { failClosed, isDangerousCommand, isProtectedPath, parsePayload, patchPaths } = createRequire(import.meta.url)(
    join(hooksDir, 'guard-core.cjs'),
);

describe('isDangerousCommand', () => {
    it('classifies every case in the policy table', () => {
        for (const [command, expected] of SHELL_CASES) {
            assert.equal(isDangerousCommand(command)?.decision ?? 'allow', expected, JSON.stringify(command));
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

describe('patchPaths', () => {
    // Shaped like what Codex's apply_patch tool actually receives (codex-rs/core/assets/tools/apply_patch.lark).
    const PATCH = [
        '*** Begin Patch',
        '*** Add File: src/enemy.js',
        '+export const speed = 2;',
        '+*** Add File: not-a-header.js',
        '*** Update File: src/game.js',
        '*** Move to: src/main.js',
        '@@ function update() {',
        '-    x += 1;',
        '+    x += 2;',
        ' }',
        '*** End of File',
        '*** Delete File: notes.md',
        '*** End Patch',
    ].join('\n');

    it('names every added, updated, moved-to, and deleted file, in order', () => {
        assert.deepEqual(patchPaths(PATCH), ['src/enemy.js', 'src/game.js', 'src/main.js', 'notes.md']);
    });

    it('never reads an added line that looks like a header as one', () => {
        assert.ok(!patchPaths(PATCH).includes('not-a-header.js'));
    });

    it('reads a heredoc-wrapped patch and a shell command carrying one', () => {
        const heredoc = `<<'EOF'\n${PATCH}\nEOF`;
        const command = `cd game && apply_patch <<'EOF'\n${PATCH}\nEOF`;

        assert.deepEqual(patchPaths(heredoc), patchPaths(PATCH));
        assert.deepEqual(patchPaths(command), patchPaths(PATCH));
    });

    it('takes CRLF line ends, indented headers, absolute paths, and an Environment ID line', () => {
        const patch = [
            '*** Begin Patch',
            '*** Environment ID: local',
            '  *** Update File: /home/me/game/pnpm-lock.yaml  ',
            '@@',
            '-a',
            '+b',
            '*** End Patch',
        ].join('\r\n');

        assert.deepEqual(patchPaths(patch), ['/home/me/game/pnpm-lock.yaml']);
    });

    it('finds nothing in text that is not a patch', () => {
        assert.deepEqual(patchPaths(''), []);
        assert.deepEqual(patchPaths('git status'), []);
        assert.deepEqual(patchPaths('*** Begin Patch\n*** End Patch'), []);
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
