import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    DEFAULT_INPUT,
    extractIndices,
    findLogoDrift,
    OUTPUT_PATH,
    parseLogoModule,
    renderModule,
} from './convert-splash-logo.mjs';

const committed = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'splash', 'logoData.ts'),
    'utf8',
);

describe('splash-logo drift check (BT-763)', () => {
    it('reads back what renderModule writes, whatever the line wrapping', () => {
        const data = { width: 3, height: 2, indices: [0, 1, 2, 3, 4, 5] };
        assert.deepEqual(parseLogoModule(renderModule(data)), data);
        assert.deepEqual(parseLogoModule(renderModule(data).replace('3, 4', '3,\n    4')), data);
    });

    it('finds no drift between the committed logoData.ts and the PNG', () => {
        assert.equal(OUTPUT_PATH.endsWith(join('src', 'splash', 'logoData.ts')), true);
        assert.deepEqual(findLogoDrift(parseLogoModule(committed), extractIndices(DEFAULT_INPUT)), []);
    });

    it('names the size and the first differing row on drift', () => {
        const png = { width: 2, height: 2, indices: [0, 1, 2, 3] };
        assert.deepEqual(findLogoDrift({ width: 2, height: 2, indices: [0, 1, 2, 9] }, png), [
            'row 1 differs from the PNG',
        ]);
        assert.deepEqual(findLogoDrift({ width: 3, height: 2, indices: [0, 1, 2, 3, 4, 5] }, png), [
            'logoData.ts is 3x2 but the PNG is 2x2',
        ]);
    });

    it('throws on a module it cannot read', () => {
        assert.throws(() => parseLogoModule('export const LOGO_WIDTH = 2;'), /cannot read/);
    });
});
