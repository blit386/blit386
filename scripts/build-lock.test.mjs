import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { acquireLockOrConfirmBuilt, releaseBuildLock } from './build-lock.mjs';

describe('build-lock', () => {
    const makeLockDir = () => join(mkdtempSync(join(tmpdir(), 'build-lock-')), 'lock');

    describe('acquireLockOrConfirmBuilt', () => {
        it('acquires an uncontended lock and writes its own pid', () => {
            const lockDir = makeLockDir();

            try {
                const acquired = acquireLockOrConfirmBuilt(lockDir, () => false);

                assert.equal(acquired, true);
                assert.equal(existsSync(lockDir), true);
                assert.equal(Number(readFileSync(join(lockDir, 'pid'), 'utf8')), process.pid);
            } finally {
                rmSync(lockDir, { recursive: true, force: true });
            }
        });

        it('returns false without ever touching the lock once the target is already built', () => {
            const lockDir = makeLockDir();

            const acquired = acquireLockOrConfirmBuilt(lockDir, () => true);

            assert.equal(acquired, false);
            assert.equal(existsSync(lockDir), false);
        });

        it('waits out a live-owned lock, then acquires it once released', () => {
            const lockDir = makeLockDir();

            assert.equal(
                acquireLockOrConfirmBuilt(lockDir, () => false),
                true,
            );

            let sleepCalls = 0;
            const sleep = () => {
                sleepCalls += 1;

                if (sleepCalls === 1) {
                    releaseBuildLock(lockDir);
                }
            };

            const acquired = acquireLockOrConfirmBuilt(lockDir, () => false, sleep);

            assert.equal(acquired, true);
            assert.equal(sleepCalls, 1);
            assert.equal(Number(readFileSync(join(lockDir, 'pid'), 'utf8')), process.pid);

            rmSync(lockDir, { recursive: true, force: true });
        });

        it('short-circuits while waiting if another process finishes the build first', () => {
            const lockDir = makeLockDir();

            assert.equal(
                acquireLockOrConfirmBuilt(lockDir, () => false),
                true,
            );

            let checkBuiltCalls = 0;
            const checkBuilt = () => {
                checkBuiltCalls += 1;

                // Already-built as of the second check, simulating the lock owner finishing mid-wait.
                return checkBuiltCalls > 1;
            };

            let sleepCalls = 0;

            const acquired = acquireLockOrConfirmBuilt(lockDir, checkBuilt, () => {
                sleepCalls += 1;
            });

            assert.equal(acquired, false);
            assert.equal(sleepCalls, 1);

            rmSync(lockDir, { recursive: true, force: true });
        });

        it('reclaims a lock left behind by a pid that is no longer running', () => {
            const lockDir = makeLockDir();

            assert.equal(
                acquireLockOrConfirmBuilt(lockDir, () => false),
                true,
            );
            // A pid essentially guaranteed not to be a running process, without relying on any
            // specific pid actually being free on the machine running this test.
            rmSync(join(lockDir, 'pid'), { force: true });
            writeFileSync(join(lockDir, 'pid'), '999999999');

            let sleepCalls = 0;

            const acquired = acquireLockOrConfirmBuilt(
                lockDir,
                () => false,
                () => {
                    sleepCalls += 1;
                },
            );

            assert.equal(acquired, true);
            assert.equal(sleepCalls, 0);

            rmSync(lockDir, { recursive: true, force: true });
        });
    });

    describe('releaseBuildLock', () => {
        it('removes the lock directory entirely', () => {
            const lockDir = makeLockDir();

            acquireLockOrConfirmBuilt(lockDir, () => false);
            assert.equal(existsSync(lockDir), true);

            releaseBuildLock(lockDir);

            assert.equal(existsSync(lockDir), false);
        });

        it('is a no-op when the lock directory does not exist', () => {
            const lockDir = makeLockDir();

            assert.doesNotThrow(() => releaseBuildLock(lockDir));
        });
    });
});
