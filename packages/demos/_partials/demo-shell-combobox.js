/**
 * The demo shell's fuzzy-searchable combobox (WAI-ARIA list-autocomplete): dependency-free
 * fuzzy matching, match highlighting, and full keyboard/mouse/focus handling.
 */

import { findCurrentIndex, selectDemo, syncArrowDisabled } from './demo-shell-nav.js';

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

    // Empty query matches everything (a pristine field shows the full list).
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
 * Build the editable fuzzy-filtering combobox (WAI-ARIA list-autocomplete).
 * Keyboard Up/Down/Enter/Escape are only handled while the listbox is open;
 * when closed, arrow keys are not intercepted so they reach the demo iframe.
 * @param {Array<{slug: string, navLabel: string, title: string}>} demos
 * @param {number} currentIndex
 * @returns {HTMLDivElement}
 */
export function buildCombobox(demos, currentIndex) {
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
    // edited this open session - filter with an empty query so the full list
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
    // Select-all only when opening from closed - not on every click - so the
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
