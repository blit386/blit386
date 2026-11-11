/**
 * Demo shell navigation model: the demo list, slug/URL derivation, and the iframe swap plus
 * `history.pushState` bookkeeping that drives demo-to-demo navigation without reloading the
 * shell document.
 *
 * Depends on `document.body.dataset.slug` / `dataset.pageSuffix`, stamped by
 * `plugins/virtual-demos.js` into every rendered demo page.
 */

/**
 * Parse the demo list serialized into the page by the build (see plugins/virtual-demos.js).
 * Already filtered to nav-visible demos, in canonical order.
 * @returns {Array<{slug: string, navLabel: string, title: string}>}
 */
export function readDemoList() {
    const demoList = document.getElementById('demo-list');

    if (!demoList) {
        return [];
    }

    return JSON.parse(demoList.textContent);
}

/**
 * Index of the current page's demo within `demos`, or -1 if its slug is not in the list.
 * @param {Array<{slug: string}>} demos
 * @returns {number}
 */
export function findCurrentIndex(demos) {
    const currentSlug = document.body.dataset.slug;

    return demos.findIndex((demo) => demo.slug === currentSlug);
}

// Matches plugins/demo-registry.js's FILENAME_PATTERN (minus the .js extension).
// Every slug that reaches urlFor() is validated against this allowlist before it is
// used to build a navigation target, so a corrupted or tampered demo-list payload
// (or select value) can never produce anything but a same-directory path -- never a
// "javascript:" or other unexpected URL scheme.
export const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

// Stamped into <body> by plugins/virtual-demos.js: '.html' in dev, where the Vite
// middleware routes only /demos/<slug>.html, and empty in the production build, where
// Cloudflare Pages serves dist/<slug>.html at the extensionless /<slug>. Nullish (not
// truthy) fallback: an empty attribute is a real "no suffix", only an absent one falls
// back to the dev form.
const PAGE_SUFFIX = document.body.dataset.pageSuffix ?? '.html';

/**
 * Build a same-directory link to another demo page. The directory is derived from
 * the current page's own pathname, so this resolves correctly under both dev
 * (/demos/<slug>.html) and the flattened production build (/<slug>).
 * @param {string} slug - Demo slug, e.g. "basics"
 * @returns {string}
 */
export function urlFor(slug) {
    if (!SLUG_PATTERN.test(slug)) {
        throw new Error(`Refusing to navigate to invalid demo slug: ${slug}`);
    }

    const dir = location.pathname.slice(0, location.pathname.lastIndexOf('/') + 1);

    return `${dir + slug}${PAGE_SUFFIX}`;
}

/**
 * Embed URL for the shell iframe: same path as urlFor, with ?embed&source.
 * ?embed tears down the engine by discarding the frame; &source keeps the
 * Twoslash panel under the canvas (plain ?embed stays canvas-only for docs).
 * @param {string} slug
 * @returns {string}
 */
export function embedUrlFor(slug) {
    return `${urlFor(slug)}?embed&source`;
}

/**
 * Read the demo slug from the current location pathname
 * (/demos/basics.html, /basics.html, or extensionless /basics).
 * @returns {string}
 */
export function slugFromLocation() {
    const name = location.pathname.slice(location.pathname.lastIndexOf('/') + 1);

    return name.replace(/\.html$/, '');
}

/**
 * Enable or disable the prev/next buttons for the given index into `demos`,
 * and refresh their neighbor-name tooltips (canonical order, never filtered).
 * Buttons stay clickable whenever a neighbor exists; keyboard Up/Down are never
 * bound to them, so demo arrow keys stay free while the listbox is closed.
 * @param {Array<{slug: string, navLabel: string}>} demos
 * @param {number} currentIndex
 * @returns {void}
 */
export function syncArrowDisabled(demos, currentIndex) {
    const prevButton = document.getElementById('demo-banner-prev');
    const nextButton = document.getElementById('demo-banner-next');

    if (!prevButton || !nextButton) {
        return;
    }

    prevButton.disabled = currentIndex <= 0;
    nextButton.disabled = currentIndex === -1 || currentIndex >= demos.length - 1;

    prevButton.setAttribute(
        'aria-label',
        currentIndex > 0 ? `Previous demo: ${demos[currentIndex - 1].navLabel}` : 'Previous demo',
    );

    nextButton.setAttribute(
        'aria-label',
        currentIndex >= 0 && currentIndex < demos.length - 1
            ? `Next demo: ${demos[currentIndex + 1].navLabel}`
            : 'Next demo',
    );

    const prevTip = prevButton.querySelector('.demo-banner-arrow-tooltip');
    const nextTip = nextButton.querySelector('.demo-banner-arrow-tooltip');

    if (prevTip) {
        prevTip.textContent = currentIndex > 0 ? demos[currentIndex - 1].navLabel : '';
    }

    if (nextTip) {
        nextTip.textContent =
            currentIndex >= 0 && currentIndex < demos.length - 1 ? demos[currentIndex + 1].navLabel : '';
    }
}

/**
 * Keep the combobox display value and arrow enabled-state aligned with `slug`.
 * @param {Array<{slug: string, navLabel: string}>} demos
 * @param {string} slug
 * @returns {void}
 */
export function syncNavUI(demos, slug) {
    const input = document.getElementById('demo-banner-combobox-input');

    const currentIndex = demos.findIndex((demo) => demo.slug === slug);

    if (input && document.activeElement !== input) {
        if (currentIndex >= 0) {
            input.value = demos[currentIndex].navLabel;
        } else {
            // A slug missing from the list; leave the field blank.
            input.value = '';
        }
    }

    syncArrowDisabled(demos, currentIndex);
}

/**
 * Swap the iframe to `slug`, update the shell title / body dataset, and optionally
 * push a clean top-level URL into the address bar (no full navigation -- the shell
 * stays loaded so the banner never reloads).
 * @param {string} slug
 * @param {{ pushState?: boolean, demos?: Array<{slug: string, title: string}> }} [options]
 * @returns {void}
 */
export function selectDemo(slug, options) {
    const opts = options || {};
    const demos = opts.demos || readDemoList();
    const frame = document.getElementById('demo-frame');
    const embedUrl = embedUrlFor(slug);

    if (!frame) {
        return;
    }

    // Replace the iframe's history entry so back/forward stays on the shell
    // document; fall back to src assignment when the frame window is unavailable.
    try {
        if (frame.contentWindow?.location) {
            frame.contentWindow.location.replace(embedUrl);
        } else {
            frame.src = embedUrl;
        }
    } catch {
        frame.src = embedUrl;
    }

    document.body.dataset.slug = slug;
    document.title = demos.find((demo) => demo.slug === slug)?.title ?? document.title;

    syncNavUI(demos, slug);

    if (opts.pushState !== false) {
        history.pushState({ slug: slug }, '', urlFor(slug));
    }
}
