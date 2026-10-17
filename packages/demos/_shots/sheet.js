/**
 * Entry for the public demo sheet at the site index.
 *
 * Reuses the /shots gallery in link mode: one committed capture per demo, each tile a link that
 * opens the demo in the shell. None of the review features (capture, lint, diffs, findings,
 * keyboard map, lightbox) are loaded here.
 */

import { initAnalytics } from '../_partials/demo-shell-analytics.js';
import { createGallery } from './gallery.js';
import { resolveKey } from './keys.js';
import { filterSheetEntries } from './sheet-entries.js';

const SHOTS_DIR = 'shots/';

// Must match the 520px breakpoints in sheet.css, where the banner filter hides and the grid goes single-column.
const SHEET_NAV_MAX_PX = 520;

const sheetNavMq = window.matchMedia(`(max-width: ${SHEET_NAV_MAX_PX}px)`);

function isSheetGalleryNavEnabled() {
    return !sheetNavMq.matches;
}

// Picked from public/shots/manifest.json by plugins/virtual-demos.js and inlined, so the tiles
// render before the load event and the browser can restore the scroll position.
const allEntries = JSON.parse(document.getElementById('sheet-entries').textContent);
const demoBase = document.body.dataset.demoBase;
const pageSuffix = document.body.dataset.pageSuffix;
const galleryRoot = document.getElementById('sheet-gallery');
const statusLine = document.getElementById('sheet-status');
const filterBox = document.getElementById('sheet-filter');
const introText = statusLine.textContent;

function demoUrl(slug) {
    return `${demoBase}${slug}${pageSuffix}`;
}

// Link mode: tiles are anchors; keyboard open uses onOpen, same bindings as /shots (keys.js).
const gallery = createGallery(galleryRoot, {
    focusInteractionEnabled: isSheetGalleryNavEnabled,
    imageUrl: (entry, variant) => `${SHOTS_DIR}${entry.variants[variant]}`,
    tileLink: (entry) => ({ href: demoUrl(entry.slug), label: entry.label }),
    onOpen: (key) => {
        const entry = gallery.entryFor(key);

        if (entry) {
            location.href = demoUrl(entry.slug);
        }
    },
});

function applyFilter() {
    const shown = filterSheetEntries(allEntries, filterBox.value);

    gallery.setEntries(shown);
    statusLine.textContent = shown.length > 0 ? introText : `No demo matches "${filterBox.value.trim()}".`;
}

filterBox.addEventListener('input', applyFilter);

document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
    }

    const action = resolveKey(event, 'gallery');

    if (!action) {
        return;
    }

    if (action === 'escape' && (document.activeElement === filterBox || filterBox.value)) {
        filterBox.value = '';
        applyFilter();
        event.preventDefault();

        if (isSheetGalleryNavEnabled()) {
            galleryRoot.focus();
        }

        return;
    }

    // The filter box stays on narrow screens, so its shortcut does too.
    if (action === 'filter') {
        filterBox.focus();
        filterBox.select();
        event.preventDefault();

        return;
    }

    if (!isSheetGalleryNavEnabled()) {
        return;
    }

    if (gallery.handleAction(action)) {
        event.preventDefault();
    }
});

applyFilter();
initAnalytics();
