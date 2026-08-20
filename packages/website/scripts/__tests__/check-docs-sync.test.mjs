import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitEnv } from '../git-env.mjs';

const { classifyDocsDiff, findUntrackedGeneratedPages, listUntrackedDocsFiles } = await import(
    '../check-docs-sync.mjs'
);

const FILE_HEADER = [
    'diff --git a/packages/website/content/docs/guides/splash.mdx b/packages/website/content/docs/guides/splash.mdx',
    'index fb5235d2..f0ab1f8e 100644',
    '--- a/packages/website/content/docs/guides/splash.mdx',
    '+++ b/packages/website/content/docs/guides/splash.mdx',
].join('\n');

describe('classifyDocsDiff', () => {
    test('returns clean for an empty diff', () => {
        assert.equal(classifyDocsDiff(''), 'clean');
    });

    test('returns clean for a diff that is only whitespace', () => {
        assert.equal(classifyDocsDiff('\n  \n'), 'clean');
    });

    test('returns lastModifiedOnly when every changed line is a lastModified value', () => {
        const diff = [
            FILE_HEADER,
            '@@ -3,7 +3,7 @@',
            ' title: "The BLIT386 Splash"',
            '-lastModified: "2026-08-06T19:00:45+02:00"',
            '+lastModified: "2026-08-06T19:21:58+02:00"',
            ' editUrl: "https://github.com/blit386/blit386/blob/main/docs/guide-splash.md"',
        ].join('\n');

        assert.equal(classifyDocsDiff(diff), 'lastModifiedOnly');
    });

    test('returns lastModifiedOnly across multiple changed files', () => {
        const diff = [
            FILE_HEADER,
            '@@ -3,7 +3,7 @@',
            '-lastModified: "2026-08-06T19:00:45+02:00"',
            '+lastModified: "2026-08-06T19:21:58+02:00"',
            FILE_HEADER,
            '@@ -3,7 +3,7 @@',
            '-lastModified: "2026-08-06T19:00:45+02:00"',
            '+lastModified: "2026-08-06T20:02:11+02:00"',
        ].join('\n');

        assert.equal(classifyDocsDiff(diff), 'lastModifiedOnly');
    });

    test('returns drift when body content changed alongside lastModified', () => {
        const diff = [
            FILE_HEADER,
            '@@ -3,9 +3,9 @@',
            '-lastModified: "2026-08-06T19:00:45+02:00"',
            '+lastModified: "2026-08-06T19:21:58+02:00"',
            ' ---',
            '-The splash palette is spaced evenly.',
            '+The splash palette is spaced evenly in encoded sRGB.',
        ].join('\n');

        assert.equal(classifyDocsDiff(diff), 'drift');
    });

    test('returns drift when only non-lastModified content changed', () => {
        const diff = [FILE_HEADER, '@@ -10,1 +10,1 @@', '-old body text', '+new body text'].join('\n');

        assert.equal(classifyDocsDiff(diff), 'drift');
    });

    test('returns drift for a brand-new page (title and body differ, not just lastModified)', () => {
        const diff = [
            'diff --git a/packages/website/content/docs/guides/new-page.mdx b/packages/website/content/docs/guides/new-page.mdx',
            'new file mode 100644',
            'index 00000000..abcdef01',
            '--- /dev/null',
            '+++ b/packages/website/content/docs/guides/new-page.mdx',
            '@@ -0,0 +1,5 @@',
            '+title: "New Page"',
            '+lastModified: "2026-08-06T19:21:58+02:00"',
            '+Some new body text.',
        ].join('\n');

        assert.equal(classifyDocsDiff(diff), 'drift');
    });

    test('does not mistake a removed frontmatter delimiter line for a diff file header', () => {
        // A removed "---" content line renders as "----" (the diff marker plus the
        // three literal dashes), which must NOT be swallowed by the `--- ` /
        // `+++ ` file-header exclusion – only real header lines carry the trailing
        // space before the path.
        const diff = [FILE_HEADER, '@@ -1,3 +1,2 @@', '-title: "Page"', '----'].join('\n');

        assert.equal(classifyDocsDiff(diff), 'drift');
    });

    test('returns drift for a rename-only diff with no content lines at all', () => {
        // A pure rename (no content change) has no `---`/`+++`/`@@` lines, so the
        // old, unguarded `[].every(...)` on an empty changed-lines array was
        // vacuously true and misclassified this as lastModifiedOnly.
        const diff = [
            'diff --git a/packages/website/content/docs/guides/old-name.mdx b/packages/website/content/docs/guides/new-name.mdx',
            'similarity index 100%',
            'rename from packages/website/content/docs/guides/old-name.mdx',
            'rename to packages/website/content/docs/guides/new-name.mdx',
        ].join('\n');

        assert.equal(classifyDocsDiff(diff), 'drift');
    });

    test('returns drift for a body addition that happens to start with "lastModified:"', () => {
        // A code example demonstrating frontmatter, deep in the body, must not be
        // trusted just because the added line is lexically shaped like the real
        // field – only a hunk starting near the file's top counts as frontmatter.
        const diff = [
            FILE_HEADER,
            '@@ -42,3 +42,4 @@',
            ' Example frontmatter shape:',
            ' ```yaml',
            '+lastModified: "2026-01-01T00:00:00Z"',
            ' ```',
        ].join('\n');

        assert.equal(classifyDocsDiff(diff), 'drift');
    });
});

describe('findUntrackedGeneratedPages', () => {
    const PAGES = [
        { src: 'guide-splash.md', path: 'guides/splash', description: 'The splash screen.' },
        { src: 'guide-new-page.md', path: 'guides/new-page', description: 'A brand-new guide.' },
    ];

    test('flags an untracked file whose path matches a newly published sitemap page', () => {
        const untrackedFiles = ['content/docs/guides/new-page.mdx'];

        assert.deepEqual(findUntrackedGeneratedPages(untrackedFiles, PAGES), ['content/docs/guides/new-page.mdx']);
    });

    test('ignores an untracked file under content/docs that matches no sitemap page', () => {
        // A hand-authored draft (e.g. a new content/docs/faq.mdx in progress) is not a
        // generated page, so it must not be reported by this check.
        const untrackedFiles = ['content/docs/faq.mdx'];

        assert.deepEqual(findUntrackedGeneratedPages(untrackedFiles, PAGES), []);
    });

    test('returns an empty list when there are no untracked files', () => {
        assert.deepEqual(findUntrackedGeneratedPages([], PAGES), []);
    });

    test('flags only the untracked files that match, leaving unrelated ones out', () => {
        const untrackedFiles = ['content/docs/guides/new-page.mdx', 'content/docs/faq.mdx'];

        assert.deepEqual(findUntrackedGeneratedPages(untrackedFiles, PAGES), ['content/docs/guides/new-page.mdx']);
    });
});

describe('listUntrackedDocsFiles', () => {
    /** @type {string} */
    let repoDir;

    after(() => {
        rmSync(repoDir, { recursive: true, force: true });
    });

    test('lists an untracked generated page under content/docs, excluding tracked files', () => {
        repoDir = mkdtempSync(join(tmpdir(), 'check-docs-sync-untracked-'));
        const env = gitEnv({ GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com' });
        /** @type {(args: string[]) => string} */
        const run = (args) => execFileSync('git', args, { cwd: repoDir, env, encoding: 'utf8', stdio: 'pipe' });

        run(['init', '--quiet']);
        run(['config', 'user.email', 'test@example.com']);
        run(['config', 'user.name', 'Test']);

        const guidesDir = join(repoDir, 'content', 'docs', 'guides');
        mkdirSync(guidesDir, { recursive: true });
        writeFileSync(join(guidesDir, 'splash.mdx'), '---\ntitle: "The BLIT386 Splash"\n---\n\nBody.\n');
        run(['add', 'content/docs/guides/splash.mdx']);
        run(['commit', '--quiet', '-m', 'initial commit']);

        writeFileSync(join(guidesDir, 'new-page.mdx'), '---\ntitle: "New Page"\n---\n\nBody.\n');

        assert.deepEqual(listUntrackedDocsFiles(repoDir), ['content/docs/guides/new-page.mdx']);
    });
});
