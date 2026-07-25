import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEMO_ORDER } from './demo-order.js';

// Number-free kebab-case demo filenames (e.g. basics.js, sprite-effects.js).
// First segment must start with a letter so legacy `001-topic.js` names are rejected.
const FILENAME_PATTERN = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\.js$/;
const PAGE_TITLE_PATTERN = /@pageTitle\s+(.+?)(?:\s*\*\/|\r?\n|$)/;
// Strip a branded `@pageTitle` prefix (with or without a legacy NNN / 00a id) so nav labels
// stay short regardless of how each demo's override is written.
const PAGE_TITLE_PREFIX_PATTERN = /^BLIT386 Demo (?:(?:[0-9]{3}|00a) )?-\s*/;
const HEADER_SCAN_BYTES = 2000;

// Demos excluded from the banner's dropdown and prev/next chain. They remain fully routable
// and embeddable at their own URL; only navigation surfacing is suppressed.
// Exported so `scripts/check-demo-registry.mjs` can flag stale entries.
export const NAV_HIDDEN_SLUGS = new Set(['barebones']);

/**
 * Build the list of demos by scanning src/*.js for number-free kebab-case files.
 * Order comes from `DEMO_ORDER` (not filenames). Each entry's title defaults to
 * "BLIT386 Demo - Title Cased Topic" and may be overridden by a `@pageTitle ...` tag
 * in the JS file header. `navLabel` is always the short title (searchable, no number).
 * @param {string} rootDir - Absolute path to the project root (Vite's config.root).
 * @returns {Array<{
 *   slug: string,
 *   scriptFile: string,
 *   title: string,
 *   navLabel: string,
 *   urlPath: string,
 *   sourcePath: string,
 *   isNavHidden: boolean,
 * }>}
 */
export function buildRegistry(rootDir) {
    const srcDir = join(rootDir, 'src');
    const files = readdirSync(srcDir);

    /** @type {Map<string, {
     *   slug: string,
     *   scriptFile: string,
     *   title: string,
     *   navLabel: string,
     *   urlPath: string,
     *   sourcePath: string,
     *   isNavHidden: boolean,
     * }>} */
    const bySlug = new Map();

    for (const file of files) {
        const match = file.match(FILENAME_PATTERN);

        if (!match) {
            continue;
        }

        const slug = match[1];
        const sourcePath = join(srcDir, file);
        const header = readHeader(sourcePath);
        const title = deriveTitle(slug, header);
        const navLabel = deriveShortTitle(slug, header);

        bySlug.set(slug, {
            slug,
            title,
            navLabel,
            scriptFile: `../src/${slug}`,
            urlPath: `/demos/${slug}.html`,
            sourcePath,
            isNavHidden: NAV_HIDDEN_SLUGS.has(slug),
        });
    }

    const entries = [];

    for (const slug of DEMO_ORDER) {
        const entry = bySlug.get(slug);

        if (!entry) {
            console.warn(`[demo-registry] Ordered slug missing on disk: ${slug}`);
            continue;
        }

        entries.push(entry);
        bySlug.delete(slug);
    }

    for (const [slug, entry] of bySlug) {
        console.warn(`[demo-registry] Demo not in DEMO_ORDER (appended): ${slug}`);
        entries.push(entry);
    }

    return entries;
}

/**
 * Read the first HEADER_SCAN_BYTES of a file as UTF-8 text.
 * @param {string} path - Absolute file path
 * @returns {string}
 */
function readHeader(path) {
    const buf = readFileSync(path);
    const slice = buf.subarray(0, HEADER_SCAN_BYTES);
    return slice.toString('utf-8');
}

/**
 * Derive the page title for a demo.
 * @param {string} slug - Kebab-case slug, e.g. "sprite-effects"
 * @param {string} header - First chunk of the JS source (to scan for @pageTitle)
 * @returns {string}
 */
function deriveTitle(slug, header) {
    const override = header.match(PAGE_TITLE_PATTERN);

    if (override) {
        return override[1].trim();
    }

    return `BLIT386 Demo - ${titleCaseTopic(slug)}`;
}

/**
 * Derive the short, unprefixed topic name used for nav UI (dropdown/prev-next labels), e.g.
 * "Flurry" or "PipBoy CRT". Strips a leading "BLIT386 Demo … - " prefix from `@pageTitle`
 * overrides that include it, so nav labels stay uniform regardless of how each demo's
 * `@pageTitle` is written.
 * @param {string} slug - Kebab-case slug, e.g. "sprite-effects"
 * @param {string} header - First chunk of the JS source (to scan for @pageTitle)
 * @returns {string}
 */
function deriveShortTitle(slug, header) {
    const override = header.match(PAGE_TITLE_PATTERN);

    if (override) {
        return override[1].trim().replace(PAGE_TITLE_PREFIX_PATTERN, '');
    }

    return titleCaseTopic(slug);
}

/**
 * Title-case a kebab-case topic, e.g. "sprite-effects" -> "Sprite Effects".
 * @param {string} topic - Kebab-case topic
 * @returns {string}
 */
function titleCaseTopic(topic) {
    return topic
        .split('-')
        .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
        .join(' ');
}
