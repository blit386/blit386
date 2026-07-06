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
 *   node scripts/gen-api-history.mjs --backfill       # one-time codemod, see Risks below
 *   node scripts/gen-api-history.mjs --methods A,B    # Phase 2 (class methods); not yet implemented
 *
 * `--backfill` derives each symbol's introducing release via `git log -S` + `git describe
 * --tags --contains` (the "pickaxe" technique) and writes `@since <version>` straight into
 * the JSDoc block in source, upgrading any date-only `@deprecated` line to also carry the
 * version. This is a one-time, human-reviewed operation: pickaxe matching can find a later
 * refactor commit instead of the true introduction (a renamed or reformatted declaration is
 * the classic failure), so every inserted tag needs a diff review before commit. Never run
 * `--backfill` as part of routine CI.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TSCONFIG_PATH = join(ROOT, 'tsconfig.json');
const ENTRY_FILE = join(ROOT, 'src', 'BLIT386.ts');
const DOCS_DIR = join(ROOT, 'docs');
const OUTPUT_FILE = join(DOCS_DIR, '_api-history.json');
const PACKAGE_JSON_PATH = join(ROOT, 'package.json');

/**
 * The release this HEAD is building toward. There is no way to derive this automatically
 * (it is not yet tagged), so it is a maintained constant: bump it by hand in the same commit
 * that bumps `package.json` `version` after a release ships.
 */
const UNRELEASED_VERSION = '1.3.0';

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
    /^Deprecated since (?:(?<version>\d+\.\d+\.\d+) \((?<vdate>\d{4}-\d{2}-\d{2})\)|(?<date>\d{4}-\d{2}-\d{2}))\.?\s*(?<note>[\s\S]*)$/u;

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

    const { version, vdate, date, note } = match.groups;

    return {
        version: version ?? null,
        date: vdate ?? date ?? null,
        note: note.trim(),
    };
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
function createRepoProgram() {
    return ts.createProgram({ rootNames: [ENTRY_FILE], options: loadRepoCompilerOptions() });
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
        const initializer = declaration.initializer;

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
 * @returns {Array<{ name: string, kind: string, node: ts.Node, sourceFile: ts.SourceFile, tags: object }>}
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
                node: memberDeclaration,
                sourceFile: memberDeclaration.getSourceFile(),
                tags: extractTags(memberDeclaration),
            },
        ];
    });
}

/**
 * Enumerates every public symbol reachable from the entrypoint module: every
 * `checker.getExportsOfModule` export (already resolved through re-exports), plus every member
 * of the configured namespace object export (`BT` in production), each carrying its parsed
 * version tags and the AST node/file needed for the `--backfill` codemod.
 *
 * @param {ts.Program} program - Compiled program.
 * @param {string} entryFilePath - Absolute path to the public entrypoint module.
 * @param {{ namespaceExportName?: string }} [options] - `namespaceExportName` defaults to `'BT'`;
 *   override for fixtures that use a different namespace object name.
 * @returns {Array<{ name: string, kind: string, node: ts.Node, sourceFile: ts.SourceFile, tags: object }>}
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
            node: declaration,
            sourceFile: declaration.getSourceFile(),
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
        const output = execFileSync('git', ['log', '-1', '--format=%aI', tag], { cwd, encoding: 'utf8' }).trim();

        return output.length > 0 ? output : null;
    } catch {
        return null;
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
 * @param {{ packageVersion: string, unreleasedVersion: string, docsDir?: string, resolveDate?: (version: string) => string | null }} params
 *   Assembly parameters.
 * @returns {{ packageVersion: string, unreleasedVersion: string, versions: object, symbols: object, pages: object }}
 *   Full manifest, ready for `JSON.stringify`.
 */
export function buildApiHistoryJson(rawSymbols, params) {
    const { packageVersion, unreleasedVersion, docsDir = DOCS_DIR, resolveDate = resolveTagDate } = params;
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
            status: deriveStatus(entry, { packageVersion, unreleasedVersion, hasTag }),
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
    const program = createRepoProgram();
    const rawSymbols = enumerateSymbols(program, ENTRY_FILE);

    return buildApiHistoryJson(rawSymbols, {
        packageVersion: loadPackageVersion(),
        unreleasedVersion: UNRELEASED_VERSION,
    });
}

/**
 * Finds the JSDoc (`/** ... *\/`) leading-comment range immediately attached to a node.
 *
 * @param {string} sourceText - Full source text of the node's file.
 * @param {ts.Node} node - Declaration node.
 * @returns {ts.CommentRange | null} The closest JSDoc comment range, or `null` if none.
 */
export function findJsDocCommentRange(sourceText, node) {
    const ranges = ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? [];
    const jsDocRanges = ranges.filter((range) => sourceText.slice(range.pos, range.pos + 3) === '/**');

    return jsDocRanges.at(-1) ?? null;
}

/**
 * Inserts an `@since <version>` line into a JSDoc comment's text, immediately before its first
 * existing tag line (or before the closing `*\/` when the block has no tags yet), matching the
 * surrounding indentation.
 *
 * @param {string} commentText - Full `/** ... *\/` comment text.
 * @param {string} version - Version to insert.
 * @returns {string} Updated comment text.
 */
export function insertSinceTag(commentText, version) {
    const lines = commentText.split('\n');
    const firstTagIndex = lines.findIndex((line) => /^\s*\*\s*@/u.test(line));
    // eslint-disable-next-line security/detect-object-injection -- firstTagIndex is a bounded findIndex result
    const referenceLine = firstTagIndex === -1 ? (lines.at(-1) ?? '') : lines[firstTagIndex];
    const indentMatch = /^(\s*)\*/u.exec(referenceLine);
    const indent = indentMatch ? indentMatch[1] : ' ';
    const newLine = `${indent}* @since ${version}`;

    if (firstTagIndex === -1) {
        lines.splice(lines.length - 1, 0, newLine);
    } else {
        lines.splice(firstTagIndex, 0, newLine);
    }

    return lines.join('\n');
}

/**
 * Upgrades a date-only `@deprecated Deprecated since <date>.` line to also carry the
 * introducing version: `@deprecated Deprecated since <version> (<date>).`. A no-op when the
 * line already carries a version.
 *
 * @param {string} commentText - Full `/** ... *\/` comment text.
 * @param {string} version - Version to insert.
 * @returns {string} Updated comment text.
 */
export function upgradeDeprecatedTag(commentText, version) {
    return commentText.replace(
        /(@deprecated\s+Deprecated since )(\d{4}-\d{2}-\d{2})/u,
        (_match, prefix, date) => `${prefix}${version} (${date})`,
    );
}

/**
 * Applies the `--backfill` codemod to one declaration: inserts `@since`, and when the
 * declaration also has a date-only `@deprecated` tag, upgrades it to carry the version too.
 *
 * @param {string} sourceText - Full source text of the declaration's file.
 * @param {ts.Node} node - Declaration node to tag.
 * @param {string} version - Introducing version to insert.
 * @param {{ upgradeDeprecated?: boolean }} [options] - Whether to also upgrade a bare `@deprecated` line.
 * @returns {string} Updated source text.
 */
export function applySinceCodemod(sourceText, node, version, options = {}) {
    const range = findJsDocCommentRange(sourceText, node);

    if (!range) {
        throw new Error('Cannot backfill @since: declaration has no JSDoc comment block.');
    }

    let commentText = sourceText.slice(range.pos, range.end);

    commentText = insertSinceTag(commentText, version);

    if (options.upgradeDeprecated) {
        commentText = upgradeDeprecatedTag(commentText, version);
    }

    return sourceText.slice(0, range.pos) + commentText + sourceText.slice(range.end);
}

/**
 * Strips a `git describe --tags --contains` suffix (`TAG~N` or `TAG^0`) down to the bare tag.
 *
 * @param {string} describeOutput - Raw `git describe` output.
 * @returns {string} Bare tag name.
 */
function stripDescribeSuffix(describeOutput) {
    const match = /^([^~^]+)/u.exec(describeOutput.trim());

    return match ? match[1] : describeOutput.trim();
}

/**
 * Runs the git-pickaxe archaeology technique (section 3.3): find the earliest commit whose diff
 * introduced `declarationText` in `filePath`, then resolve the first tag that contains it.
 * Returns `null` when either step fails - unresolved symbols need manual review, never a guess.
 *
 * @param {string} declarationText - Text to pickaxe-search for (e.g. `'export class Widget'`).
 * @param {string} filePath - Path to the file, relative to `cwd`.
 * @param {{ cwd?: string, execFile?: typeof execFileSync }} [runOptions] - Injectable for tests.
 * @returns {string | null} Introducing version tag, or `null` if unresolved.
 */
export function findIntroducingVersion(declarationText, filePath, runOptions = {}) {
    const cwd = runOptions.cwd ?? ROOT;
    const execFile = runOptions.execFile ?? execFileSync;

    let sha;

    try {
        const log = execFile('git', ['log', '-S', declarationText, '--format=%H', '--', filePath], {
            cwd,
            encoding: 'utf8',
        });
        const shas = log
            .trim()
            .split('\n')
            .filter((line) => line.length > 0);

        sha = shas.at(-1);
    } catch {
        return null;
    }

    if (!sha) {
        return null;
    }

    try {
        const describeOutput = execFile('git', ['describe', '--tags', '--contains', sha], { cwd, encoding: 'utf8' });

        return stripDescribeSuffix(describeOutput);
    } catch {
        return null;
    }
}

/**
 * Builds a reasonably specific pickaxe search string for a symbol record - specific enough to
 * avoid matching an unrelated later edit, per the Risks section (a bare method name like
 * `drawSprite:` can resolve to a later refactor instead of the true introduction).
 *
 * @param {{ name: string, node: ts.Node }} record - Symbol record from {@link collectSymbolRecords}.
 * @returns {string} Pickaxe search text.
 */
function pickaxeSearchText(record) {
    if (record.name.includes('.')) {
        const memberName = record.name.slice(record.name.indexOf('.') + 1);

        return ts.isGetAccessor(record.node) ? `get ${memberName}(` : `${memberName}:`;
    }

    if (ts.isClassDeclaration(record.node)) {
        return `export class ${record.name}`;
    }

    if (ts.isInterfaceDeclaration(record.node)) {
        return `interface ${record.name}`;
    }

    if (ts.isTypeAliasDeclaration(record.node)) {
        return `type ${record.name}`;
    }

    if (ts.isFunctionDeclaration(record.node)) {
        return `function ${record.name}`;
    }

    return `${record.name} =`;
}

/**
 * Path relative to the repo root, for readable console output.
 *
 * @param {string} filePath - Absolute file path.
 * @returns {string} Repo-relative path.
 */
function relativeToRoot(filePath) {
    return filePath.startsWith(ROOT) ? filePath.slice(ROOT.length + 1) : filePath;
}

/**
 * Runs `--backfill`: derives `@since` for every symbol currently missing it via git archaeology,
 * writes the tag (and upgrades any date-only `@deprecated` line) into source, and prints a
 * resolved/unresolved summary. Every write here needs a human diff review before commit - see
 * the module doc comment and brief section 11 (Risks and gotchas).
 */
function runBackfill() {
    const program = createRepoProgram();
    const pending = collectSymbolRecords(program, ENTRY_FILE).filter((record) => !record.tags.since);

    if (pending.length === 0) {
        console.log('Every public export already has @since; nothing to backfill.');

        return;
    }

    const byFile = new Map();

    for (const record of pending) {
        const filePath = record.sourceFile.fileName;

        if (!byFile.has(filePath)) {
            byFile.set(filePath, []);
        }

        byFile.get(filePath).push(record);
    }

    let resolvedCount = 0;
    let unresolvedCount = 0;

    for (const [filePath, records] of byFile) {
        let sourceText = readFileSync(filePath, 'utf8');

        // Bottom-to-top so an earlier insertion never shifts a not-yet-processed node's offsets.
        const orderedRecords = [...records].sort((a, b) => b.node.getStart() - a.node.getStart());

        for (const record of orderedRecords) {
            const searchText = pickaxeSearchText(record);
            const version = findIntroducingVersion(searchText, relativeToRoot(filePath));

            if (!version) {
                console.warn(`[backfill] UNRESOLVED: ${record.name} (${relativeToRoot(filePath)}) - tag it manually.`);
                unresolvedCount += 1;
                continue;
            }

            sourceText = applySinceCodemod(sourceText, record.node, version, {
                upgradeDeprecated: Boolean(record.tags.deprecated && !record.tags.deprecated.version),
            });
            console.log(`[backfill] ${record.name} -> @since ${version} (${relativeToRoot(filePath)})`);
            resolvedCount += 1;
        }

        writeFileSync(filePath, sourceText);
    }

    console.log(`\nBackfill complete: ${resolvedCount} resolved, ${unresolvedCount} unresolved.`);
    console.log('Review every inserted @since before committing - pickaxe matching is a heuristic, not a proof.');
}

/**
 * Parses CLI flags into a plain options object. Pure (no `process` access) so it is unit
 * testable without spawning the script.
 *
 * @param {string[]} argv - `process.argv.slice(2)`-style argument list.
 * @returns {{ isCheck: boolean, isSinceCheck: boolean, isBackfill: boolean, methodsClasses: string[] }}
 *   Parsed CLI options.
 */
export function parseCliArgs(argv) {
    const methodsIndex = argv.indexOf('--methods');
    const methodsClasses =
        methodsIndex === -1
            ? []
            : (argv[methodsIndex + 1] ?? '')
                  .split(',')
                  .map((name) => name.trim())
                  .filter((name) => name.length > 0);

    return {
        isCheck: argv.includes('--check'),
        isSinceCheck: argv.includes('--since-check'),
        isBackfill: argv.includes('--backfill'),
        methodsClasses,
    };
}

/**
 * Runs `--check`: regenerates the manifest in memory and diffs it against the committed
 * `docs/_api-history.json`, exiting non-zero on drift. Mirrors `sync-doc-banners.mjs --check`.
 *
 * @param {string} desiredJson - Freshly generated JSON text (already `\n`-terminated).
 */
function runCheck(desiredJson) {
    const relativeOutput = relativeToRoot(OUTPUT_FILE);
    const current = existsSync(OUTPUT_FILE) ? readFileSync(OUTPUT_FILE, 'utf8') : null;

    if (current === desiredJson) {
        console.log(`${relativeOutput} is up to date.`);

        return;
    }

    console.error(`${relativeOutput} is out of date.`);
    console.error('Run `pnpm run api:history` to regenerate it.');
    process.exit(1);
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
    const { isCheck, isSinceCheck, isBackfill, methodsClasses } = parseCliArgs(process.argv.slice(2));

    if (methodsClasses.length > 0) {
        console.log(
            `[gen-api-history] --methods ${methodsClasses.join(',')} received; class-method enumeration is Phase 2` +
                ' and not implemented yet - ignoring.',
        );
    }

    if (isSinceCheck) {
        runSinceCheck();

        return;
    }

    if (isBackfill) {
        runBackfill();

        return;
    }

    const history = generate();
    const json = `${JSON.stringify(history, null, 2)}\n`;

    if (isCheck) {
        runCheck(json);

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
