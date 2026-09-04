import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { acquireLockOrConfirmBuilt, reclaimAbandonedLock, releaseBuildLock } from './build-lock.mjs';

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

        it('never evicts a live lock owner no matter how old the lock directory is', () => {
            const lockDir = makeLockDir();

            assert.equal(
                acquireLockOrConfirmBuilt(lockDir, () => false),
                true,
            );

            // Backdate the lock directory well past LOCK_STALE_MS – staleness alone must never
            // evict a confirmed-alive owner, only a dead pid (or an unreadable one) may.
            const farPast = new Date(Date.now() - 60 * 60 * 1000);
            utimesSync(lockDir, farPast, farPast);

            let sleepCalls = 0;
            const sleep = () => {
                sleepCalls += 1;

                if (sleepCalls === 3) {
                    releaseBuildLock(lockDir);
                }
            };

            const acquired = acquireLockOrConfirmBuilt(lockDir, () => false, sleep);

            assert.equal(acquired, true);
            assert.equal(sleepCalls, 3);
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

    describe('reclaimAbandonedLock', () => {
        it('deletes a lock whose recorded pid is dead', () => {
            const lockDir = makeLockDir();

            assert.equal(
                acquireLockOrConfirmBuilt(lockDir, () => false),
                true,
            );
            writeFileSync(join(lockDir, 'pid'), '999999999');

            reclaimAbandonedLock(lockDir);

            assert.equal(existsSync(lockDir), false);
        });

        it('restores a lock instead of deleting it if its pid turns out to be alive', () => {
            const lockDir = makeLockDir();

            assert.equal(
                acquireLockOrConfirmBuilt(lockDir, () => false),
                true,
            );

            // Simulates a waiter reaching the reclaim step on a lock that has, in truth, already
            // become live again (recreated by another process between the waiter's freshness
            // check and this call) – the exact race a plain rmSync cannot protect against.
            reclaimAbandonedLock(lockDir);

            assert.equal(existsSync(lockDir), true);
            assert.equal(Number(readFileSync(join(lockDir, 'pid'), 'utf8')), process.pid);

            rmSync(lockDir, { recursive: true, force: true });
        });

        it('is a no-op when the lock directory is already gone', () => {
            const lockDir = makeLockDir();

            assert.doesNotThrow(() => reclaimAbandonedLock(lockDir));
            assert.equal(existsSync(lockDir), false);
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
