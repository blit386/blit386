/**
 * Review aids for the /shots page: findings (flags and notes) and the baseline pixel diff.
 * startReviewMode returns the two hooks that shots.js routes keys to.
 */

import { BASELINE_REFUSED, parseBaseline } from './baseline.js';
import { diffPixels, loadPixels } from './diff.js';
import { downloadBlob } from './download.js';
import { createFindings } from './findings.js';

const DIFF_CYCLE = ['current', 'baseline', 'diff'];
const EXPORT_FILE = 'shots-findings.md';

function exportMarkdown(findings, setStatus) {
    const markdown = findings.toMarkdown();

    // Download first: the clipboard is undefined outside a secure context and must never block it.
    downloadBlob(EXPORT_FILE, new Blob([markdown], { type: 'text/markdown' }));
    setStatus(`findings downloaded as ${EXPORT_FILE}`);

    navigator.clipboard?.writeText(markdown).then(
        () => setStatus(`findings downloaded as ${EXPORT_FILE} and copied`),
        () => setStatus(`findings downloaded as ${EXPORT_FILE}, clipboard blocked`),
    );
}

function startFindings({ gallery, setStatus, renderInfo }) {
    const findings = createFindings(localStorage);

    const hooks = {
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

    return hooks;
}

function startDiff({ gallery, imageUrl, setStatus }, rawBaseline) {
    const baseline = rawBaseline === null ? null : parseBaseline(rawBaseline, location.href);
    const cache = new Map();
    const state = { show: 'current' };

    const baselineUrlFor = (entry, variant) => `${baseline}/${entry.variants[variant]}`;

    async function computeDiff(entry, variant) {
        const baselineUrl = baselineUrlFor(entry, variant);
        const current = await loadPixels(imageUrl(entry, variant));
        const result = diffPixels(current, await loadPixels(baselineUrl));
        const canvas = document.createElement('canvas');

        canvas.width = current.width;
        canvas.height = current.height;
        canvas.getContext('2d').putImageData(new ImageData(result.data, current.width, current.height), 0, 0);

        return { changed: result.changed, url: canvas.toDataURL(), baselineUrl };
    }

    // The promise is cached, failures included: a missing baseline is not re-fetched on every
    // refresh(), and concurrent callers share one decode. The current image's URL is part of the
    // key: a recapture in dev swaps in a new object URL, which must not reuse the old diff.
    function diffFor(entry, variant) {
        const cacheKey = `${entry.slug}/${entry.pose}/${variant}|${imageUrl(entry, variant)}`;

        if (!cache.has(cacheKey)) {
            cache.set(cacheKey, computeDiff(entry, variant));
        }

        return cache.get(cacheKey);
    }

    function apply(action) {
        if (rawBaseline === null) {
            setStatus('no baseline: open /shots?baseline=<url of another public/shots>');

            return;
        }

        if (baseline === null) {
            setStatus(BASELINE_REFUSED);

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
    }

    if (rawBaseline !== null && baseline === null) {
        setStatus(BASELINE_REFUSED);
    }

    return {
        apply,
        // The lightbox reads the live diff state through this, the way the gallery gets it from setView.
        current: () => ({ show: state.show, diffFor, baselineUrlFor }),
    };
}

/**
 * @param {{
 *   gallery: ReturnType<typeof import('./gallery.js').createGallery>,
 *   imageUrl: (entry: object, variant: string) => string | null,
 *   setStatus: (text: string) => void,
 *   renderInfo: () => void,
 * }} context
 * @returns {{
 *   findings: ReturnType<typeof startFindings>,
 *   diff: ReturnType<typeof startDiff>,
 * }}
 */
function startReviewMode(context) {
    return {
        findings: startFindings(context),
        diff: startDiff(context, new URLSearchParams(location.search).get('baseline')),
    };
}

export { startReviewMode };
