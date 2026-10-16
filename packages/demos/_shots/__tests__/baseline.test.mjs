/**
 * parseBaseline: which `?baseline=` values the /shots page accepts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseBaseline } from '../baseline.js';

const PAGE = 'http://localhost:5173/shots?baseline=x';

describe('parseBaseline', () => {
    it('accepts an absolute http(s) URL and drops a trailing slash', () => {
        assert.equal(parseBaseline('https://example.com/shots/', PAGE), 'https://example.com/shots');
        assert.equal(parseBaseline('http://example.com/shots', PAGE), 'http://example.com/shots');
    });

    it('resolves a same-origin path against the page', () => {
        assert.equal(parseBaseline('/baseline/shots', PAGE), 'http://localhost:5173/baseline/shots');
    });

    it('refuses other schemes', () => {
        assert.equal(parseBaseline('javascript:alert(1)', PAGE), null);
        assert.equal(parseBaseline('data:text/html,hi', PAGE), null);
    });

    it('refuses a value that is not a URL at all', () => {
        assert.equal(parseBaseline('http://', PAGE), null);
    });
});
