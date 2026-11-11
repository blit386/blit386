#!/usr/bin/env node
/**
 * Catch dead or placeholder links in `src/*.js` header comments - the `Prerequisites:` /
 * `Guide:` / `Live version:` block every demo carries (see `.claude/rules/file-structure.md`).
 * These are reader-visible: the demo source is published and rendered in the source panel on
 * demos.blit386.dev, so a stale link there is a stale link a visitor can click. BT-448 fixed
 * twenty header comments that linked to vancura.dev walkthrough articles that all 404'd;
 * nothing stopped a future edit from reintroducing that, or from linking a docs page or demo
 * slug that no longer exists. This is the registry-driven guard against all three.
 *
 * Only the leading header comment block is scanned - not the whole file - so an explanatory
 * link buried mid-file (a third-party credit, an MDN reference) is out of scope by design.
 *
 * Checks, per `https://` URL found in that block:
 *   - Placeholder domain: host is `vancura.dev` or ends in `.vancura.dev` - always a failure.
 *   - `blit386.dev/docs/...`: the path (fragment stripped) must match a `path` value in
 *     `packages/blit386/docs/_sitemap.json`, and a `#fragment` must be a heading id on that
 *     page's `src` file, slugged by `scripts/lib/heading-anchors.mjs` the way the site does.
 *   - `demos.blit386.dev/<slug>`: the first path segment must be a `DEMO_ORDER` entry.
 *
 * Any other domain (e.g. a one-off GitHub credit) is ignored.
 *
 * Usage:
 *   node scripts/check-demo-comment-links.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { headingAnchors } from '../../../scripts/lib/heading-anchors.mjs';
import { DEMO_ORDER } from '../plugins/demo-order.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = join(ROOT, '..', 'blit386', 'docs');

/** Hostname a header link must never point at - matched as the exact host or a `.`-suffix. */
const PLACEHOLDER_DOMAIN = 'vancura.dev';

const URL_PATTERN = /https:\/\/[^\s)'"]+/gu;

/**
 * Extracts the leading header comment block of a demo source file - either a `/** *\/` block at
 * the very top, or a run of consecutive `//`-prefixed lines from the top, stopping at the first
 * line that is not a `//` comment. Mirrors the "header comment -> imports" section order
 * documented in `.claude/rules/file-structure.md`.
 *
 * @param {string} source Full file contents.
 * @returns {string} The header comment text (including comment markers), or `''` if the file
 *   does not start with a comment.
 */
export function extractHeaderComment(source) {
    if (source.startsWith('/**') || source.startsWith('/*')) {
        const end = source.indexOf('*/');
        return end === -1 ? source : source.slice(0, end + 2);
    }

    const lines = source.split('\n');
    const headerLines = [];

    for (const line of lines) {
        if (!line.startsWith('//')) {
            break;
        }

        headerLines.push(line);
    }

    return headerLines.join('\n');
}

/**
 * @param {string} headerText Header comment text, as returned by `extractHeaderComment`.
 * @returns {string[]} Every `https://` URL found, with trailing prose punctuation (`)`, `,`,
 *   `.`) trimmed off so a parenthetical or comma-separated list parses cleanly.
 */
export function findLinksInHeader(headerText) {
    const matches = headerText.match(URL_PATTERN) ?? [];
    return matches.map((url) => url.replace(/[)+,.]+$/u, ''));
}

/**
 * The regex in `findLinksInHeader` is permissive by design (it has to catch a placeholder
 * domain regardless of what path or syntax follows it), so it can capture text that isn't a
 * valid URL - e.g. an illustrative `https://[id]` in prose. Parsing that with `new URL()`
 * throws, which would otherwise crash the whole script on one bad match instead of reporting a
 * clean per-file failure.
 *
 * @param {string} url
 * @returns {URL | null} The parsed URL, or `null` when `url` is not a valid absolute URL.
 */
function tryParseUrl(url) {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

/**
 * @param {string[]} urls
 * @returns {string[]} Human-readable failure messages, one per URL that `findLinksInHeader`
 *   matched but that does not parse as a valid URL.
 */
export function findMalformedLinkFailures(urls) {
    return urls.filter((url) => tryParseUrl(url) === null).map((url) => `${url} is not a valid URL`);
}

/**
 * @param {string} url
 * @returns {boolean} Whether `url`'s host is a known-dead placeholder domain.
 */
function isPlaceholderUrl(url) {
    const parsed = tryParseUrl(url);

    if (parsed === null) {
        return false;
    }

    const host = parsed.hostname;
    return host === PLACEHOLDER_DOMAIN || host.endsWith(`.${PLACEHOLDER_DOMAIN}`);
}

/**
 * @param {string[]} urls
 * @returns {string[]} Human-readable failure messages, one per placeholder-domain URL.
 */
export function findPlaceholderLinkFailures(urls) {
    return urls.filter(isPlaceholderUrl).map((url) => `${url} points at a known-placeholder domain`);
}

/**
 * @param {string[]} urls
 * @param {Set<string>} sitemapPaths `path` values from `packages/blit386/docs/_sitemap.json`.
 * @param {Map<string, Set<string>>} [anchorsByPath] Heading ids per sitemap path. A fragment is
 *   checked only when its page has an entry, so callers that pass none check paths alone.
 * @returns {string[]} Human-readable failure messages for `blit386.dev/docs/...` links whose
 *   page path (fragment stripped) is not in `sitemapPaths`, or whose fragment is not a heading
 *   id on that page.
 */
export function findDocsLinkFailures(urls, sitemapPaths, anchorsByPath = new Map()) {
    const failures = [];

    for (const url of urls) {
        const parsed = tryParseUrl(url);

        if (parsed === null || parsed.hostname !== 'blit386.dev' || !parsed.pathname.startsWith('/docs/')) {
            continue;
        }

        const path = parsed.pathname.slice('/docs/'.length).replace(/\/$/u, '');

        if (!sitemapPaths.has(path)) {
            failures.push(`${url} has no matching page in packages/blit386/docs/_sitemap.json (path "${path}")`);
            continue;
        }

        // Raw, not decoded: every heading id is ASCII today, and decoding a stray `%` would throw.
        const fragment = parsed.hash.slice(1);
        const anchors = anchorsByPath.get(path);

        if (fragment !== '' && anchors !== undefined && !anchors.has(fragment)) {
            failures.push(`${url} has no heading "#${fragment}" on the page (path "${path}")`);
        }
    }

    return failures;
}

/**
 * @param {string[]} urls
 * @param {Set<string>} demoSlugs `DEMO_ORDER` entries.
 * @returns {string[]} Human-readable failure messages for `demos.blit386.dev/<slug>` links whose
 *   slug is not in `demoSlugs`. A bare `https://demos.blit386.dev` (no slug) is not checked.
 */
export function findDemoLinkFailures(urls, demoSlugs) {
    const failures = [];

    for (const url of urls) {
        const parsed = tryParseUrl(url);

        if (parsed === null || parsed.hostname !== 'demos.blit386.dev') {
            continue;
        }

        const slug = parsed.pathname.split('/').filter(Boolean)[0];

        if (slug === undefined) {
            continue;
        }

        if (!demoSlugs.has(slug)) {
            failures.push(`${url} references demo "${slug}", which is not in DEMO_ORDER`);
        }
    }

    return failures;
}

/**
 * Runs every link check against one file's header comment.
 *
 * @param {string} source Full file contents.
 * @param {{ sitemapPaths: Set<string>, anchorsByPath?: Map<string, Set<string>>, demoSlugs: Set<string> }} registries
 * @returns {string[]} Human-readable failure messages (unprefixed - the caller adds the file name).
 */
export function findCommentLinkFailures(source, { sitemapPaths, anchorsByPath, demoSlugs }) {
    const urls = findLinksInHeader(extractHeaderComment(source));

    return [
        ...findMalformedLinkFailures(urls),
        ...findPlaceholderLinkFailures(urls),
        ...findDocsLinkFailures(urls, sitemapPaths, anchorsByPath),
        ...findDemoLinkFailures(urls, demoSlugs),
    ];
}

/**
 * @returns {{ sitemapPaths: Set<string>, anchorsByPath: Map<string, Set<string>> }} `path` values
 *   from `packages/blit386/docs/_sitemap.json`, and the heading ids of each page's `src` file.
 */
function readSitemap() {
    const sitemap = JSON.parse(readFileSync(join(DOCS_DIR, '_sitemap.json'), 'utf8'));
    const anchorsByPath = new Map(
        sitemap.pages.map((page) => [page.path, headingAnchors(readFileSync(join(DOCS_DIR, page.src), 'utf8'))]),
    );
    return { sitemapPaths: new Set(anchorsByPath.keys()), anchorsByPath };
}

/** @returns {string[]} All failure messages across every `src/*.js` header comment, each prefixed with its file name. */
function runAllChecks() {
    const { sitemapPaths, anchorsByPath } = readSitemap();
    const demoSlugs = new Set(DEMO_ORDER);
    const srcDir = join(ROOT, 'src');
    const failures = [];

    for (const file of readdirSync(srcDir).sort()) {
        if (!file.endsWith('.js')) {
            continue;
        }

        const source = readFileSync(join(srcDir, file), 'utf8');

        for (const message of findCommentLinkFailures(source, { sitemapPaths, anchorsByPath, demoSlugs })) {
            failures.push(`src/${file}: ${message}`);
        }
    }

    return failures;
}

function main() {
    const failures = runAllChecks();

    if (failures.length > 0) {
        console.error('Demo comment link check failed:\n');

        for (const message of failures) {
            console.error(`  - ${message}`);
        }

        console.error(
            '\nFix the header comment in the listed file(s): repoint a vancura.dev link at the equivalent ' +
                'blit386.dev/docs/... guide, and make sure every blit386.dev/docs/... or demos.blit386.dev/<slug> ' +
                'link matches a real sitemap page (and heading, for a #fragment) or DEMO_ORDER entry.',
        );
        process.exit(1);
    }

    console.log('Demo comment links OK: no placeholder domains, all internal links resolve.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
