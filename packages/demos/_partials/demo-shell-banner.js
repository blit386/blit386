/**
 * Demo shell banner: logo, prev/next arrows, and the persistent nav bar that hosts the
 * combobox, plus the shell/embed mode switch (`renderShell` / `prepareEmbed` / `prepareShell`).
 */

import { buildCombobox } from './demo-shell-combobox.js';
import {
    embedUrlFor,
    findCurrentIndex,
    readDemoList,
    selectDemo,
    slugFromLocation,
    SLUG_PATTERN,
    syncArrowDisabled,
} from './demo-shell-nav.js';

/**
 * Build the light/dark BLIT386 logo link. Both images are always in the DOM;
 * CSS toggles which one is visible via `prefers-color-scheme`.
 *
 * Manual-sync hazard: `_shots/sheet.html` writes the same logo as static markup (href, label,
 * image paths, sizes, classes). Change both together.
 * @returns {HTMLAnchorElement}
 */
function buildLogo() {
    const logoLink = document.createElement('a');

    logoLink.className = 'demo-banner-logo';
    // The site index, the all-demos sheet (dev and build both serve it at /).
    logoLink.href = '/';
    logoLink.setAttribute('aria-label', 'BLIT386 Demos');

    const logoLight = document.createElement('img');

    logoLight.className = 'demo-banner-logo-light';
    logoLight.src = '/sprites/favicon-light-32.png';
    logoLight.width = 64;
    logoLight.height = 64;
    logoLight.alt = 'BLIT386';

    logoLink.appendChild(logoLight);

    const logoDark = document.createElement('img');

    logoDark.className = 'demo-banner-logo-dark';
    logoDark.src = '/sprites/favicon-dark-32.png';
    logoDark.width = 64;
    logoDark.height = 64;
    logoDark.alt = 'BLIT386';

    logoLink.appendChild(logoDark);

    return logoLink;
}

/**
 * Attach a twoslash-style hover tooltip to a prev/next arrow button.
 * @param {HTMLButtonElement} button
 * @returns {HTMLSpanElement} The tooltip element (text updated by syncArrowDisabled).
 */
function attachArrowTooltip(button) {
    const tooltip = document.createElement('span');

    tooltip.className = 'demo-banner-arrow-tooltip';

    tooltip.setAttribute('aria-hidden', 'true');
    button.appendChild(tooltip);

    return tooltip;
}

/**
 * Shared prev/next arrow button. Steps by canonical order (`step` of -1 or +1).
 * @param {Array<{slug: string, navLabel: string}>} demos
 * @param {{ id: string, glyph: string, ariaLabel: string, step: number }} options
 * @returns {HTMLButtonElement}
 */
function buildArrowButton(demos, options) {
    const button = document.createElement('button');

    button.type = 'button';
    button.id = options.id;
    button.className = 'demo-banner-arrow';

    button.setAttribute('aria-label', options.ariaLabel);

    const glyph = document.createElement('span');

    glyph.className = 'demo-banner-arrow-glyph';
    glyph.textContent = options.glyph;

    button.appendChild(glyph);

    attachArrowTooltip(button);

    button.addEventListener('click', () => {
        const currentIndex = findCurrentIndex(demos);

        // Nav-hidden demos are index -1; refuse to step from an unknown position.
        if (currentIndex < 0) {
            return;
        }

        const targetIndex = currentIndex + options.step;

        if (targetIndex < 0 || targetIndex >= demos.length) {
            return;
        }

        selectDemo(demos[targetIndex].slug, { demos: demos });

        // Keep the open combobox label in sync without re-filtering by it.
        const input = document.getElementById('demo-banner-combobox-input');
        const listbox = document.getElementById('demo-banner-listbox');

        if (input && listbox && !listbox.hidden) {
            input.value = demos[targetIndex].navLabel;

            input.dispatchEvent(new CustomEvent('demo-banner-sync-label'));
        }
    });

    return button;
}

/**
 * Build the "previous demo" arrow button.
 * @param {Array<{slug: string, navLabel: string}>} demos
 * @returns {HTMLButtonElement}
 */
function buildPrevButton(demos) {
    return buildArrowButton(demos, {
        id: 'demo-banner-prev',
        glyph: '‹',
        ariaLabel: 'Previous demo',
        step: -1,
    });
}

/**
 * Build the "next demo" arrow button.
 * @param {Array<{slug: string, navLabel: string}>} demos
 * @returns {HTMLButtonElement}
 */
function buildNextButton(demos) {
    return buildArrowButton(demos, {
        id: 'demo-banner-next',
        glyph: '›',
        ariaLabel: 'Next demo',
        step: 1,
    });
}

/**
 * Build the prev/combobox/next navigation group.
 * @param {Array<{slug: string, navLabel: string, title: string}>} demos
 * @param {number} currentIndex
 * @returns {HTMLDivElement}
 */
function buildNav(demos, currentIndex) {
    const nav = document.createElement('div');

    nav.className = 'demo-banner-nav';

    nav.appendChild(buildPrevButton(demos));
    nav.appendChild(buildCombobox(demos, currentIndex));
    nav.appendChild(buildNextButton(demos));

    return nav;
}

/**
 * Populate the (initially empty) #demo-banner with the logo and nav group, point
 * the content iframe at this demo's embed URL, and wire back/forward navigation.
 * @returns {void}
 */
export function renderShell() {
    const banner = document.getElementById('demo-banner');
    const frame = document.getElementById('demo-frame');

    if (!banner || !frame) {
        return;
    }

    const demos = readDemoList();
    const currentIndex = findCurrentIndex(demos);
    const initialSlug = document.body.dataset.slug;

    banner.appendChild(buildLogo());
    banner.appendChild(buildNav(demos, currentIndex));

    syncArrowDisabled(demos, currentIndex);

    // Initial iframe src: this demo with source (dev: /demos/<slug>.html?embed&source,
    // prod: /<slug>?embed&source). Same relative-path derivation as urlFor().
    if (initialSlug) {
        frame.src = embedUrlFor(initialSlug);
    }

    window.addEventListener('popstate', () => {
        const slug = slugFromLocation();

        if (!SLUG_PATTERN.test(slug)) {
            return;
        }

        selectDemo(slug, { pushState: false, demos: demos });
    });
}

/**
 * Embed mode: drop the shell chrome so only the canvas + source panel remain.
 * @returns {void}
 */
export function prepareEmbed() {
    const banner = document.getElementById('demo-banner');
    const frame = document.getElementById('demo-frame');

    if (banner) {
        banner.remove();
    }

    if (frame) {
        frame.remove();
    }
}

/**
 * Shell mode: drop the in-page canvas / source hosts. The live demo runs inside
 * #demo-frame instead (workaround for the engine having no teardown API).
 * @returns {void}
 */
export function prepareShell() {
    const canvas = document.getElementById('canvas-container');
    const source = document.getElementById('demo-source');

    if (canvas) {
        canvas.remove();
    }

    if (source) {
        source.remove();
    }
}
