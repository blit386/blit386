#!/usr/bin/env node
/**
 * Enforce mutual consistency between demo files on disk, DEMO_ORDER, VINTAGE_URLS,
 * and NAV_HIDDEN_SLUGS. Failures exit 1 with clear messages – soft console.warns from
 * buildRegistry are not enough for CI / preflight.
 *
 * Rules:
 * - Every `src/*.js` matching the number-free kebab-case pattern has exactly one
 *   DEMO_ORDER entry, and every DEMO_ORDER entry has exactly one matching file.
 * - No duplicate current slugs; no current slug may equal a vintage URL key that maps
 *   elsewhere (would steal that demo's public path).
 * - Every VINTAGE_URLS target is either a live slug or listed in RETIRED_SLUGS.
 * - Every NAV_HIDDEN_SLUGS / RETIRED_SLUGS entry is still meaningful (no stale rows).
 * - Every demo carries a one-line `@description` header tag of a length that survives every
 *   social-card consumer intact (see DESCRIPTION_MIN_CHARS / DESCRIPTION_MAX_CHARS).
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO_ORDER } from '../plugins/demo-order.js';
import { buildRegistry, HEADER_SCAN_BYTES, NAV_HIDDEN_SLUGS } from '../plugins/demo-registry.js';
import { RETIRED_SLUGS, VINTAGE_URLS } from '../plugins/demo-vintage-urls.js';
import { OG_IMAGE_DIR, OG_SCALE_MODES } from '../plugins/social-meta.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Mirrors plugins/demo-registry.js – kept local so this script can list files without
// going through buildRegistry's soft-warn merge path.
const FILENAME_PATTERN = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\.js$/;

// The ceiling is the column budget, not an SEO limit: the tag must be one line, and the
// longest prefix (" * @description ") is 16 characters, so 104 is the most that fits this
// repo's 120-column convention. That lands comfortably under every consumer's truncation
// point anyway – Google cuts a meta description around 155 characters, and Facebook's own
// guidance is under 155. The floor keeps one-word placeholders ("Sprites.") from passing the
// gate.
const DESCRIPTION_MIN_CHARS = 60;
const DESCRIPTION_MAX_CHARS = 104;

/** @type {string[]} */
const errors = [];

/**
 * @param {string} message
 */
function fail(message) {
    errors.push(message);
}

/**
 * Collect number-free kebab-case demo slugs from `src/`.
 * @returns {string[]}
 */
function listDiskSlugs() {
    const files = readdirSync(join(ROOT, 'src'));
    /** @type {string[]} */
    const slugs = [];

    for (const file of files) {
        const match = file.match(FILENAME_PATTERN);

        if (match) {
            slugs.push(match[1]);
        }
    }

    return slugs.sort((a, b) => a.localeCompare(b));
}

const diskSlugs = listDiskSlugs();
const diskSlugSet = new Set(diskSlugs);

// Mute buildRegistry's soft warns – this script reports the same issues as hard errors.
const originalWarn = console.warn;
console.warn = () => {};
const registry = buildRegistry(ROOT);
console.warn = originalWarn;

const registrySlugSet = new Set(registry.map((entry) => entry.slug));

if (registrySlugSet.size !== diskSlugSet.size || [...registrySlugSet].some((slug) => !diskSlugSet.has(slug))) {
    fail(
        'buildRegistry() slug set disagrees with src/ scan — FILENAME_PATTERN may have drifted between demo-registry.js and this script.',
    );
}

// --- DEMO_ORDER ↔ disk bijection -------------------------------------------------------

const orderSeen = new Set();

for (const slug of DEMO_ORDER) {
    if (orderSeen.has(slug)) {
        fail(`Duplicate DEMO_ORDER entry: "${slug}"`);
        continue;
    }

    orderSeen.add(slug);

    if (!diskSlugSet.has(slug)) {
        fail(`DEMO_ORDER lists "${slug}" but src/${slug}.js is missing`);
    }
}

for (const slug of diskSlugs) {
    if (!orderSeen.has(slug)) {
        fail(`src/${slug}.js is not listed in DEMO_ORDER`);
    }
}

// --- Current slug collisions with vintage URL keys -------------------------------------

const vintageByKey = new Map(Object.entries(VINTAGE_URLS));

for (const slug of diskSlugs) {
    const mappedCurrent = vintageByKey.get(slug);

    if (mappedCurrent !== undefined && mappedCurrent !== slug) {
        fail(
            `Current slug "${slug}" collides with vintage URL key mapping to "${mappedCurrent}" (would steal /${slug})`,
        );
    }
}

// --- VINTAGE_URLS targets must be live or explicitly retired ---------------------------

const vintageTargets = new Set();

for (const [vintageSlug, currentSlug] of Object.entries(VINTAGE_URLS)) {
    vintageTargets.add(currentSlug);

    const isLive = diskSlugSet.has(currentSlug);
    const isRetired = RETIRED_SLUGS.has(currentSlug);

    if (!isLive && !isRetired) {
        fail(
            `VINTAGE_URLS["${vintageSlug}"] → "${currentSlug}" is neither a live src/${currentSlug}.js nor listed in RETIRED_SLUGS`,
        );
    }

    if (isLive && isRetired) {
        fail(`Slug "${currentSlug}" is both live on disk and listed in RETIRED_SLUGS — remove it from RETIRED_SLUGS`);
    }
}

for (const slug of RETIRED_SLUGS) {
    if (diskSlugSet.has(slug)) {
        fail(`RETIRED_SLUGS lists "${slug}" but src/${slug}.js still exists`);
    }

    if (!vintageTargets.has(slug)) {
        fail(`RETIRED_SLUGS lists "${slug}" but no VINTAGE_URLS entry targets it`);
    }
}

// --- NAV_HIDDEN_SLUGS must still match a live file -------------------------------------

for (const slug of NAV_HIDDEN_SLUGS) {
    if (!diskSlugSet.has(slug)) {
        fail(`NAV_HIDDEN_SLUGS lists "${slug}" but src/${slug}.js is missing (stale entry)`);
    }
}

// --- @description presence, length, and shape ------------------------------------------

for (const entry of registry) {
    const { description, slug } = entry;

    if (description === '') {
        fail(
            `src/${slug}.js has no "@description <one sentence>" header tag – required for the ` +
                `meta description and og:description, and it must appear within the first ` +
                `${HEADER_SCAN_BYTES} bytes of the file`,
        );
        continue;
    }

    // Count code points, not UTF-16 units, so one astral character is not counted as two.
    const length = [...description].length;

    if (length < DESCRIPTION_MIN_CHARS) {
        fail(`src/${slug}.js @description is ${length} chars, under the ${DESCRIPTION_MIN_CHARS}-char minimum`);
    }

    if (length > DESCRIPTION_MAX_CHARS) {
        fail(`src/${slug}.js @description is ${length} chars, over the ${DESCRIPTION_MAX_CHARS}-char ceiling`);
    }

    if (/[<>]/.test(description)) {
        fail(`src/${slug}.js @description contains < or > – keep it plain prose`);
    }

    // A period specifically, not any sentence-final mark: the documented rule says period, and
    // 46 cards that punctuate the same way read better than a mix.
    if (!/\.$/.test(description)) {
        fail(`src/${slug}.js @description should end in a period`);
    }
}

// --- @ogScale, when a demo overrides its card framing -----------------------------------

for (const entry of registry) {
    if (entry.ogScale !== '' && !OG_SCALE_MODES.has(entry.ogScale)) {
        fail(
            `src/${entry.slug}.js has @ogScale "${entry.ogScale}", which is not one of ` +
                `${[...OG_SCALE_MODES].join(', ')}`,
        );
    }
}

// --- OG cards: reported, never fatal ----------------------------------------------------

// Deliberately a warning rather than a `fail()`. `buildSocialMeta` falls back to og-default.png,
// so a missing card degrades gracefully – while capturing one needs a built site, a preview
// server, a browser, and ffmpeg. Blocking every preflight on that would make adding a demo far
// more expensive than the graceful fallback justifies.
const missingCards = registry
    .map((entry) => entry.slug)
    .filter((slug) => !existsSync(join(ROOT, 'public', OG_IMAGE_DIR, `og-${slug}.png`)));

// --- Report ----------------------------------------------------------------------------

if (missingCards.length > 0) {
    console.warn(
        `Note: ${missingCards.length} demo(s) have no OpenGraph card and will use the shared ` +
            `fallback: ${missingCards.join(', ')}\n` +
            'Capture them with `pnpm run capture:og -- <slug>` (see README).\n',
    );
}

if (errors.length > 0) {
    console.error('Demo registry check failed:\n');

    for (const message of errors) {
        console.error(`  - ${message}`);
    }

    console.error(`\n${errors.length} error(s). Fix plugins/demo-order.js, plugins/demo-vintage-urls.js,`);
    console.error('plugins/demo-registry.js (NAV_HIDDEN_SLUGS), or the matching src/*.js file(s).');
    console.error(`@description must be one line, ${DESCRIPTION_MIN_CHARS}-${DESCRIPTION_MAX_CHARS} characters.`);
    process.exit(1);
}

console.log(
    `Demo registry OK: ${diskSlugs.length} demos, ${Object.keys(VINTAGE_URLS).length} vintage URLs, ${NAV_HIDDEN_SLUGS.size} nav-hidden.`,
);
