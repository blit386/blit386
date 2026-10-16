/**
 * The /shots lightbox: one capture at integer zoom (100, 200, 400 percent), panned with the
 * arrow keys, with an optional pixel grid at 400 percent. Opens in place over the gallery and
 * walks the gallery's visible order.
 */

import { demoNeighbor } from './layout-model.js';
import { CAPTION_SEPARATOR } from './manifest.js';
import { OUTPUT_VARIANT } from './poses.js';

const ZOOM_LEVELS = [1, 2, 4];
const PAN_STEP_PX = 40;
const PAN_FAST_PX = 200;
const GRID_ZOOM = 4;
const CAPTION_GAP_PX = 8;

// Trackpads fire many wheel events per swipe; one zoom step per gate keeps three levels from flying past.
const WHEEL_GATE_MS = 150;

const PANS = {
    'pan-up': [0, -PAN_STEP_PX],
    'pan-down': [0, PAN_STEP_PX],
    'pan-fast-up': [0, -PAN_FAST_PX],
    'pan-fast-down': [0, PAN_FAST_PX],
    'pan-fast-left': [-PAN_FAST_PX, 0],
    'pan-fast-right': [PAN_FAST_PX, 0],
};

// Every action handleAction() answers; keys.test.mjs checks the key map against it.
const LIGHTBOX_ACTIONS = [
    ...Object.keys(PANS),
    'prev',
    'next',
    'first',
    'last',
    'demo-prev',
    'demo-next',
    'zoom-in',
    'zoom-out',
    'zoom-1',
    'zoom-2',
    'zoom-4',
    'grid-toggle',
    'variant-next',
    'close',
];

/**
 * @param {HTMLElement} root - The #shots-lightbox element.
 * @param {{
 *   imageUrl: (entry: object, variant: string) => string | null,
 *   order: () => string[],
 *   entryFor: (key: string) => object | null,
 *   variantFor: (key: string) => string,
 *   cycleVariant: (key: string) => void,
 *   diffState: () => { show: string, diffFor: (entry: object, variant: string) => Promise<{ changed: number, url: string }>, baselineUrlFor: (entry: object, variant: string) => string },
 *   onClose: (lastKey: string | null) => void,
 * }} hooks
 */
function createLightbox(root, hooks) {
    let key = null;
    let zoomIndex = 0;
    let grid = false;
    let renderToken = 0;
    let lastWheel = 0;

    const stage = document.createElement('div');
    const img = document.createElement('img');
    const gridLayer = document.createElement('div');
    const diffLayer = document.createElement('img');
    const caption = document.createElement('div');

    stage.className = 'shots-stage';
    gridLayer.className = 'shots-grid';
    gridLayer.hidden = true;
    diffLayer.className = 'shots-diff-overlay';
    diffLayer.hidden = true;
    diffLayer.draggable = false;
    caption.className = 'shots-lightbox-caption';
    img.draggable = false;
    stage.append(img, diffLayer, gridLayer, caption);
    root.append(stage);

    function render() {
        const entry = hooks.entryFor(key);

        if (!entry) {
            return;
        }

        const zoom = ZOOM_LEVELS[zoomIndex];
        const variant = hooks.variantFor(key);

        img.src = hooks.imageUrl(entry, variant) ?? '';
        img.alt = `${entry.slug} ${entry.pose} ${variant} at ${zoom * 100} percent`;
        img.onload = null;

        // An output capture is stored at drawing-buffer size, not the manifest's display size.
        if (variant !== OUTPUT_VARIANT) {
            sizeTo(entry.width, entry.height, zoom);
        } else if (img.complete && img.naturalWidth > 0) {
            sizeTo(img.naturalWidth, img.naturalHeight, zoom);
        } else {
            img.onload = () => sizeTo(img.naturalWidth, img.naturalHeight, zoom);
        }

        caption.textContent = [
            entry.slug,
            entry.pose,
            variant,
            `${zoom * 100}%`,
            `${entry.width}x${entry.height}`,
        ].join(CAPTION_SEPARATOR);
        renderDiff(entry, variant);
    }

    /** Show the baseline or lay the cached diff over the image, per the diff state; a newer render cancels a stale one. */
    function renderDiff(entry, variant) {
        const token = ++renderToken;
        const { show, diffFor, baselineUrlFor } = hooks.diffState();

        diffLayer.hidden = true;

        // Stays 'current' until a usable ?baseline= is set, so diffFor is only called with a baseline.
        if (show === 'current') {
            return;
        }

        // The baseline image does not depend on the diff, so it shows even if the current capture fails to load.
        if (show === 'baseline') {
            img.src = baselineUrlFor(entry, variant);
        }

        diffFor(entry, variant).then(
            (diff) => {
                if (token !== renderToken) {
                    return;
                }

                if (show === 'diff') {
                    diffLayer.src = diff.url;
                    diffLayer.hidden = false;
                }

                caption.textContent += `${CAPTION_SEPARATOR}diff ${diff.changed}`;
            },
            (error) => {
                if (token === renderToken) {
                    caption.textContent += `${CAPTION_SEPARATOR}diff: ${error.message}`;
                }
            },
        );
    }

    function sizeTo(width, height, zoom) {
        img.width = width * zoom;
        img.height = height * zoom;
        gridLayer.hidden = !(grid && zoom === GRID_ZOOM);
        gridLayer.style.backgroundSize = `${zoom}px ${zoom}px`;
        placeLayers();
    }

    /** Line the grid and diff layers up with the image; the stage centers it, so a resize moves it. */
    function placeLayers() {
        for (const layer of [gridLayer, diffLayer]) {
            layer.style.width = `${img.width}px`;
            layer.style.height = `${img.height}px`;
            layer.style.left = `${img.offsetLeft}px`;
            layer.style.top = `${img.offsetTop}px`;
        }

        caption.style.left = `${img.offsetLeft + img.width / 2}px`;
        caption.style.top = `${img.offsetTop + img.height + CAPTION_GAP_PX}px`;
    }

    function step(delta) {
        const keys = hooks.order();
        const index = keys.indexOf(key);

        if (index === -1) {
            return;
        }

        key = keys[Math.min(keys.length - 1, Math.max(0, index + delta))];
        render();
    }

    function jumpTo(action) {
        const keys = hooks.order();

        key = action === 'first' ? keys[0] : keys[keys.length - 1];
        render();
    }

    function zoomBy(action) {
        if (action === 'zoom-in' || action === 'zoom-out') {
            zoomIndex = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, zoomIndex + (action === 'zoom-in' ? 1 : -1)));
        } else {
            zoomIndex = ZOOM_LEVELS.indexOf(Number(action.slice('zoom-'.length)));
        }

        render();
    }

    function close() {
        const lastKey = key;

        root.hidden = true;
        document.documentElement.style.overflow = '';
        key = null;
        renderToken++;
        window.removeEventListener('resize', placeLayers);
        hooks.onClose(lastKey);
    }

    /** @returns {boolean} True when the action was a navigation action. */
    function navigationActions(action) {
        if (action === 'prev' || action === 'next') {
            step(action === 'next' ? 1 : -1);
        } else if (action === 'first' || action === 'last') {
            jumpTo(action);
        } else if (action === 'demo-prev' || action === 'demo-next') {
            key = demoNeighbor(hooks.order(), key, action === 'demo-next' ? 1 : -1);
            render();
        } else {
            return false;
        }

        return true;
    }

    /**
     * @param {string} action - From keys.js, lightbox column.
     * @returns {boolean}
     */
    function handleAction(action) {
        if (action in PANS) {
            root.scrollBy({ left: PANS[action][0], top: PANS[action][1] });
        } else if (navigationActions(action)) {
            return true;
        } else if (action.startsWith('zoom-')) {
            zoomBy(action);
        } else if (action === 'grid-toggle') {
            grid = !grid;
            render();
        } else if (action === 'variant-next') {
            hooks.cycleVariant(key);
            render();
        } else if (action === 'close') {
            close();
        } else {
            return false;
        }

        return true;
    }

    root.addEventListener('click', (event) => {
        if (event.target === root || event.target === stage) {
            close();
        }
    });

    // Ctrl or Cmd plus wheel zooms, which is also what a trackpad pinch sends; a plain wheel scrolls
    // the lightbox so a zoomed capture can be panned. Not passive: preventDefault keeps the browser's
    // own page zoom from taking the pinch.
    root.addEventListener(
        'wheel',
        (event) => {
            if (!event.ctrlKey && !event.metaKey) {
                return;
            }

            event.preventDefault();

            const now = performance.now();

            if (event.deltaY === 0 || now - lastWheel < WHEEL_GATE_MS) {
                return;
            }

            lastWheel = now;
            zoomBy(event.deltaY < 0 ? 'zoom-in' : 'zoom-out');
        },
        { passive: false },
    );

    return {
        open(nextKey) {
            key = nextKey;
            root.hidden = false;
            document.documentElement.style.overflow = 'hidden';
            window.addEventListener('resize', placeLayers);
            render();
        },
        close,
        isOpen: () => !root.hidden,
        currentKey: () => key,
        rerender: render,
        handleAction,
    };
}

export { createLightbox, LIGHTBOX_ACTIONS };
