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
const { failClosed, isDangerousCommand, isProtectedPath, parsePayload } = createRequire(import.meta.url)(
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
