import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
    applyBlit386Range,
    applyEngineRange,
    applyEngineVersionConstants,
    applyVersion,
    bumpLockstep,
    checkLockstep,
    CREATE_BLIT386_PACKAGE_JSON_PATH,
    deriveCaretRange,
    ENGINE_PACKAGE_JSON_PATH,
    ENGINE_VERSION_FILE,
    KIT_PACKAGE_JSON_PATH,
    LOCKSTEP_PACKAGE_JSON_PATHS,
    main,
    parseArgv,
    parseVersionArg,
    SCAFFOLD_RANGE_FILE,
    SEMVER_RE,
} from './bump-lockstep.mjs';

/** Builds a fixture file map for `bumpLockstep`, keyed by absolute path under `/repo`. */
function makeFixtureFiles() {
    return new Map([
        [
            join('/repo', ENGINE_PACKAGE_JSON_PATH),
            `${JSON.stringify({ name: 'blit386', version: '1.2.1' }, null, 4)}\n`,
        ],
        [
            join('/repo', ENGINE_VERSION_FILE),
            [
                'export class BTAPI {',
                '    public static readonly VERSION_MAJOR = 1;',
                '    public static readonly VERSION_MINOR = 2;',
                '    public static readonly VERSION_PATCH = 1;',
                '}',
                '',
            ].join('\n'),
        ],
        [
            join('/repo', KIT_PACKAGE_JSON_PATH),
            `${JSON.stringify(
                { name: '@blit386/kit', version: '1.2.1', blit386: { engineRange: '^1.2.0' } },
                null,
                4,
            )}\n`,
        ],
        [
            join('/repo', CREATE_BLIT386_PACKAGE_JSON_PATH),
            `${JSON.stringify({ name: 'create-blit386', version: '1.2.1' }, null, 4)}\n`,
        ],
        [
            join('/repo', SCAFFOLD_RANGE_FILE),
            ["const BLIT386_RANGE = '^1.2.0';", 'export function scaffold() {}', ''].join('\n'),
        ],
    ]);
}

/** Reads from a fixture file map, mirroring how the real script reads from disk. */
function readFrom(files) {
    return (path) => {
        const raw = files.get(path);

        if (raw === undefined) {
            throw new Error(`missing fixture: ${path}`);
        }

        return raw;
    };
}

describe('bump-lockstep', () => {
    describe('parseVersionArg', () => {
        it('accepts x.y.z including bare zeros', () => {
            assert.equal(parseVersionArg('1.3.0'), '1.3.0');
            assert.equal(parseVersionArg(' 2.0.0 '), '2.0.0');
            assert.equal(parseVersionArg('0.1.0'), '0.1.0');
            assert.equal(parseVersionArg('0.0.0'), '0.0.0');
            assert.ok(SEMVER_RE.test('10.20.30'));
        });

        it('rejects prerelease, leading zeros, missing, and garbage', () => {
            assert.throws(() => parseVersionArg('1.3.0-beta.1'), /Expected a SemVer/);
            assert.throws(() => parseVersionArg('v1.3.0'), /Expected a SemVer/);
            assert.throws(() => parseVersionArg('01.2.3'), /Expected a SemVer/);
            assert.throws(() => parseVersionArg('1.02.3'), /Expected a SemVer/);
            assert.throws(() => parseVersionArg('1.2.03'), /Expected a SemVer/);
            assert.throws(() => parseVersionArg(undefined), /missing/);
            assert.equal(SEMVER_RE.test('1.2'), false);
            assert.equal(SEMVER_RE.test('01.0.0'), false);
        });
    });

    describe('deriveCaretRange', () => {
        it('pins major.minor from the version and zeroes the patch', () => {
            assert.equal(deriveCaretRange('1.5.0'), '^1.5.0');
            assert.equal(deriveCaretRange('1.5.3'), '^1.5.0');
            assert.equal(deriveCaretRange('2.0.0'), '^2.0.0');
        });
    });

    describe('applyVersion', () => {
        it('rewrites version and preserves other fields', () => {
            const { next, previous } = applyVersion('{\n  "name": "demo",\n  "version": "1.2.1"\n}\n', '1.3.0');
            assert.equal(previous, '1.2.1');
            assert.deepEqual(JSON.parse(next), { name: 'demo', version: '1.3.0' });
            assert.ok(next.endsWith('\n'));
        });

        it('throws on invalid JSON or missing version', () => {
            assert.throws(() => applyVersion('{', '1.0.0'), /Invalid JSON/);
            assert.throws(() => applyVersion('{"name":"x"}', '1.0.0'), /missing a string "version"/);
        });

        // Biome formats JSON at 2 spaces; a JSON.stringify round-trip here reindented every
        // manifest and broke `format:check` on the next release step.
        it('touches nothing but the version value', () => {
            const raw = [
                '{',
                '  "name": "demo",',
                '  "version": "1.2.1",',
                '  "scripts": {',
                '    "build": "tsup"',
                '  },',
                '  "keywords": ["a", "b"]',
                '}',
                '',
            ].join('\n');
            const { next } = applyVersion(raw, '1.3.0');
            assert.equal(next, raw.replace('"1.2.1"', '"1.3.0"'));
        });

        it('ignores nested "version" keys', () => {
            const raw = '{\n  "dependencies": {\n    "version": "^7.0.0"\n  },\n  "version": "1.2.1"\n}\n';
            const { next, previous } = applyVersion(raw, '1.3.0');
            assert.equal(previous, '1.2.1');
            assert.deepEqual(JSON.parse(next), { dependencies: { version: '^7.0.0' }, version: '1.3.0' });
            assert.ok(next.includes('"version": "^7.0.0"'));
        });

        it('is not fooled by a colon inside a preceding string value', () => {
            const raw = '{\n  "description": "note: not a key",\n  "version": "1.2.1"\n}\n';
            const { next } = applyVersion(raw, '1.3.0');
            assert.equal(next, raw.replace('"1.2.1"', '"1.3.0"'));
        });

        it('is not fooled by an escaped quote in a preceding string value', () => {
            const raw = '{\n  "description": "say \\"version\\": \\"9.9.9\\"",\n  "version": "1.2.1"\n}\n';
            const { next, previous } = applyVersion(raw, '1.3.0');
            assert.equal(previous, '1.2.1');
            assert.equal(next, raw.replace('"1.2.1"', '"1.3.0"'));
            assert.equal(JSON.parse(next).description, 'say "version": "9.9.9"');
        });

        it('rewrites the last of duplicate top-level keys, the one JSON.parse resolves to', () => {
            const raw = '{\n  "version": "1.0.0",\n  "version": "1.2.1"\n}\n';
            const { next, previous } = applyVersion(raw, '1.3.0');
            assert.equal(previous, '1.2.1');
            assert.equal(next, '{\n  "version": "1.0.0",\n  "version": "1.3.0"\n}\n');
            assert.equal(JSON.parse(next).version, '1.3.0');
        });
    });

    describe('applyEngineRange', () => {
        it('rewrites blit386.engineRange and preserves other fields', () => {
            const raw = `${JSON.stringify(
                { name: '@blit386/kit', version: '1.2.1', blit386: { engineRange: '^1.2.0' } },
                null,
                4,
            )}\n`;
            const { next, previous } = applyEngineRange(raw, '^1.3.0');
            assert.equal(previous, '^1.2.0');
            assert.deepEqual(JSON.parse(next), {
                name: '@blit386/kit',
                version: '1.2.1',
                blit386: { engineRange: '^1.3.0' },
            });
        });

        it('throws when engineRange is missing', () => {
            assert.throws(() => applyEngineRange('{"name":"x"}', '^1.3.0'), /missing a string "engineRange"/);
        });
    });

    describe('applyEngineVersionConstants', () => {
        it('rewrites all three constants and preserves surrounding source', () => {
            const raw = [
                'export class BTAPI {',
                '    /** Major. */',
                '    public static readonly VERSION_MAJOR = 1;',
                '',
                '    /** Minor. */',
                '    public static readonly VERSION_MINOR = 4;',
                '',
                '    /** Patch. */',
                '    public static readonly VERSION_PATCH = 0;',
                '}',
                '',
            ].join('\n');
            const { next, previous } = applyEngineVersionConstants(raw, '1.5.0');
            assert.equal(previous, '1.4.0');
            assert.match(next, /VERSION_MAJOR = 1;/);
            assert.match(next, /VERSION_MINOR = 5;/);
            assert.match(next, /VERSION_PATCH = 0;/);
            assert.equal(next.replace(/= \d+;/g, '= N;'), raw.replace(/= \d+;/g, '= N;'));
        });

        it('throws when a constant is missing', () => {
            assert.throws(
                () => applyEngineVersionConstants('export class BTAPI {}', '1.5.0'),
                /missing one of VERSION_MAJOR/,
            );
        });
    });

    describe('applyBlit386Range', () => {
        it('rewrites the constant and preserves surrounding source', () => {
            const raw = "const BLIT386_RANGE = '^1.4.0';\nexport function scaffold() {}\n";
            const { next, previous } = applyBlit386Range(raw, '^1.5.0');
            assert.equal(previous, '^1.4.0');
            assert.equal(next, "const BLIT386_RANGE = '^1.5.0';\nexport function scaffold() {}\n");
        });

        it('throws when the constant is missing', () => {
            assert.throws(
                () => applyBlit386Range('export function scaffold() {}\n', '^1.5.0'),
                /missing the BLIT386_RANGE/,
            );
        });
    });

    describe('parseArgv', () => {
        it('parses version and optional --dry-run', () => {
            assert.deepEqual(parseArgv(['node', 'bump-lockstep.mjs', '1.3.0']), {
                mode: 'bump',
                version: '1.3.0',
                dryRun: false,
            });
            assert.deepEqual(parseArgv(['node', 'bump-lockstep.mjs', '--dry-run', '1.3.0']), {
                mode: 'bump',
                version: '1.3.0',
                dryRun: true,
            });
            // pnpm run bump -- 1.3.0 forwards a bare `--` separator
            assert.deepEqual(parseArgv(['node', 'bump-lockstep.mjs', '--', '1.3.0', '--dry-run']), {
                mode: 'bump',
                version: '1.3.0',
                dryRun: true,
            });
        });

        it('rejects wrong arity', () => {
            assert.throws(() => parseArgv(['node', 'bump-lockstep.mjs']), /Usage:/);
            assert.throws(() => parseArgv(['node', 'bump-lockstep.mjs', '1.3.0', 'extra']), /Usage:/);
        });

        it('parses --check with no version', () => {
            assert.deepEqual(parseArgv(['node', 'bump-lockstep.mjs', '--check']), { mode: 'check' });
        });

        it('rejects --check combined with a version or with --dry-run', () => {
            assert.throws(() => parseArgv(['node', 'bump-lockstep.mjs', '--check', '1.3.0']), /do not pass one/);
            assert.throws(() => parseArgv(['node', 'bump-lockstep.mjs', '--check', '--dry-run']), /mutually exclusive/);
        });
    });

    describe('checkLockstep', () => {
        it('reports no drift for a consistent tree', () => {
            const files = makeFixtureFiles();
            const { version, drift } = checkLockstep({ root: '/repo', readFile: readFrom(files) });

            assert.equal(version, '1.2.1');
            assert.deepEqual(drift, []);
        });

        it('never writes', () => {
            const files = makeFixtureFiles();
            const before = new Map(files);

            checkLockstep({ root: '/repo', readFile: readFrom(files) });

            assert.deepEqual([...files.entries()], [...before.entries()]);
        });

        it('derives the expected values from the engine, not the kit', () => {
            const files = makeFixtureFiles();
            files.set(
                join('/repo', ENGINE_PACKAGE_JSON_PATH),
                `${JSON.stringify({ name: 'blit386', version: '1.3.0' }, null, 4)}\n`,
            );

            const { version, drift } = checkLockstep({ root: '/repo', readFile: readFrom(files) });

            assert.equal(version, '1.3.0');
            assert.ok(
                !drift.some((entry) => entry.path === ENGINE_PACKAGE_JSON_PATH),
                'the engine is trivially in step with its own version',
            );
            assert.ok(drift.some((entry) => entry.path === KIT_PACKAGE_JSON_PATH && entry.expected === '1.3.0'));
            assert.ok(
                drift.some(
                    (entry) =>
                        entry.path === `${KIT_PACKAGE_JSON_PATH} (blit386.engineRange)` && entry.expected === '^1.3.0',
                ),
            );
        });

        it('flags a hand-edited engineRange', () => {
            const files = makeFixtureFiles();
            files.set(
                join('/repo', KIT_PACKAGE_JSON_PATH),
                `${JSON.stringify(
                    { name: '@blit386/kit', version: '1.2.1', blit386: { engineRange: '^1.1.0' } },
                    null,
                    4,
                )}\n`,
            );

            const { drift } = checkLockstep({ root: '/repo', readFile: readFrom(files) });

            assert.deepEqual(drift, [
                {
                    path: `${KIT_PACKAGE_JSON_PATH} (blit386.engineRange)`,
                    actual: '^1.1.0',
                    expected: '^1.2.0',
                },
            ]);
        });

        it('flags a hand-edited BLIT386_RANGE', () => {
            const files = makeFixtureFiles();
            files.set(
                join('/repo', SCAFFOLD_RANGE_FILE),
                ["const BLIT386_RANGE = '^1.1.0';", 'export function scaffold() {}', ''].join('\n'),
            );

            const { drift } = checkLockstep({ root: '/repo', readFile: readFrom(files) });

            assert.deepEqual(drift, [
                { path: `${SCAFFOLD_RANGE_FILE} (BLIT386_RANGE)`, actual: '^1.1.0', expected: '^1.2.0' },
            ]);
        });

        it('flags a scaffolder version that fell behind', () => {
            const files = makeFixtureFiles();
            files.set(
                join('/repo', CREATE_BLIT386_PACKAGE_JSON_PATH),
                `${JSON.stringify({ name: 'create-blit386', version: '1.2.0' }, null, 4)}\n`,
            );

            const { drift } = checkLockstep({ root: '/repo', readFile: readFrom(files) });

            assert.deepEqual(drift, [{ path: CREATE_BLIT386_PACKAGE_JSON_PATH, actual: '1.2.0', expected: '1.2.1' }]);
        });

        it('flags drifted BTAPI version constants', () => {
            const files = makeFixtureFiles();
            files.set(
                join('/repo', ENGINE_VERSION_FILE),
                [
                    'export class BTAPI {',
                    '    public static readonly VERSION_MAJOR = 1;',
                    '    public static readonly VERSION_MINOR = 1;',
                    '    public static readonly VERSION_PATCH = 1;',
                    '}',
                    '',
                ].join('\n'),
            );

            const { drift } = checkLockstep({ root: '/repo', readFile: readFrom(files) });

            assert.deepEqual(drift, [
                {
                    path: `${ENGINE_VERSION_FILE} (VERSION_MAJOR/MINOR/PATCH)`,
                    actual: '1.1.1',
                    expected: '1.2.1',
                },
            ]);
        });

        it('reports every drifted field, not just the first', () => {
            const files = makeFixtureFiles();
            files.set(
                join('/repo', KIT_PACKAGE_JSON_PATH),
                `${JSON.stringify(
                    { name: '@blit386/kit', version: '1.2.1', blit386: { engineRange: '^1.1.0' } },
                    null,
                    4,
                )}\n`,
            );
            files.set(
                join('/repo', SCAFFOLD_RANGE_FILE),
                ["const BLIT386_RANGE = '^1.0.0';", 'export function scaffold() {}', ''].join('\n'),
            );

            const { drift } = checkLockstep({ root: '/repo', readFile: readFrom(files) });

            assert.equal(drift.length, 2);
        });

        it('throws when the engine package.json has no usable version', () => {
            const missing = makeFixtureFiles();
            missing.set(join('/repo', ENGINE_PACKAGE_JSON_PATH), `${JSON.stringify({ name: 'blit386' }, null, 4)}\n`);
            assert.throws(() => checkLockstep({ root: '/repo', readFile: readFrom(missing) }), /missing a string/);

            const bad = makeFixtureFiles();
            bad.set(
                join('/repo', ENGINE_PACKAGE_JSON_PATH),
                `${JSON.stringify({ name: 'blit386', version: '1.2' }, null, 4)}\n`,
            );
            assert.throws(() => checkLockstep({ root: '/repo', readFile: readFrom(bad) }), /Expected a SemVer/);
        });
    });

    describe('bumpLockstep', () => {
        it('updates all three package.json files, BTAPI.ts, engineRange, and BLIT386_RANGE in one pass', () => {
            const files = makeFixtureFiles();
            /** @type {string[]} */
            const writes = [];

            const results = bumpLockstep({
                root: '/repo',
                version: '1.5.0',
                readFile: (path) => {
                    const raw = files.get(path);
                    if (raw === undefined) {
                        throw new Error(`missing ${path}`);
                    }
                    return raw;
                },
                writeFile: (path, data) => {
                    writes.push(path);
                    files.set(path, data);
                },
            });

            // 3 package.json versions + engineRange + BTAPI constants + BLIT386_RANGE = 6 rows.
            assert.equal(results.length, 6);
            assert.equal(writes.length, 5);

            for (const rel of LOCKSTEP_PACKAGE_JSON_PATHS) {
                assert.equal(JSON.parse(files.get(join('/repo', rel))).version, '1.5.0');
            }
            assert.deepEqual(JSON.parse(files.get(join('/repo', LOCKSTEP_PACKAGE_JSON_PATHS[1]))).blit386, {
                engineRange: '^1.5.0',
            });
            assert.match(files.get(join('/repo', ENGINE_VERSION_FILE)), /VERSION_MAJOR = 1;/);
            assert.match(files.get(join('/repo', ENGINE_VERSION_FILE)), /VERSION_MINOR = 5;/);
            assert.match(files.get(join('/repo', ENGINE_VERSION_FILE)), /VERSION_PATCH = 0;/);
            assert.match(files.get(join('/repo', SCAFFOLD_RANGE_FILE)), /BLIT386_RANGE = '\^1\.5\.0';/);
        });

        it('dry-run does not write', () => {
            const files = makeFixtureFiles();
            let writes = 0;

            const results = bumpLockstep({
                root: '/repo',
                version: '9.9.9',
                dryRun: true,
                readFile: (path) => {
                    const raw = files.get(path);
                    if (raw === undefined) {
                        throw new Error(`missing ${path}`);
                    }
                    return raw;
                },
                writeFile: () => {
                    writes += 1;
                },
            });

            assert.equal(writes, 0);
            assert.equal(results.length, 6);
            assert.ok(results.every((result) => result.next.includes('9.9.9') || result.next.includes('9.9.0')));
        });

        it('fails before any write when a later file cannot be read', () => {
            const files = makeFixtureFiles();
            let writes = 0;

            assert.throws(
                () =>
                    bumpLockstep({
                        root: '/repo',
                        version: '1.5.0',
                        readFile: (path) => {
                            if (path.endsWith(join('create-blit386', 'src', 'scaffold.ts'))) {
                                throw new Error('missing scaffold.ts');
                            }
                            const raw = files.get(path);
                            if (raw === undefined) {
                                throw new Error(`missing ${path}`);
                            }
                            return raw;
                        },
                        writeFile: () => {
                            writes += 1;
                        },
                    }),
                /missing scaffold\.ts/,
            );
            assert.equal(writes, 0);
            for (const rel of LOCKSTEP_PACKAGE_JSON_PATHS) {
                assert.equal(JSON.parse(files.get(join('/repo', rel))).version, '1.2.1');
            }
        });

        it('rolls back earlier writes when a later write fails', () => {
            const files = makeFixtureFiles();

            assert.throws(
                () =>
                    bumpLockstep({
                        root: '/repo',
                        version: '1.5.0',
                        readFile: (path) => {
                            const raw = files.get(path);
                            if (raw === undefined) {
                                throw new Error(`missing ${path}`);
                            }
                            return raw;
                        },
                        writeFile: (path, data) => {
                            if (path.endsWith(join('create-blit386', 'src', 'scaffold.ts'))) {
                                throw new Error('disk full');
                            }
                            files.set(path, data);
                        },
                    }),
                /disk full/,
            );

            for (const rel of LOCKSTEP_PACKAGE_JSON_PATHS) {
                assert.equal(JSON.parse(files.get(join('/repo', rel))).version, '1.2.1');
            }
            assert.match(files.get(join('/repo', ENGINE_VERSION_FILE)), /VERSION_MINOR = 2;/);
        });

        it('reports rollback failures alongside the original error, and still rolls back the rest', () => {
            const files = makeFixtureFiles();
            const scaffoldRangePath = join('/repo', SCAFFOLD_RANGE_FILE);
            const engineVersionPath = join('/repo', ENGINE_VERSION_FILE);
            let engineWriteCount = 0;

            assert.throws(
                () =>
                    bumpLockstep({
                        root: '/repo',
                        version: '1.5.0',
                        readFile: (path) => {
                            const raw = files.get(path);
                            if (raw === undefined) {
                                throw new Error(`missing ${path}`);
                            }
                            return raw;
                        },
                        writeFile: (path, data) => {
                            if (path === scaffoldRangePath) {
                                throw new Error('disk full');
                            }
                            if (path === engineVersionPath) {
                                engineWriteCount += 1;
                                // First call is the forward write (let it succeed); second call is this
                                // entry's own rollback, which fails so a later rollback entry (blit386's
                                // package.json, earlier in write order, later in rollback order) can prove
                                // the loop keeps going past a failed rollback instead of aborting.
                                if (engineWriteCount === 2) {
                                    throw new Error('engine rollback failed');
                                }
                            }
                            files.set(path, data);
                        },
                    }),
                (error) => {
                    assert.match(error.message, /disk full/);
                    assert.match(error.message, /engine rollback failed/);
                    return true;
                },
            );

            // Rolled back successfully: entries written after the engine file, and the one written before it.
            assert.equal(JSON.parse(files.get(join('/repo', KIT_PACKAGE_JSON_PATH))).version, '1.2.1');
            assert.equal(JSON.parse(files.get(join('/repo', CREATE_BLIT386_PACKAGE_JSON_PATH))).version, '1.2.1');
            assert.equal(JSON.parse(files.get(join('/repo', ENGINE_PACKAGE_JSON_PATH))).version, '1.2.1');
            // Left at the bumped value: its own rollback write failed.
            assert.match(files.get(engineVersionPath), /VERSION_MINOR = 5;/);
        });
    });

    describe('main', () => {
        it('returns 0 on success and 1 on bad args', () => {
            const lines = [];
            const code = main(['node', 'bump-lockstep.mjs', '1.3.0', '--dry-run'], {
                log: (message) => lines.push(message),
                bump: () => [
                    { path: 'packages/blit386/package.json', previous: '1.2.1', next: '1.3.0' },
                    { path: 'packages/kit/package.json', previous: '1.2.1', next: '1.3.0' },
                ],
            });
            assert.equal(code, 0);
            assert.ok(lines.some((line) => line.includes('Would set packages/kit/package.json')));
            assert.ok(lines.some((line) => line.includes('(dry-run')));

            assert.equal(main(['node', 'bump-lockstep.mjs']), 1);
        });

        it('--check returns 0 and reports the in-step version', () => {
            const lines = [];
            const code = main(['node', 'bump-lockstep.mjs', '--check'], {
                log: (message) => lines.push(message),
                check: () => ({ version: '1.2.1', drift: [] }),
            });

            assert.equal(code, 0);
            assert.ok(lines.some((line) => line.includes('in step at 1.2.1')));
        });

        it('--check returns 1 and lists every drifted field', () => {
            const errors = [];
            const code = main(['node', 'bump-lockstep.mjs', '--check'], {
                log: () => {},
                error: (message) => errors.push(message),
                check: () => ({
                    version: '1.2.1',
                    drift: [
                        { path: KIT_PACKAGE_JSON_PATH, actual: '1.2.0', expected: '1.2.1' },
                        { path: SCAFFOLD_RANGE_FILE, actual: '^1.1.0', expected: '^1.2.0' },
                    ],
                }),
            });

            assert.equal(code, 1);
            assert.ok(errors.some((line) => line.includes(KIT_PACKAGE_JSON_PATH)));
            assert.ok(errors.some((line) => line.includes(SCAFFOLD_RANGE_FILE)));
            assert.ok(errors.some((line) => line.includes('pnpm run bump -- 1.2.1')));
        });
    });
});
