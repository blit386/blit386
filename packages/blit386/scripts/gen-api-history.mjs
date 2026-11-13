#!/usr/bin/env node
/**
 * Builds `docs/_api-history.json` - the versioned public API surface - from JSDoc
 * `@since` / `@changed` / `@deprecated` tags in `src/`.
 *
 * The engine's public entrypoint (`src/BLIT386.ts`) is the single source of truth: every
 * top-level `export {}` / `export type {}` name, plus every member of the `BT` namespace
 * object, is a public symbol. This script walks that surface with the TypeScript compiler
 * API (never regex over source text, so re-exports and JSDoc resolve reliably), reads each
 * symbol's version tags, and emits a deterministic JSON manifest: sorted keys, dates baked
 * in from git tags, no run timestamp, so regeneration is byte-identical until the tags
 * actually change.
 *
 * Usage:
 *   node scripts/gen-api-history.mjs                  # write docs/_api-history.json
 *   node scripts/gen-api-history.mjs --check          # report drift, write nothing, exit 1
 *   node scripts/gen-api-history.mjs --since-check    # exit 1 if any public export lacks @since
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { gitEnv } from '../../../scripts/lib/git-env.mjs';
import { relativeToRoot, runCheck } from './generated-file-check.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TSCONFIG_PATH = join(ROOT, 'tsconfig.json');
export const ENTRY_FILE = join(ROOT, 'src', 'BLIT386.ts');
const DOCS_DIR = join(ROOT, 'docs');
const OUTPUT_FILE = join(DOCS_DIR, '_api-history.json');
const PACKAGE_JSON_PATH = join(ROOT, 'package.json');

/**
 * The release this HEAD is building toward. There is no way to derive this automatically
 * (it is not yet tagged), so it is a maintained constant: bump it by hand in the same commit
 * that bumps `package.json` `version` after a release ships.
 */
const UNRELEASED_VERSION = '1.8.1';

/**
 * Versions past `UNRELEASED_VERSION` a tag may name on purpose. Each entry is a release already
 * planned on a milestone; drop it once `UNRELEASED_VERSION` catches up.
 * 1.9.0: `@changed 1.9.0` on `BT.renderAt` (BT-727, on the 1.9.0 milestone).
 */
const ALLOWED_FUTURE_VERSIONS = ['1.9.0'];

/** A tag version is a plain `major.minor.patch` - no `v` prefix, no pre-release suffix. */
const PLAIN_SEMVER = /^\d+\.\d+\.\d+$/u;

/** Compiler options used when no real tsconfig is supplied (fixture / unit-test programs). */
export const DEFAULT_TEST_COMPILER_OPTIONS = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
    noEmit: true,
};

/**
 * Flattens a JSDoc tag's `comment` (a plain string, or a `NodeArray<JSDocComment>` mixing
 * text and `{@link}` nodes) into plain text, preserving `{@link Name}` markup so downstream
 * consumers (docs prose) keep the link.
 *
 * @param {string | ts.NodeArray<ts.JSDocComment> | undefined} comment - Raw tag comment.
 * @returns {string} Flattened comment text.
 */
export function commentToText(comment) {
    if (comment === undefined) {
        return '';
    }

    if (typeof comment === 'string') {
        return comment;
    }

    return comment
        .map((part) => {
            if (ts.isJSDocLink(part) || ts.isJSDocLinkCode(part) || ts.isJSDocLinkPlain(part)) {
                const name = part.name ? entityNameToText(part.name) : '';

                return `{@link ${name}}${part.text ?? ''}`;
            }

            return part.text ?? '';
        })
        .join('');
}

/**
 * Renders a JSDoc link target (`EntityName` or `JSDocMemberName`) back to dotted text.
 *
 * @param {ts.EntityName | ts.JSDocMemberName} node - Link target node.
 * @returns {string} Dotted/hashed text representation.
 */
function entityNameToText(node) {
    if (node.text !== undefined) {
        return node.text;
    }

    if (node.left && node.right) {
        const separator = node.kind === ts.SyntaxKind.JSDocMemberName ? '#' : '.';

        return `${entityNameToText(node.left)}${separator}${entityNameToText(node.right)}`;
    }

    return '';
}

/** Matches both `@deprecated` forms: date-only (legacy) and `since <version> (date)`. */
const DEPRECATED_PATTERN =
    /^Deprecated since (?:(?<version>\d+\.\d+\.\d+) \((?<versionDate>\d{4}-\d{2}-\d{2})\)|(?<date>\d{4}-\d{2}-\d{2}))\.?\s*(?<note>[\s\S]*)$/u;

/**
 * Parses an `@deprecated` tag's comment text into a structured record. Backward compatible
 * with the 52 pre-existing date-only tags (`version` resolves to `null`).
 *
 * @param {string} text - Flattened `@deprecated` comment text.
 * @returns {{ version: string | null, date: string | null, note: string }} Parsed fields.
 */
export function parseDeprecatedTag(text) {
    const match = DEPRECATED_PATTERN.exec(text);

    if (!match?.groups) {
        return { version: null, date: null, note: text.trim() };
    }

    const { version, versionDate, date, note } = match.groups;

    return {
        version: version ?? null,
        date: versionDate ?? date ?? null,
        note: note.trim(),
    };
}

/**
 * Warns (to stderr) about an `@changed` tag whose text doesn't match `<version> <note>` - a
 * missing version token, or a version with no note - so a malformed tag is visibly dropped
 * during manifest generation rather than silently discarded, matching how `--since-check`
 * surfaces missing `@since` tags instead of guessing at them.
 *
 * @param {ts.Node} declaration - Declaration the malformed tag was found on.
 * @param {string} text - Raw `@changed` comment text that failed to parse.
 */
function warnMalformedChangedTag(declaration, text) {
    const sourceFile = declaration.getSourceFile();
    const { line } = sourceFile.getLineAndCharacterOfPosition(declaration.getStart());

    console.warn(
        `[gen-api-history] malformed @changed tag at ${relativeToRoot(sourceFile.fileName)}:${line + 1} - ` +
            `expected "<version> <note>", got: ${JSON.stringify(text)}`,
    );
}

/**
 * Reads `@since` / `@changed` / `@deprecated` off a declaration node via the compiler API.
 *
 * @param {ts.Node} declaration - Declaration node to inspect.
 * @returns {{
 *   since: string | null,
 *   changes: Array<{ version: string, note: string }>,
 *   deprecated: { version: string | null, date: string | null, note: string } | null,
 * }} Parsed version tags.
 */
export function extractTags(declaration) {
    let since = null;
    const changes = [];
    let deprecated = null;

    for (const tag of ts.getJSDocTags(declaration)) {
        const tagName = tag.tagName.text;
        const text = commentToText(tag.comment).trim();

        if (tagName === 'since') {
            since = text.length > 0 ? text : null;
        } else if (tagName === 'changed') {
            const match = /^(\S+)\s+([\s\S]*)$/u.exec(text);

            if (match) {
                changes.push({ version: match[1], note: match[2].trim() });
            } else {
                warnMalformedChangedTag(declaration, text);
            }
        } else if (tagName === 'deprecated') {
            deprecated = parseDeprecatedTag(text);
        }
    }

    changes.sort((a, b) => compareVersions(a.version, b.version));

    return { since, changes, deprecated };
}

/**
 * Compares two bare `major.minor.patch` version strings numerically (no pre-release/build
 * metadata support - this project's tags are plain semver).
 *
 * @param {string} a - First version.
 * @param {string} b - Second version.
 * @returns {number} Negative if `a < b`, positive if `a > b`, zero if equal.
 */
export function compareVersions(a, b) {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    const length = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < length; i += 1) {
        // eslint-disable-next-line security/detect-object-injection -- bounded loop counter
        const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);

        if (diff !== 0) {
            return diff;
        }
    }

    return 0;
}

/**
 * Derives a symbol's `status` badge: `deprecated` wins outright (it is a stronger signal than
 * release state), then `unreleased` for the configured unreleased version or missing/untagged
 * future versions, otherwise `stable`.
 *
 * Manual sync: `SymbolStatus` in packages/website/src/data/api-history.ts re-types these three
 * values, and `since-badge.tsx` there compares them. Change all three places together.
 *
 * @param {{ since: string | null, deprecated: unknown }} entry - Symbol's parsed tags.
 * @param {{ packageVersion: string, unreleasedVersion: string, hasTag: (version: string) => boolean }} context
 *   - Release context.
 * @returns {'stable' | 'unreleased' | 'deprecated'} Derived status.
 */
export function deriveStatus(entry, context) {
    if (entry.deprecated) {
        return 'deprecated';
    }

    if (!entry.since) {
        return 'unreleased';
    }

    if (entry.since === context.unreleasedVersion) {
        return 'unreleased';
    }

    if (compareVersions(entry.since, context.packageVersion) > 0 && !context.hasTag(entry.since)) {
        return 'unreleased';
    }

    return 'stable';
}

/**
 * Builds a `ts.Program` from an explicit file list, for fixture-driven unit tests that do not
 * want the real `tsconfig.json`.
 *
 * @param {string[]} rootNames - Entry file paths.
 * @param {ts.CompilerOptions} [options] - Compiler options; defaults to a minimal ES2022/bundler set.
 * @returns {ts.Program} Compiled program.
 */
export function createProgramFromFiles(rootNames, options = DEFAULT_TEST_COMPILER_OPTIONS) {
    return ts.createProgram({ rootNames, options });
}

/**
 * Resolves the real `tsconfig.json`'s fully-parsed compiler options (correct `lib` mapping,
 * `moduleResolution`, etc.) without pulling in its whole `include` file list - the program only
 * needs the public entrypoint as a root; the compiler follows imports from there.
 *
 * @returns {ts.CompilerOptions} Parsed compiler options.
 */
function loadRepoCompilerOptions() {
    const configFile = ts.readConfigFile(TSCONFIG_PATH, ts.sys.readFile);

    if (configFile.error) {
        throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
    }

    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ROOT);

    return parsed.options;
}

/**
 * Builds the real repo's `ts.Program`, rooted at the public entrypoint.
 *
 * @returns {ts.Program} Compiled program for `src/BLIT386.ts`.
 */
export function createRepoProgram() {
    return ts.createProgram({
        rootNames: [ENTRY_FILE],
        options: loadRepoCompilerOptions(),
    });
}

/**
 * Resolves an export symbol through its alias (an `export { X }` / `export type { X }` name)
 * to the symbol backing its real declaration.
 *
 * @param {ts.TypeChecker} checker - Type checker for the program.
 * @param {ts.Symbol} symbol - Export symbol, possibly an alias.
 * @returns {ts.Symbol} Resolved (non-alias) symbol.
 */
function resolveAliasedSymbol(checker, symbol) {
    if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
        return checker.getAliasedSymbol(symbol);
    }

    return symbol;
}

/**
 * Classifies a top-level declaration's kind for the JSON `kind` field.
 *
 * @param {ts.Node} declaration - Resolved declaration node.
 * @returns {'class' | 'interface' | 'type' | 'function' | 'const' | 'unknown'} Symbol kind.
 */
function classifyDeclarationKind(declaration) {
    if (ts.isClassDeclaration(declaration)) {
        return 'class';
    }

    if (ts.isInterfaceDeclaration(declaration)) {
        return 'interface';
    }

    if (ts.isTypeAliasDeclaration(declaration)) {
        return 'type';
    }

    if (ts.isFunctionDeclaration(declaration)) {
        return 'function';
    }

    if (ts.isVariableDeclaration(declaration)) {
        const initializer = declaration.initializer;

        if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
            return 'function';
        }

        return 'const';
    }

    return 'unknown';
}

/**
 * Classifies a `BT` namespace member's kind (getter vs method vs plain constant), matching the
 * getters-vs-methods convention documented in `CLAUDE.md`.
 *
 * @param {ts.Node} declaration - Member declaration node (property of the `BT` object literal).
 * @returns {'getter' | 'setter' | 'method' | 'const' | 'unknown'} Member kind.
 */
function classifyBtMemberKind(declaration) {
    if (ts.isGetAccessor(declaration)) {
        return 'getter';
    }

    if (ts.isSetAccessor(declaration)) {
        return 'setter';
    }

    if (ts.isMethodDeclaration(declaration)) {
        return 'method';
    }

    if (ts.isPropertyAssignment(declaration)) {
        let initializer = declaration.initializer;

        // `BT.drawTile` is `(arrow) as { overloads }` - object literals cannot declare overloads directly.
        while (
            initializer &&
            (ts.isAsExpression(initializer) ||
                ts.isSatisfiesExpression(initializer) ||
                ts.isParenthesizedExpression(initializer))
        ) {
            initializer = initializer.expression;
        }

        if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
            return 'method';
        }

        return 'const';
    }

    if (ts.isShorthandPropertyAssignment(declaration)) {
        return 'const';
    }

    return 'unknown';
}

/**
 * Walks the type of the resolved `BT` (or fixture equivalent) export and yields one record per
 * member property, keyed `BT.<member>`.
 *
 * @param {ts.TypeChecker} checker - Type checker for the program.
 * @param {ts.Symbol} btSymbol - Resolved symbol for the namespace object export.
 * @param {string} exportName - Public name of the namespace export (`'BT'` in production).
 * @returns {Array<{ name: string, kind: string, tags: object }>}
 *   One record per member.
 */
function collectNamespaceMemberRecords(checker, btSymbol, exportName) {
    const declaration = btSymbol.valueDeclaration;

    if (!declaration) {
        return [];
    }

    const type = checker.getTypeOfSymbolAtLocation(btSymbol, declaration);

    return checker.getPropertiesOfType(type).flatMap((propertySymbol) => {
        const memberDeclaration = propertySymbol.valueDeclaration ?? propertySymbol.getDeclarations()?.[0];

        if (!memberDeclaration) {
            return [];
        }

        return [
            {
                name: `${exportName}.${propertySymbol.getName()}`,
                kind: classifyBtMemberKind(memberDeclaration),
                tags: extractTags(memberDeclaration),
            },
        ];
    });
}

/**
 * Enumerates every public symbol reachable from the entrypoint module: every
 * `checker.getExportsOfModule` export (already resolved through re-exports), plus every member
 * of the configured namespace object export (`BT` in production), each carrying its parsed
 * version tags.
 *
 * @param {ts.Program} program - Compiled program.
 * @param {string} entryFilePath - Absolute path to the public entrypoint module.
 * @param {{ namespaceExportName?: string }} [options] - `namespaceExportName` defaults to `'BT'`;
 *   override for fixtures that use a different namespace object name.
 * @returns {Array<{ name: string, kind: string, tags: object }>}
 *   One record per public symbol.
 */
export function collectSymbolRecords(program, entryFilePath, options = {}) {
    const namespaceExportName = options.namespaceExportName ?? 'BT';
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(entryFilePath);

    if (!sourceFile) {
        throw new Error(`Entry file not found in program: ${entryFilePath}`);
    }

    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);

    if (!moduleSymbol) {
        throw new Error(`No module symbol resolved for entry file: ${entryFilePath}`);
    }

    const records = [];

    for (const exportSymbol of checker.getExportsOfModule(moduleSymbol)) {
        const name = exportSymbol.getName();
        const resolved = resolveAliasedSymbol(checker, exportSymbol);

        if (name === namespaceExportName) {
            records.push(...collectNamespaceMemberRecords(checker, resolved, namespaceExportName));
            continue;
        }

        const declaration = resolved.valueDeclaration ?? resolved.getDeclarations()?.[0];

        if (!declaration) {
            continue;
        }

        records.push({
            name,
            kind: classifyDeclarationKind(declaration),
            tags: extractTags(declaration),
        });
    }

    return records;
}

/**
 * Thin wrapper over {@link collectSymbolRecords} returning just the `{ kind, since, changes,
 * deprecated }` data needed for the JSON manifest, keyed by symbol name.
 *
 * @param {ts.Program} program - Compiled program.
 * @param {string} entryFilePath - Absolute path to the public entrypoint module.
 * @param {{ namespaceExportName?: string }} [options] - See {@link collectSymbolRecords}.
 * @returns {Record<string, { kind: string, since: string | null, changes: Array<object>, deprecated: object | null }>}
 *   Parsed tags keyed by symbol name.
 */
export function enumerateSymbols(program, entryFilePath, options = {}) {
    const symbols = {};

    for (const record of collectSymbolRecords(program, entryFilePath, options)) {
        symbols[record.name] = { kind: record.kind, ...record.tags };
    }

    return symbols;
}

/**
 * Resolves a tag's commit date via `git log -1 --format=%aI <tag>`. Returns `null` when the tag
 * does not exist locally (shallow clones, or a version that has not shipped yet).
 *
 * @param {string} tag - Tag name (bare semver, no `v` prefix).
 * @param {{ cwd?: string }} [runOptions] - `cwd` to run git in; defaults to the repo root.
 * @returns {string | null} ISO 8601 tag date, or `null` if unresolved.
 */
export function resolveTagDate(tag, runOptions = {}) {
    const cwd = runOptions.cwd ?? ROOT;

    try {
        const output = execFileSync('git', ['log', '-1', '--format=%aI', tag], {
            cwd,
            encoding: 'utf8',
            env: gitEnv(),
            stdio: ['ignore', 'pipe', 'ignore'], // a missing tag is an expected answer, not noise
        }).trim();

        return output.length > 0 ? output : null;
    } catch {
        return null;
    }
}

/**
 * Lists every `@since` / `@changed` / `@deprecated` version that is not plain semver, or that
 * is past `unreleasedVersion` without being named in `allowedFutureVersions`.
 *
 * @param {Record<string, { since: string | null, changes: Array<{ version: string }>, deprecated: { version: string | null } | null }>} symbols
 * @param {{ unreleasedVersion: string, allowedFutureVersions?: string[] }} context
 * @returns {string[]} One readable line per problem, sorted; empty when every version is valid.
 */
export function findVersionProblems(symbols, context) {
    const allowed = context.allowedFutureVersions ?? [];
    const problems = [];

    for (const [name, entry] of Object.entries(symbols)) {
        const tagged = [
            ['since', entry.since],
            ...entry.changes.map((change) => ['changed', change.version]),
            ['deprecated', entry.deprecated?.version ?? null],
        ];
        for (const [tag, version] of tagged) {
            if (version === null) {
                continue;
            }
            if (!PLAIN_SEMVER.test(version)) {
                problems.push(`${name}: @${tag} ${JSON.stringify(version)} is not a plain major.minor.patch version`);
            } else if (compareVersions(version, context.unreleasedVersion) > 0 && !allowed.includes(version)) {
                problems.push(
                    `${name}: @${tag} ${version} is past the next release ${context.unreleasedVersion} ` +
                        '(add it to ALLOWED_FUTURE_VERSIONS if that release is planned)',
                );
            }
        }
    }

    return problems.sort();
}

/**
 * Throws when the checkout has no git tags at all. Without tags every release date resolves to
 * `null` and `--check` reports a generic drift, so name the real cause up front.
 *
 * @param {{ cwd?: string }} [runOptions] - `cwd` to run git in; defaults to the repo root.
 */
export function assertReleaseTagsPresent(runOptions = {}) {
    const tags = execFileSync('git', ['tag', '--list'], {
        cwd: runOptions.cwd ?? ROOT,
        encoding: 'utf8',
        env: gitEnv(),
    }).trim();

    if (tags.length === 0) {
        throw new Error(
            'This is a tag-less checkout (no git tags at all), so release dates cannot be resolved. ' +
                'Run `git fetch --tags` (or clone without --no-tags / a shallow depth) and try again.',
        );
    }
}

/**
 * Builds the `versions` map: every version referenced anywhere (`packageVersion`,
 * `unreleasedVersion`, and every symbol's `since` / `changed` / `deprecated` version), each
 * resolved to its tag date once. The unreleased version always maps to `null`.
 *
 * @param {Record<string, { since: string | null, changes: Array<{ version: string }>, deprecated: { version: string | null } | null }>} symbols
 *   Parsed symbol tags.
 * @param {string} packageVersion - Current `package.json` version.
 * @param {string} unreleasedVersion - Configured next-release version.
 * @param {(version: string) => string | null} [resolveDate] - Injectable for tests.
 * @returns {Record<string, string | null>} Version -> ISO date (or `null`), sorted by version.
 */
export function buildVersionsMap(symbols, packageVersion, unreleasedVersion, resolveDate = resolveTagDate) {
    const versionSet = new Set([packageVersion, unreleasedVersion]);

    for (const entry of Object.values(symbols)) {
        if (entry.since) {
            versionSet.add(entry.since);
        }

        for (const change of entry.changes) {
            versionSet.add(change.version);
        }

        if (entry.deprecated?.version) {
            versionSet.add(entry.deprecated.version);
        }
    }

    const versions = {};

    for (const version of [...versionSet].sort(compareVersions)) {
        // eslint-disable-next-line security/detect-object-injection -- version string from our own versionSet, not external input
        versions[version] = version === unreleasedVersion ? null : resolveDate(version);
    }

    return versions;
}

/**
 * Maps a doc filename to its sitemap-style page key (`api-core-types.md` -> `api/core-types`,
 * `guide-audio.md` -> `guides/audio`).
 *
 * @param {string} filename - Doc filename.
 * @returns {string} Page key.
 */
function pageKeyFromFilename(filename) {
    const withoutExt = filename.replace(/\.md$/u, '');

    if (withoutExt.startsWith('api-')) {
        return `api/${withoutExt.slice('api-'.length)}`;
    }

    if (withoutExt.startsWith('guide-')) {
        return `guides/${withoutExt.slice('guide-'.length)}`;
    }

    return withoutExt;
}

/**
 * Scans `docs/api-*.md` and `docs/guide-*.md` for `<Since symbol="X" ...>` occurrences to build
 * the page -> symbols membership map (no separate manifest to keep in sync).
 *
 * @param {string} [docsDir] - Docs directory to scan; defaults to the repo's `docs/`.
 * @returns {Record<string, string[]>} Page key -> sorted, de-duplicated symbol names.
 */
export function buildPagesMap(docsDir = DOCS_DIR) {
    if (!existsSync(docsDir)) {
        return {};
    }

    const pages = {};
    const files = readdirSync(docsDir).filter((file) => /^(?:api|guide)-.*\.md$/u.test(file));

    for (const file of files.sort()) {
        const content = readFileSync(join(docsDir, file), 'utf8');
        const symbolNames = [...content.matchAll(/<Since\s+symbol="([^"]+)"/gu)].map((match) => match[1]);

        if (symbolNames.length === 0) {
            continue;
        }

        pages[pageKeyFromFilename(file)] = [...new Set(symbolNames)].sort();
    }

    return pages;
}

/**
 * Assembles the deterministic `docs/_api-history.json` shape: sorted `symbols` and `versions`
 * keys, dates baked in, no run timestamp.
 *
 * @param {Record<string, { kind: string, since: string | null, changes: Array<object>, deprecated: object | null }>} rawSymbols
 *   Output of {@link enumerateSymbols}.
 * @param {{ packageVersion: string, unreleasedVersion: string, allowedFutureVersions?: string[], docsDir?: string, resolveDate?: (version: string) => string | null }} params
 *   Assembly parameters.
 * @returns {{ packageVersion: string, unreleasedVersion: string, versions: object, symbols: object, pages: object }}
 *   Full manifest, ready for `JSON.stringify`.
 */
export function buildApiHistoryJson(rawSymbols, params) {
    const {
        packageVersion,
        unreleasedVersion,
        allowedFutureVersions = [],
        docsDir = DOCS_DIR,
        resolveDate = resolveTagDate,
    } = params;
    const problems = findVersionProblems(rawSymbols, { unreleasedVersion, allowedFutureVersions });
    if (problems.length > 0) {
        throw new Error(`${problems.length} invalid version tag(s):\n  ${problems.join('\n  ')}`);
    }
    const versions = buildVersionsMap(rawSymbols, packageVersion, unreleasedVersion, resolveDate);
    const hasTag = (version) =>
        // eslint-disable-next-line security/detect-object-injection -- version string from our own versionSet, not external input
        Object.hasOwn(versions, version) && versions[version] !== null;

    const symbols = {};

    for (const name of Object.keys(rawSymbols).sort()) {
        // eslint-disable-next-line security/detect-object-injection -- name comes from Object.keys(rawSymbols), not external input
        const entry = rawSymbols[name];
        const changes = [...entry.changes].sort((a, b) => compareVersions(a.version, b.version));

        // eslint-disable-next-line security/detect-object-injection -- name comes from Object.keys(rawSymbols), not external input
        symbols[name] = {
            kind: entry.kind,
            since: entry.since,
            changes,
            deprecated: entry.deprecated,
            status: deriveStatus(entry, {
                packageVersion,
                unreleasedVersion,
                hasTag,
            }),
        };
    }

    return {
        packageVersion,
        unreleasedVersion,
        versions,
        symbols,
        pages: buildPagesMap(docsDir),
    };
}

/**
 * Reads `package.json`'s `version` field.
 *
 * @returns {string} Current package version.
 */
function loadPackageVersion() {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));

    return pkg.version;
}

/**
 * Runs the full generate pipeline against the real repo: build the program, enumerate symbols,
 * assemble the manifest.
 *
 * @returns {object} Full `docs/_api-history.json` contents (as a JS object, not yet serialized).
 */
function generate() {
    assertReleaseTagsPresent();
    const program = createRepoProgram();
    const rawSymbols = enumerateSymbols(program, ENTRY_FILE);

    return buildApiHistoryJson(rawSymbols, {
        packageVersion: loadPackageVersion(),
        unreleasedVersion: UNRELEASED_VERSION,
        allowedFutureVersions: ALLOWED_FUTURE_VERSIONS,
    });
}

/**
 * Parses CLI flags into a plain options object. Pure (no `process` access) so it is unit
 * testable without spawning the script.
 *
 * @param {string[]} argv - `process.argv.slice(2)`-style argument list.
 * @returns {{ isCheck: boolean, isSinceCheck: boolean }} Parsed CLI options.
 */
export function parseCliArgs(argv) {
    return {
        isCheck: argv.includes('--check'),
        isSinceCheck: argv.includes('--since-check'),
    };
}

/**
 * Runs `--since-check`: fails when any enumerated public export lacks `@since`, catching new
 * exports that landed without a version tag.
 */
function runSinceCheck() {
    const program = createRepoProgram();
    const rawSymbols = enumerateSymbols(program, ENTRY_FILE);
    const missing = Object.keys(rawSymbols)
        // eslint-disable-next-line security/detect-object-injection -- name comes from Object.keys(rawSymbols), not external input
        .filter((name) => !rawSymbols[name].since)
        .sort();

    if (missing.length === 0) {
        console.log('All public exports carry an @since tag.');

        return;
    }

    console.error(`${missing.length} public export(s) missing @since:`);

    for (const name of missing) {
        console.error(`  ${name}`);
    }

    process.exit(1);
}

/** CLI entry point. */
function main() {
    const { isCheck, isSinceCheck } = parseCliArgs(process.argv.slice(2));

    if (isSinceCheck) {
        runSinceCheck();

        return;
    }

    const history = generate();
    const json = `${JSON.stringify(history, null, 2)}\n`;

    if (isCheck) {
        runCheck(OUTPUT_FILE, json, 'api:history');

        return;
    }

    if (!existsSync(DOCS_DIR)) {
        mkdirSync(DOCS_DIR, { recursive: true });
    }

    writeFileSync(OUTPUT_FILE, json);
    console.log(`Wrote ${relativeToRoot(OUTPUT_FILE)} (${Object.keys(history.symbols).length} symbols).`);
}

const isMainModule = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
    main();
}
