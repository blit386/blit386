import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { patchTitleHtml } from '../patch-html-title.mjs';

// PREFIX used by the module: 'BLIT386 – ' (en dash, U+2013)
const PREFIX = 'BLIT386 – ';

describe('patchTitleHtml', () => {
    test('prepends prefix to <title> on un-prefixed HTML', () => {
        const result = patchTitleHtml('<title>Getting Started</title>');
        assert.equal(result, `<title>${PREFIX}Getting Started</title>`);
    });

    test('prepends prefix to og:title on un-prefixed HTML', () => {
        const result = patchTitleHtml('<meta property="og:title" content="Getting Started">');
        assert.equal(result, `<meta property="og:title" content="${PREFIX}Getting Started">`);
    });

    test('patches both <title> and og:title in a full HTML head', () => {
        const input = '<title>Page</title><meta property="og:title" content="Page">';
        const result = patchTitleHtml(input);
        assert.ok(result.includes(`<title>${PREFIX}Page</title>`));
        assert.ok(result.includes(`content="${PREFIX}Page"`));
    });

    test('is idempotent on already-prefixed <title>', () => {
        const input = `<title>${PREFIX}Getting Started</title>`;
        assert.equal(patchTitleHtml(input), input);
    });

    test('is idempotent on already-prefixed og:title', () => {
        const input = `<meta property="og:title" content="${PREFIX}Getting Started">`;
        assert.equal(patchTitleHtml(input), input);
    });

    test('does not double-prefix on a second call', () => {
        const once = patchTitleHtml('<title>Page</title>');
        const twice = patchTitleHtml(once);
        assert.equal(once, twice);
    });

    test('returns HTML without either tag unchanged', () => {
        const input = '<html><body><p>No title here</p></body></html>';
        assert.equal(patchTitleHtml(input), input);
    });

    test('returns empty string unchanged', () => {
        assert.equal(patchTitleHtml(''), '');
    });
});
