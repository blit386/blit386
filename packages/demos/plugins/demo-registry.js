import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Three digits (`001-topic`) or special prefix `00a-topic`.
const FILENAME_PATTERN = /^(00a|[0-9]{3})-([a-z0-9-]+)\.js$/;
const PAGE_TITLE_PATTERN = /@pageTitle\s+(.+?)(?:\s*\*\/|\r?\n|$)/;
const PAGE_TITLE_PREFIX_PATTERN = /^BLIT386 Demo (?:[0-9]{3}|00a) - /;
const HEADER_SCAN_BYTES = 2000;
const EN_DASH = '–';

// Demos excluded from the banner's dropdown and prev/next chain. They remain fully routable
// and embeddable at their own URL; only navigation surfacing is suppressed.
const NAV_HIDDEN_SLUGS = new Set(['00a-barebones']);

/**
 * Build the list of demos by scanning src/*.js for files matching NNN-topic.js or 00a-topic.js.
 * Each entry's title defaults to "BLIT386 Demo NNN - Title Cased Topic" and
 * may be overridden by a `@pageTitle ...` tag in the JS file header.
 * @param {string} rootDir - Absolute path to the project root (Vite's config.root).
 * @returns {Array<{
 *   number: string,
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

    const entries = [];

    for (const file of files) {
        const match = file.match(FILENAME_PATTERN);

        if (!match) {
            continue;
        }

        const [, number, topic] = match;
        const slug = `${number}-${topic}`;
        const sourcePath = join(srcDir, file);
        const header = readHeader(sourcePath);
        const title = deriveTitle(number, topic, header);
        const navLabel = `${number} ${EN_DASH} ${deriveShortTitle(topic, header)}`;

        entries.push({
            number,
            slug,
            title,
            navLabel,
            scriptFile: `../src/${slug}`,
            urlPath: `/demos/${slug}.html`,
            sourcePath,
            isNavHidden: NAV_HIDDEN_SLUGS.has(slug),
        });
    }

    entries.sort((a, b) => sortKey(a.number).localeCompare(sortKey(b.number)));

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
 * Stable ordering so `00a` sorts before numeric demos (`001`, …).
 *
 * @param {string} number - Demo id, e.g. "001" or "00a"
 * @returns {string}
 */
function sortKey(number) {
    return number === '00a' ? '000a' : number;
}

/**
 * Derive the page title for a demo.
 * @param {string} number - Demo id, e.g. "001" or "00a"
 * @param {string} topic - Kebab-case topic, e.g. "sprite-effects"
 * @param {string} header - First chunk of the JS source (to scan for @pageTitle)
 * @returns {string}
 */
function deriveTitle(number, topic, header) {
    const override = header.match(PAGE_TITLE_PATTERN);

    if (override) {
        return override[1].trim();
    }

    return `BLIT386 Demo ${number} - ${titleCaseTopic(topic)}`;
}

/**
 * Derive the short, unprefixed topic name used for nav UI (dropdown/prev-next labels), e.g.
 * "Flurry" or "PipBoy CRT". Strips a leading "BLIT386 Demo NNN - " prefix from `@pageTitle`
 * overrides that include it, so nav labels stay uniform regardless of how each demo's
 * `@pageTitle` is written.
 * @param {string} topic - Kebab-case topic, e.g. "sprite-effects"
 * @param {string} header - First chunk of the JS source (to scan for @pageTitle)
 * @returns {string}
 */
function deriveShortTitle(topic, header) {
    const override = header.match(PAGE_TITLE_PATTERN);

    if (override) {
        return override[1].trim().replace(PAGE_TITLE_PREFIX_PATTERN, '');
    }

    return titleCaseTopic(topic);
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
