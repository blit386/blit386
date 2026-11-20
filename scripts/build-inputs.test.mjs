import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { getSourceMtimeMs, isBuilt } from './build-lock.mjs';
import { resolveEngineBuildInputs } from './ensure-engine-built.mjs';
import { resolveKitBuildInputs } from './ensure-kit-built.mjs';

const at = (path, seconds) => utimesSync(path, seconds, seconds);

describe('isBuilt with several freshness sources', () => {
    const withFixture = (run) => {
        const root = mkdtempSync(join(tmpdir(), 'build-inputs-'));

        try {
            mkdirSync(join(root, 'src'));
            writeFileSync(join(root, 'src', 'a.ts'), '');
            writeFileSync(join(root, 'config.ts'), '');
            writeFileSync(join(root, 'dist.js'), '');
            run(root);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    };

    it('is stale when a config file is newer than dist', () => {
        withFixture((root) => {
            at(join(root, 'src', 'a.ts'), 100);
            at(join(root, 'dist.js'), 200);
            at(join(root, 'config.ts'), 300);

            assert.equal(isBuilt(join(root, 'dist.js'), [join(root, 'src'), join(root, 'config.ts')]), false);
        });
    });

    it('is fresh when src and config are both older than dist', () => {
        withFixture((root) => {
            at(join(root, 'src', 'a.ts'), 100);
            at(join(root, 'config.ts'), 150);
            at(join(root, 'dist.js'), 200);

            assert.equal(isBuilt(join(root, 'dist.js'), [join(root, 'src'), join(root, 'config.ts')]), true);
        });
    });

    it('does not crash on a config file that does not exist', () => {
        withFixture((root) => {
            at(join(root, 'src', 'a.ts'), 100);
            at(join(root, 'dist.js'), 200);

            assert.equal(getSourceMtimeMs(join(root, 'missing.ts')), 0);
            assert.equal(isBuilt(join(root, 'dist.js'), [join(root, 'src'), join(root, 'missing.ts')]), true);
        });
    });
});

describe('package build inputs', () => {
    it('list each package config beside its src tree', () => {
        const tails = (paths) => paths.map((path) => path.split('/packages/')[1]);

        assert.deepEqual(tails(resolveEngineBuildInputs()), [
            'blit386/src',
            'blit386/vite.config.ts',
            'blit386/vite.node.config.ts',
            'blit386/package.json',
            'blit386/tsconfig.json',
        ]);
        assert.deepEqual(tails(resolveKitBuildInputs()), [
            'kit/src',
            'kit/tsup.config.ts',
            'kit/package.json',
            'kit/tsconfig.json',
        ]);
    });
});
