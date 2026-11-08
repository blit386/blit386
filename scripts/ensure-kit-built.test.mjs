import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    buildKitBuildCommand,
    ensureKitBuilt,
    getNewestMtimeMs,
    isKitBuilt,
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

        it('is false when the registry entry file is older than the source - stale dist', () => {
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

    describe('ensureKitBuilt', () => {
        const makeSeams = ({ builtStates, status = 0 }) => {
            const calls = { spawn: [], exit: [], error: [] };
            const states = [...builtStates];

            return {
                calls,
                seams: {
                    built: () => states.shift(),
                    spawn: (...args) => {
                        calls.spawn.push(args);

                        return { status };
                    },
                    exit: (code) => calls.exit.push(code),
                    log: () => {},
                    logError: (message) => calls.error.push(message),
                },
            };
        };

        it('does not spawn when the kit is already built', () => {
            const { calls, seams } = makeSeams({ builtStates: [true] });

            ensureKitBuilt(seams);

            assert.equal(calls.spawn.length, 0);
            assert.deepEqual(calls.exit, []);
        });

        it('spawns the kit build and does not exit when it succeeds', () => {
            const { calls, seams } = makeSeams({ builtStates: [false, true] });

            ensureKitBuilt(seams);

            assert.equal(calls.spawn.length, 1);
            assert.equal(calls.spawn[0][0], 'pnpm');
            assert.deepEqual(calls.exit, []);
        });

        it('exits with the build status when the build fails', () => {
            const { calls, seams } = makeSeams({ builtStates: [false, false], status: 3 });

            ensureKitBuilt(seams);

            assert.deepEqual(calls.exit, [3]);
            assert.equal(calls.error.length, 1);
        });

        it('exits 1 when the build succeeds but the kit is still not built', () => {
            const { calls, seams } = makeSeams({ builtStates: [false, false], status: 0 });

            ensureKitBuilt(seams);

            assert.deepEqual(calls.exit, [1]);
        });
    });
});
