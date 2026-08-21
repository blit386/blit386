#!/usr/bin/env node
/**
 * Finds kit doc files (`packages/kit/content/docs/*.md`) that are due for human review because
 * the engine gained or changed public API, per `packages/blit386/docs/_api-history.json`'s
 * per-symbol `since` / `changes` history, since the kit's `blit386.docsReviewedAt` marker
 * (`packages/kit/package.json`) was last bumped.
 *
 * `docsReviewedAt` is hand-set only – see `packages/kit/CLAUDE.md` critical rule 5. This script
 * never writes it; it only reads and reports. `KIT_DOC_TRIGGER_PAGES` duplicates, at page
 * granularity, what `packages/kit/CLAUDE.md`'s "Kit content vs engine docs" table says at symbol
 * granularity – deliberate, see `.claude/rules/named-constants.md` ("document the duplication").
 * If you add/rename an `_api-history.json` page or a `content/docs/*.md` file, update both.
 *
 * Usage:
 *   node scripts/check-kit-docs-drift.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo root, resolved from this script's own location at repo-root `scripts/`. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** `_api-history.json` path, relative to `ROOT`. */
export const API_HISTORY_PATH = 'packages/blit386/docs/_api-history.json';

/** Kit `package.json` path, relative to `ROOT`. */
export const KIT_PACKAGE_JSON_PATH = 'packages/kit/package.json';

/**
 * Which `_api-history.json` `pages` groups make a kit doc file worth re-reviewing.
 * Intentionally page-level (coarse, ~7 entries) rather than symbol-level (~200 entries): the
 * failure mode here is "ask a human to spend five minutes reading," not "block a merge," so an
 * over-inclusive false positive is cheap and a false negative is not.
 *
 * `getting-started.md` and `when-something-breaks.md` have no entry – neither maps to one API
 * surface. They stay covered by the manual `/kit-audit` checklist, not this script.
 */
export const KIT_DOC_TRIGGER_PAGES = {
    'content/docs/basics.md': ['api/core', 'api/game-loop', 'api/assets'],
    'content/docs/drawing.md': ['api/rendering', 'guides/bitmap-fonts'],
    'content/docs/input.md': ['guides/input'],
    'content/docs/palette.md': ['api/palette', 'api/core-types'],
    'content/docs/random.md': ['api/random'],
    'content/docs/audio.md': ['api/audio'],
    'content/docs/hot-reload.md': ['api/core'],
};

/**
 * @param {string} a `x.y.z`.
 * @param {string} b `x.y.z`.
 * @returns {-1 | 0 | 1} -1 when a < b, 0 when equal, 1 when a > b.
 */
function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        if ((pa[i] ?? 0) !== (pb[i] ?? 0)) {
            return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
        }
    }

    return 0;
}

/**
 * @typedef {{ dueDocs: { docFile: string, pages: string[] }[], drift: boolean, engineVersion: string, docsReviewedAt: string }} DriftReport
 */

/**
 * @param {{ apiHistory: { packageVersion: string, symbols: Record<string, { since: string, changes: { version: string }[] }>, pages: Record<string, string[]> }, docsReviewedAt: string, triggerPages?: Record<string, string[]> }} input
 * @returns {DriftReport}
 */
export function computeKitDocsDrift({ apiHistory, docsReviewedAt, triggerPages = KIT_DOC_TRIGGER_PAGES }) {
    const { packageVersion, symbols, pages } = apiHistory;

    if (compareVersions(packageVersion, docsReviewedAt) <= 0) {
        return { drift: false, engineVersion: packageVersion, docsReviewedAt, dueDocs: [] };
    }

    const changedSymbolNames = new Set();

    for (const [name, info] of Object.entries(symbols)) {
        const versions = [info.since, ...(info.changes ?? []).map((change) => change.version)];
        const isChangedInWindow = versions.some(
            (version) => compareVersions(version, docsReviewedAt) > 0 && compareVersions(version, packageVersion) <= 0,
        );

        if (isChangedInWindow) {
            changedSymbolNames.add(name);
        }
    }

    const changedPages = new Set(
        Object.entries(pages)
            .filter(([, pageSymbols]) => pageSymbols.some((name) => changedSymbolNames.has(name)))
            .map(([pageName]) => pageName),
    );

    const dueDocs = Object.entries(triggerPages)
        .map(([docFile, docTriggerPages]) => ({
            docFile,
            pages: docTriggerPages.filter((page) => changedPages.has(page)),
        }))
        .filter((entry) => entry.pages.length > 0);

    return { drift: dueDocs.length > 0, engineVersion: packageVersion, docsReviewedAt, dueDocs };
}

/**
 * @param {{ root?: string }} [options]
 * @returns {DriftReport}
 */
export function checkKitDocsDrift(options = {}) {
    const root = options.root ?? ROOT;
    const apiHistory = JSON.parse(readFileSync(join(root, API_HISTORY_PATH), 'utf8'));
    const kitPackageJson = JSON.parse(readFileSync(join(root, KIT_PACKAGE_JSON_PATH), 'utf8'));
    const docsReviewedAt = kitPackageJson.blit386?.docsReviewedAt;

    if (typeof docsReviewedAt !== 'string') {
        throw new Error(`${KIT_PACKAGE_JSON_PATH} is missing a string "blit386.docsReviewedAt" field`);
    }

    return computeKitDocsDrift({ apiHistory, docsReviewedAt });
}

/** CLI entry point. */
function main() {
    const report = checkKitDocsDrift();

    if (!report.drift) {
        console.log(`Kit docs OK (no engine API changes since docsReviewedAt ${report.docsReviewedAt}).`);
        return 0;
    }

    console.log(
        `Kit docs may be stale: engine is at ${report.engineVersion}, kit docs were last reviewed at ` +
            `${report.docsReviewedAt}. Review these files:`,
    );

    for (const { docFile, pages } of report.dueDocs) {
        console.log(`  - packages/kit/${docFile} (changed: ${pages.join(', ')})`);
    }

    return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    process.exitCode = main();
}
