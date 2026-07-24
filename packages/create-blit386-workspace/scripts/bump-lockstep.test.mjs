import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    applyVersion,
    bumpLockstep,
    LOCKSTEP_PACKAGE_JSON_PATHS,
    main,
    parseArgv,
    parseVersionArg,
    SEMVER_RE,
} from './bump-lockstep.mjs';

describe('bump-lockstep', () => {
    describe('parseVersionArg', () => {
        it('accepts x.y.z', () => {
            assert.equal(parseVersionArg('1.3.0'), '1.3.0');
            assert.equal(parseVersionArg(' 2.0.0 '), '2.0.0');
        });

        it('rejects prerelease, missing, and garbage', () => {
            assert.throws(() => parseVersionArg('1.3.0-beta.1'), /Expected a SemVer/);
            assert.throws(() => parseVersionArg('v1.3.0'), /Expected a SemVer/);
            assert.throws(() => parseVersionArg(undefined), /missing/);
            assert.ok(SEMVER_RE.test('0.1.0'));
            assert.equal(SEMVER_RE.test('1.2'), false);
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
    });

    describe('parseArgv', () => {
        it('parses version and optional --dry-run', () => {
            assert.deepEqual(parseArgv(['node', 'bump-lockstep.mjs', '1.3.0']), {
                version: '1.3.0',
                dryRun: false,
            });
            assert.deepEqual(parseArgv(['node', 'bump-lockstep.mjs', '--dry-run', '1.3.0']), {
                version: '1.3.0',
                dryRun: true,
            });
            // pnpm run bump -- 1.3.0 forwards a bare `--` separator
            assert.deepEqual(parseArgv(['node', 'bump-lockstep.mjs', '--', '1.3.0', '--dry-run']), {
                version: '1.3.0',
                dryRun: true,
            });
        });

        it('rejects wrong arity', () => {
            assert.throws(() => parseArgv(['node', 'bump-lockstep.mjs']), /Usage:/);
            assert.throws(() => parseArgv(['node', 'bump-lockstep.mjs', '1.3.0', 'extra']), /Usage:/);
        });
    });

    describe('bumpLockstep', () => {
        it('updates every lockstep package.json', () => {
            /** @type {Map<string, string>} */
            const files = new Map(
                LOCKSTEP_PACKAGE_JSON_PATHS.map((path) => [
                    `/repo/${path}`,
                    `${JSON.stringify({ name: path, version: '1.2.1' }, null, 4)}\n`,
                ]),
            );
            /** @type {string[]} */
            const writes = [];

            const results = bumpLockstep({
                root: '/repo',
                version: '1.3.0',
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

            assert.equal(results.length, 3);
            assert.ok(results.every((result) => result.previous === '1.2.1' && result.next === '1.3.0'));
            assert.equal(writes.length, 3);
            for (const rel of LOCKSTEP_PACKAGE_JSON_PATHS) {
                assert.equal(JSON.parse(files.get(`/repo/${rel}`)).version, '1.3.0');
            }
        });

        it('dry-run does not write', () => {
            let writes = 0;
            bumpLockstep({
                root: '/repo',
                version: '9.9.9',
                dryRun: true,
                readFile: () => '{"version":"1.0.0"}\n',
                writeFile: () => {
                    writes += 1;
                },
            });
            assert.equal(writes, 0);
        });
    });

    describe('main', () => {
        it('returns 0 on success and 1 on bad args', () => {
            const lines = [];
            const code = main(['node', 'bump-lockstep.mjs', '1.3.0', '--dry-run'], {
                log: (message) => lines.push(message),
                bump: () => [
                    { path: 'package.json', previous: '1.2.1', next: '1.3.0' },
                    { path: 'packages/kit/package.json', previous: '1.2.1', next: '1.3.0' },
                    { path: 'packages/create-blit386/package.json', previous: '1.2.1', next: '1.3.0' },
                ],
            });
            assert.equal(code, 0);
            assert.ok(lines.some((line) => line.includes('Would set package.json')));
            assert.ok(lines.some((line) => line.includes('(dry-run')));

            assert.equal(main(['node', 'bump-lockstep.mjs']), 1);
        });
    });
});
