import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findLogoDrift, parseLogoModule, renderModule } from './convert-splash-logo.mjs';

describe('splash-logo drift check (BT-763)', () => {
    it('reads back what renderModule writes, whatever the line wrapping', () => {
        const data = { width: 3, height: 2, indices: [0, 1, 2, 3, 4, 5] };
        assert.deepEqual(parseLogoModule(renderModule(data)), data);
        assert.deepEqual(parseLogoModule(renderModule(data).replace('3, 4', '3,\n    4')), data);
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
