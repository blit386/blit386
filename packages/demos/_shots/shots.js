/**
 * Entry for the /shots gallery.
 *
 * View mode (every build): fetch public/shots/manifest.json and render it. Capture mode (dev
 * server only): add the capture panel and the iframe driver on top. Everything keyed
 * goes through keys.js, so one listener here dispatches to the gallery or the lightbox.
 */

import { createGallery } from './gallery.js';
import { KEY_HELP, resolveKey, SHARED_ACTIONS } from './keys.js';
import { createLightbox } from './lightbox.js';
import { emptyManifest, entryKey } from './manifest.js';
import { startReviewMode } from './review-mode.js';

const MANIFEST_URL = 'shots/manifest.json';
const SHOTS_DIR = 'shots/';

const demos = JSON.parse(document.getElementById('demo-list').textContent);
const demoBase = document.body.dataset.demoBase;
const pageSuffix = document.body.dataset.pageSuffix ?? '';
const statusLine = document.getElementById('shots-status');
const filterBox = document.getElementById('shots-filter');
const galleryRoot = document.getElementById('shots-gallery');
const lightboxRoot = document.getElementById('shots-lightbox');
const helpRoot = document.getElementById('shots-help-overlay');
const infoRoot = document.getElementById('shots-info');

/** @type {Map<string, string>} Object URLs for frames captured this session, keyed `<key>/<variant>`. */
const liveImages = new Map();

function setStatus(text) {
    statusLine.textContent = text;
}

function liveImageKey(slug, pose, variant) {
    return `${entryKey(slug, pose)}/${variant}`;
}

function imageUrl(entry, variant) {
    const live = liveImages.get(liveImageKey(entry.slug, entry.pose, variant));

    if (live) {
        return live;
    }

    const path = entry.variants[variant];

    return path ? `${SHOTS_DIR}${path}` : null;
}

function demoUrl(slug, extra = '') {
    return `${demoBase}${slug}${pageSuffix}${extra}`;
}

const gallery = createGallery(galleryRoot, {
    imageUrl,
    onOpen: (key) => lightbox.open(key),
    onCapture: (keys) => window.__shotsCapture?.(keys),
});

const lightbox = createLightbox(lightboxRoot, {
    imageUrl,
    order: () => gallery.visibleKeys(),
    entryFor: (key) => gallery.entryFor(key),
    variantFor: (key) => gallery.currentVariant(key),
    cycleVariant: (key) => gallery.cycleVariant(key),
    onClose: (key) => {
        if (key) {
            gallery.focusKey(key);
        }

        galleryRoot.focus();
    },
});

function renderHelp() {
    const rows = KEY_HELP.map(
        (row) => `<tr><td><kbd>${row.keys}</kbd></td><td>${row.gallery}</td><td>${row.lightbox}</td></tr>`,
    ).join('');

    helpRoot.innerHTML = `<h2>Keyboard</h2><table><tr><th></th><th>Gallery</th><th>Lightbox</th></tr>${rows}</table><p>Press ? or Esc to close.</p>`;
}

function currentKey() {
    return lightbox.isOpen() ? lightbox.currentKey() : gallery.focusedKey();
}

function renderInfo() {
    const key = currentKey();
    const entry = key ? gallery.entryFor(key) : null;

    if (!entry || infoRoot.hidden) {
        return;
    }

    const lint = entry.lint.map((finding) => `${finding.rule}: ${finding.message}`).join('\n') || 'no lint findings';

    const notes = (window.__shotsFindings?.notesFor(key) ?? []).map((note) => `\nnote: ${note}`).join('');

    infoRoot.textContent = `${entry.slug} / ${entry.pose}\n${entry.width}x${entry.height}\nvariants: ${Object.keys(entry.variants).join(', ')}\n${entry.error ? `error: ${entry.error}\n` : ''}${lint}${notes}`;
}

function copyPath(key) {
    const entry = gallery.entryFor(key);
    const variant = gallery.currentVariant(key);
    const path = entry?.variants[variant];

    if (!path) {
        return;
    }

    // Undefined outside a secure context, e.g. the dev server opened on a LAN IP.
    if (!navigator.clipboard) {
        setStatus(`clipboard unavailable here (needs https or localhost): ${path}`);

        return;
    }

    navigator.clipboard.writeText(`packages/demos/public/shots/${path}`).then(
        () => setStatus(`copied ${path}`),
        () => setStatus('clipboard blocked'),
    );
}

function openLive(key) {
    const entry = key ? gallery.entryFor(key) : null;

    if (entry) {
        window.open(demoUrl(entry.slug), '_blank', 'noopener');
    }
}

function handleShared(action) {
    const key = currentKey();

    if (action === 'help') {
        helpRoot.hidden = !helpRoot.hidden;
    } else if (action === 'info-toggle') {
        infoRoot.hidden = !infoRoot.hidden;
        renderInfo();
    } else if (action === 'open-live') {
        openLive(key);
    } else if (action === 'copy-path' && key) {
        copyPath(key);
    } else if (action === 'flag' && key) {
        window.__shotsFindings?.toggleFlag(key);
    } else if (action === 'note' && key) {
        window.__shotsFindings?.addNote(key);
    } else if (action === 'export') {
        window.__shotsFindings?.exportMarkdown();
    } else if (action === 'diff-toggle' || action === 'diff-cycle') {
        window.__shotsDiff?.(action);

        if (lightbox.isOpen()) {
            lightbox.rerender();
        }
    } else {
        return false;
    }

    return true;
}

document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
    }

    if (!helpRoot.hidden && (event.key === '?' || event.key === 'Escape')) {
        helpRoot.hidden = true;
        event.preventDefault();

        return;
    }

    const mode = lightbox.isOpen() ? 'lightbox' : 'gallery';
    const action = resolveKey(event, mode);

    if (!action) {
        return;
    }

    if (action === 'filter') {
        filterBox.focus();
        filterBox.select();
        event.preventDefault();

        return;
    }

    // Escape clears the filter first (whether the box has focus or not), then the selection.
    if (action === 'escape' && mode === 'gallery' && (document.activeElement === filterBox || filterBox.value)) {
        filterBox.value = '';
        gallery.setView({ filter: '' });
        galleryRoot.focus();
        event.preventDefault();

        return;
    }

    const handled = SHARED_ACTIONS.includes(action)
        ? handleShared(action)
        : mode === 'lightbox'
          ? lightbox.handleAction(action)
          : gallery.handleAction(action);

    if (handled) {
        event.preventDefault();
        renderInfo();
    }
});

filterBox.addEventListener('input', () => gallery.setView({ filter: filterBox.value }));
document.getElementById('shots-help').addEventListener('click', () => handleShared('help'));

async function loadManifest() {
    try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-store' });

        if (!response.ok) {
            throw new Error(`manifest ${response.status}`);
        }

        const parsed = await response.json();

        if (!Array.isArray(parsed?.entries)) {
            throw new Error('manifest has no entries array');
        }

        // A bad row is skipped and defaults are filled in, so one bad entry never blanks the gallery.
        const entries = parsed.entries
            .filter((entry) => typeof entry?.slug === 'string' && typeof entry?.pose === 'string')
            .map((entry) => ({ variants: {}, lint: [], error: null, ...entry }));

        return { manifest: { ...parsed, entries }, failed: false };
    } catch (error) {
        setStatus(`No captures yet (${error.message}). Run a capture in dev or pnpm run capture:shots.`);

        return { manifest: emptyManifest(), failed: true };
    }
}

renderHelp();

const { manifest, failed } = await loadManifest();

gallery.setEntries(manifest.entries);

if (!failed) {
    setStatus(
        `${manifest.entries.length} tiles from ${demos.length} demos${manifest.generatedAt ? `, captured ${manifest.generatedAt.slice(0, 10)}` : ''}`,
    );
}

// After the summary, so a refused ?baseline status is the one left on screen.
startReviewMode({ gallery, imageUrl, setStatus, renderInfo });

galleryRoot.focus();

if (import.meta.env.DEV) {
    const { startCaptureMode } = await import('./capture-mode.js');

    startCaptureMode({ manifest, demos, demoBase, pageSuffix, gallery, liveImages, liveImageKey, setStatus }).catch(
        (error) => {
            console.error(error);
            setStatus(`capture mode failed: ${error?.message ?? error}`);
        },
    );
}

export { demoUrl, gallery, imageUrl, lightbox, liveImageKey, liveImages, setStatus };
