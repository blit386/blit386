/**
 * Unit tests for the shared HTML-escaping helper used by `virtual-demos.js` and
 * `social-meta.js`. Pure and single-pass, so every case here is a plain string assertion.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { escapeHtml } from '../html-escape.js';

describe('escapeHtml', () => {
    it('escapes each of the five significant characters individually', () => {
        assert.equal(escapeHtml('&'), '&amp;');
        assert.equal(escapeHtml('<'), '&lt;');
        assert.equal(escapeHtml('>'), '&gt;');
        assert.equal(escapeHtml('"'), '&quot;');
        assert.equal(escapeHtml("'"), '&#39;');
    });

    it('escapes all five in one pass, in order', () => {
        assert.equal(escapeHtml(`Tom & "Jerry" <b>'s</b>`), 'Tom &amp; &quot;Jerry&quot; &lt;b&gt;&#39;s&lt;/b&gt;');
    });

    it('returns an empty string unchanged', () => {
        assert.equal(escapeHtml(''), '');
    });

    it('returns a string with no special characters unchanged', () => {
        assert.equal(escapeHtml('Plain prose, no markup here.'), 'Plain prose, no markup here.');
    });

    it('does not re-scan its own replacement output for a second pass', () => {
        // A single '&' becomes '&amp;', which itself contains an '&'. A buggy multi-pass
        // implementation would escape that '&' again into '&amp;amp;'.
        assert.equal(escapeHtml('&'), '&amp;');
        assert.notEqual(escapeHtml('&'), '&amp;amp;');
    });

    it('coerces non-string input via String()', () => {
        assert.equal(escapeHtml(42), '42');
    });
});
