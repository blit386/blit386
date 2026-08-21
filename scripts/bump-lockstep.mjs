#!/usr/bin/env node
/**
 * Set blit386, @blit386/kit, and create-blit386 to the same lockstep SemVer version, plus every
 * value derived from it: BTAPI's `VERSION_MAJOR` / `VERSION_MINOR` / `VERSION_PATCH`, the kit's
 * `blit386.engineRange`, and the scaffolder's `BLIT386_RANGE`. Lockstep releases must never leave
 * any of the three packages, or a derived range, out of sync.
 *
 * Usage:
 *   node scripts/bump-lockstep.mjs 1.5.0
 *   pnpm run bump -- 1.5.0
 *   node scripts/bump-lockstep.mjs --check   (read-only; verifies the checked-in values)
 *   pnpm run bump:check
 *
 * Does not create git tags, commit, or publish. Dry-run with --dry-run.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo root, resolved from this script's own location at repo-root `scripts/`. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The engine's `package.json` path, relative to `ROOT`. */
export const ENGINE_PACKAGE_JSON_PATH = 'packages/blit386/package.json';

/** The kit's `package.json` path, relative to `ROOT`. */
export const KIT_PACKAGE_JSON_PATH = 'packages/kit/package.json';

/** The scaffolder's `package.json` path, relative to `ROOT`. */
export const CREATE_BLIT386_PACKAGE_JSON_PATH = 'packages/create-blit386/package.json';

/** The three publishable packages' `package.json` paths, relative to `ROOT`. */
export const LOCKSTEP_PACKAGE_JSON_PATHS = [
    ENGINE_PACKAGE_JSON_PATH,
    KIT_PACKAGE_JSON_PATH,
    CREATE_BLIT386_PACKAGE_JSON_PATH,
];

/** Source file holding the engine's own version constants, relative to `ROOT`. */
export const ENGINE_VERSION_FILE = 'packages/blit386/src/core/BTAPI.ts';

/** Source file holding the scaffolder's pinned engine range, relative to `ROOT`. */
export const SCAFFOLD_RANGE_FILE = 'packages/create-blit386/src/scaffold.ts';

/** SemVer `x.y.z` only (no prerelease / build metadata; no leading zeros). */
export const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

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
 * Derive the caret range the kit's `engineRange` and the scaffolder's `BLIT386_RANGE` pin to: the
 * major and minor of the lockstep version, patch pinned to zero. A caret range already admits
 * future patch/minor releases within the same major, so pinning to `.0` rather than the exact
 * patch avoids re-deriving it on every patch release.
 *
 * @param {string} version SemVer `x.y.z`.
 * @returns {string} `^x.y.0`.
 */
export function deriveCaretRange(version) {
    const [major, minor] = parseVersionArg(version).split('.');

    return `^${major}.${minor}.0`;
}

/**
 * Index just past the closing quote of the JSON string literal starting at `start`.
 *
 * @param {string} raw JSON text.
 * @param {number} start Index of the opening quote.
 * @returns {number} Index one past the closing quote.
 * @throws {Error} When the literal is unterminated.
 */
function endOfStringLiteral(raw, start) {
    let index = start + 1;

    while (index < raw.length) {
        const char = raw[index];

        if (char === '\\') {
            index += 2;
            continue;
        }

        if (char === '"') {
            return index + 1;
        }

        index += 1;
    }

    throw new Error('Invalid JSON: unterminated string literal');
}

/**
 * Locate the top-level `"version"` string value inside already-valid JSON text.
 *
 * Scans with a depth counter so a nested `"version"` key (inside `dependencies`,
 * `publishConfig`, a script body, ...) is never mistaken for the real one. When a
 * manifest repeats the key at the top level, the last one wins, matching what
 * `JSON.parse` resolved.
 *
 * @param {string} raw JSON text.
 * @returns {{ start: number, end: number }} Half-open span of the value literal, quotes included.
 * @throws {Error} When no top-level `"version"` string literal is present.
 */
function findTopLevelVersionSpan(raw) {
    /** @type {{ start: number, end: number } | undefined} */
    let span;
    let depth = 0;
    let index = 0;

    while (index < raw.length) {
        const char = raw[index];

        if (char === '"') {
            const literalEnd = endOfStringLiteral(raw, index);

            if (depth !== 1) {
                index = literalEnd;
                continue;
            }

            let cursor = literalEnd;

            while (cursor < raw.length && /\s/u.test(raw[cursor])) {
                cursor += 1;
            }

            if (raw[cursor] !== ':') {
                index = literalEnd;
                continue;
            }

            cursor += 1;

            while (cursor < raw.length && /\s/u.test(raw[cursor])) {
                cursor += 1;
            }

            if (raw.slice(index, literalEnd) === '"version"' && raw[cursor] === '"') {
                span = { start: cursor, end: endOfStringLiteral(raw, cursor) };
            }

            // Resume at the value so it is never re-read as a key.
            index = cursor;
            continue;
        }

        if (char === '{' || char === '[') {
            depth += 1;
        } else if (char === '}' || char === ']') {
            depth -= 1;
        }

        index += 1;
    }

    if (span === undefined) {
        throw new Error('package.json is missing a string "version" field');
    }

    return span;
}

/**
 * Locate a `"<key>": "<value>"` string field anywhere in already-valid JSON text. Unlike
 * {@link findTopLevelVersionSpan}, this is not depth- or top-level-restricted: it is only ever
 * used for keys (`engineRange`) that appear exactly once in the manifests this script touches.
 *
 * @param {string} raw JSON text.
 * @param {string} key Field name to find.
 * @returns {{ start: number, end: number }} Half-open span of the value literal, quotes included.
 * @throws {Error} When no such string field is present.
 */
function findStringFieldSpan(raw, key) {
    const keyLiteral = JSON.stringify(key);
    let index = 0;

    while (index < raw.length) {
        const char = raw[index];

        if (char !== '"') {
            index += 1;
            continue;
        }

        const literalEnd = endOfStringLiteral(raw, index);

        if (raw.slice(index, literalEnd) === keyLiteral) {
            let cursor = literalEnd;

            while (cursor < raw.length && /\s/u.test(raw[cursor])) {
                cursor += 1;
            }

            if (raw[cursor] === ':') {
                cursor += 1;

                while (cursor < raw.length && /\s/u.test(raw[cursor])) {
                    cursor += 1;
                }

                if (raw[cursor] === '"') {
                    return { start: cursor, end: endOfStringLiteral(raw, cursor) };
                }
            }
        }

        index = literalEnd;
    }

    throw new Error(`package.json is missing a string "${key}" field`);
}

/**
 * Rewrite only the top-level `version` value, leaving every other byte alone.
 *
 * Deliberately textual rather than a `JSON.stringify` round-trip: re-serializing
 * would reindent the whole manifest to this script's own spacing and break
 * `format:check` on the next release step.
 *
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

    const { start, end } = findTopLevelVersionSpan(raw);

    return {
        next: `${raw.slice(0, start)}${JSON.stringify(version)}${raw.slice(end)}`,
        previous: record.version,
    };
}

/**
 * Rewrite the kit's `blit386.engineRange` field to a derived caret range, same textual-patch
 * discipline as {@link applyVersion}.
 *
 * @param {string} raw `packages/kit/package.json` contents.
 * @param {string} range New caret range (from {@link deriveCaretRange}).
 * @returns {{ next: string, previous: string }} Updated JSON text and the prior range.
 */
export function applyEngineRange(raw, range) {
    const { start, end } = findStringFieldSpan(raw, 'engineRange');
    const previous = JSON.parse(raw.slice(start, end));

    return {
        next: `${raw.slice(0, start)}${JSON.stringify(range)}${raw.slice(end)}`,
        previous,
    };
}

const VERSION_MAJOR_RE = /(public static readonly VERSION_MAJOR = )(\d+)(;)/u;
const VERSION_MINOR_RE = /(public static readonly VERSION_MINOR = )(\d+)(;)/u;
const VERSION_PATCH_RE = /(public static readonly VERSION_PATCH = )(\d+)(;)/u;

/**
 * Rewrite `BTAPI`'s `VERSION_MAJOR` / `VERSION_MINOR` / `VERSION_PATCH` constants.
 *
 * @param {string} raw `packages/blit386/src/core/BTAPI.ts` contents.
 * @param {string} version New SemVer `x.y.z`.
 * @returns {{ next: string, previous: string }} Updated source text and the prior `x.y.z`.
 * @throws {Error} When any of the three constants is missing.
 */
export function applyEngineVersionConstants(raw, version) {
    const majorMatch = raw.match(VERSION_MAJOR_RE);
    const minorMatch = raw.match(VERSION_MINOR_RE);
    const patchMatch = raw.match(VERSION_PATCH_RE);

    if (!majorMatch || !minorMatch || !patchMatch) {
        throw new Error('BTAPI.ts is missing one of VERSION_MAJOR / VERSION_MINOR / VERSION_PATCH');
    }

    const previous = `${majorMatch[2]}.${minorMatch[2]}.${patchMatch[2]}`;
    const [major, minor, patch] = version.split('.');
    const next = raw
        .replace(VERSION_MAJOR_RE, `$1${major}$3`)
        .replace(VERSION_MINOR_RE, `$1${minor}$3`)
        .replace(VERSION_PATCH_RE, `$1${patch}$3`);

    return { next, previous };
}

const BLIT386_RANGE_RE = /(const BLIT386_RANGE = ')([^']+)(';)/u;

/**
 * Rewrite the scaffolder's `BLIT386_RANGE` constant to a derived caret range.
 *
 * @param {string} raw `packages/create-blit386/src/scaffold.ts` contents.
 * @param {string} range New caret range (from {@link deriveCaretRange}).
 * @returns {{ next: string, previous: string }} Updated source text and the prior range.
 * @throws {Error} When the constant is missing.
 */
export function applyBlit386Range(raw, range) {
    const match = raw.match(BLIT386_RANGE_RE);

    if (!match) {
        throw new Error('scaffold.ts is missing the BLIT386_RANGE constant');
    }

    const previous = match[2];
    const next = raw.replace(BLIT386_RANGE_RE, `$1${range}$3`);

    return { next, previous };
}

/**
 * One physical file this script writes, and how to derive its next contents plus the
 * human-readable result rows (one file can report more than one logical field, e.g. the kit's
 * `package.json` reports both its own `version` and its derived `engineRange`).
 *
 * @typedef {{ path: string, apply: (raw: string, version: string) => { next: string, results: { path: string, previous: string, next: string }[] } }} LockstepTarget
 */

/**
 * A lockstep target whose `apply` only rewrites its `package.json`'s top-level `version` – no
 * derived fields. Shared by the engine's and scaffolder's manifests, which are otherwise identical.
 *
 * @param {string} path Package.json path, relative to `ROOT`.
 * @returns {LockstepTarget}
 */
function versionOnlyTarget(path) {
    return {
        path,
        apply: (raw, version) => {
            const { next, previous } = applyVersion(raw, version);
            return { next, results: [{ path, previous, next: version }] };
        },
    };
}

/** @type {LockstepTarget[]} */
const LOCKSTEP_TARGETS = [
    versionOnlyTarget(ENGINE_PACKAGE_JSON_PATH),
    {
        path: ENGINE_VERSION_FILE,
        apply: (raw, version) => {
            const { next, previous } = applyEngineVersionConstants(raw, version);
            return {
                next,
                results: [{ path: `${ENGINE_VERSION_FILE} (VERSION_MAJOR/MINOR/PATCH)`, previous, next: version }],
            };
        },
    },
    {
        path: KIT_PACKAGE_JSON_PATH,
        apply: (raw, version) => {
            const versionResult = applyVersion(raw, version);
            const range = deriveCaretRange(version);
            const rangeResult = applyEngineRange(versionResult.next, range);
            return {
                next: rangeResult.next,
                results: [
                    { path: KIT_PACKAGE_JSON_PATH, previous: versionResult.previous, next: version },
                    {
                        path: `${KIT_PACKAGE_JSON_PATH} (blit386.engineRange)`,
                        previous: rangeResult.previous,
                        next: range,
                    },
                ],
            };
        },
    },
    versionOnlyTarget(CREATE_BLIT386_PACKAGE_JSON_PATH),
    {
        path: SCAFFOLD_RANGE_FILE,
        apply: (raw, version) => {
            const range = deriveCaretRange(version);
            const { next, previous } = applyBlit386Range(raw, range);
            return { next, results: [{ path: `${SCAFFOLD_RANGE_FILE} (BLIT386_RANGE)`, previous, next: range }] };
        },
    },
];

/**
 * @param {{ root?: string, version: string, dryRun?: boolean, readFile?: (path: string) => string, writeFile?: (path: string, data: string) => void }} options
 * @returns {{ path: string, previous: string, next: string }[]} Per-field bump results.
 */
export function bumpLockstep(options) {
    const root = options.root ?? ROOT;
    const version = parseVersionArg(options.version);
    const dryRun = options.dryRun === true;
    const readFile = options.readFile ?? ((path) => readFileSync(path, 'utf8'));
    const writeFile = options.writeFile ?? ((path, data) => writeFileSync(path, data, 'utf8'));

    /** @type {{ absolute: string, next: string, previousContents: string, results: { path: string, previous: string, next: string }[] }[]} */
    const staged = [];

    for (const target of LOCKSTEP_TARGETS) {
        const absolute = join(root, target.path);
        const raw = readFile(absolute);
        const { next, results } = target.apply(raw, version);
        staged.push({ absolute, next, previousContents: raw, results });
    }

    const results = staged.flatMap((entry) => entry.results);

    if (dryRun) {
        return results;
    }

    /** @type {{ absolute: string, previousContents: string }[]} */
    const written = [];

    try {
        for (const entry of staged) {
            if (entry.next === entry.previousContents) {
                continue;
            }

            writeFile(entry.absolute, entry.next);

            written.push({ absolute: entry.absolute, previousContents: entry.previousContents });
        }
    } catch (error) {
        /** @type {{ absolute: string, error: unknown }[]} */
        const rollbackFailures = [];

        for (const entry of written.reverse()) {
            try {
                writeFile(entry.absolute, entry.previousContents);
            } catch (rollbackError) {
                rollbackFailures.push({ absolute: entry.absolute, error: rollbackError });
            }
        }

        if (rollbackFailures.length === 0) {
            throw error;
        }

        const originalMessage = error instanceof Error ? error.message : String(error);
        const rollbackMessage = rollbackFailures
            .map(
                (failure) =>
                    `  ${failure.absolute}: ${failure.error instanceof Error ? failure.error.message : String(failure.error)}`,
            )
            .join('\n');

        throw new Error(
            `${originalMessage}\nAdditionally, rollback failed for ${rollbackFailures.length} file(s), left at the bumped version:\n${rollbackMessage}`,
        );
    }

    return results;
}

/**
 * Verify every lockstep target already holds the value derived from the engine's own version.
 *
 * Read-only counterpart to {@link bumpLockstep}. `packages/blit386/package.json`'s version is the
 * anchor (the engine anchors semver for all three packages), every other value is re-derived from it
 * with the exact transforms the bump uses, and any field whose checked-in value differs is reported.
 * A target already in step is a fixed point of its own transform, so this needs no second copy of
 * the derivation rules – which is the point: `bump` is a writer run once per release, and until now
 * nothing verified the result afterwards. A hand edit, a bad merge, or a cherry-pick drifted
 * silently.
 *
 * The engine's own `package.json` is a target too, and is trivially in step with the version read
 * out of it; keeping it in the loop keeps the iteration uniform.
 *
 * @param {{ root?: string, readFile?: (path: string) => string }} [options] Root and reader overrides.
 * @returns {{ version: string, drift: { path: string, actual: string, expected: string }[] }} The anchor version and every drifted field.
 */
export function checkLockstep(options = {}) {
    const root = options.root ?? ROOT;
    const readFile = options.readFile ?? ((path) => readFileSync(path, 'utf8'));

    const enginePkg = JSON.parse(readFile(join(root, ENGINE_PACKAGE_JSON_PATH)));

    if (typeof enginePkg.version !== 'string') {
        throw new Error(`${ENGINE_PACKAGE_JSON_PATH} is missing a string "version" field.`);
    }

    const version = parseVersionArg(enginePkg.version);

    /** @type {{ path: string, actual: string, expected: string }[]} */
    const drift = [];

    for (const target of LOCKSTEP_TARGETS) {
        const { results } = target.apply(readFile(join(root, target.path)), version);

        for (const result of results) {
            if (result.previous !== result.next) {
                drift.push({ path: result.path, actual: result.previous, expected: result.next });
            }
        }
    }

    return { version, drift };
}

/**
 * @param {string[]} argv Process argv (including node + script path).
 * @returns {{ mode: 'check' } | { mode: 'bump', version: string, dryRun: boolean }} The parsed command-line arguments.
 */
export function parseArgv(argv) {
    const args = argv.slice(2).filter((arg) => arg !== '--');
    const check = args.includes('--check');
    const dryRun = args.includes('--dry-run');
    const positional = args.filter((arg) => arg !== '--dry-run' && arg !== '--check');

    if (check) {
        if (dryRun) {
            throw new Error('Usage: --check and --dry-run are mutually exclusive.');
        }

        if (positional.length > 0) {
            throw new Error(`Usage: --check derives the version from ${ENGINE_PACKAGE_JSON_PATH}; do not pass one.`);
        }

        return { mode: 'check' };
    }

    if (positional.length !== 1) {
        throw new Error(
            'Usage: node scripts/bump-lockstep.mjs <x.y.z> [--dry-run] | node scripts/bump-lockstep.mjs --check',
        );
    }

    return { mode: 'bump', version: parseVersionArg(positional[0]), dryRun };
}

/**
 * @param {string[]} argv Process argv (including node + script path).
 * @param {{ log?: (message: string) => void, error?: (message: string) => void, bump?: typeof bumpLockstep, check?: typeof checkLockstep }} [hooks] Optional hooks for logging, bumping, and checking.
 * @returns {number} Process exit code.
 */
export function main(argv, hooks = {}) {
    const log = hooks.log ?? console.log;
    const error = hooks.error ?? console.error;
    const bump = hooks.bump ?? bumpLockstep;
    const check = hooks.check ?? checkLockstep;

    try {
        const parsed = parseArgv(argv);

        if (parsed.mode === 'check') {
            const { version, drift } = check({});

            if (drift.length === 0) {
                log(`Lockstep is in step at ${version}.`);
                return 0;
            }

            error(`Lockstep drift against ${ENGINE_PACKAGE_JSON_PATH} version ${version}:`);

            for (const entry of drift) {
                error(`  ${entry.path}: ${entry.actual} (expected ${entry.expected})`);
            }

            error(`Run \`pnpm run bump -- ${version}\` to restore, or bump to a new version.`);
            return 1;
        }

        const { version, dryRun } = parsed;
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
