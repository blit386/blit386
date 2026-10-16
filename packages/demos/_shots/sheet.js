/**
 * Entry for the public demo sheet at the site index.
 *
 * Reuses the /shots gallery in link mode: one committed capture per demo, each tile a link that
 * opens the demo in the shell. None of the review features (capture, lint, diffs, findings,
 * keyboard map, lightbox) are loaded here.
 */

import { initAnalytics } from '../_partials/demo-shell-analytics.js';
import { createGallery } from './gallery.js';
import { filterSheetEntries } from './sheet-entries.js';

const SHOTS_DIR = 'shots/';

// Picked from public/shots/manifest.json by plugins/virtual-demos.js and inlined, so the tiles
// render before the load event and the browser can restore the scroll position.
const allEntries = JSON.parse(document.getElementById('sheet-entries').textContent);
const demoBase = document.body.dataset.demoBase;
const pageSuffix = document.body.dataset.pageSuffix;
const statusLine = document.getElementById('sheet-status');
const filterBox = document.getElementById('sheet-filter');
const introText = statusLine.textContent;

// Link mode: tiles navigate on their own, so the gallery's open and capture hooks are never called.
const gallery = createGallery(document.getElementById('sheet-gallery'), {
    imageUrl: (entry, variant) => `${SHOTS_DIR}${entry.variants[variant]}`,
    tileLink: (entry) => ({ href: `${demoBase}${entry.slug}${pageSuffix}`, label: entry.label }),
});

function applyFilter() {
    const shown = filterSheetEntries(allEntries, filterBox.value);

    gallery.setEntries(shown);
    statusLine.textContent = shown.length > 0 ? introText : `No demo matches "${filterBox.value.trim()}".`;
}

filterBox.addEventListener('input', applyFilter);
applyFilter();
initAnalytics();
