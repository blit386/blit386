/**
 * The tile grid of the /shots page: renders manifest entries as 1x tiles, keeps focus and
 * selection, stacks poses per demo, and answers the gallery actions from keys.js. Layout math
 * lives in layout-model.js; this file only touches the DOM.
 */

import { buildRows, demoNeighbor, moveFocus, visibleOrder } from './layout-model.js';
import { CAPTION_SEPARATOR, entryKey } from './manifest.js';
import { OUTPUT_VARIANT, VARIANTS } from './poses.js';

const ROW_SCROLL_FRACTION = 0.9;

const FOCUS_MOVES = {
    'focus-left': 'left',
    'focus-right': 'right',
    'focus-up': 'up',
    'focus-down': 'down',
    'focus-home': 'home',
    'focus-end': 'end',
};

// Every action handleAction() answers; keys.test.mjs checks the key map against it.
const GALLERY_ACTIONS = [
    ...Object.keys(FOCUS_MOVES),
    'page-up',
    'page-down',
    'demo-next',
    'demo-prev',
    'extend-left',
    'extend-right',
    'extend-up',
    'extend-down',
    'toggle-select',
    'select-all',
    'select-none',
    'escape',
    'stack-all',
    'stack-focused',
    'variant-next',
    'lint-toggle',
    'open',
    'capture-selected',
    'capture-all',
];

/**
 * Size an image to its entry. An output capture is stored at drawing-buffer size, not the
 * manifest's display size, so it takes its own pixel size once loaded.
 *
 * @param {HTMLImageElement} img
 * @param {{ width: number, height: number }} entry
 * @param {string} variant
 */
function sizeImage(img, entry, variant) {
    if (variant === OUTPUT_VARIANT) {
        img.addEventListener('load', () => {
            img.width = img.naturalWidth;
            img.height = img.naturalHeight;
        });
    } else {
        img.width = entry.width;
        img.height = entry.height;
    }
}

/**
 * Wait for the tile's diff against the baseline, then show it: swap the image for the baseline,
 * lay the magenta diff over it, and add a badge with the changed-pixel count (or the failure).
 */
function attachDiff(view, { entry, variant, img, element, caption }) {
    const addBadge = (text, isError) => {
        const badge = document.createElement('span');

        badge.className = isError ? 'shots-badge shots-badge-error' : 'shots-badge';
        badge.textContent = text;
        caption.append(badge);
    };

    view.diffFor(entry, variant).then(
        (diff) => {
            if (view.diff === 'baseline') {
                img.src = diff.baselineUrl;
            } else if (view.diff === 'diff') {
                const overlay = document.createElement('img');

                sizeImage(overlay, entry, variant);
                overlay.src = diff.url;
                overlay.style.position = 'absolute';
                overlay.style.left = '4px';
                overlay.style.top = '4px';
                element.append(overlay);
            }

            addBadge(`diff ${diff.changed}`, false);
        },
        (error) => addBadge(`diff: ${error.message}`, true),
    );
}

/**
 * @param {HTMLElement} root - The gallery's container: `#shots-gallery` on /shots, `#sheet-gallery` on the sheet.
 * @param {{
 *   imageUrl: (entry: object, variant: string) => string | null,
 *   onOpen?: (key: string) => void,
 *   onCapture?: (keys: string[]) => void,
 *   onSelect?: () => void,
 *   tileLink?: (entry: object) => { href: string, label: string },
 * }} hooks - `tileLink` switches a tile to link mode for the public sheet: the tile becomes a
 *   plain link labeled `label`, with no focus or selection clicks. Link mode never
 *   reaches `onOpen` or `onCapture`, so the sheet omits them; the review page passes both and
 *   never passes `tileLink`.
 */
function createGallery(root, hooks) {
    /** @type {Array<object>} */
    let entries = [];
    const byKey = new Map();
    const view = {
        stacked: true,
        expanded: new Set(),
        filter: '',
        variant: 'display',
        lint: true,
        diff: 'current',
        diffFor: null,
    };
    let focused = null;
    const selected = new Set();
    let anchorKey = null;
    const flagged = new Set();
    /** @type {Array<{ key: string, slug: string, pose: string, stackSize: number }>} */
    let tiles = [];

    function tileElement(key) {
        return root.querySelector(`[data-key="${CSS.escape(key)}"]`);
    }

    function variantFor(entry) {
        if (entry.variants[view.variant]) {
            return view.variant;
        }

        return VARIANTS.find((variant) => entry.variants[variant]) ?? 'display';
    }

    function renderTile(tile) {
        const entry = byKey.get(tile.key);
        const element = document.createElement('figure');
        const variant = variantFor(entry);
        const url = hooks.imageUrl(entry, variant);
        const link = hooks.tileLink?.(entry) ?? null;
        let img = null;

        element.className = 'shots-tile';
        element.dataset.key = tile.key;
        element.dataset.focused = String(tile.key === focused);
        element.dataset.selected = String(selected.has(tile.key));
        element.dataset.flagged = String(flagged.has(tile.key));

        if (entry.error) {
            const error = document.createElement('div');

            error.className = 'shots-error';
            error.style.width = `${entry.width || 320}px`;
            error.textContent = entry.error;
            element.append(error);
        } else if (url) {
            img = document.createElement('img');

            sizeImage(img, entry, variant);
            img.src = url;
            img.alt = link ? link.label : `${tile.slug} ${tile.pose} ${variant}`;
            img.draggable = false;

            if (link) {
                img.loading = 'lazy';
            }

            element.append(img);
        }

        const caption = document.createElement('figcaption');

        caption.className = 'shots-caption';
        if (link) {
            caption.append(link.label);
        } else {
            caption.append([tile.slug, tile.pose, `${entry.width}x${entry.height}`, variant].join(CAPTION_SEPARATOR));
        }

        if (view.lint && entry.lint.length > 0) {
            const badge = document.createElement('span');

            badge.className = 'shots-badge';
            badge.title = entry.lint.map((finding) => `${finding.rule}: ${finding.message}`).join('\n');
            badge.textContent = `lint ${entry.lint.length}`;
            caption.append(badge);
        }

        if (entry.error) {
            const badge = document.createElement('span');

            badge.className = 'shots-badge shots-badge-error';
            badge.textContent = 'error';
            caption.append(badge);
        }

        element.append(caption);

        if (view.diffFor && img) {
            attachDiff(view, { entry, variant, img, element, caption });
        }

        if (tile.stackSize > 1) {
            const count = document.createElement('span');

            count.className = 'shots-stack-count';
            count.textContent = `${tile.stackSize}`;
            element.append(count);
        }

        if (link) {
            const anchor = document.createElement('a');

            anchor.className = 'shots-tile-link';
            anchor.href = link.href;
            anchor.append(...element.childNodes);
            element.append(anchor);

            return element;
        }

        element.addEventListener('click', (event) => {
            if (event.shiftKey) {
                extendSelectionTo(tile.key);
            } else {
                focused = tile.key;
                anchorKey = tile.key;
            }

            refresh();
            hooks.onSelect?.();
        });
        element.addEventListener('dblclick', () => hooks.onOpen(tile.key));

        return element;
    }

    function refresh() {
        tiles = visibleOrder(entries, view);

        if (!tiles.some((tile) => tile.key === focused)) {
            focused = tiles[0]?.key ?? null;
        }

        root.replaceChildren(...tiles.map(renderTile));

        if (focused) {
            tileElement(focused)?.scrollIntoView({ block: 'nearest' });
        }
    }

    function rows() {
        const origin = root.getBoundingClientRect();

        return buildRows(
            tiles.map((tile) => {
                const box = tileElement(tile.key).getBoundingClientRect();

                return {
                    key: tile.key,
                    x: box.left - origin.left,
                    y: box.top - origin.top,
                    w: box.width,
                    h: box.height,
                };
            }),
        );
    }

    function order() {
        return tiles.map((tile) => tile.key);
    }

    function extendSelectionTo(key) {
        const keys = order();
        const from = keys.indexOf(anchorKey ?? focused);
        const to = keys.indexOf(key);

        if (from === -1 || to === -1) {
            return;
        }

        for (const index of keys.keys()) {
            if (index >= Math.min(from, to) && index <= Math.max(from, to)) {
                selected.add(keys[index]);
            }
        }

        focused = key;
    }

    function pageBy(direction) {
        if (tiles.length === 0) {
            return;
        }

        const step = root.clientHeight * ROW_SCROLL_FRACTION;
        const current = tileElement(focused);
        const target = (current?.offsetTop ?? 0) + step * direction;
        const next = tiles
            .map((tile) => ({ key: tile.key, top: tileElement(tile.key).offsetTop }))
            .reduce((best, item) => (Math.abs(item.top - target) < Math.abs(best.top - target) ? item : best));

        focused = next.key;
    }

    function nextVariant(key = focused) {
        const entry = byKey.get(key);

        const available = entry ? VARIANTS.filter((variant) => entry.variants[variant]) : [];

        if (available.length === 0) {
            return;
        }

        const index = available.indexOf(variantFor(entry));

        view.variant = available[(index + 1) % available.length];
    }

    function toggleIn(set, value) {
        if (set.has(value)) {
            set.delete(value);
        } else {
            set.add(value);
        }
    }

    /** @returns {boolean} True when the action moved focus. */
    function focusActions(action) {
        if (action in FOCUS_MOVES) {
            focused = moveFocus(rows(), focused, FOCUS_MOVES[action]);
        } else if (action === 'page-up' || action === 'page-down') {
            pageBy(action === 'page-up' ? -1 : 1);
        } else if (action === 'demo-next' || action === 'demo-prev') {
            focused = demoNeighbor(order(), focused, action === 'demo-next' ? 1 : -1);
        } else {
            return false;
        }

        return true;
    }

    /** @returns {boolean} True when the action changed the selection. */
    function selectionActions(action) {
        if (action.startsWith('extend-')) {
            anchorKey ??= focused;
            extendSelectionTo(moveFocus(rows(), focused, action.slice('extend-'.length)));
        } else if (action === 'toggle-select') {
            if (focused) {
                toggleIn(selected, focused);
                anchorKey = focused;
            }
        } else if (action === 'select-all') {
            for (const key of order()) {
                selected.add(key);
            }
        } else if (action === 'select-none' || action === 'escape') {
            selected.clear();
        } else {
            return false;
        }

        return true;
    }

    /** @returns {boolean} True when the action changed the view. */
    function viewActions(action) {
        if (action === 'stack-all') {
            view.stacked = !view.stacked;
            view.expanded.clear();
        } else if (action === 'stack-focused') {
            const slug = byKey.get(focused)?.slug;

            if (slug) {
                toggleIn(view.expanded, slug);
            }
        } else if (action === 'variant-next') {
            nextVariant();
        } else if (action === 'lint-toggle') {
            view.lint = !view.lint;
        } else {
            return false;
        }

        return true;
    }

    /** @returns {boolean} True when the action ran a hook (no re-render needed). */
    function commandActions(action) {
        if (action === 'open') {
            if (focused) {
                hooks.onOpen(focused);
            }
        } else if (action === 'capture-selected') {
            hooks.onCapture(selected.size > 0 ? [...selected] : focused ? [focused] : []);
        } else if (action === 'capture-all') {
            hooks.onCapture(entries.map((entry) => entryKey(entry.slug, entry.pose)));
        } else {
            return false;
        }

        return true;
    }

    /**
     * @param {string} action - From keys.js.
     * @returns {boolean} True when the action was handled.
     */
    function handleAction(action) {
        if (focusActions(action) || selectionActions(action) || viewActions(action)) {
            refresh();

            return true;
        }

        return commandActions(action);
    }

    return {
        setEntries(next) {
            entries = next;
            byKey.clear();

            for (const entry of entries) {
                byKey.set(entryKey(entry.slug, entry.pose), entry);
            }

            refresh();
        },
        setView(partial) {
            Object.assign(view, partial);
            refresh();
        },
        getView: () => ({ ...view, expanded: new Set(view.expanded) }),
        focusKey(key) {
            focused = key;
            refresh();
        },
        focusedKey: () => focused,
        selectedKeys: () => [...selected],
        visibleKeys: order,
        entryFor: (key) => byKey.get(key) ?? null,
        currentVariant: (key) => variantFor(byKey.get(key)),
        cycleVariant(key) {
            nextVariant(key);
            refresh();
        },
        toggleFlag(key) {
            toggleIn(flagged, key);
            refresh();
        },
        setFlagged(keys) {
            flagged.clear();

            for (const key of keys) {
                flagged.add(key);
            }

            refresh();
        },
        handleAction,
        refresh,
    };
}

export { createGallery, GALLERY_ACTIONS };
