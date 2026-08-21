import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildEngineBuildCommand, isEngineBuilt, resolveEngineViteEntry } from './ensure-engine-built.mjs';

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
        it('is true when the vite entry file exists', () => {
            assert.equal(
                isEngineBuilt('/fake/packages/blit386/dist/vite.js', () => true),
                true,
            );
        });

        it('is false when the vite entry file is missing', () => {
            assert.equal(
                isEngineBuilt('/fake/packages/blit386/dist/vite.js', () => false),
                false,
            );
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
