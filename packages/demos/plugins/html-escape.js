// Single pass over the input, so there is no "escape & first" ordering hazard: a character
// this table produces can never be rescanned and escaped a second time.
const HTML_ESCAPES = new Map([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#39;'],
]);

const HTML_ESCAPE_PATTERN = /[&<>"']/g;

/**
 * Escape a string for safe interpolation into HTML text content or a quoted attribute value.
 *
 * Shared by `virtual-demos.js` (page titles, the dev index page) and `social-meta.js` (every
 * `content=` attribute in the social head block), so both escape identically and neither
 * imports the other.
 *
 * This is deliberately a fixed five-character table rather than a sanitizer. Every input is
 * build-time content authored in this repo – a demo's `@pageTitle` and `@description` header
 * tags – interpolated into a static HTML file by a Vite plugin running in Node. There is no
 * untrusted input and no DOM here, so `sanitize-html` / `DOMPurify` would add a runtime
 * dependency without escaping anything this does not already cover.
 * @param {string} str – Raw text.
 * @returns {string}
 */
export function escapeHtml(str) {
    return String(str).replace(HTML_ESCAPE_PATTERN, (char) => HTML_ESCAPES.get(char) ?? char);
}
