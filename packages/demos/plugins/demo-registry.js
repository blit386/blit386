import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// #region Constants

const DEMO_FILENAME_PATTERN = /^(\d{3})-([a-z0-9-]+)\.js$/;
const PAGE_TITLE_PATTERN = /@pageTitle\s+(.+?)(?:\s*\*\/|\r?\n|$)/;
const HEADER_SCAN_BYTES = 2000;

// #endregion

// #region Public API

/**
 * Build the list of demos by scanning src/*.js for files matching NNN-topic.js.
 * Each entry's title defaults to "Blit-Tech Demo NNN - Title Cased Topic" and
 * may be overridden by a `@pageTitle ...` tag in the JS file header.
 * @param {string} rootDir - Absolute path to the project root (Vite's config.root).
 * @returns {Array<{number: string, slug: string, scriptFile: string, title: string, urlPath: string, sourcePath: string}>}
 */
export function buildRegistry(rootDir) {
    const srcDir = join(rootDir, 'src');
    const files = readdirSync(srcDir);

    const entries = [];

    for (const file of files) {
        const match = file.match(DEMO_FILENAME_PATTERN);

        if (!match) continue;

        const [, number, topic] = match;
        const slug = `${number}-${topic}`;
        const sourcePath = join(srcDir, file);
        const title = deriveTitle(number, topic, readHeader(sourcePath));

        entries.push({
            number,
            slug,
            title,
            scriptFile: `../src/${slug}`,
            urlPath: `/demos/${slug}.html`,
            sourcePath,
        });
    }

    entries.sort((a, b) => a.number.localeCompare(b.number));

    return entries;
}

// #endregion

// #region Internals

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
 * @param {string} number - Three-digit demo number, e.g. "001"
 * @param {string} topic - Kebab-case topic, e.g. "sprite-effects"
 * @param {string} header - First chunk of the JS source (to scan for @pageTitle)
 * @returns {string}
 */
function deriveTitle(number, topic, header) {
    const override = header.match(PAGE_TITLE_PATTERN);

    if (override) return override[1].trim();

    const topicTitle = topic
        .split('-')
        .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
        .join(' ');

    return `Blit-Tech Demo ${number} - ${topicTitle}`;
}

// #endregion
