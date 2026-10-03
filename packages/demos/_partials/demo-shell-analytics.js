/**
 * Plausible analytics bootstrap for the demo shell document.
 *
 * Loaded on the shell document and on standalone `?embed` pages (docs-site and third-party
 * iframes), but not inside the shell's own same-origin content iframe, so pageviews are not
 * double-counted. See `demo-shell.js` for how this is wired into the bootstrap.
 */

/**
 * Whether this document is the content iframe of the demo shell (same-origin parent). A
 * cross-origin parent throws on `location` access, which means a real external embed.
 * @returns {boolean}
 */
function isShellFrame() {
    if (window.parent === window) {
        return false;
    }

    try {
        return window.parent.location.origin === location.origin;
    } catch {
        return false;
    }
}

/**
 * Load Plausible unless the shell already counts this view from its parent document.
 * @returns {void}
 */
export function initAnalytics() {
    if (isShellFrame()) {
        return;
    }

    const plausibleScript = document.createElement('script');

    plausibleScript.async = true;
    plausibleScript.src = 'https://plausible.io/js/pa-Jy-1Ffqwh5Zpp2YOMEBr5.js';

    document.head.appendChild(plausibleScript);

    // Modules are strict: use window.plausible (bare `plausible` is not a binding here).
    // Plausible's snippet queues calls until the remote script loads.
    window.plausible =
        window.plausible ||
        ((...args) => {
            const queue = window.plausible.q || [];

            window.plausible.q = queue;
            queue.push(args);
        });

    window.plausible.init =
        window.plausible.init ||
        ((i) => {
            window.plausible.o = i || {};
        });

    window.plausible.init();
}
