import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveShortTitle } from '../demo-registry.js';

describe('deriveShortTitle', () => {
    test('strips a BLIT386 Demo prefix written with an en dash', () => {
        const header = '// @pageTitle BLIT386 Demo – PipBoy CRT\n';
        assert.equal(deriveShortTitle('crt-pipboy', header), 'PipBoy CRT');
    });

    test('strips a BLIT386 Demo prefix written with an ASCII hyphen', () => {
        const header = '// @pageTitle BLIT386 Demo - PipBoy CRT\n';
        assert.equal(deriveShortTitle('crt-pipboy', header), 'PipBoy CRT');
    });

    test('falls back to the title-cased slug when there is no @pageTitle override', () => {
        const header = '// A demo with no page title override.\n';
        assert.equal(deriveShortTitle('sprite-effects', header), 'Sprite Effects');
    });
});
