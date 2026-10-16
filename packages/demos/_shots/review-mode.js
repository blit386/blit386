/**
 * Review aids for the /shots page: findings (flags and notes) and the baseline pixel diff.
 * Installs the `window.__shotsFindings` and `window.__shotsDiff` hooks that shots.js routes keys to.
 */

import { diffPixels, loadPixels } from './diff.js';
import { createFindings } from './findings.js';

const DIFF_CYCLE = ['current', 'baseline', 'diff'];
const EXPORT_FILE = 'shots-findings.md';

/**
 * Resolve `?baseline=` to an absolute http(s) base URL without a trailing slash. A relative value
 * resolves against the page, so a same-origin path works; `javascript:` and `data:` are refused.
 *
 * @param {string} value
 * @returns {string | null}
 */
function parseBaseline(value) {
    try {
        const url = new URL(value, location.href);

        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href.replace(/\/$/, '') : null;
    } catch {
        return null;
    }
}

function exportMarkdown(findings, setStatus) {
    const markdown = findings.toMarkdown();
    const link = document.createElement('a');

    // Download first: the clipboard is undefined outside a secure context and must never block it.
    link.href = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    link.download = EXPORT_FILE;
    link.click();
    // Some browsers start the download asynchronously; revoking in the same tick can empty it.
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
    setStatus(`findings downloaded as ${EXPORT_FILE}`);

    navigator.clipboard?.writeText(markdown).then(
        () => setStatus(`findings downloaded as ${EXPORT_FILE} and copied`),
        () => setStatus(`findings downloaded as ${EXPORT_FILE}, clipboard blocked`),
    );
}

function startFindings({ gallery, setStatus, renderInfo }) {
    const findings = createFindings(localStorage);

    window.__shotsFindings = {
        toggleFlag(key) {
            findings.toggleFlag(key);
            gallery.setFlagged(findings.flaggedKeys());
        },
        addNote(key) {
            const text = window.prompt(`Note for ${key}`);

            if (text !== null) {
                findings.addNote(key, text);
                renderInfo();
            }
        },
        notesFor: (key) => findings.notesFor(key),
        exportMarkdown: () => exportMarkdown(findings, setStatus),
    };

    gallery.setFlagged(findings.flaggedKeys());
}

function startDiff({ gallery, imageUrl, setStatus }, rawBaseline) {
    const baseline = rawBaseline === null ? null : parseBaseline(rawBaseline);
    const cache = new Map();
    const state = { show: 'current' };

    async function diffFor(entry, variant) {
        const cacheKey = `${entry.slug}/${entry.pose}/${variant}`;

        if (!cache.has(cacheKey)) {
            const baselineUrl = `${baseline}/${entry.variants[variant]}`;
            const current = await loadPixels(imageUrl(entry, variant));
            const result = diffPixels(current, await loadPixels(baselineUrl));
            const canvas = document.createElement('canvas');

            canvas.width = current.width;
            canvas.height = current.height;
            canvas.getContext('2d').putImageData(new ImageData(result.data, current.width, current.height), 0, 0);
            cache.set(cacheKey, { changed: result.changed, url: canvas.toDataURL(), baselineUrl });
        }

        return cache.get(cacheKey);
    }

    window.__shotsDiff = (action) => {
        if (rawBaseline === null) {
            setStatus('no baseline: open /shots?baseline=<url of another public/shots>');

            return;
        }

        if (baseline === null) {
            setStatus('baseline refused: it must be an http(s) URL or a same-origin path');

            return;
        }

        state.show =
            action === 'diff-toggle'
                ? state.show === 'current'
                    ? 'diff'
                    : 'current'
                : DIFF_CYCLE[(DIFF_CYCLE.indexOf(state.show) + 1) % DIFF_CYCLE.length];

        gallery.setView({ diff: state.show, diffFor: state.show === 'current' ? null : diffFor });
        setStatus(`diff view: ${state.show}`);
    };

    // The lightbox reads the live diff state through this, the way the gallery gets it from setView.
    window.__shotsDiff.current = () => ({ show: state.show, diffFor });

    if (rawBaseline !== null && baseline === null) {
        setStatus('baseline refused: it must be an http(s) URL or a same-origin path');
    }
}

/**
 * @param {{
 *   gallery: ReturnType<typeof import('./gallery.js').createGallery>,
 *   imageUrl: (entry: object, variant: string) => string | null,
 *   setStatus: (text: string) => void,
 *   renderInfo: () => void,
 * }} context
 */
function startReviewMode(context) {
    startFindings(context);
    startDiff(context, new URLSearchParams(location.search).get('baseline'));
}

export { startReviewMode };
