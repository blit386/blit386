import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    buildEngineBuildCommand,
    getNewestMtimeMs,
    isEngineBuilt,
    resolveEngineBuildLockDir,
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

    describe('resolveEngineBuildLockDir', () => {
        it('points at a repo-root lock directory, outside every package', () => {
            const lockDir = resolveEngineBuildLockDir();

            assert.equal(lockDir, resolve(repositoryRoot, '.ensure-engine-built.lock'));
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
});
