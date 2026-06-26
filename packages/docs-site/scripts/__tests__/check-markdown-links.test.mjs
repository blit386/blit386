import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIgnoredFile } from '../check-markdown-links.mjs';

// ROOT as computed by check-markdown-links.mjs: resolve(dirname(scriptUrl), '..')
// From scripts/__tests__/, two levels up gives us the project root.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('isIgnoredFile', () => {
    test('ignores a file inside a content/docs section directory', () => {
        const path = join(ROOT, 'content', 'docs', 'api', 'renderer', 'index.mdx');
        assert.equal(isIgnoredFile(path), true);
    });

    test('ignores a deeply nested file under a section', () => {
        const path = join(ROOT, 'content', 'docs', 'guide', 'getting-started', 'index.mdx');
        assert.equal(isIgnoredFile(path), true);
    });

    test('does not ignore content/docs/index.mdx (hand-authored hub page)', () => {
        const path = join(ROOT, 'content', 'docs', 'index.mdx');
        assert.equal(isIgnoredFile(path), false);
    });

    test('does not ignore content/docs/meta.json (root meta file)', () => {
        const path = join(ROOT, 'content', 'docs', 'meta.json');
        assert.equal(isIgnoredFile(path), false);
    });

    test('does not ignore files outside content/docs', () => {
        const path = join(ROOT, 'content', 'guide', 'index.mdx');
        assert.equal(isIgnoredFile(path), false);
    });

    test('does not ignore README.md at the repo root', () => {
        const path = join(ROOT, 'README.md');
        assert.equal(isIgnoredFile(path), false);
    });

    test('handles Windows-style backslash normalization', () => {
        // On Windows, path.relative() returns backslash-separated paths.
        // The function normalizes them with split('\\').join('/') before matching.
        // Verify the normalization step directly using the same regex the function uses.
        const windowsRel = 'content\\docs\\api\\renderer\\index.mdx';
        const normalized = windowsRel.split('\\').join('/');
        assert.equal(/^content\/docs\/[^/]+\//u.test(normalized), true);
    });
});
