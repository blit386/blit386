/**
 * Unit tests for `flattenDemos`, the build step that moves dist/demos/* up to dist/.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { flattenDemos } from '../flatten-demos.js';

describe('flattenDemos', () => {
    let distDir;

    beforeEach(() => {
        distDir = mkdtempSync(join(tmpdir(), 'flatten-demos-'));
    });

    afterEach(() => {
        rmSync(distDir, { recursive: true, force: true });
    });

    it('does nothing when dist/demos is missing', () => {
        assert.doesNotThrow(() => flattenDemos(distDir));
    });

    it('moves pages up, rewrites ../ references, and removes dist/demos', () => {
        mkdirSync(join(distDir, 'demos'));
        writeFileSync(join(distDir, 'demos', 'a.html'), '<script src="../assets/x.js"></script>');
        writeFileSync(join(distDir, 'demos', 'b.txt'), 'plain');

        flattenDemos(distDir);

        assert.equal(readFileSync(join(distDir, 'a.html'), 'utf-8'), '<script src="./assets/x.js"></script>');
        assert.equal(readFileSync(join(distDir, 'b.txt'), 'utf-8'), 'plain');
        assert.ok(!existsSync(join(distDir, 'demos')));
    });

    it('throws on a subdirectory before moving anything', () => {
        mkdirSync(join(distDir, 'demos', 'sub'), { recursive: true });
        writeFileSync(join(distDir, 'demos', 'a.html'), 'x');

        assert.throws(() => flattenDemos(distDir), /unexpected subdirectory in dist\/demos: sub/);
        assert.ok(existsSync(join(distDir, 'demos', 'a.html')));
        assert.ok(!existsSync(join(distDir, 'a.html')));
    });

    it('rethrows read errors other than ENOENT', () => {
        // dist/demos is a file, so readdirSync fails with ENOTDIR.
        writeFileSync(join(distDir, 'demos'), 'not a directory');

        assert.throws(() => flattenDemos(distDir), { code: 'ENOTDIR' });
    });

    it('fails and keeps the source file when a page cannot be written', () => {
        // dist/a.html is a directory, so writing the flattened page fails after the read succeeded.
        mkdirSync(join(distDir, 'a.html'));
        mkdirSync(join(distDir, 'demos'));
        writeFileSync(join(distDir, 'demos', 'a.html'), 'x');

        assert.throws(() => flattenDemos(distDir), { code: 'EISDIR' });
        assert.ok(existsSync(join(distDir, 'demos', 'a.html')));
    });
});
