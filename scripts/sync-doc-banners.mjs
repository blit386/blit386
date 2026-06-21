#!/usr/bin/env node
/**
 * Keep the "read this on blit386.dev" banner current in every published doc.
 *
 * Each engine doc that publishes to the docs site (those listed in
 * `docs/_sitemap.json`) carries a short banner, just below its H1, pointing
 * GitHub readers at the typeset copy on blit386.dev. The banner is wrapped in
 * sentinel HTML comments so the public mirror generator
 * (`blit386-dev-fumapress/scripts/sync-docs-from-engine.mjs`) can strip it back
 * out - the live site should never tell its own readers to go to the site.
 *
 * This script is the single owner of that banner. It derives every URL from the
 * sitemap, so the link can never drift: run it and each doc gets a banner with
 * the correct `https://blit386.dev/docs/<path>` URL, inserted if missing and
 * rewritten if stale. Contributor-only docs (those absent from the sitemap) are
 * left untouched.
 *
 * Usage:
 *   node scripts/sync-doc-banners.mjs            # write banners (local + pre-commit)
 *   node scripts/sync-doc-banners.mjs --check    # report drift, write nothing, exit 1 (CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = join(ROOT, 'docs');
const SITEMAP_FILE = join(DOCS_DIR, '_sitemap.json');
const SITE_BASE = 'https://blit386.dev/docs';
const BANNER_START = '<!-- blit386.dev-banner:start -->';
const BANNER_END = '<!-- blit386.dev-banner:end -->';

/** Match an existing banner block plus the blank lines that surround it. */
const BANNER_REGION = /\n*<!-- blit386\.dev-banner:start -->[\s\S]*?<!-- blit386\.dev-banner:end -->\n*/u;

/** Load the published-page list (src + site path) from the sitemap manifest. */
const loadPages = () => {
    let manifest;

    try {
        manifest = JSON.parse(readFileSync(SITEMAP_FILE, 'utf8'));
    } catch (error) {
        throw new Error(`Cannot read sitemap manifest ${SITEMAP_FILE}: ${error.message}`, { cause: error });
    }

    if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
        throw new Error('Sitemap manifest must define a non-empty "pages" array.');
    }

    return manifest.pages;
};

/** Build the banner block (sentinels included, no surrounding blank lines) for one site URL. */
const buildBanner = (url) =>
    [
        BANNER_START,
        '',
        '> [!TIP]',
        `> You're reading the raw source on GitHub. The same page lives at ${url}, typeset like an`,
        '> actual docs site and easier on the eyes. Probably the nicer place to read it, but same',
        '> words either way.',
        '',
        BANNER_END,
    ].join('\n');

/** Remove any existing banner, collapsing the blank lines it sat between to one separator. */
const withoutBanner = (markdown) => markdown.replace(BANNER_REGION, '\n\n');

/**
 * Insert the banner immediately below the H1, with exactly one blank line on
 * each side. Throws if the doc has no H1 (every published doc must have one).
 */
const insertBanner = (markdown, banner, src) => {
    const lines = markdown.split('\n');
    const headingIndex = lines.findIndex((line) => /^#\s+/u.test(line));

    if (headingIndex === -1) {
        throw new Error(`Published doc "${src}" has no H1; cannot place the banner.`);
    }

    const before = lines.slice(0, headingIndex + 1);
    const after = lines.slice(headingIndex + 1);

    while (after.length > 0 && after[0].trim() === '') {
        after.shift();
    }

    return [...before, '', banner, '', ...after].join('\n');
};

/** Compute the desired file contents for one page (idempotent: strip then re-insert). */
const desiredContents = ({ src, path }) => {
    const raw = readFileSync(join(DOCS_DIR, src), 'utf8');
    const banner = buildBanner(`${SITE_BASE}/${path}`);

    return insertBanner(withoutBanner(raw), banner, src);
};

const main = () => {
    const isCheck = process.argv.includes('--check');
    const pages = loadPages();
    const drifted = [];

    for (const page of pages) {
        const filePath = join(DOCS_DIR, page.src);
        const current = readFileSync(filePath, 'utf8');
        const desired = desiredContents(page);

        if (desired === current) {
            continue;
        }

        drifted.push(page.src);

        if (!isCheck) {
            writeFileSync(filePath, desired);
        }
    }

    if (isCheck) {
        if (drifted.length > 0) {
            console.error(`\n${drifted.length} doc banner(s) out of date:`);

            for (const src of drifted) {
                console.error(`  docs/${src}`);
            }

            console.error('\nRun `pnpm run sync:doc-banners` to update them.');
            process.exit(1);
        }

        console.log(`All ${pages.length} doc banner(s) up to date.`);

        return;
    }

    if (drifted.length === 0) {
        console.log(`All ${pages.length} doc banner(s) already up to date.`);

        return;
    }

    for (const src of drifted) {
        console.log(`updated banner in docs/${src}`);
    }

    console.log(`\n${drifted.length} of ${pages.length} doc banner(s) updated.`);
};

main();
