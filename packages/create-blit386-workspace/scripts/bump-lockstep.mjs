#!/usr/bin/env node
/**
 * Set both publishable packages (and the private workspace root) to the same
 * SemVer version. Lockstep releases must never leave `@blit386/kit` and
 * `create-blit386` on different versions.
 *
 * Usage:
 *   node scripts/bump-lockstep.mjs 1.3.0
 *   pnpm run bump -- 1.3.0
 *
 * Does not create git tags, commit, or publish. Dry-run with --dry-run.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Packages whose `version` field must match on every release. */
export const LOCKSTEP_PACKAGE_JSON_PATHS = [
    'package.json',
    'packages/kit/package.json',
    'packages/create-blit386/package.json',
];

/** SemVer `x.y.z` only (no prerelease / build metadata). */
export const SEMVER_RE = /^\d+\.\d+\.\d+$/u;

/**
 * @param {string | undefined} version Candidate version string.
 * @returns {string} Trimmed SemVer string.
 * @throws {Error} When missing or not `x.y.z`.
 */
export function parseVersionArg(version) {
    const trimmed = version?.trim() ?? '';
    if (!SEMVER_RE.test(trimmed)) {
        throw new Error(
            `Expected a SemVer x.y.z version (got ${version === undefined ? '(missing)' : JSON.stringify(version)}).`,
        );
    }
    return trimmed;
}

/**
 * @param {string} raw Package.json file contents.
 * @param {string} version New version to write.
 * @returns {{ next: string, previous: string }} Updated JSON text and the prior version.
 * @throws {Error} When JSON is invalid or has no string `version` field.
 */
export function applyVersion(raw, version) {
    /** @type {unknown} */
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid JSON: ${message}`);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('package.json must be a JSON object');
    }
    const record = /** @type {Record<string, unknown>} */ (parsed);
    if (typeof record.version !== 'string') {
        throw new Error('package.json is missing a string "version" field');
    }
    const previous = record.version;
    record.version = version;
    return { next: `${JSON.stringify(record, null, 4)}\n`, previous };
}

/**
 * @param {{ root?: string, version: string, dryRun?: boolean, readFile?: (path: string) => string, writeFile?: (path: string, data: string) => void }} options
 * @returns {{ path: string, previous: string, next: string }[]} Per-file bump results.
 */
export function bumpLockstep(options) {
    const root = options.root ?? ROOT;
    const version = parseVersionArg(options.version);
    const dryRun = options.dryRun === true;
    const readFile = options.readFile ?? ((path) => readFileSync(path, 'utf8'));
    const writeFile = options.writeFile ?? ((path, data) => writeFileSync(path, data, 'utf8'));

    /** @type {{ path: string, previous: string, next: string }[]} */
    const results = [];

    for (const rel of LOCKSTEP_PACKAGE_JSON_PATHS) {
        const absolute = join(root, rel);
        const raw = readFile(absolute);
        const { next, previous } = applyVersion(raw, version);
        if (!dryRun && previous !== version) {
            writeFile(absolute, next);
        }
        results.push({ path: rel, previous, next: version });
    }

    return results;
}

/**
 * @param {string[]} argv Process argv (including node + script path).
 * @returns {{ version: string, dryRun: boolean }}
 */
export function parseArgv(argv) {
    const args = argv.slice(2).filter((arg) => arg !== '--');
    const dryRun = args.includes('--dry-run');
    const positional = args.filter((arg) => arg !== '--dry-run');
    if (positional.length !== 1) {
        throw new Error('Usage: node scripts/bump-lockstep.mjs <x.y.z> [--dry-run]');
    }
    return { version: parseVersionArg(positional[0]), dryRun };
}

/**
 * @param {string[]} argv
 * @param {{ log?: (message: string) => void, bump?: typeof bumpLockstep }} [hooks]
 * @returns {number} Process exit code.
 */
export function main(argv, hooks = {}) {
    const log = hooks.log ?? console.log;
    const bump = hooks.bump ?? bumpLockstep;

    try {
        const { version, dryRun } = parseArgv(argv);
        const results = bump({ version, dryRun });
        const label = dryRun ? 'Would set' : 'Set';
        for (const result of results) {
            log(`${label} ${result.path}: ${result.previous} -> ${result.next}`);
        }
        if (dryRun) {
            log('(dry-run; no files written)');
        }
        return 0;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        return 1;
    }
}

const isDirectRun = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    process.exitCode = main(process.argv);
}
