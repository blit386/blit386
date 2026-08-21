import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { ENGINE_PACKAGE_JSON_PATH, KIT_PACKAGE_JSON_PATH, SCAFFOLD_RANGE_FILE } from './bump-lockstep.mjs';
import { findEngineRangeDrift } from './check-engine-range-drift.mjs';

/** Builds an in-sync fixture file map, keyed by absolute path under `/repo`. */
function makeFixtureFiles({ kitRange = '^1.5.0', scaffoldRange = '^1.5.0' } = {}) {
    return new Map([
        [
            join('/repo', ENGINE_PACKAGE_JSON_PATH),
            `${JSON.stringify({ name: 'blit386', version: '1.5.0' }, null, 4)}\n`,
        ],
        [
            join('/repo', KIT_PACKAGE_JSON_PATH),
            `${JSON.stringify(
                { name: '@blit386/kit', version: '1.5.0', blit386: { engineRange: kitRange } },
                null,
                4,
            )}\n`,
        ],
        [
            join('/repo', SCAFFOLD_RANGE_FILE),
            [`const BLIT386_RANGE = '${scaffoldRange}';`, 'export function scaffold() {}', ''].join('\n'),
        ],
    ]);
}

/** @param {Map<string, string>} files @returns {(path: string) => string} */
function readFileFrom(files) {
    return (path) => {
        const content = files.get(path);
        if (content === undefined) {
            throw new Error(`Unexpected read: ${path}`);
        }
        return content;
    };
}

describe('check-engine-range-drift', () => {
    it('reports no drift when both ranges match the derived range', () => {
        const failures = findEngineRangeDrift({ root: '/repo', readFile: readFileFrom(makeFixtureFiles()) });
        assert.deepEqual(failures, []);
    });

    it('reports drift when only the kit engineRange is stale', () => {
        const failures = findEngineRangeDrift({
            root: '/repo',
            readFile: readFileFrom(makeFixtureFiles({ kitRange: '^1.4.0' })),
        });
        assert.equal(failures.length, 1);
        assert.match(failures[0], /blit386\.engineRange is "\^1\.4\.0", expected "\^1\.5\.0"/u);
    });

    it('reports drift when only the scaffolder BLIT386_RANGE is stale', () => {
        const failures = findEngineRangeDrift({
            root: '/repo',
            readFile: readFileFrom(makeFixtureFiles({ scaffoldRange: '^1.3.0' })),
        });
        assert.equal(failures.length, 1);
        assert.match(failures[0], /BLIT386_RANGE is "\^1\.3\.0", expected "\^1\.5\.0"/u);
    });

    it('reports both mismatches when both are stale', () => {
        const failures = findEngineRangeDrift({
            root: '/repo',
            readFile: readFileFrom(makeFixtureFiles({ kitRange: '^1.4.0', scaffoldRange: '^1.3.0' })),
        });
        assert.equal(failures.length, 2);
    });
});
