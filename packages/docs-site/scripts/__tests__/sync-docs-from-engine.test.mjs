import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Set ENGINE_DOCS_DIR before the dynamic import so the module-level loadSitemap()
// reads from the fixture instead of the real engine repo.
const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__', 'sync-docs');
process.env.ENGINE_DOCS_DIR = FIXTURE_DIR;

const {
    splitFragment,
    rewriteTarget,
    escapeMdxText,
    transformBody,
    extractTitleAndBody,
    dropDuplicateIntro,
    stripSiteBanner,
    isToolingDirective,
    summarizeComment,
    getLastModified,
    editUrlFor,
    renderPage,
} = await import('../sync-docs-from-engine.mjs');

// Injected site-paths map for rewriteTarget tests; matches what the fixture produces.
const TEST_PATHS = {
    'docs/api/renderer.md': '/docs/api/renderer',
    'docs/guide/getting-started.md': '/docs/guide/getting-started',
};

describe('splitFragment', () => {
    test('returns path and empty fragment when no hash', () => {
        assert.deepEqual(splitFragment('foo/bar.md'), { path: 'foo/bar.md', fragment: '' });
    });

    test('splits on first hash', () => {
        assert.deepEqual(splitFragment('foo/bar.md#section'), { path: 'foo/bar.md', fragment: '#section' });
    });

    test('handles anchor-only link', () => {
        assert.deepEqual(splitFragment('#section'), { path: '', fragment: '#section' });
    });

    test('handles multiple hashes by splitting on first', () => {
        assert.deepEqual(splitFragment('a.md#x#y'), { path: 'a.md', fragment: '#x#y' });
    });
});

describe('rewriteTarget', () => {
    test('passes through https URLs unchanged', () => {
        assert.equal(rewriteTarget('https://example.com', 'docs', TEST_PATHS), 'https://example.com');
    });

    test('passes through http URLs unchanged', () => {
        assert.equal(rewriteTarget('http://example.com', 'docs', TEST_PATHS), 'http://example.com');
    });

    test('passes through mailto: links unchanged', () => {
        assert.equal(rewriteTarget('mailto:foo@example.com', 'docs', TEST_PATHS), 'mailto:foo@example.com');
    });

    test('passes through anchor-only links unchanged', () => {
        assert.equal(rewriteTarget('#section', 'docs', TEST_PATHS), '#section');
    });

    test('rewrites published doc to site-relative path', () => {
        assert.equal(rewriteTarget('renderer.md', 'docs/api', TEST_PATHS), '/docs/api/renderer');
    });

    test('rewrites published doc with fragment', () => {
        assert.equal(rewriteTarget('renderer.md#methods', 'docs/api', TEST_PATHS), '/docs/api/renderer#methods');
    });

    test('rewrites cross-section link via parent traversal', () => {
        assert.equal(
            rewriteTarget('../guide/getting-started.md', 'docs/api', TEST_PATHS),
            '/docs/guide/getting-started',
        );
    });

    test('falls back to GitHub blob URL for unknown file path', () => {
        assert.equal(
            rewriteTarget('unknown.md', 'docs/api', TEST_PATHS),
            'https://github.com/blit386/blit386/blob/main/docs/api/unknown.md',
        );
    });

    test('falls back to GitHub tree URL for extensionless path', () => {
        assert.equal(
            rewriteTarget('some-dir', 'docs', TEST_PATHS),
            'https://github.com/blit386/blit386/tree/main/docs/some-dir',
        );
    });

    test('preserves fragment on GitHub fallback', () => {
        assert.equal(
            rewriteTarget('unknown.md#heading', 'docs', TEST_PATHS),
            'https://github.com/blit386/blit386/blob/main/docs/unknown.md#heading',
        );
    });

    test('trims surrounding whitespace from target', () => {
        assert.equal(rewriteTarget('  https://example.com  ', 'docs', TEST_PATHS), 'https://example.com');
    });
});

describe('escapeMdxText', () => {
    test('escapes < in prose', () => {
        assert.equal(escapeMdxText('value < 50'), 'value &lt; 50');
    });

    test('does not escape < before PascalCase (opening MDX tag)', () => {
        assert.equal(escapeMdxText('<Callout>'), '<Callout>');
    });

    test('does not escape < before slash-PascalCase (closing MDX tag)', () => {
        assert.equal(escapeMdxText('</Callout>'), '</Callout>');
    });

    test('escapes { to &#123;', () => {
        assert.equal(escapeMdxText('{value}'), '&#123;value&#125;');
    });

    test('escapes } to &#125;', () => {
        assert.equal(escapeMdxText('}'), '&#125;');
    });

    test('escapes lowercase HTML-like tags', () => {
        assert.equal(escapeMdxText('<div>'), '&lt;div>');
    });

    test('leaves plain text unchanged', () => {
        assert.equal(escapeMdxText('no special chars'), 'no special chars');
    });
});

describe('transformBody', () => {
    test('passes fenced code blocks through unchanged', () => {
        const input = '```js\nconst x = { a: 1 };\n```';
        const { body } = transformBody(input, 'docs');
        assert.equal(body, input);
    });

    test('rewrites Markdown links to site paths using module-level SITE_PATHS', () => {
        const { body } = transformBody('[Renderer](renderer.md)', 'docs/api');
        assert.ok(body.includes('/docs/api/renderer'));
    });

    test('does not escape braces inside MDX component blocks', () => {
        const input = '<Callout type={{ key: "val" }}>text</Callout>';
        const { body } = transformBody(input, 'docs');
        assert.equal(body, input);
    });

    test('strips HTML comments from prose and collects them', () => {
        const { body, comments } = transformBody('text <!-- a note --> more', 'docs');
        assert.ok(!body.includes('<!-- a note -->'));
        assert.ok(comments.length > 0);
    });

    test('escapes braces in plain prose outside fenced blocks', () => {
        const { body } = transformBody('```\n{ safe }\n```\n\n{escaped}', 'docs');
        assert.ok(body.includes('{ safe }'));
        assert.ok(body.includes('&#123;escaped&#125;'));
    });
});

describe('extractTitleAndBody', () => {
    test('extracts H1 as title and returns remaining body', () => {
        const { title, body } = extractTitleAndBody('# My Title\n\nBody text.', 'test.md');
        assert.equal(title, 'My Title');
        assert.equal(body, 'Body text.');
    });

    test('throws when no H1 is found', () => {
        assert.throws(() => extractTitleAndBody('No heading here.', 'test.md'), /has no H1/u);
    });

    test('strips leading blank lines from body', () => {
        const { body } = extractTitleAndBody('# Title\n\n\nBody.', 'test.md');
        assert.equal(body, 'Body.');
    });

    test('handles H1 that is not on the first line', () => {
        const { title } = extractTitleAndBody('Preamble\n# Late Title\nBody.', 'test.md');
        assert.equal(title, 'Late Title');
    });
});

describe('dropDuplicateIntro', () => {
    test('removes first paragraph when it exactly matches description', () => {
        assert.equal(dropDuplicateIntro('The intro.\n\nMore content.', 'The intro.'), 'More content.');
    });

    test('leaves body unchanged when first paragraph differs from description', () => {
        const body = 'Different intro.\n\nMore content.';
        assert.equal(dropDuplicateIntro(body, 'Not the same.'), body);
    });

    test('returns empty string when entire body matches description', () => {
        assert.equal(dropDuplicateIntro('Only paragraph.', 'Only paragraph.'), '');
    });

    test('trims whitespace before comparing', () => {
        assert.equal(dropDuplicateIntro('  Match  \n\nMore.', 'Match'), 'More.');
    });
});

describe('stripSiteBanner', () => {
    test('removes the blit386.dev banner block', () => {
        const input = 'Before.\n<!-- blit386.dev-banner:start -->\nbanner\n<!-- blit386.dev-banner:end -->\nAfter.';
        const result = stripSiteBanner(input);
        assert.ok(!result.includes('blit386.dev-banner'));
        assert.ok(!result.includes('banner'));
        assert.ok(result.includes('After.'));
    });

    test('leaves content without a banner unchanged', () => {
        const input = 'No banner here.';
        assert.equal(stripSiteBanner(input), input);
    });
});

describe('isToolingDirective', () => {
    test('recognizes cspell directives', () => {
        assert.equal(isToolingDirective('cspell:ignore fooBar'), true);
    });

    test('recognizes prettier-ignore', () => {
        assert.equal(isToolingDirective('prettier-ignore'), true);
    });

    test('recognizes markdownlint directives', () => {
        assert.equal(isToolingDirective('markdownlint-disable MD013'), true);
    });

    test('is case-insensitive', () => {
        assert.equal(isToolingDirective('CSPELL:ignore foo'), true);
    });

    test('returns false for non-directive prose', () => {
        assert.equal(isToolingDirective('This is a real comment.'), false);
    });
});

describe('summarizeComment', () => {
    test('returns short text unchanged', () => {
        assert.equal(summarizeComment('short comment'), 'short comment');
    });

    test('collapses multiple spaces to one', () => {
        assert.equal(summarizeComment('a  b'), 'a b');
    });

    test('trims leading and trailing whitespace', () => {
        assert.equal(summarizeComment('  hello  '), 'hello');
    });

    test('truncates at 120 chars with ellipsis when input exceeds 120 chars', () => {
        const long = 'a'.repeat(121);
        const result = summarizeComment(long);
        assert.equal(result.length, 120);
        assert.ok(result.endsWith('...'));
    });

    test('does not truncate exactly-120-char collapsed strings', () => {
        const exact = 'a'.repeat(120);
        assert.equal(summarizeComment(exact), exact);
    });
});

describe('editUrlFor', () => {
    test('builds a GitHub blob URL under docs/ for the given source', () => {
        assert.equal(editUrlFor('api/core.md'), 'https://github.com/blit386/blit386/blob/main/docs/api/core.md');
    });
});

describe('getLastModified', () => {
    // Real git integration test: init a throwaway repo with one commit (at a fixed
    // author date) under docs/, matching the "docs/<src>" pathspec getLastModified
    // queries, then confirm it reads that date back via `git log`. This exercises
    // the actual command (not a mock) while staying fully deterministic and
    // independent of the real sibling engine repo, which is not checked out when
    // this suite runs in CI.
    const repoRoot = mkdtempSync(join(tmpdir(), 'sync-docs-git-'));
    const fixedDate = '2026-01-15T10:30:00+01:00';

    mkdirSync(join(repoRoot, 'docs'), { recursive: true });
    execFileSync('git', ['init', '--quiet'], { cwd: repoRoot });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoRoot });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repoRoot });
    writeFileSync(join(repoRoot, 'docs', 'placeholder.md'), '# Placeholder\n');
    execFileSync('git', ['add', '-A'], { cwd: repoRoot });
    execFileSync('git', ['commit', '--quiet', '-m', 'initial commit'], {
        cwd: repoRoot,
        env: { ...process.env, GIT_AUTHOR_DATE: fixedDate, GIT_COMMITTER_DATE: fixedDate },
    });

    test('reads the last commit date for a tracked doc path', () => {
        const result = getLastModified('placeholder.md', repoRoot);
        assert.equal(result, fixedDate);
    });

    test('returns undefined when the path has no history in the repo', () => {
        const result = getLastModified('does-not-exist.md', repoRoot);
        assert.equal(result, undefined);
    });

    test('returns undefined when the target is not a git repository', () => {
        const nonRepoDir = mkdtempSync(join(tmpdir(), 'sync-docs-non-git-'));

        try {
            const result = getLastModified('anything.md', nonRepoDir);
            assert.equal(result, undefined);
        } finally {
            rmSync(nonRepoDir, { recursive: true, force: true });
        }
    });

    after(() => {
        rmSync(repoRoot, { recursive: true, force: true });
    });
});

describe('renderPage frontmatter (lastModified, editUrl)', () => {
    const FIXTURE_PAGE = { src: 'api/with-components.md', description: 'Version-history components demo.' };

    test('always includes editUrl pointing at the engine GitHub blob', () => {
        const { contents } = renderPage(FIXTURE_PAGE);
        assert.match(
            contents,
            /editUrl: "https:\/\/github\.com\/blit386\/blit386\/blob\/main\/docs\/api\/with-components\.md"/u,
        );
    });

    test('includes lastModified with the injected date when available', () => {
        const { contents } = renderPage(FIXTURE_PAGE, { lastModifiedFor: () => '2026-02-01T00:00:00Z' });
        assert.match(contents, /lastModified: "2026-02-01T00:00:00Z"/u);
    });

    test('omits lastModified entirely when the lookup returns undefined (e.g. no git history)', () => {
        const { contents } = renderPage(FIXTURE_PAGE, { lastModifiedFor: () => undefined });
        assert.ok(!contents.includes('lastModified:'));
    });

    test('omits lastModified by default against the non-git fixture directory', () => {
        // FIXTURE_DIR (scripts/__fixtures__/sync-docs) is not a git repo, so the real
        // (non-injected) getLastModified must fail closed rather than throw.
        const { contents } = renderPage(FIXTURE_PAGE);
        assert.ok(!contents.includes('lastModified:'));
    });

    test('Since, ApiAvailability, and PageChangelog tags survive verbatim in the generated MDX', () => {
        const { contents } = renderPage(FIXTURE_PAGE);
        assert.ok(contents.includes('<Since symbol="Vector2i" />'));
        assert.ok(contents.includes('<ApiAvailability page="api/core-types" />'));
        assert.ok(contents.includes('<PageChangelog page="api/core-types" />'));
    });
});
