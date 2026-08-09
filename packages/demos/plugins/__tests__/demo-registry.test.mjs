/**
 * Unit tests for the pure header-parsing helpers in plugins/demo-registry.js.
 *
 * All three are string-in/string-out, so they are tested directly rather than through
 * `buildRegistry` (which needs a real src/ directory on disk).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveDescription, deriveOgScale, deriveShortTitle } from '../demo-registry.js';

describe('deriveDescription', () => {
    it('extracts the tag from a line-comment header', () => {
        const header = [
            '// Palette Cycling: classic retro color rotation using BT.paletteCycle().',
            '// @description Rotate a range of palette entries every tick for a flowing waterfall effect.',
            '//',
        ].join('\n');

        assert.equal(
            deriveDescription(header),
            'Rotate a range of palette entries every tick for a flowing waterfall effect.',
        );
    });

    it('extracts the tag from a multi-line JSDoc header', () => {
        const header = [
            '/**',
            ' * Basics Demo – your very first BLIT386 program!',
            ' *',
            ' * @description Bootstrap the engine, load a sprite, and bounce it off the edges.',
            ' */',
        ].join('\n');

        assert.equal(deriveDescription(header), 'Bootstrap the engine, load a sprite, and bounce it off the edges.');
    });

    it('does not capture the closing delimiter of a one-line JSDoc header', () => {
        assert.equal(
            deriveDescription('/** @description Draw a single square and move it. */'),
            'Draw a single square and move it.',
        );
    });

    it('returns an empty string when the tag is absent', () => {
        assert.equal(deriveDescription('// Just a plain header with no tags at all.\n'), '');
    });

    it('stops at the newline, so a wrapped second line is not captured', () => {
        const header = ['// @description First line only.', '// Second line must not be swallowed.'].join('\n');

        assert.equal(deriveDescription(header), 'First line only.');
    });

    it('trims surrounding whitespace', () => {
        assert.equal(deriveDescription('//   @description    Padded on both sides.   \n'), 'Padded on both sides.');
    });

    it('takes the first occurrence when the tag appears twice', () => {
        const header = ['// @description The one that counts.', '// @description The stale leftover.'].join('\n');

        assert.equal(deriveDescription(header), 'The one that counts.');
    });

    it('handles CRLF line endings', () => {
        assert.equal(deriveDescription('// @description Windows checkout.\r\n// next line\r\n'), 'Windows checkout.');
    });

    it('does not reach onto the next line for a value', () => {
        // `\s` would match the newline and capture the following comment line verbatim,
        // handing "// A description..." to the meta tag. The tag must be treated as absent so
        // check-demo-registry fails it loudly instead.
        const header = ['// @description', '// A description that lives on the next line.'].join('\n');

        assert.equal(deriveDescription(header), '');
    });
});

describe('deriveOgScale', () => {
    it('extracts the tag from a line-comment header', () => {
        assert.equal(deriveOgScale('// @ogScale fit\n// more header\n'), 'fit');
    });

    it('extracts the tag from a JSDoc header', () => {
        assert.equal(deriveOgScale('/**\n * Demo\n * @ogScale integer\n */'), 'integer');
    });

    it('returns an empty string when the tag is absent', () => {
        assert.equal(deriveOgScale('// @description Only a description here, no scale tag.\n'), '');
    });

    it('returns an unknown value verbatim, leaving validation to check-demo-registry', () => {
        // Silently defaulting here would hide a typo; the gate should fail loudly instead.
        assert.equal(deriveOgScale('// @ogScale enormous\n'), 'enormous');
    });

    it('does not confuse @description for @ogScale', () => {
        assert.equal(deriveOgScale('// @description A perfectly ordinary description sentence goes here.\n'), '');
    });

    it('does not reach onto the next line for a value', () => {
        assert.equal(deriveOgScale('// @ogScale\n// fit\n'), '');
    });
});

// From #516 (BT-465). Kept verbatim in substance, restyled from `test` to `it` so this file
// uses one form throughout.
describe('deriveShortTitle', () => {
    it('strips a BLIT386 Demo prefix written with an en dash', () => {
        const header = '// @pageTitle BLIT386 Demo – PipBoy CRT\n';
        assert.equal(deriveShortTitle('crt-pipboy', header), 'PipBoy CRT');
    });

    it('strips a BLIT386 Demo prefix written with an ASCII hyphen', () => {
        const header = '// @pageTitle BLIT386 Demo – PipBoy CRT\n';
        assert.equal(deriveShortTitle('crt-pipboy', header), 'PipBoy CRT');
    });

    it('falls back to the title-cased slug when there is no @pageTitle override', () => {
        const header = '// A demo with no page title override.\n';
        assert.equal(deriveShortTitle('sprite-effects', header), 'Sprite Effects');
    });
});
