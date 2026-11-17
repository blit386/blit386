/**
 * Offline checks for links to BLIT386's own sites, shared by the two link gates so there is one
 * rule per URL family: the root `docs:links` check (`scripts/check-markdown-links.mjs`, every
 * tracked Markdown file) and the demos header gate
 * (`packages/demos/scripts/check-demo-comment-links.mjs`, `src/*.js` header comments).
 *
 *   - `blit386.dev/docs/...`: the path must be a known docs page, and a `#fragment` must be a
 *     heading id on that page's source, slugged by `heading-anchors.mjs` the way the site does.
 *   - `demos.blit386.dev/<slug>`: the first path segment must be a known demo page.
 *
 * Neither function touches the network; callers pass the registries in.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { headingAnchors } from './heading-anchors.mjs';

/** The docs site's host, and the route segment its docs live under (`/docs/<path>`). */
export const SITE_HOST = 'blit386.dev';
export const DOCS_ROUTE = 'docs';
const DOCS_PATH_PREFIX = `/${DOCS_ROUTE}/`;
const DEMOS_HOST = 'demos.blit386.dev';

/**
 * @param {string} url
 * @returns {URL | null} The parsed URL, or `null` when `url` is not a valid absolute URL.
 */
export function tryParseUrl(url) {
    try {
        return new URL(url);
    } catch {
        return null;
    }
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

        if (parsed === null || parsed.hostname !== SITE_HOST || !parsed.pathname.startsWith(DOCS_PATH_PREFIX)) {
            continue;
        }

        const path = parsed.pathname.slice(DOCS_PATH_PREFIX.length).replace(/\/$/u, '');

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
 * @param {Set<string>} demoSlugs `DEMO_ORDER` entries, plus any non-demo pages the caller allows.
 * @returns {string[]} Human-readable failure messages for `demos.blit386.dev/<slug>` links whose
 *   slug is not in `demoSlugs`. A bare `https://demos.blit386.dev` (no slug) is not checked.
 */
export function findDemoLinkFailures(urls, demoSlugs) {
    const failures = [];

    for (const url of urls) {
        const parsed = tryParseUrl(url);

        if (parsed === null || parsed.hostname !== DEMOS_HOST) {
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
 * @param {string} docsDir Absolute path of `packages/blit386/docs`.
 * @returns {{ sitemapPaths: Set<string>, anchorsByPath: Map<string, Set<string>>, sections: string[] }}
 *   `path` values from `_sitemap.json`, the heading ids of each page's `src` file, and the
 *   section keys (each a `/docs/<section>` index route on the site).
 */
export function readSitemap(docsDir) {
    const sitemap = JSON.parse(readFileSync(join(docsDir, '_sitemap.json'), 'utf8'));
    const anchorsByPath = new Map(
        sitemap.pages.map((page) => [page.path, headingAnchors(readFileSync(join(docsDir, page.src), 'utf8'))]),
    );
    return { sitemapPaths: new Set(anchorsByPath.keys()), anchorsByPath, sections: Object.keys(sitemap.sections) };
}
