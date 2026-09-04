import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    buildKitBuildCommand,
    getNewestMtimeMs,
    isKitBuilt,
    resolveKitBuildLockDir,
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

    describe('resolveKitBuildLockDir', () => {
        it('points at a repo-root lock directory, outside every package', () => {
            const lockDir = resolveKitBuildLockDir();

            assert.equal(lockDir, resolve(repositoryRoot, '.ensure-kit-built.lock'));
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
});
