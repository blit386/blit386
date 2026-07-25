/**
 * Demo page dual-mode bootstrap and shell navigation.
 *
 * Loaded by `_partials/layout.html` as a module on every demo page:
 * - Embed (`?embed` / `?embed&source`): strip shell chrome; canvas (+ optional source) remain.
 * - Shell (default): strip in-page canvas/source, build the persistent banner, and drive the
 *   content iframe (`?embed&source`) so demo swaps discard the engine with the frame.
 *
 * Depends on `window.__blit386IsEmbedded` from the tiny first-paint stamp in layout.html.
 */

/**
 * Load Plausible only on the shell document so embed iframes (and demo swaps) do not
 * double-count pageviews.
 * @returns {void}
 */
function initAnalytics() {
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

/**
 * Parse the demo list serialized into the page by the build (see plugins/virtual-demos.js).
 * Already filtered to nav-visible demos, in canonical order.
 * @returns {Array<{slug: string, navLabel: string, title: string}>}
 */
function readDemoList() {
    const demoList = document.getElementById('demo-list');

    if (!demoList) {
        return [];
    }

    return JSON.parse(demoList.textContent);
}

/**
 * Index of the current page's demo within `demos`, or -1 if this demo is nav-hidden
 * (e.g. barebones, excluded from the dropdown/prev-next chain).
 * @param {Array<{slug: string}>} demos
 * @returns {number}
 */
function findCurrentIndex(demos) {
    const currentSlug = document.body.dataset.slug;

    return demos.findIndex((demo) => demo.slug === currentSlug);
}

// Matches plugins/demo-registry.js's FILENAME_PATTERN (minus the .js extension).
// Every slug that reaches urlFor() is validated against this allowlist before it is
// used to build a navigation target, so a corrupted or tampered demo-list payload
// (or select value) can never produce anything but a same-directory path -- never a
// "javascript:" or other unexpected URL scheme.
const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Build a same-directory link to another demo page. The directory is derived from
 * the current page's own pathname, so this resolves correctly under both dev
 * (/demos/<slug>.html) and the flattened production build (/<slug>.html).
 * @param {string} slug - Demo slug, e.g. "basics"
 * @returns {string}
 */
function urlFor(slug) {
    if (!SLUG_PATTERN.test(slug)) {
        throw new Error(`Refusing to navigate to invalid demo slug: ${slug}`);
    }

    const dir = location.pathname.slice(0, location.pathname.lastIndexOf('/') + 1);

    return `${dir + slug}.html`;
}

/**
 * Embed URL for the shell iframe: same path as urlFor, with ?embed&source.
 * ?embed tears down the engine by discarding the frame; &source keeps the
 * Twoslash panel under the canvas (plain ?embed stays canvas-only for docs).
 * @param {string} slug
 * @returns {string}
 */
function embedUrlFor(slug) {
    return `${urlFor(slug)}?embed&source`;
}

/**
 * Read the demo slug from the current location pathname
 * (/demos/basics.html, /basics.html, or extensionless /basics).
 * @returns {string}
 */
function slugFromLocation() {
    const name = location.pathname.slice(location.pathname.lastIndexOf('/') + 1);

    return name.replace(/\.html$/, '');
}

/**
 * Title-case a kebab-case slug, e.g. "sprite-effects" -> "Sprite Effects".
 * Mirrors plugins/demo-registry.js's titleCaseTopic for nav-hidden fallbacks.
 * @param {string} slug
 * @returns {string}
 */
function titleCaseSlug(slug) {
    return slug
        .split('-')
        .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
        .join(' ');
}

/**
 * Look up the document title for a slug from the nav list. Nav-hidden slugs
 * (absent from `demos`) get a stable slug-derived title so popstate does not
 * leave a stale document.title from the previous demo.
 * @param {Array<{slug: string, title: string}>} demos
 * @param {string} slug
 * @returns {string}
 */
function titleFor(demos, slug) {
    for (let i = 0; i < demos.length; i++) {
        if (demos[i].slug === slug) {
            return demos[i].title;
        }
    }

    return `BLIT386 Demo - ${titleCaseSlug(slug)}`;
}

/**
 * Build the light/dark BLIT386 logo link. Both images are always in the DOM;
 * CSS toggles which one is visible via `prefers-color-scheme`.
 * @returns {HTMLAnchorElement}
 */
function buildLogo() {
    const logoLink = document.createElement('a');

    logoLink.className = 'demo-banner-logo';
    logoLink.href = 'https://blit386.dev';
    logoLink.setAttribute('aria-label', 'BLIT386');

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
 * Dependency-free fuzzy matcher: subsequence match with consecutive / word-start
 * bonuses. Returns null when `query` does not match `text`; otherwise a score
 * (higher is better) and the character indices to highlight.
 * @param {string} query
 * @param {string} text
 * @returns {{ score: number, indices: number[] } | null}
 */
function fuzzyMatch(query, text) {
    const q = query.toLowerCase();
    const t = text.toLowerCase();

    // Empty query matches everything (used to show the full list when closed-open).
    if (q.length === 0) {
        return { score: 0, indices: [] };
    }

    const indices = [];
    let score = 0;
    let consecutive = 0;
    let qi = 0;

    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t.charAt(ti) !== q.charAt(qi)) {
            consecutive = 0;

            continue;
        }

        indices.push(ti);
        consecutive += 1;
        // Base point + streak bonus; early / word-boundary hits rank higher.
        score += 1 + consecutive * 5;

        if (ti === 0 || /[\s\-_/]/.test(t.charAt(ti - 1))) {
            score += 12;
        }

        qi += 1;
    }

    if (qi !== q.length) {
        return null;
    }

    // Prefer shorter labels and matches that finish earlier in the string.
    score -= t.length;
    score -= indices[indices.length - 1];

    return { score: score, indices: indices };
}

/**
 * Build a label node with matched characters wrapped in highlight spans.
 * Uses DOM APIs (no HTML string interpolation) so nav labels stay text-safe.
 * @param {string} label
 * @param {number[]} indices
 * @returns {DocumentFragment}
 */
function buildHighlightedLabel(label, indices) {
    const fragment = document.createDocumentFragment();
    const matchSet = {};

    for (let i = 0; i < indices.length; i++) {
        matchSet[indices[i]] = true;
    }

    let run = '';
    let runIsMatch = null;

    function flush() {
        if (run.length === 0) {
            return;
        }

        if (runIsMatch) {
            const span = document.createElement('span');

            span.className = 'demo-banner-match';
            span.textContent = run;

            fragment.appendChild(span);
        } else {
            fragment.appendChild(document.createTextNode(run));
        }

        run = '';
    }

    for (let c = 0; c < label.length; c++) {
        const isMatch = Boolean(matchSet[c]);

        if (runIsMatch !== null && isMatch !== runIsMatch) {
            flush();
        }

        runIsMatch = isMatch;
        run += label.charAt(c);
    }

    flush();

    return fragment;
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
function syncArrowDisabled(demos, currentIndex) {
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
function syncNavUI(demos, slug) {
    const input = document.getElementById('demo-banner-combobox-input');

    const currentIndex = demos.findIndex((demo) => demo.slug === slug);

    if (input && document.activeElement !== input) {
        if (currentIndex >= 0) {
            input.value = demos[currentIndex].navLabel;
        } else {
            // Nav-hidden demos are not in the list; leave the field blank.
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
function selectDemo(slug, options) {
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
    document.title = titleFor(demos, slug);

    syncNavUI(demos, slug);

    if (opts.pushState !== false) {
        history.pushState({ slug: slug }, '', urlFor(slug));
    }
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
 * Build the editable fuzzy-filtering combobox (WAI-ARIA list-autocomplete).
 * Keyboard Up/Down/Enter/Escape are only handled while the listbox is open;
 * when closed, arrow keys are not intercepted so they reach the demo iframe.
 * @param {Array<{slug: string, navLabel: string, title: string}>} demos
 * @param {number} currentIndex
 * @returns {HTMLDivElement}
 */
function buildCombobox(demos, currentIndex) {
    const wrapper = document.createElement('div');

    wrapper.className = 'demo-banner-combobox';
    wrapper.id = 'demo-banner-combobox';

    const input = document.createElement('input');

    input.type = 'text';
    input.id = 'demo-banner-combobox-input';
    input.className = 'demo-banner-combobox-input';

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-label', 'Jump to demo');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', 'demo-banner-listbox');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');

    input.value = currentIndex >= 0 ? demos[currentIndex].navLabel : '';

    const listbox = document.createElement('ul');

    listbox.id = 'demo-banner-listbox';
    listbox.className = 'demo-banner-listbox';

    listbox.setAttribute('role', 'listbox');
    listbox.setAttribute('aria-label', 'Demos');

    listbox.hidden = true;

    const live = document.createElement('div');

    live.id = 'demo-banner-live';
    live.className = 'demo-banner-live';

    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');

    wrapper.appendChild(input);
    wrapper.appendChild(listbox);
    wrapper.appendChild(live);

    /** @type {{ demo: {slug: string, navLabel: string}, score: number, indices: number[] }[]} */
    let filtered = [];
    let activeIndex = -1;
    let isOpen = false;

    // When true, the input still shows the current demo label and has not been
    // edited this open session — filter with an empty query so the full list
    // appears (filtering by "Basics" would hide almost everything).
    let isPristine = true;

    /**
     * Announce the current result count for screen readers.
     * @returns {void}
     */
    function announceCount() {
        if (filtered.length === 0) {
            live.textContent = 'No demos match';
        } else if (filtered.length === 1) {
            live.textContent = '1 demo';
        } else {
            live.textContent = `${filtered.length} demos`;
        }
    }

    /**
     * Mark the active option and point aria-activedescendant at it.
     * @param {number} index
     * @returns {void}
     */
    function setActiveIndex(index) {
        const options = listbox.querySelectorAll('[role="option"]');

        activeIndex = index;

        for (let i = 0; i < options.length; i++) {
            const opt = options[i];
            const isActive = i === activeIndex;

            opt.classList.toggle('is-active', isActive);
            opt.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }

        if (activeIndex >= 0 && options[activeIndex]) {
            input.setAttribute('aria-activedescendant', options[activeIndex].id);

            options[activeIndex].scrollIntoView({ block: 'nearest' });
        } else {
            input.removeAttribute('aria-activedescendant');
        }
    }

    /**
     * Query string used for fuzzy filtering. Empty while the field is still
     * showing the untouched current-demo label.
     * @returns {string}
     */
    function filterQuery() {
        if (isPristine) {
            return '';
        }

        return input.value.trim();
    }

    /**
     * Recompute fuzzy results from the input value and rebuild the listbox.
     * @returns {void}
     */
    function renderOptions() {
        const query = filterQuery();
        const results = [];

        for (let i = 0; i < demos.length; i++) {
            const match = fuzzyMatch(query, demos[i].navLabel);

            if (match) {
                results.push({
                    demo: demos[i],
                    score: match.score,
                    indices: match.indices,
                });
            }
        }

        // Empty query keeps registry order; non-empty sorts by fuzzy score.
        if (query.length > 0) {
            results.sort((a, b) => b.score - a.score);
        }

        filtered = results;
        listbox.textContent = '';

        if (filtered.length === 0) {
            const empty = document.createElement('li');

            empty.className = 'demo-banner-listbox-empty';
            empty.setAttribute('role', 'presentation');
            empty.textContent = 'No demos match';

            listbox.appendChild(empty);

            setActiveIndex(-1);
        } else {
            for (let r = 0; r < filtered.length; r++) {
                const result = filtered[r];
                const optionIndex = r;
                const option = document.createElement('li');

                option.id = `demo-banner-option-${optionIndex}`;
                option.className = 'demo-banner-option';

                option.setAttribute('role', 'option');
                option.setAttribute('aria-selected', 'false');

                option.dataset.slug = result.demo.slug;

                option.appendChild(buildHighlightedLabel(result.demo.navLabel, result.indices));

                // mousedown (not click) so the option commits before input blur
                // closes the listbox.
                option.addEventListener('mousedown', (event) => {
                    event.preventDefault();

                    commitSelection(result.demo.slug);
                });

                option.addEventListener('mouseenter', () => {
                    setActiveIndex(optionIndex);
                });

                listbox.appendChild(option);
            }

            // Prefer the currently loaded demo when it is still in the filtered set.
            const preferred = filtered.findIndex((result) => result.demo.slug === document.body.dataset.slug);

            setActiveIndex(preferred >= 0 ? preferred : 0);
        }

        announceCount();
    }

    /**
     * Open the listbox, enable canonical prev/next, and render options.
     * @returns {void}
     */
    function openListbox() {
        if (isOpen) {
            renderOptions();
            syncArrowDisabled(demos, findCurrentIndex(demos));

            return;
        }

        isOpen = true;
        listbox.hidden = false;

        input.setAttribute('aria-expanded', 'true');

        renderOptions();
        syncArrowDisabled(demos, findCurrentIndex(demos));
    }

    /**
     * Close the listbox, clear activedescendant, and restore the input label.
     * Arrow keys are not intercepted while closed, so they stay free for the demo.
     * @param {{ restoreLabel?: boolean }} [options]
     * @returns {void}
     */
    function closeListbox(options) {
        const opts = options || {};

        if (!isOpen) {
            syncArrowDisabled(demos, findCurrentIndex(demos));

            return;
        }

        isOpen = false;
        isPristine = true;
        listbox.hidden = true;

        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');

        activeIndex = -1;
        live.textContent = '';

        if (opts.restoreLabel !== false) {
            const idx = findCurrentIndex(demos);

            input.value = idx >= 0 ? demos[idx].navLabel : '';
        }

        syncArrowDisabled(demos, findCurrentIndex(demos));
    }

    /**
     * Load a demo and close the combobox.
     * @param {string} slug
     * @returns {void}
     */
    function commitSelection(slug) {
        selectDemo(slug, { demos: demos });
        closeListbox({ restoreLabel: true });

        input.blur();
    }

    input.addEventListener('focus', () => {
        isPristine = true;

        openListbox();

        // Select-all so the next keystroke replaces the current label.
        input.select();
    });

    // Some automation / focus paths skip the focus event; click still opens.
    // Select-all only when opening from closed – not on every click – so the
    // user can place a caret and edit the filter with the mouse.
    input.addEventListener('click', () => {
        if (!isOpen) {
            isPristine = true;

            openListbox();

            input.select();
        }
    });

    input.addEventListener('input', () => {
        isPristine = false;

        openListbox();
    });

    // Prev/next arrows update the label without treating it as a filter edit.
    input.addEventListener('demo-banner-sync-label', () => {
        isPristine = true;

        renderOptions();

        input.select();
    });

    /**
     * Escape while the listbox is open: first press clears a non-empty filter,
     * second (or when already empty / pristine) closes and blurs.
     * Shared by the input and by arrow-focused document keydown.
     * @param {KeyboardEvent} event
     * @returns {void}
     */
    function handleEscapeWhileOpen(event) {
        event.preventDefault();

        if (!isPristine && input.value.length > 0) {
            input.value = '';
            isPristine = false;

            renderOptions();

            // Return focus to the input so the cleared field is obvious.
            input.focus();
            input.select();
        } else {
            closeListbox();

            input.blur();

            const active = document.activeElement;

            if (active?.closest?.('.demo-banner-arrow')) {
                active.blur();
            }
        }
    }

    input.addEventListener('keydown', (event) => {
        // When closed, ignore arrow keys so they can reach the demo iframe
        // (the input only has focus while the user is interacting with it;
        // once blurred, keys go to the focused frame naturally).
        if (!isOpen) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                return;
            }

            if (event.key === 'Escape') {
                input.blur();

                return;
            }

            // Alphanumeric / Backspace while focused opens and filters.
            if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
                isPristine = false;
                openListbox();
            }

            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();

            if (filtered.length === 0) {
                return;
            }

            setActiveIndex(activeIndex < filtered.length - 1 ? activeIndex + 1 : 0);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();

            if (filtered.length === 0) {
                return;
            }

            setActiveIndex(activeIndex > 0 ? activeIndex - 1 : filtered.length - 1);
        } else if (event.key === 'Enter') {
            event.preventDefault();

            if (activeIndex >= 0 && filtered[activeIndex]) {
                commitSelection(filtered[activeIndex].demo.slug);
            }
        } else if (event.key === 'Escape') {
            handleEscapeWhileOpen(event);
        }
    });

    // Escape must also work when focus moved to prev/next while the listbox
    // is still open (arrows stay coupled to the open combobox by design).
    document.addEventListener('keydown', (event) => {
        if (!isOpen || event.key !== 'Escape') {
            return;
        }

        const active = document.activeElement;

        if (active?.closest?.('.demo-banner-arrow')) {
            handleEscapeWhileOpen(event);
        }
    });

    // Close when focus leaves the combobox widget (input or listbox).
    // Prev/next arrows are outside the wrapper but should keep the listbox
    // open so canonical stepping stays available while searching.
    wrapper.addEventListener('focusout', (event) => {
        const next = event.relatedTarget;

        if (next && (wrapper.contains(next) || next.closest('.demo-banner-arrow'))) {
            return;
        }

        // Defer so a mousedown on an option can commit first.
        setTimeout(() => {
            const active = document.activeElement;

            if (wrapper.contains(active) || active?.closest?.('.demo-banner-arrow')) {
                return;
            }

            closeListbox();
        }, 0);
    });

    document.addEventListener('mousedown', (event) => {
        if (!isOpen) {
            return;
        }

        if (!wrapper.contains(event.target) && !event.target.closest('.demo-banner-arrow')) {
            closeListbox();

            // Blur so subsequent keys go to the demo iframe, not a focused input
            // sitting over a closed listbox.
            input.blur();
        }
    });

    return wrapper;
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
function renderShell() {
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
    // prod: /<slug>.html?embed&source). Same relative-path derivation as urlFor().
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
function prepareEmbed() {
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
function prepareShell() {
    const canvas = document.getElementById('canvas-container');
    const source = document.getElementById('demo-source');

    if (canvas) {
        canvas.remove();
    }

    if (source) {
        source.remove();
    }
}

if (window.__blit386IsEmbedded) {
    prepareEmbed();
} else {
    prepareShell();
    renderShell();
    initAnalytics();
}
