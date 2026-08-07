#!/usr/bin/env node
// @ts-nocheck
/**
 * Verify the generated docs mirror matches its source, tolerating the
 * one-commit lag inherent to `lastModified`.
 *
 * `lastModified` (see `getLastModified` in sync-docs-from-engine.mjs) comes from
 * `git log` on the engine source doc. This repo squash-merges every PR
 * (root CLAUDE.md), which collapses a PR's commits into one new commit with a
 * new SHA and author date on `main`. A PR that both edits an engine doc and
 * regenerates its mirror can never embed that final, squashed commit's date -
 * that commit does not exist yet when `sync:docs` runs, however carefully the
 * source and mirror commits are ordered within the PR. So the mirror's
 * `lastModified` is always exactly one commit behind until the *next* sync
 * touches the same page, regardless of author discipline.
 *
 * A byte-exact `git diff --exit-code` therefore fails on every such PR without
 * any real content drift to fix. This script regenerates the mirror and then
 * inspects the diff: a change confined to `lastModified` lines passes (it will
 * self-correct on the next sync); any other change - title, description,
 * editUrl, or body - still fails the build.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DIFF_FILE_HEADER_PATTERN = /^(?:\+\+\+ |--- )/u;
const LAST_MODIFIED_LINE_PATTERN = /^[+-]lastModified: /u;

/**
 * Classify a `git diff -- content/docs` unified diff: `'clean'` (no diff),
 * `'lastModifiedOnly'` (every changed line is a `lastModified` frontmatter
 * value), or `'drift'` (at least one other line changed). Diff file-header
 * lines (`--- a/...`, `+++ b/...`) are ignored - they always change alongside
 * any edit and carry no content of their own.
 */
const classifyDocsDiff = (diffText) => {
    if (diffText.trim() === '') {
        return 'clean';
    }

    const changedLines = diffText
        .split('\n')
        .filter((line) => /^[+-]/u.test(line) && !DIFF_FILE_HEADER_PATTERN.test(line));

    return changedLines.every((line) => LAST_MODIFIED_LINE_PATTERN.test(line)) ? 'lastModifiedOnly' : 'drift';
};

const main = () => {
    execFileSync('pnpm', ['run', 'sync:docs'], { stdio: 'inherit' });

    const diff = execFileSync('git', ['diff', '--no-color', '--', 'content/docs'], { encoding: 'utf8' });
    const verdict = classifyDocsDiff(diff);

    if (verdict === 'clean') {
        console.log('Docs mirror matches the engine source.');

        return;
    }

    if (verdict === 'lastModifiedOnly') {
        console.log(
            'Docs mirror lastModified timestamp(s) are one commit behind the engine source (expected: this repo ' +
                'squash-merges PRs, so a PR that edits an engine doc and regenerates its mirror cannot embed the ' +
                "final squashed commit's date). Not failing the build - the next sync will pick it up.",
        );

        return;
    }

    console.error(
        'Docs mirror is out of sync with the engine source. Run `pnpm run sync:docs` and commit the result.\n',
    );
    console.error(diff);
    process.exitCode = 1;
};

export { classifyDocsDiff };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
