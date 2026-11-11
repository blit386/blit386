import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deadAnchors, isIgnoredFile, normalizeRelSep } from './check-markdown-links.mjs';

// ROOT as computed by check-markdown-links.mjs: resolve(dirname(scriptUrl), '..')
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('isIgnoredFile', () => {
    test('ignores a file inside a website content/docs section directory', () => {
        const path = join(ROOT, 'packages', 'website', 'content', 'docs', 'api', 'renderer', 'index.mdx');
        assert.equal(isIgnoredFile(path), true);
    });

    test('ignores a deeply nested file under a section', () => {
        const path = join(ROOT, 'packages', 'website', 'content', 'docs', 'guide', 'getting-started', 'index.mdx');
        assert.equal(isIgnoredFile(path), true);
    });

    test('does not ignore content/docs/index.mdx (hand-authored hub page)', () => {
        const path = join(ROOT, 'packages', 'website', 'content', 'docs', 'index.mdx');
        assert.equal(isIgnoredFile(path), false);
    });

    test('does not ignore content/docs/meta.json (root meta file)', () => {
        const path = join(ROOT, 'packages', 'website', 'content', 'docs', 'meta.json');
        assert.equal(isIgnoredFile(path), false);
    });

    test('does not ignore files outside content/docs', () => {
        const path = join(ROOT, 'packages', 'website', 'content', 'guide', 'index.mdx');
        assert.equal(isIgnoredFile(path), false);
    });

    test('does not ignore README.md at the repo root', () => {
        const path = join(ROOT, 'README.md');
        assert.equal(isIgnoredFile(path), false);
    });

    test('handles Windows-style backslash normalization', () => {
        // On Windows, path.relative() returns backslash-separated paths;
        // isIgnoredFile delegates to normalizeRelSep before matching.
        // path.relative() never produces backslashes on POSIX, so we test
        // normalizeRelSep directly - the helper that isIgnoredFile calls.
        const windowsRel = 'packages\\website\\content\\docs\\api\\renderer\\index.mdx';
        assert.equal(normalizeRelSep(windowsRel), 'packages/website/content/docs/api/renderer/index.mdx');
    });
});

describe('deadAnchors', () => {
    /** @param {(dir: string) => void} body */
    const inTempDir = (body) => {
        const dir = mkdtempSync(join(tmpdir(), 'docs-links-anchors-'));

        try {
            body(dir);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    };

    test('reports a missing in-page anchor and passes a real one', () => {
        inTempDir((dir) => {
            const page = join(dir, 'page.md');
            const source = '# Page\n\n## Real heading\n\n[ok](#real-heading) and [bad](#nope)\n';

            writeFileSync(page, source);

            assert.deepEqual(deadAnchors(page, source), ['#nope']);
        });
    });

    test('resolves other.md#frag against the target file headings', () => {
        inTempDir((dir) => {
            const page = join(dir, 'page.md');
            const source = '[ok](other.md#usage) [bad](./other.md#nope) [encoded](other.md#usage%2D1) [stray](#100%)\n';

            writeFileSync(join(dir, 'other.md'), '# Other\n\n## Usage\n\n## Usage\n');
            writeFileSync(page, source);

            assert.deepEqual(deadAnchors(page, source), ['./other.md#nope', '#100%']);
        });
    });

    test('checks reference definitions too', () => {
        inTempDir((dir) => {
            const page = join(dir, 'page.md');
            const source = '# Page\n\nSee [the page][ref].\n\n[ref]: #missing\n';

            writeFileSync(page, source);

            assert.deepEqual(deadAnchors(page, source), ['#missing']);
        });
    });

    test('skips code, external URLs, site routes, missing files and non-markdown targets', () => {
        inTempDir((dir) => {
            const page = join(dir, 'page.md');
            const source = [
                '# Page',
                '',
                '```md',
                '[fenced](#fenced)',
                '```',
                '',
                'Inline `[code](#code)` span.',
                '[external](https://example.com/page#frag)',
                '[route](/docs/api/core#frag)',
                '[missing](missing.md#frag)',
                '[script](tool.mjs#L10)',
            ].join('\n');

            writeFileSync(page, source);

            assert.deepEqual(deadAnchors(page, source), []);
        });
    });
});
