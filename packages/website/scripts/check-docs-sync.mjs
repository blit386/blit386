#!/usr/bin/env node
// @ts-nocheck
/**
 * Verify the generated docs mirror matches its source.
 *
 * `lastModified` (see `getLastModified` in sync-docs-from-engine.mjs) comes from
 * `git log` on the engine source doc. Squash merging is disabled on this repo
 * (root CLAUDE.md); a PR lands as a merge commit, so the branch's own commits
 * keep their original SHA and author date on `main` rather than being
 * rewritten into one new commit the way a squash would. So a PR that commits
 * an engine-doc edit *before* running `sync:docs`, and regenerates the mirror
 * from that history, embeds a `lastModified` that already matches what
 * `git log` reports once the PR merges – no lag to chase.
 *
 * This script regenerates the mirror and then inspects the diff: a clean diff
 * passes. Any diff at all fails the build, including one confined to the
 * `lastModified` frontmatter field – that shape means the commit order above
 * wasn't followed (the doc edit wasn't committed before `sync:docs` ran), not
 * an unavoidable byproduct of the merge strategy. `classifyDocsDiff` still
 * distinguishes a `lastModified`-only diff from real content drift (title,
 * description, editUrl, body, or a rename) so the failure message can tell the
 * two apart.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { gitEnv } from './git-env.mjs';
import { PAGES } from './sync-docs-from-engine.mjs';

const DIFF_FILE_HEADER_PATTERN = /^(?:\+\+\+ |--- )/u;
const HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/u;
const LAST_MODIFIED_LINE_PATTERN = /^[+-]lastModified: /u;

/**
 * A generated page's frontmatter (see `renderPage` in sync-docs-from-engine.mjs)
 * is always the opening `---`, a two-line banner, up to four fields, and the
 * closing `---` – 8 lines at most. A hunk whose pre-image starts beyond that is
 * necessarily body content, never frontmatter, however its lines read.
 */
const FRONTMATTER_HUNK_START_LIMIT = 8;

/**
 * Classify a `git diff -- content/docs` unified diff: `'clean'` (no diff),
 * `'lastModifiedOnly'` (every changed line is a `lastModified` frontmatter
 * value, and at least one such line exists), or `'drift'` (anything else,
 * including a rename or mode change with no matching content lines). Diff
 * file-header lines (`--- a/...`, `+++ b/...`) are ignored – they always
 * change alongside any edit and carry no content of their own.
 *
 * `lastModified`-shaped text is only trusted inside a hunk that starts within
 * `FRONTMATTER_HUNK_START_LIMIT` of the file's top, so a coincidentally
 * matching line added to prose or a code example – never actually frontmatter
 * – still counts as drift.
 */
const classifyDocsDiff = (diffText) => {
    if (diffText.trim() === '') {
        return 'clean';
    }

    let isFrontmatterHunk = false;
    const changedLines = [];

    for (const line of diffText.split('\n')) {
        const hunkHeader = HUNK_HEADER_PATTERN.exec(line);

        if (hunkHeader) {
            isFrontmatterHunk = Number(hunkHeader[1]) <= FRONTMATTER_HUNK_START_LIMIT;
            continue;
        }

        if (/^[+-]/u.test(line) && !DIFF_FILE_HEADER_PATTERN.test(line)) {
            changedLines.push({ line, isFrontmatterHunk });
        }
    }

    const isSafe =
        changedLines.length > 0 &&
        changedLines.every(({ line, isFrontmatterHunk }) => isFrontmatterHunk && LAST_MODIFIED_LINE_PATTERN.test(line));

    return isSafe ? 'lastModifiedOnly' : 'drift';
};

/**
 * List untracked, non-ignored files under `content/docs`. `git diff` (used above) never reports
 * an untracked path at all, so a brand-new mirror page that `sync:docs` wrote but nobody staged
 * is invisible to `classifyDocsDiff` – this is the other half of what a clean verdict must check.
 */
const listUntrackedDocsFiles = (cwd = process.cwd()) =>
    execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'content/docs'], {
        cwd,
        encoding: 'utf8',
        env: gitEnv(),
    })
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

/**
 * Narrow a list of untracked files to the ones that are actually generated pages, by
 * cross-referencing the sitemap manifest's published-page entries (a page's `path` is already
 * `<section>/<topic>`, and `sync-docs-from-engine.mjs` writes it to `content/docs/<path>.mdx`).
 * An untracked file that matches no sitemap page – a hand-authored draft, for instance – is out
 * of scope for this check and is left out.
 */
const findUntrackedGeneratedPages = (untrackedFiles, pages = PAGES) => {
    const expected = new Set(pages.map((page) => `content/docs/${page.path}.mdx`));

    return untrackedFiles.filter((file) => expected.has(file));
};

const main = () => {
    execFileSync('pnpm', ['run', 'sync:docs'], { stdio: 'inherit' });

    const untrackedGeneratedPages = findUntrackedGeneratedPages(listUntrackedDocsFiles());

    if (untrackedGeneratedPages.length > 0) {
        console.error(
            'Docs mirror has newly generated page(s) missing from the commit (untracked):\n\n' +
                untrackedGeneratedPages.map((file) => `  ${file}`).join('\n') +
                '\n\nThese were just written by `pnpm run sync:docs` from a page added to ' +
                '`packages/blit386/docs/_sitemap.json`. Run `git add` on the file(s) above and commit them.\n',
        );
        process.exitCode = 1;

        return;
    }

    const diff = execFileSync('git', ['diff', '--no-color', '--', 'content/docs'], {
        encoding: 'utf8',
        env: gitEnv(),
    });
    const verdict = classifyDocsDiff(diff);

    if (verdict === 'clean') {
        console.log('Docs mirror matches the engine source.');

        return;
    }

    if (verdict === 'lastModifiedOnly') {
        console.error(
            'Docs mirror lastModified timestamp(s) are stale. This repo lands PRs as merge commits (squash merging ' +
                'is disabled), so a doc edit committed before `pnpm run sync:docs` runs should already embed the ' +
                'right date – this diff means the engine doc edit was not committed before sync:docs ran. Commit the ' +
                'engine doc edit first, then run `pnpm run sync:docs` again and commit the regenerated mirror.\n',
        );
        console.error(diff);
        process.exitCode = 1;

        return;
    }

    console.error(
        'Docs mirror is out of sync with the engine source. Run `pnpm run sync:docs` and commit the result.\n',
    );
    console.error(diff);
    process.exitCode = 1;
};

export { classifyDocsDiff, listUntrackedDocsFiles, findUntrackedGeneratedPages };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
