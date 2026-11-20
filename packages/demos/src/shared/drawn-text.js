/**
 * The strings the last frame drew, for an agent or a test reading a live demo under `?embed&capture`.
 *
 * The page is one canvas, so the accessibility tree is empty and a six-pixel system font is a poor thing to
 * read from a screenshot. The text a demo draws with the built-in font goes through `BT.systemPrint` (the shared
 * kit's labels, captions, key-value rows and tooltips, and any demo that calls it directly), and the engine overlay
 * draws the demo's own rows. This module taps the first and reads the second from the engine's dev-only
 * `window.__btOverlayRows`, and hands both back with the display position each was drawn at.
 *
 * `BT.testState()` is not this readout: it returns whatever a game's own hook remembers, so a wrong label next
 * to a right internal value would still pass. Nothing here is installed unless `capture-expose.js` asks for it,
 * so a demo without `?capture` draws through the untouched `BT.systemPrint`.
 *
 * Known gaps:
 * - `BT.printFont` text (bitmap fonts a demo loads itself) is not recorded.
 * - A frame that makes no `BT.systemPrint` call leaves the previous frame's list in place, so a label a demo
 *   stopped drawing can still read back. Do not take its presence as proof the current frame drew it.
 * - The frame boundary is the end of a synchronous task, not the renderer's `beginFrame`. Text a demo prints from
 *   `update()` is recorded although the engine discards it at the next `beginFrame`. Demos draw from `render()`;
 *   telling the two apart needs a render-phase signal from the engine.
 */

// Palette slot 0 is transparent: the engine returns from `BT.systemPrint` without drawing anything.
const TRANSPARENT_SLOT = 0;

/** Text drawn by the shared UI kit (`ui-core.js`, `ui-widgets.js`). */
const TEXT_SOURCE_KIT = 'kit';

/** Text a demo drew by calling `BT.systemPrint` itself. */
const TEXT_SOURCE_SYSTEM = 'system';

/** A demo row the engine overlay drew. */
const TEXT_SOURCE_OVERLAY = 'overlay';

// Who is drawing right now. The kit flips it around its own `BT.systemPrint` calls.
let currentSource = TEXT_SOURCE_SYSTEM;

// The strings of the frame being drawn, or of the last one drawn when none is in progress.
let frame = [];

// True from a frame's first string until the task that drew it ends (see the tap below).
let isFrameOpen = false;

/**
 * Tags the `BT.systemPrint` calls that follow, until the next call. The kit sets `'kit'` around its own draws
 * and puts `'system'` back, so a demo's direct calls read as `'system'`.
 *
 * @param {string} source - `TEXT_SOURCE_KIT` or `TEXT_SOURCE_SYSTEM`.
 */
function setTextSource(source) {
    currentSource = source;
}

/**
 * Wraps `bt.systemPrint` so every call is drawn exactly as before and then recorded, unless it drew nothing.
 *
 * A frame is the run of calls inside one synchronous task: `render()` is synchronous, so the first call after the
 * previous task ended starts a fresh list and a microtask closes it. Counting ticks would not do - `captureFrame`
 * and a second `renderAt` re-render at the same tick.
 *
 * @param {{ systemPrint: (pos: { x: number, y: number }, color: number, text: string) => void, camera: { x: number, y: number } }} bt -
 *   The engine namespace whose `systemPrint` the demo calls.
 */
function installTextTap(bt) {
    const draw = bt.systemPrint;

    bt.systemPrint = (pos, color, text) => {
        // Draw first: a call the engine rejects (it throws on a bad palette index) is not on screen.
        draw(pos, color, text);

        // A transparent string is not on screen either.
        if (color === TRANSPARENT_SLOT) {
            return;
        }

        if (!isFrameOpen) {
            frame = [];
            isFrameOpen = true;

            queueMicrotask(() => {
                isFrameOpen = false;
            });
        }

        // The renderer draws text at `pos` minus the camera, so subtract it to get the display position. The kit
        // reuses one vector for every string, so copy the numbers out now.
        const camera = bt.camera;

        frame.push({ source: currentSource, text, x: pos.x - camera.x, y: pos.y - camera.y, color });
    };
}

/**
 * The strings the last frame drew: kit and direct `BT.systemPrint` text in draw order, then the overlay's demo
 * rows. Each has the text and the display position of its top-left corner (the position the demo passed minus the
 * camera offset in effect for that draw); `kit` and `system` entries also carry
 * the palette slot, and `overlay` entries a `side` (`'left'` or `'right'`).
 *
 * Overlay rows exist only while the engine overlay body is visible, and only in a dev build (the engine sets
 * `window.__btOverlayRows` under the same rule as `window.BT`). A frame that drew no `BT.systemPrint` text at all
 * leaves the previous frame's list in place (see the known gaps at the top of this file).
 *
 * @returns {Array<{ source: string, text: string, x: number, y: number, color?: number, side?: string }>}
 */
function readDrawnText() {
    const overlayRows = globalThis.__btOverlayRows?.read() ?? [];

    return [
        ...frame.map((entry) => ({ ...entry })),
        ...overlayRows.map((row) => ({ source: TEXT_SOURCE_OVERLAY, ...row })),
    ];
}

export { installTextTap, readDrawnText, setTextSource, TEXT_SOURCE_KIT, TEXT_SOURCE_OVERLAY, TEXT_SOURCE_SYSTEM };
