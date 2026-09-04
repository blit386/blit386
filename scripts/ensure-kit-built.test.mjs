import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    acquireLockOrConfirmBuilt,
    buildKitBuildCommand,
    getNewestMtimeMs,
    isKitBuilt,
    releaseKitBuildLock,
    resolveKitRegistryEntry,
    resolveKitSourceDir,
} from './ensure-kit-built.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

describe('ensure-kit-built', () => {
    describe('resolveKitRegistryEntry', () => {
        it('points at packages/kit/dist/migrations/registry.js', () => {
            const entry = resolveKitRegistryEntry();

            assert.ok(entry.endsWith(join('kit', 'dist', 'migrations', 'registry.js')));
            assert.ok(entry.includes(join('packages', 'kit')));
        });
    });

    describe('isKitBuilt', () => {
        const fakeEntry = '/fake/packages/kit/dist/migrations/registry.js';
        const fakeSourceDir = '/fake/packages/kit/src';

        it('is true when the registry entry file exists and is at least as new as the source', () => {
            assert.equal(
                isKitBuilt(
                    fakeEntry,
                    fakeSourceDir,
                    () => true,
                    () => 200,
                    () => 100,
                ),
                true,
            );
        });

        it('is false when the registry entry file is missing', () => {
            assert.equal(
                isKitBuilt(
                    fakeEntry,
                    fakeSourceDir,
                    () => false,
                    () => 200,
                    () => 100,
                ),
                false,
            );
        });

        it('is false when the registry entry file is older than the source – stale dist', () => {
            assert.equal(
                isKitBuilt(
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
        it('returns the mtime of the kit source tree as a positive number', () => {
            const mtimeMs = getNewestMtimeMs(resolveKitSourceDir());

            assert.ok(mtimeMs > 0);
        });
    });

    describe('buildKitBuildCommand', () => {
        it('runs the kit build through pnpm --filter, no shell', () => {
            const { command, args, cwd } = buildKitBuildCommand();

            assert.equal(command, 'pnpm');
            assert.deepEqual(args, ['--filter', '@blit386/kit', 'run', 'build']);
            assert.equal(cwd, repositoryRoot);
        });
    });

    describe('acquireLockOrConfirmBuilt', () => {
        const makeLockDir = () => join(mkdtempSync(join(tmpdir(), 'ensure-kit-lock-')), 'lock');

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

        it('returns false without a build once the kit is already built', () => {
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
                    releaseKitBuildLock(lockDir);
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
