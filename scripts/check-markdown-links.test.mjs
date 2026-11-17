import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deadAnchors, deadLinks, isIgnoredFile, normalizeRelSep } from './check-markdown-links.mjs';

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

describe('deadLinks', () => {
    const registries = {
        docsPaths: new Set(['api/core', 'faq']),
        docsAnchors: new Map([['api/core', new Set(['bootstrap'])]]),
        sitePages: new Set(['', 'community', 'blog/hello-world']),
        demoSlugs: new Set(['basics', 'shots']),
        trackedPaths: new Set(['other.md', 'packages', 'packages/demos', 'packages/demos/README.md']),
    };

    /**
     * @param {string} source
     * @param {{ inSiteContent?: boolean }} [options] Whether the page sits under the website's content dir.
     * @returns {string[]} The dead targets `deadLinks` reports for `source`.
     */
    const deadTargetsIn = (source, { inSiteContent = true } = {}) => {
        const dir = mkdtempSync(join(tmpdir(), 'docs-links-targets-'));

        try {
            const page = join(dir, 'page.md');
            const siteContentDir = inSiteContent ? dir : join(dir, 'elsewhere');

            writeFileSync(join(dir, 'other.md'), '# Other\n');
            writeFileSync(page, source);

            return deadLinks(page, source, { ...registries, root: dir, siteContentDir }).map(({ target }) => target);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    };

    test('reports a missing relative file and passes an existing one', () => {
        assert.deepEqual(deadTargetsIn('[ok](./other.md) [ok](other.md#x) [bad](missing.md)\n'), ['missing.md']);
    });

    test('reports a file that is on disk but not tracked, or tracked under another case', () => {
        // page.md is written next to other.md but is not in trackedPaths.
        assert.deepEqual(deadTargetsIn('[untracked](page.md) [case](OTHER.md)\n'), ['page.md', 'OTHER.md']);
    });

    test('reports a docs path missing from the sitemap and passes a real one', () => {
        const source = [
            '[ok](/docs/api/core#bootstrap)',
            '[ok](https://blit386.dev/docs/faq)',
            '[bad](/docs/api/nope)',
            '[bad](https://blit386.dev/docs/guides/gone)',
            '[bad anchor](/docs/api/core#nope)',
        ].join('\n');

        assert.deepEqual(deadTargetsIn(source), [
            '/docs/api/nope',
            'https://blit386.dev/docs/guides/gone',
            '/docs/api/core#nope',
        ]);
    });

    test('reports a site route with no content page and passes a real one', () => {
        assert.deepEqual(deadTargetsIn('[ok](/community) [ok](https://blit386.dev/) [bad](/gone)\n'), ['/gone']);
    });

    test('reports a dead demo slug and passes a demo or an allowlisted page', () => {
        const source =
            '[ok](https://demos.blit386.dev/basics) [ok](https://demos.blit386.dev/shots) [bad](https://demos.blit386.dev/retired)\n';

        assert.deepEqual(deadTargetsIn(source), ['https://demos.blit386.dev/retired']);
    });

    test('reports a dead GitHub blob or tree path and passes a tracked one', () => {
        const base = 'https://github.com/blit386/blit386';
        const source = [
            `[ok](${base}/blob/main/packages/demos/README.md#L3)`,
            `[ok](${base}/tree/main/packages/demos)`,
            `[bad](${base}/blob/main/packages/demos/GONE.md)`,
        ].join('\n');

        assert.deepEqual(deadTargetsIn(source), [`${base}/blob/main/packages/demos/GONE.md`]);
    });

    test('never checks a third-party URL, an issue link or mailto', () => {
        const source = [
            '[x](https://example.invalid/never-fetched)',
            '[x](https://github.com/blit386/blit386/issues/999999)',
            '[x](https://github.com/someone/else/blob/main/gone.md)',
            '[x](mailto:nobody@example.invalid)',
        ].join('\n');

        assert.deepEqual(deadTargetsIn(source), []);
    });

    test('reports a root-relative route outside the website content and passes an absolute URL', () => {
        const source = '[bad](/community) [ok](https://blit386.dev/community)\n';

        assert.deepEqual(deadTargetsIn(source, { inSiteContent: false }), ['/community']);
    });

    test('reports a relative link into the generated docs mirror', () => {
        const dir = mkdtempSync(join(tmpdir(), 'docs-links-mirror-'));

        try {
            const page = join(dir, 'page.md');
            const mirror = join(ROOT, 'packages', 'website', 'content', 'docs', 'api', 'core.mdx');
            const source = `[mirror](${relative(dir, mirror)})\n`;

            writeFileSync(page, source);

            assert.equal(deadLinks(page, source, { ...registries, root: ROOT, siteContentDir: dir }).length, 1);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
