import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import {
    applySinceCodemod,
    buildApiHistoryJson,
    buildPagesMap,
    buildVersionsMap,
    collectSymbolRecords,
    commentToText,
    compareVersions,
    createProgramFromFiles,
    deriveStatus,
    enumerateSymbols,
    extractTags,
    findIntroducingVersion,
    findJsDocCommentRange,
    insertSinceTag,
    parseCliArgs,
    parseDeprecatedTag,
    resolveTagDate,
    upgradeDeprecatedTag,
} from './gen-api-history.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, '__fixtures__', 'gen-api-history');
const ENTRY_FILE = join(FIXTURES_DIR, 'entry.ts');
const DOCS_FIXTURES_DIR = join(FIXTURES_DIR, 'docs');
const REPO_ROOT = resolve(HERE, '..');

/** Builds a fresh program + symbol map over the fixture module tree. */
function loadFixtureSymbols() {
    const program = createProgramFromFiles([ENTRY_FILE]);

    return enumerateSymbols(program, ENTRY_FILE, { namespaceExportName: 'FixtureBT' });
}

/** Recursively finds a property assignment named `name` anywhere in `sourceFile` (test helper). */
function findPropertyAssignment(sourceFile, name) {
    let found;

    const visit = (node) => {
        if (found) {
            return;
        }

        if (ts.isPropertyAssignment(node) && node.name.getText(sourceFile) === name) {
            found = node;

            return;
        }

        ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);

    return found;
}

describe('commentToText', () => {
    it('returns an empty string for undefined comments', () => {
        assert.equal(commentToText(undefined), '');
    });

    it('passes plain string comments through unchanged', () => {
        assert.equal(commentToText('1.0.3'), '1.0.3');
    });
});

describe('parseDeprecatedTag', () => {
    it('parses the legacy date-only form (version resolves to null)', () => {
        const result = parseDeprecatedTag('Deprecated since 2026-05-31. Use {@link isPointerActive} instead.');
        assert.deepEqual(result, {
            version: null,
            date: '2026-05-31',
            note: 'Use {@link isPointerActive} instead.',
        });
    });

    it('parses the versioned form: since <version> (date)', () => {
        const result = parseDeprecatedTag('Deprecated since 1.2.0 (2026-05-31). Use {@link isKeyReleased} instead.');
        assert.deepEqual(result, {
            version: '1.2.0',
            date: '2026-05-31',
            note: 'Use {@link isKeyReleased} instead.',
        });
    });

    it('falls back to a null version/date when the text does not match either form', () => {
        const result = parseDeprecatedTag('Just plain deprecated text.');
        assert.deepEqual(result, { version: null, date: null, note: 'Just plain deprecated text.' });
    });
});

describe('compareVersions', () => {
    it('orders by major, then minor, then patch', () => {
        assert.ok(compareVersions('0.2.0', '1.0.3') < 0);
        assert.ok(compareVersions('1.0.4', '1.0.3') > 0);
        assert.ok(compareVersions('1.2.0', '1.2.0') === 0);
        assert.ok(compareVersions('1.10.0', '1.2.0') > 0);
    });
});

describe('collectSymbolRecords / enumerateSymbols (fixture module graph)', () => {
    const symbols = loadFixtureSymbols();

    it('resolves a re-exported class to its real declaration, kind, since, and changes', () => {
        assert.deepEqual(symbols.Widget, {
            kind: 'class',
            since: '1.0.0',
            changes: [{ version: '1.2.0', note: 'Added the resize option.' }],
            deprecated: null,
        });
    });

    it('leaves since null for a symbol with no @since tag yet', () => {
        assert.equal(symbols.helper.since, null);
        assert.equal(symbols.helper.kind, 'function');
    });

    it('parses the legacy date-only @deprecated form on a re-exported function', () => {
        assert.deepEqual(symbols.legacyDeprecated.deprecated, {
            version: null,
            date: '2026-05-31',
            note: 'Use {@link helper} instead.',
        });
    });

    it('parses the versioned @deprecated form alongside its own @since', () => {
        assert.equal(symbols.versionedDeprecated.since, '1.0.3');
        assert.deepEqual(symbols.versionedDeprecated.deprecated, {
            version: '1.2.0',
            date: '2026-05-31',
            note: 'Use {@link helper} instead.',
        });
    });

    it('classifies a re-exported type alias as kind "type"', () => {
        assert.equal(symbols.FixtureType.kind, 'type');
    });

    it('classifies namespace object members as const / getter / method', () => {
        assert.equal(symbols['FixtureBT.MAX'].kind, 'const');
        assert.equal(symbols['FixtureBT.MAX'].since, '1.0.0');

        assert.equal(symbols['FixtureBT.value'].kind, 'getter');
        assert.equal(symbols['FixtureBT.value'].since, '1.0.0');

        assert.equal(symbols['FixtureBT.add'].kind, 'method');
        assert.equal(symbols['FixtureBT.add'].since, null);
    });

    it('collectSymbolRecords exposes the AST node and source file needed for backfill', () => {
        const program = createProgramFromFiles([ENTRY_FILE]);
        const records = collectSymbolRecords(program, ENTRY_FILE, { namespaceExportName: 'FixtureBT' });
        const widgetRecord = records.find((record) => record.name === 'Widget');

        assert.ok(widgetRecord);
        assert.equal(widgetRecord.sourceFile.fileName.endsWith('Source.ts'), true);
        assert.equal(typeof widgetRecord.node.getStart, 'function');
    });
});

describe('deriveStatus', () => {
    const hasTag = (version) => version !== '9.9.9';

    it('is "deprecated" regardless of release state', () => {
        const entry = { since: '1.0.0', deprecated: { version: '1.0.0', date: '2026-01-01', note: '' } };
        assert.equal(
            deriveStatus(entry, { packageVersion: '1.2.1', unreleasedVersion: '1.3.0', hasTag }),
            'deprecated',
        );
    });

    it('is "unreleased" when @since is missing', () => {
        const entry = { since: null, deprecated: null };
        assert.equal(
            deriveStatus(entry, { packageVersion: '1.2.1', unreleasedVersion: '1.3.0', hasTag }),
            'unreleased',
        );
    });

    it('is "unreleased" when @since equals the configured unreleased version', () => {
        const entry = { since: '1.3.0', deprecated: null };
        assert.equal(
            deriveStatus(entry, { packageVersion: '1.2.1', unreleasedVersion: '1.3.0', hasTag }),
            'unreleased',
        );
    });

    it('is "unreleased" when @since is newer than packageVersion and untagged', () => {
        const entry = { since: '9.9.9', deprecated: null };
        assert.equal(
            deriveStatus(entry, { packageVersion: '1.2.1', unreleasedVersion: '1.3.0', hasTag }),
            'unreleased',
        );
    });

    it('is "stable" when @since is tagged and not newer than packageVersion', () => {
        const entry = { since: '1.0.3', deprecated: null };
        assert.equal(deriveStatus(entry, { packageVersion: '1.2.1', unreleasedVersion: '1.3.0', hasTag }), 'stable');
    });
});

describe('buildVersionsMap', () => {
    it('resolves every referenced version once via the injected resolver, and nulls the unreleased version', () => {
        const symbols = {
            Widget: { since: '1.0.0', changes: [{ version: '1.2.0' }], deprecated: null },
            helper: { since: null, changes: [], deprecated: null },
            legacy: { since: '1.0.3', changes: [], deprecated: { version: '1.1.0' } },
        };
        const resolved = [];
        const resolveDate = (version) => {
            resolved.push(version);
            return `${version}-DATE`;
        };

        const versions = buildVersionsMap(symbols, '1.2.1', '1.3.0', resolveDate);

        assert.deepEqual(Object.keys(versions), ['1.0.0', '1.0.3', '1.1.0', '1.2.0', '1.2.1', '1.3.0']);
        assert.equal(versions['1.0.0'], '1.0.0-DATE');
        assert.equal(versions['1.3.0'], null); // Unreleased version is never resolved.
        assert.deepEqual(resolved.sort(), ['1.0.0', '1.0.3', '1.1.0', '1.2.0', '1.2.1'].sort());
    });
});

describe('resolveTagDate (real git integration)', () => {
    it('resolves a known repo tag to an ISO-8601 date string', () => {
        const date = resolveTagDate('1.2.0', { cwd: REPO_ROOT });
        assert.match(date ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u);
    });

    it('returns null for a tag that does not exist', () => {
        assert.equal(resolveTagDate('99.99.99-does-not-exist', { cwd: REPO_ROOT }), null);
    });
});

describe('buildPagesMap', () => {
    it('scans api-*.md / guide-*.md for <Since symbol="X"> and de-duplicates, ignoring other files', () => {
        const pages = buildPagesMap(DOCS_FIXTURES_DIR);

        assert.deepEqual(pages, {
            'api/widgets': ['FixtureBT.value', 'Widget'],
            'guides/widgets': ['helper'],
        });
    });

    it('returns an empty object for a missing docs directory', () => {
        assert.deepEqual(buildPagesMap(join(FIXTURES_DIR, 'does-not-exist')), {});
    });
});

describe('buildApiHistoryJson', () => {
    it('produces a deterministic, sorted manifest with the documented shape', () => {
        const rawSymbols = loadFixtureSymbols();
        const resolveDate = (version) => `${version}T00:00:00+00:00`;

        const history = buildApiHistoryJson(rawSymbols, {
            packageVersion: '1.2.1',
            unreleasedVersion: '1.3.0',
            docsDir: DOCS_FIXTURES_DIR,
            resolveDate,
        });

        assert.equal(history.packageVersion, '1.2.1');
        assert.equal(history.unreleasedVersion, '1.3.0');
        assert.deepEqual(Object.keys(history), ['packageVersion', 'unreleasedVersion', 'versions', 'symbols', 'pages']);

        const symbolNames = Object.keys(history.symbols);
        assert.deepEqual(symbolNames, [...symbolNames].sort());

        assert.deepEqual(history.symbols.Widget, {
            kind: 'class',
            since: '1.0.0',
            changes: [{ version: '1.2.0', note: 'Added the resize option.' }],
            deprecated: null,
            status: 'stable',
        });

        assert.equal(history.symbols.helper.status, 'unreleased');
        assert.equal(history.symbols.legacyDeprecated.status, 'deprecated');
        assert.equal(history.symbols.versionedDeprecated.status, 'deprecated');

        // The manifest carries no run-generated fields (e.g. a "generatedAt" timestamp) -
        // only the documented top-level keys asserted above, each built from source/git data.
    });

    it('is byte-identical across two independent runs (regeneration determinism)', () => {
        const rawSymbols = loadFixtureSymbols();
        const params = {
            packageVersion: '1.2.1',
            unreleasedVersion: '1.3.0',
            docsDir: DOCS_FIXTURES_DIR,
            resolveDate: (version) => `${version}T00:00:00+00:00`,
        };

        const first = JSON.stringify(buildApiHistoryJson(rawSymbols, params), null, 2);
        const second = JSON.stringify(buildApiHistoryJson(loadFixtureSymbols(), params), null, 2);

        assert.equal(first, second);
    });
});

describe('JSDoc backfill codemod', () => {
    it('insertSinceTag inserts before the first existing tag, matching its indentation', () => {
        const comment = ['    /**', '     * A helper.', '     *', '     * @param x - Input.', '     */'].join('\n');

        const updated = insertSinceTag(comment, '1.0.3');

        assert.equal(
            updated,
            [
                '    /**',
                '     * A helper.',
                '     *',
                '     * @since 1.0.3',
                '     * @param x - Input.',
                '     */',
            ].join('\n'),
        );
    });

    it('insertSinceTag appends before the closing */ when the block has no tags', () => {
        const comment = ['/**', ' * A helper with no tags yet.', ' */'].join('\n');

        const updated = insertSinceTag(comment, '1.0.0');

        assert.equal(updated, ['/**', ' * A helper with no tags yet.', ' * @since 1.0.0', ' */'].join('\n'));
    });

    it('upgradeDeprecatedTag adds a version to a date-only @deprecated line', () => {
        const comment = ['/**', ' * @deprecated Deprecated since 2026-05-31. Use {@link isDown} instead.', ' */'].join(
            '\n',
        );

        const updated = upgradeDeprecatedTag(comment, '1.1.0');

        assert.match(updated, /@deprecated Deprecated since 1\.1\.0 \(2026-05-31\)\. Use \{@link isDown\} instead\./u);
    });

    it('upgradeDeprecatedTag is a no-op when a version is already present', () => {
        const comment = '/**\n * @deprecated Deprecated since 1.1.0 (2026-05-31). Use isDown instead.\n */';
        assert.equal(upgradeDeprecatedTag(comment, '9.9.9'), comment);
    });

    it('findJsDocCommentRange + applySinceCodemod round-trip on a real fixture declaration', async () => {
        const { readFileSync } = await import('node:fs');
        const program = createProgramFromFiles([ENTRY_FILE]);
        const records = collectSymbolRecords(program, ENTRY_FILE, { namespaceExportName: 'FixtureBT' });
        const helperRecord = records.find((record) => record.name === 'helper');

        assert.ok(helperRecord);

        const sourceText = readFileSync(helperRecord.sourceFile.fileName, 'utf8');
        const range = findJsDocCommentRange(sourceText, helperRecord.node);

        assert.ok(range);
        assert.equal(sourceText.slice(range.pos, range.pos + 3), '/**');
    });

    it('insertSinceTag expands a single-line comment into a multi-line block, preserving the description', () => {
        const comment = '/** Horizontal flip flag for sprite rendering. */';

        const updated = insertSinceTag(comment, '1.2.0', { baseIndent: '    ' });

        assert.equal(
            updated,
            ['/**', '     * Horizontal flip flag for sprite rendering.', '     * @since 1.2.0', '     */'].join('\n'),
        );
    });

    it('insertSinceTag expands a single-line comment with no baseIndent (top-level declaration)', () => {
        const comment = '/** A top-level single-line description. */';

        const updated = insertSinceTag(comment, '2.0.0');

        assert.equal(updated, ['/**', ' * A top-level single-line description.', ' * @since 2.0.0', ' */'].join('\n'));
    });

    it('applySinceCodemod expands a real single-line-JSDoc namespace member into valid multi-line JSDoc', async () => {
        const { readFileSync } = await import('node:fs');
        const program = createProgramFromFiles([ENTRY_FILE]);
        const records = collectSymbolRecords(program, ENTRY_FILE, { namespaceExportName: 'FixtureBT' });
        const flagRecord = records.find((record) => record.name === 'FixtureBT.flag');

        assert.ok(flagRecord);

        const sourceText = readFileSync(flagRecord.sourceFile.fileName, 'utf8');
        const range = findJsDocCommentRange(sourceText, flagRecord.node);

        assert.ok(range);
        assert.equal(sourceText.slice(range.pos, range.end).includes('\n'), false, 'fixture comment is single-line');

        const updatedSource = applySinceCodemod(sourceText, flagRecord.node, '1.2.0');

        // The inserted tag must land inside a real multi-line JSDoc block, never as bare text
        // outside any comment (the exact regression this fix addresses).
        assert.match(
            updatedSource,
            /\/\*\*\n\s+\* Fixture single-line JSDoc member, no version tag yet - matches the real `BT` namespace style\.\n\s+\* @since 1\.2\.0\n\s+\*\/\n\s+flag: 1,/u,
        );

        // Re-parsing the updated text (in memory - never touching the fixture file on disk) must
        // still find a well-formed `flag` property with the newly inserted @since, and no parse
        // errors, proving the codemod output is valid, re-consumable TypeScript/JSDoc.
        const reparsedSourceFile = ts.createSourceFile(
            flagRecord.sourceFile.fileName,
            updatedSource,
            ts.ScriptTarget.ES2022,
            true,
        );
        const flagNode = findPropertyAssignment(reparsedSourceFile, 'flag');

        assert.ok(flagNode, 'expected to find the re-parsed `flag` property assignment');
        assert.deepEqual(extractTags(flagNode), {
            since: '1.2.0',
            changes: [],
            deprecated: null,
        });
    });
});

describe('findIntroducingVersion (git pickaxe, mocked execFile)', () => {
    it('strips a TAG~N describe suffix down to the bare tag', () => {
        const execFile = (_git, args) => {
            if (args.includes('-S')) {
                return 'abc123\n';
            }
            return '1.2.0~3\n';
        };

        assert.equal(findIntroducingVersion('export class Widget', 'src/Widget.ts', { execFile }), '1.2.0');
    });

    it('strips a TAG^0 describe suffix (exact tag commit) down to the bare tag', () => {
        const execFile = (_git, args) => (args.includes('-S') ? 'abc123\n' : '1.2.0^0\n');

        assert.equal(findIntroducingVersion('export class Widget', 'src/Widget.ts', { execFile }), '1.2.0');
    });

    it('returns null when the pickaxe search finds no commit', () => {
        const execFile = () => '';

        assert.equal(findIntroducingVersion('export class Ghost', 'src/Ghost.ts', { execFile }), null);
    });

    it('returns null when git describe fails (e.g. commit not reachable from any tag)', () => {
        const execFile = (_git, args) => {
            if (args.includes('-S')) {
                return 'abc123\n';
            }
            throw new Error('fatal: no tag exactly matches');
        };

        assert.equal(findIntroducingVersion('export class Widget', 'src/Widget.ts', { execFile }), null);
    });

    it('passes --follow to git log -S so pickaxe search survives file renames', () => {
        const logArgs = [];
        const execFile = (_git, args) => {
            if (args[0] === 'log') {
                logArgs.push(...args);

                return 'abc123\n';
            }

            return '1.2.0^0\n';
        };

        findIntroducingVersion('export class Widget', 'src/Widget.ts', { execFile });

        assert.ok(logArgs.includes('--follow'), 'expected git log invocation to include --follow');
        assert.ok(logArgs.includes('-S'), 'expected git log invocation to still include -S');
    });
});

describe('findIntroducingVersion (git pickaxe, real repo fixture with a rename)', () => {
    /**
     * Builds a throwaway git repo with a symbol declared before a file rename, then renamed and
     * edited afterward, mirroring the real regression: `src/BlitTech.ts` renamed to
     * `src/BLIT386.ts` shortly before a release tag, which made every symbol declared in that file
     * falsely resolve to the post-rename release when `git log` ran without `--follow`. A mocked
     * `execFile` cannot prove this - it only proves the codemod builds the argv it is told to
     * build. Only a real git repo proves the `--follow` flag itself changes pickaxe results.
     *
     * @returns {{ dir: string, oldSha: string, renameSha: string }} Fixture repo directory and the
     *   genesis commit / rename commit SHAs.
     */
    async function buildRenameFixtureRepo() {
        const { execFileSync } = await import('node:child_process');
        const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const dir = mkdtempSync(join(tmpdir(), 'gen-api-history-rename-'));
        const env = {
            ...process.env,
            GIT_AUTHOR_NAME: 'Test',
            GIT_AUTHOR_EMAIL: 'test@example.com',
            GIT_COMMITTER_NAME: 'Test',
            GIT_COMMITTER_EMAIL: 'test@example.com',
        };
        // -c commit.gpgsign=false / tag.gpgsign=false override the caller's global git config for
        // this throwaway, git-config-isolated fixture repo only - a machine with commit signing
        // enabled globally would otherwise fail these commits without a configured signing key.
        const run = (args) =>
            execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], {
                cwd: dir,
                encoding: 'utf8',
                env,
            });

        run(['init', '--initial-branch=main']);
        writeFileSync(join(dir, 'OldName.ts'), 'export const FLAG: number = 1;\n');
        run(['add', 'OldName.ts']);
        run(['commit', '-m', 'genesis: add FLAG in OldName.ts']);
        const oldSha = run(['log', '-1', '--format=%H']).trim();

        run(['mv', 'OldName.ts', 'NewName.ts']);
        run(['commit', '-m', 'rename: OldName.ts -> NewName.ts']);
        const renameSha = run(['log', '-1', '--format=%H']).trim();

        run(['tag', '-a', '1.0.0', '-m', '1.0.0', oldSha]);
        run(['tag', '-a', '2.0.0', '-m', '2.0.0', renameSha]);

        return { dir, oldSha, renameSha, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
    }

    it('resolves a symbol declared before a rename to the pre-rename tag, not the rename tag', async () => {
        const { execFileSync } = await import('node:child_process');
        const fixture = await buildRenameFixtureRepo();

        try {
            const version = findIntroducingVersion('FLAG: number = 1', 'NewName.ts', {
                cwd: fixture.dir,
                execFile: execFileSync,
            });

            assert.equal(version, '1.0.0', 'expected --follow to find the pre-rename genesis tag, not 2.0.0');
        } finally {
            fixture.cleanup();
        }
    });

    it('regresses to the wrong post-rename tag when --follow is omitted (proves the bug this test guards against)', async () => {
        const { execFileSync } = await import('node:child_process');
        const fixture = await buildRenameFixtureRepo();

        try {
            // Deliberately mimics the pre-fix argv (no --follow) to prove the old behavior really
            // was broken, and that the fix in findIntroducingVersion is what closes the gap.
            const execFileWithoutFollow = (_git, args, options) =>
                execFileSync(
                    'git',
                    args.filter((arg) => arg !== '--follow'),
                    options,
                );

            const version = findIntroducingVersion('FLAG: number = 1', 'NewName.ts', {
                cwd: fixture.dir,
                execFile: execFileWithoutFollow,
            });

            assert.equal(version, '2.0.0', 'without --follow, git log cannot see past the rename');
        } finally {
            fixture.cleanup();
        }
    });
});

describe('parseCliArgs', () => {
    it('defaults every flag to false and methodsClasses to an empty array', () => {
        assert.deepEqual(parseCliArgs([]), {
            isCheck: false,
            isSinceCheck: false,
            isBackfill: false,
            methodsClasses: [],
        });
    });

    it('recognizes --check, --since-check, and --backfill independently', () => {
        assert.equal(parseCliArgs(['--check']).isCheck, true);
        assert.equal(parseCliArgs(['--since-check']).isSinceCheck, true);
        assert.equal(parseCliArgs(['--backfill']).isBackfill, true);
    });

    it('parses --methods into a trimmed, non-empty class list without crashing (Phase 2 stub)', () => {
        assert.deepEqual(parseCliArgs(['--methods', 'Palette,Color32']).methodsClasses, ['Palette', 'Color32']);
        assert.deepEqual(parseCliArgs(['--methods', ' Palette , , Color32 ']).methodsClasses, ['Palette', 'Color32']);
        assert.deepEqual(parseCliArgs(['--methods']).methodsClasses, []);
    });
});
