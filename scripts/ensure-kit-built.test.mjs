import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildKitBuildCommand, isKitBuilt, resolveKitRegistryEntry } from './ensure-kit-built.mjs';

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
        it('is true when the registry entry file exists', () => {
            assert.equal(
                isKitBuilt('/fake/packages/kit/dist/migrations/registry.js', () => true),
                true,
            );
        });

        it('is false when the registry entry file is missing', () => {
            assert.equal(
                isKitBuilt('/fake/packages/kit/dist/migrations/registry.js', () => false),
                false,
            );
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
