/**
 * The /shots lightbox: one capture at integer zoom (100, 200, 400 percent), panned with the
 * arrow keys, with an optional pixel grid at 400 percent. Opens in place over the gallery and
 * walks the gallery's visible order.
 */

const ZOOM_LEVELS = [1, 2, 4];
const PAN_STEP_PX = 40;
const PAN_FAST_PX = 200;
const GRID_ZOOM = 4;

const PANS = {
    'pan-up': [0, -PAN_STEP_PX],
    'pan-down': [0, PAN_STEP_PX],
    'pan-left': [-PAN_STEP_PX, 0],
    'pan-right': [PAN_STEP_PX, 0],
    'pan-fast-up': [0, -PAN_FAST_PX],
    'pan-fast-down': [0, PAN_FAST_PX],
    'pan-fast-left': [-PAN_FAST_PX, 0],
    'pan-fast-right': [PAN_FAST_PX, 0],
};

/**
 * @param {HTMLElement} root - The #shots-lightbox element.
 * @param {{
 *   imageUrl: (entry: object, variant: string) => string | null,
 *   order: () => string[],
 *   entryFor: (key: string) => object | null,
 *   variantFor: (key: string) => string,
 *   onClose: (lastKey: string | null) => void,
 * }} hooks
 */
function createLightbox(root, hooks) {
    let key = null;
    let zoomIndex = 0;
    let grid = false;

    const stage = document.createElement('div');
    const img = document.createElement('img');
    const gridLayer = document.createElement('div');
    const caption = document.createElement('div');

    stage.className = 'shots-stage';
    gridLayer.className = 'shots-grid';
    gridLayer.hidden = true;
    caption.className = 'shots-lightbox-caption';
    img.draggable = false;
    stage.append(img, gridLayer);
    root.append(stage, caption);

    function render() {
        const entry = hooks.entryFor(key);

        if (!entry) {
            return;
        }

        const zoom = ZOOM_LEVELS[zoomIndex];
        const variant = hooks.variantFor(key);

        img.src = hooks.imageUrl(entry, variant) ?? '';
        img.width = entry.width * zoom;
        img.height = entry.height * zoom;
        img.alt = `${entry.slug} ${entry.pose} ${variant} at ${zoom * 100} percent`;

        gridLayer.hidden = !(grid && zoom === GRID_ZOOM);
        gridLayer.style.backgroundSize = `${zoom}px ${zoom}px`;
        gridLayer.style.width = `${img.width}px`;
        gridLayer.style.height = `${img.height}px`;
        gridLayer.style.left = `${img.offsetLeft}px`;
        gridLayer.style.top = `${img.offsetTop}px`;

        caption.textContent = `${entry.slug} / ${entry.pose} / ${variant}  ${zoom * 100}%  ${entry.width}x${entry.height}`;
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

    function stepDemo(delta) {
        const keys = hooks.order();
        const slugOf = (item) => item.slice(0, item.indexOf('/'));
        let index = keys.indexOf(key);
        const slug = slugOf(key);

        while (index >= 0 && index < keys.length && slugOf(keys[index]) === slug) {
            index += delta;
        }

        if (index >= 0 && index < keys.length) {
            key = keys[index];
            render();
        }
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
        key = null;
        hooks.onClose(lastKey);
    }

    /** @returns {boolean} True when the action was a navigation action. */
    function navigationActions(action) {
        if (action === 'prev' || action === 'next') {
            step(action === 'next' ? 1 : -1);
        } else if (action === 'first' || action === 'last') {
            jumpTo(action);
        } else if (action === 'demo-prev' || action === 'demo-next') {
            stepDemo(action === 'demo-next' ? 1 : -1);
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

    return {
        open(nextKey) {
            key = nextKey;
            root.hidden = false;
            render();
        },
        close,
        isOpen: () => !root.hidden,
        currentKey: () => key,
        rerender: render,
        handleAction,
    };
}

export { createLightbox };
