import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    acquireLockOrConfirmBuilt,
    buildEngineBuildCommand,
    getNewestMtimeMs,
    isEngineBuilt,
    releaseEngineBuildLock,
    resolveEngineSourceDir,
    resolveEngineViteEntry,
} from './ensure-engine-built.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

describe('ensure-engine-built', () => {
    describe('resolveEngineViteEntry', () => {
        it('points at packages/blit386/dist/vite.js', () => {
            const entry = resolveEngineViteEntry();

            assert.ok(entry.endsWith(join('blit386', 'dist', 'vite.js')));
            assert.ok(entry.includes(join('packages', 'blit386')));
        });
    });

    describe('isEngineBuilt', () => {
        const fakeEntry = '/fake/packages/blit386/dist/vite.js';
        const fakeSourceDir = '/fake/packages/blit386/src';

        it('is true when the vite entry file exists and is at least as new as the source', () => {
            assert.equal(
                isEngineBuilt(
                    fakeEntry,
                    fakeSourceDir,
                    () => true,
                    () => 200,
                    () => 100,
                ),
                true,
            );
        });

        it('is false when the vite entry file is missing', () => {
            assert.equal(
                isEngineBuilt(
                    fakeEntry,
                    fakeSourceDir,
                    () => false,
                    () => 200,
                    () => 100,
                ),
                false,
            );
        });

        it('is false when the vite entry file is older than the source – stale dist', () => {
            assert.equal(
                isEngineBuilt(
                    fakeEntry,
                    fakeSourceDir,
                    () => true,
                    () => 100,
                    () => 200,
                ),
                false,
            );
        });
    });

    describe('getNewestMtimeMs', () => {
        it('returns the mtime of the engine source tree as a positive number', () => {
            const mtimeMs = getNewestMtimeMs(resolveEngineSourceDir());

            assert.ok(mtimeMs > 0);
        });
    });

    describe('buildEngineBuildCommand', () => {
        it('runs the engine build through pnpm --filter, no shell', () => {
            const { command, args, cwd } = buildEngineBuildCommand();

            assert.equal(command, 'pnpm');
            assert.deepEqual(args, ['--filter', 'blit386', 'run', 'build']);
            assert.equal(cwd, repositoryRoot);
        });
    });

    describe('acquireLockOrConfirmBuilt', () => {
        const makeLockDir = () => join(mkdtempSync(join(tmpdir(), 'ensure-engine-lock-')), 'lock');

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

        it('returns false without a build once the engine is already built', () => {
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
                    releaseEngineBuildLock(lockDir);
                }
            };

            const acquired = acquireLockOrConfirmBuilt(lockDir, () => false, sleep);

            assert.equal(acquired, true);
            assert.equal(sleepCalls, 1);
            assert.equal(Number(readFileSync(join(lockDir, 'pid'), 'utf8')), process.pid);

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
});
