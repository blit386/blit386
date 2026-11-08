#!/usr/bin/env node
/**
 * Derive the units the `/audit` skill reads, and keep `.claude/skills/audit/modules.md` (the audit
 * ledger) in step with the tree.
 *
 * The unit list is never hand-maintained. It is derived from the working tree by the rules in
 * `deriveUnits()`: one unit per `packages/blit386/src/<dir>`, one per demo file, one per website,
 * kit and scaffolder area, and four root units (scripts, maintainer agent config, repo docs,
 * tooling config). The ledger only adds two columns a human owns - `Last audited` and `Ticket` -
 * so a new directory or demo shows up as a missing row, and a removed one as a stale row, and
 * `--check` fails on either. That is the same `sync:*:check` pattern `sync-cursor-commands` and
 * `sync-maintainer-agents` use, and it runs in the same two places (the pre-push root pass and the
 * CI `quality-root` job).
 *
 * Coverage is enforced where new code appears: every top-level entry of every `packages/*`
 * directory (and of `packages/blit386/src/`) must be claimed by some unit's path or listed in
 * `IGNORED_NAMES`. A package with no rule here fails the check. Root-level directories are not
 * enumerated (an untracked `node_modules`, `.idea` or scratch checkout would be noise); the root
 * units name their directories explicitly instead.
 *
 * Usage:
 *   node scripts/audit-modules.mjs                  # rewrite the derived columns, add new rows, drop stale ones
 *   node scripts/audit-modules.mjs --check          # report drift, write nothing, exit 1 (pre-push, CI)
 *   node scripts/audit-modules.mjs --list [--json]  # print the units for the audit orchestrator
 *   node scripts/audit-modules.mjs --stamp <YYYY-MM-DD> <BT-ID> <unit>...   # record an audit on those rows
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportSyncDrift } from './lib/report-sync-drift.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Repo-relative path of the ledger this script owns the derived columns of. */
export const LEDGER_REL = '.claude/skills/audit/modules.md';

/** Column header of the ledger table; `parseLedger` and `renderLedger` both key off it. */
const LEDGER_HEADER = '| Unit | Kind | Paths | Last audited | Ticket |';

/** Value of the two human-owned columns on a row nothing has audited yet. */
export const NEVER = '-';

/** Directory names skipped by the coverage walk: build output, dependencies, tests and static assets. */
const IGNORED_NAMES = new Set(['dist', 'node_modules', 'coverage', 'public', 'test', 'tests', '__test__', '__tests__']);

/** A test, bench or spec file; a directory holding only these has nothing to audit. */
const TEST_FILE = /\.(?:test|bench|spec)\.[cm]?[jt]sx?$/u;

/** Prose units are read against the docs-authoring rules; code units against the review checklist. */
const KIND_CODE = 'code';
const KIND_PROSE = 'prose';

/** Packages the derivation knows about, in ledger order. A new `packages/*` entry fails the check until it is added here. */
const KNOWN_PACKAGES = [
    'packages/blit386',
    'packages/demos',
    'packages/website',
    'packages/kit',
    'packages/create-blit386',
];

/**
 * @typedef {object} Unit
 * @property {string} key Stable ledger key, e.g. `engine-audio` or `demo:camera`.
 * @property {string} kind `code` or `prose`.
 * @property {string[]} paths Repo-relative files or directories the unit covers.
 */

/**
 * @typedef {object} LedgerRow
 * @property {string} key
 * @property {string} kind
 * @property {string} paths Comma-joined paths as rendered in the ledger.
 * @property {string} audited `YYYY-MM-DD` or `-`.
 * @property {string} ticket `BT-123` or `-`.
 */

/** @param {string} root @param {string} rel @returns {string[]} Sorted child directory names, or [] when `rel` is missing. */
function dirNames(root, rel) {
    const abs = join(root, rel);

    if (!existsSync(abs)) {
        return [];
    }

    return readdirSync(abs, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
}

/** @param {string} root @param {string} rel @returns {string[]} Sorted child file names, or [] when `rel` is missing. */
function fileNames(root, rel) {
    const abs = join(root, rel);

    if (!existsSync(abs)) {
        return [];
    }

    return readdirSync(abs, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();
}

/**
 * Whether a directory holds at least one file that is not a test, bench or spec (recursively, skipping
 * ignored names). A directory of tests alone (`src/__test__`, `src/docs`) is not an audit unit.
 *
 * @param {string} root
 * @param {string} rel
 * @returns {boolean}
 */
export function hasAuditableFiles(root, rel) {
    for (const name of fileNames(root, rel)) {
        if (!TEST_FILE.test(name)) {
            return true;
        }
    }

    return dirNames(root, rel).some(
        (name) => !IGNORED_NAMES.has(name) && hasAuditableFiles(root, posix.join(rel, name)),
    );
}

/**
 * Derive every audit unit from the tree. Order is the ledger order: engine, demos, website, kit,
 * scaffolder, root.
 *
 * @param {string} root Absolute repo root.
 * @returns {Unit[]}
 */
export function deriveUnits(root = ROOT) {
    /** @type {Unit[]} */
    const units = [];
    const add = (key, kind, paths) => {
        if (units.some((unit) => unit.key === key)) {
            throw new Error(`audit unit key ${key} derived twice; rename one rule in scripts/audit-modules.mjs`);
        }
        units.push({ key, kind, paths });
    };
    const existing = (paths) => paths.filter((rel) => existsSync(join(root, rel)));

    const engineSrc = 'packages/blit386/src';
    for (const dir of dirNames(root, engineSrc)) {
        const rel = posix.join(engineSrc, dir);
        if (!IGNORED_NAMES.has(dir) && hasAuditableFiles(root, rel)) {
            // The engine's source art (logo, splash, system-font sheet) is read by the assets loaders and scripts.
            add(`engine-${dir}`, KIND_CODE, dir === 'assets' ? [rel, ...existing(['packages/blit386/assets'])] : [rel]);
        }
    }
    const entryFiles = fileNames(root, engineSrc).filter((name) => !TEST_FILE.test(name));
    if (entryFiles.length > 0) {
        add(
            'engine-entry',
            KIND_CODE,
            entryFiles.map((name) => posix.join(engineSrc, name)),
        );
    }
    add('engine-scripts', KIND_CODE, ['packages/blit386/scripts']);
    add('engine-docs', KIND_PROSE, ['packages/blit386/docs']);

    const demosSrc = 'packages/demos/src';
    for (const name of fileNames(root, demosSrc)) {
        if (name.endsWith('.js') && !TEST_FILE.test(name)) {
            add(`demo:${name.slice(0, -'.js'.length)}`, KIND_CODE, [posix.join(demosSrc, name)]);
        }
    }
    add('demos-shared', KIND_CODE, ['packages/demos/src/shared']);
    add('demos-scripts', KIND_CODE, ['packages/demos/scripts']);
    add(
        'demos-build',
        KIND_CODE,
        existing([
            'packages/demos/plugins',
            'packages/demos/_partials',
            'packages/demos/_shots',
            'packages/demos/styles',
        ]),
    );

    add('website-src', KIND_CODE, ['packages/website/src']);
    add('website-scripts', KIND_CODE, ['packages/website/scripts']);
    add('website-content', KIND_PROSE, ['packages/website/content']);

    add('kit-src', KIND_CODE, ['packages/kit/src']);
    add('kit-hooks', KIND_CODE, existing(['packages/kit/content/hooks', 'packages/kit/content/hooks.manifest.json']));
    add('kit-skills', KIND_PROSE, ['packages/kit/content/skills']);
    add(
        'kit-content',
        KIND_PROSE,
        existing([
            'packages/kit/content/docs',
            'packages/kit/content/rules',
            'packages/kit/content/templates',
            'packages/kit/content/AGENTS.md',
        ]),
    );

    add('scaffolder', KIND_CODE, ['packages/create-blit386/src', 'packages/create-blit386/templates']);

    add('root-scripts', KIND_CODE, ['scripts']);
    add('maintainer-agents', KIND_PROSE, [
        '.claude',
        ...KNOWN_PACKAGES.map((pkg) => posix.join(pkg, '.claude')).filter((rel) => existsSync(join(root, rel))),
    ]);

    const isMarkdown = (name) => name.endsWith('.md');
    const rootFiles = fileNames(root, '.');
    const packageFiles = KNOWN_PACKAGES.flatMap((pkg) => fileNames(root, pkg).map((name) => posix.join(pkg, name)));
    add('repo-docs', KIND_PROSE, [
        ...rootFiles.filter(isMarkdown),
        ...existing([
            'docs',
            '.github/copilot-instructions.md',
            '.github/pull_request_template.md',
            'packages/demos/docs',
        ]),
        ...packageFiles.filter((rel) => isMarkdown(posix.basename(rel))),
    ]);
    add('tooling-config', KIND_CODE, [
        ...rootFiles.filter((name) => !isMarkdown(name)),
        ...existing([
            '.github/workflows',
            '.github/actions',
            '.github/ISSUE_TEMPLATE',
            '.husky',
            '.devcontainer',
            '.cursor/hooks.json',
            '.cursor/mcp.json',
            '.zed',
        ]),
        ...packageFiles.filter((rel) => !isMarkdown(posix.basename(rel))),
    ]);

    // A gitignored file at a package root (a local RELEASE.md draft, a leftover benchmark report) exists on
    // one machine and not in CI; the ledger must derive the same on both.
    return units.map((unit) => ({ ...unit, paths: dropGitignored(root, unit.paths) }));
}

/**
 * Walk a directory and list entries no unit claims. A directory is covered when a unit path equals it or
 * contains it; when a unit path lies inside it, the walk descends one level so siblings are checked too.
 * Ignored names and test-only directories are skipped.
 *
 * @param {string} root
 * @param {string} rel Directory to walk.
 * @param {Set<string>} claimed Every unit path.
 * @returns {string[]} Repo-relative uncovered entries.
 */
function uncoveredIn(root, rel, claimed) {
    const uncovered = [];
    const covers = (entry) => {
        for (const path of claimed) {
            if (path === entry || entry.startsWith(`${path}/`)) {
                return true;
            }
        }

        return false;
    };
    const hasUnitInside = (entry) => [...claimed].some((path) => path.startsWith(`${entry}/`));

    for (const name of dirNames(root, rel)) {
        const entry = posix.join(rel, name);
        if (IGNORED_NAMES.has(name) || covers(entry) || !hasAuditableFiles(root, entry)) {
            continue;
        }
        if (hasUnitInside(entry)) {
            uncovered.push(...uncoveredIn(root, entry, claimed));
        } else {
            uncovered.push(entry);
        }
    }
    for (const name of fileNames(root, rel)) {
        const entry = posix.join(rel, name);
        if (!TEST_FILE.test(name) && !covers(entry)) {
            uncovered.push(entry);
        }
    }

    return uncovered;
}

/**
 * Every `packages/*` entry and everything under each known package must belong to a unit; a package the
 * rules do not know is reported whole.
 *
 * @param {string} root
 * @param {Unit[]} units
 * @returns {string[]} Repo-relative paths nothing audits.
 */
export function findUncovered(root, units) {
    const claimed = new Set(units.flatMap((unit) => unit.paths));
    const uncovered = [];

    for (const name of dirNames(root, 'packages')) {
        const pkg = posix.join('packages', name);
        if (!KNOWN_PACKAGES.includes(pkg)) {
            uncovered.push(pkg);
        } else {
            uncovered.push(...uncoveredIn(root, pkg, claimed));
        }
    }

    return dropGitignored(root, uncovered);
}

/**
 * Build output and local state (`.wrangler`, `playwright-report`, `.source`) are gitignored and never
 * audited, so they are removed from the uncovered list. Outside a git checkout, or when git is missing,
 * nothing is dropped.
 *
 * @param {string} root
 * @param {string[]} paths
 * @returns {string[]}
 */
function dropGitignored(root, paths) {
    if (paths.length === 0) {
        return paths;
    }
    let ignored = '';
    try {
        ignored = execFileSync('git', ['-C', root, 'check-ignore', '--stdin'], {
            input: `${paths.join('\n')}\n`,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
        });
    } catch (error) {
        // Exit 1 means "none of these are ignored"; anything else (no git, not a repository) also means keep all.
        ignored = typeof error.stdout === 'string' ? error.stdout : '';
    }
    const ignoredSet = new Set(ignored.split('\n').filter(Boolean));

    return paths.filter((entry) => !ignoredSet.has(entry));
}

/**
 * @param {string} text Ledger markdown.
 * @returns {LedgerRow[]} Rows in file order; everything outside the table is ignored.
 */
export function parseLedger(text) {
    const rows = [];
    let inTable = false;

    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (line === LEDGER_HEADER) {
            inTable = true;
            continue;
        }
        if (!inTable) {
            continue;
        }
        if (!line.startsWith('|')) {
            break;
        }
        const cells = line
            .slice(1, -1)
            .split('|')
            .map((cell) => cell.trim());
        if (cells.length !== 5 || cells[0].startsWith('--')) {
            continue;
        }
        const [key, kind, paths, audited, ticket] = cells;
        rows.push({ key: key.replace(/`/gu, ''), kind, paths: paths.replace(/`/gu, ''), audited, ticket });
    }

    return rows;
}

/** @param {Unit} unit @returns {string} The comma-joined paths cell. */
const pathsCell = (unit) => unit.paths.join(', ');

/**
 * Re-derive every row from the tree, keeping the human-owned columns of rows that still exist.
 *
 * @param {LedgerRow[]} existingRows
 * @param {Unit[]} units
 * @returns {{ rows: LedgerRow[], drifted: string[] }} New rows plus one line per added, removed or re-derived row.
 */
export function mergeLedger(existingRows, units) {
    const byKey = new Map(existingRows.map((row) => [row.key, row]));
    const drifted = [];
    const rows = units.map((unit) => {
        const previous = byKey.get(unit.key);
        const paths = pathsCell(unit);
        if (!previous) {
            drifted.push(`added ${unit.key}`);
        } else if (previous.kind !== unit.kind || previous.paths !== paths) {
            drifted.push(`re-derived ${unit.key}`);
        }

        return {
            key: unit.key,
            kind: unit.kind,
            paths,
            audited: previous?.audited ?? NEVER,
            ticket: previous?.ticket ?? NEVER,
        };
    });
    const keys = new Set(units.map((unit) => unit.key));
    for (const row of existingRows) {
        if (!keys.has(row.key)) {
            drifted.push(`removed ${row.key}`);
        }
    }

    return { rows, drifted };
}

/**
 * @param {LedgerRow[]} rows
 * @returns {string} The whole ledger file, compact-table style (one space of padding, never aligned).
 */
export function renderLedger(rows) {
    const lines = [
        '# Audit ledger',
        '',
        // Wrapped exactly as Prettier (printWidth 120) wraps it, so a regenerated ledger is already formatted.
        'One row per audit unit. The `Unit`, `Kind` and `Paths` columns are derived from the tree by `scripts/audit-modules.mjs`',
        'and rewritten by `pnpm run audit:modules`; never edit them by hand. `Last audited` and `Ticket` are written by',
        '`pnpm run audit:modules -- --stamp <date> <ticket> <unit>...` when a module ticket is filed, or by hand.',
        '`pnpm run audit:modules:check` (pre-push root pass and CI) fails when a unit has no row or a row has no unit, so a new',
        'directory or demo cannot be forgotten. How the units are read: `SKILL.md` in this directory.',
        '',
        LEDGER_HEADER,
        '| --- | --- | --- | --- | --- |',
        ...rows.map((row) => `| \`${row.key}\` | ${row.kind} | ${row.paths} | ${row.audited} | ${row.ticket} |`),
        '',
    ];

    return lines.join('\n');
}

/** @param {string} root @returns {LedgerRow[]} Rows on disk, or [] when the ledger does not exist yet. */
export function readLedger(root = ROOT) {
    const abs = join(root, LEDGER_REL);

    return existsSync(abs) ? parseLedger(readFileSync(abs, 'utf8')) : [];
}

/** @param {string} root @param {LedgerRow[]} rows */
function writeLedger(root, rows) {
    writeFileSync(join(root, LEDGER_REL), renderLedger(rows));
}

/**
 * Sync or check the ledger against the derived units.
 *
 * @param {object} options
 * @param {string} [options.root]
 * @param {boolean} [options.isCheck]
 * @returns {number} Exit code.
 */
export function syncLedger({ root = ROOT, isCheck = false } = {}) {
    const units = deriveUnits(root);
    const uncovered = findUncovered(root, units);

    if (uncovered.length > 0) {
        console.error(`\n${uncovered.length} path(s) no audit unit covers - add a rule to scripts/audit-modules.mjs:`);
        for (const entry of uncovered) {
            console.error(`  ${entry}`);
        }

        return 1;
    }

    const { rows, drifted } = mergeLedger(readLedger(root), units);
    if (!isCheck && (drifted.length > 0 || !existsSync(join(root, LEDGER_REL)))) {
        writeLedger(root, rows);
    }

    return reportSyncDrift({ drifted, total: rows.length, isCheck, noun: 'ledger row', syncScript: 'audit:modules' });
}

/**
 * Record an audit date and ticket on the named rows.
 *
 * @param {object} options
 * @param {string} [options.root]
 * @param {string} options.date `YYYY-MM-DD`.
 * @param {string} options.ticket Issue identifier such as `BT-753`.
 * @param {string[]} options.keys Unit keys to stamp.
 * @returns {number} Exit code.
 */
export function stampLedger({ root = ROOT, date, ticket, keys }) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
        console.error(`--stamp: date must be YYYY-MM-DD, got ${JSON.stringify(date)}`);
        return 1;
    }
    if (!/^[A-Z][A-Z0-9]*-\d+$/u.test(ticket)) {
        console.error(`--stamp: ticket must look like BT-123, got ${JSON.stringify(ticket)}`);
        return 1;
    }
    if (keys.length === 0) {
        console.error('--stamp: name at least one unit');
        return 1;
    }

    const rows = readLedger(root);
    const known = new Set(rows.map((row) => row.key));
    const unknown = keys.filter((key) => !known.has(key));
    if (unknown.length > 0) {
        console.error(`--stamp: no ledger row for ${unknown.join(', ')} (run pnpm run audit:modules first)`);
        return 1;
    }

    const wanted = new Set(keys);
    writeLedger(
        root,
        rows.map((row) => (wanted.has(row.key) ? { ...row, audited: date, ticket } : row)),
    );
    console.log(`stamped ${keys.length} row(s) with ${date} ${ticket}`);

    return 0;
}

/**
 * @param {string[]} argv Arguments after the script path.
 * @returns {number} Exit code.
 */
export function main(argv) {
    if (argv[0] === '--list') {
        const units = deriveUnits();
        if (argv.includes('--json')) {
            console.log(JSON.stringify(units, null, 2));
        } else {
            for (const unit of units) {
                console.log(`${unit.key}\t${unit.kind}\t${pathsCell(unit)}`);
            }
        }

        return 0;
    }
    if (argv[0] === '--stamp') {
        const [, date, ticket, ...keys] = argv;

        return stampLedger({ date, ticket, keys });
    }

    return syncLedger({ isCheck: argv.includes('--check') });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv.slice(2)));
}
