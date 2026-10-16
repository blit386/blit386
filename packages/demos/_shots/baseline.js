/**
 * The `?baseline=` parameter of the /shots page, kept free of the DOM so it can be unit-tested.
 */

const BASELINE_REFUSED = 'baseline refused: it must be an http(s) URL or a same-origin path';

/**
 * Resolve `?baseline=` to an absolute http(s) base URL without a trailing slash. A relative value
 * resolves against `pageUrl`, so a same-origin path works; `javascript:` and `data:` are refused.
 *
 * @param {string} value
 * @param {string} pageUrl
 * @returns {string | null}
 */
function parseBaseline(value, pageUrl) {
    try {
        const url = new URL(value, pageUrl);

        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href.replace(/\/$/, '') : null;
    } catch {
        return null;
    }
}

export { BASELINE_REFUSED, parseBaseline };
