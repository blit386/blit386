#!/usr/bin/env node
/**
 * Enforce mutual consistency between demo files on disk, DEMO_ORDER, VINTAGE_URLS,
 * and NAV_HIDDEN_SLUGS. Failures exit 1 with clear messages — soft console.warns from
 * buildRegistry are not enough for CI / preflight.
 *
 * Rules:
 * - Every `src/*.js` matching the number-free kebab-case pattern has exactly one
 *   DEMO_ORDER entry, and every DEMO_ORDER entry has exactly one matching file.
 * - No duplicate current slugs; no current slug may equal a vintage URL key that maps
 *   elsewhere (would steal that demo's public path).
 * - Every VINTAGE_URLS target is either a live slug or listed in RETIRED_SLUGS.
 * - Every NAV_HIDDEN_SLUGS / RETIRED_SLUGS entry is still meaningful (no stale rows).
 */
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO_ORDER } from '../plugins/demo-order.js';
import { buildRegistry, NAV_HIDDEN_SLUGS } from '../plugins/demo-registry.js';
import { RETIRED_SLUGS, VINTAGE_URLS } from '../plugins/demo-vintage-urls.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Mirrors plugins/demo-registry.js — kept local so this script can list files without
// going through buildRegistry's soft-warn merge path.
const FILENAME_PATTERN = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\.js$/;

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

// Mute buildRegistry's soft warns — this script reports the same issues as hard errors.
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

// --- Report ----------------------------------------------------------------------------

if (errors.length > 0) {
    console.error('Demo registry check failed:\n');

    for (const message of errors) {
        console.error(`  - ${message}`);
    }

    console.error(`\n${errors.length} error(s). Fix plugins/demo-order.js, plugins/demo-vintage-urls.js,`);
    console.error('plugins/demo-registry.js (NAV_HIDDEN_SLUGS), or the matching src/*.js file(s).');
    process.exit(1);
}

console.log(
    `Demo registry OK: ${diskSlugs.length} demos, ${Object.keys(VINTAGE_URLS).length} vintage URLs, ${NAV_HIDDEN_SLUGS.size} nav-hidden.`,
);
