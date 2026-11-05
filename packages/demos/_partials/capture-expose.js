/**
 * Puts the engine on `window.BT` for the /shots capture page and for agents driving a demo.
 *
 * The capture page drives a demo through a same-origin iframe: it calls BT.renderAt() to seek a
 * deterministic frame and BT.captureFrame() to read the pixels. Capture mode itself only runs on
 * the dev server; this partial exists so that dev page can drive the engine, and it is harmless
 * in production, where only a same-origin page can reach the iframe's window. Loaded under
 * `?capture` (see layout.html). Same module instance as the demo's own `import { BT } from 'blit386'`, so this is
 * the live engine, not a copy.
 *
 * It also turns on the engine's drawn-text recorder, so `BT.frameText` (and the `texts` field of
 * the kit's `snapshot()`) lists every string the last frame drew - kit text, `BT.systemPrint`, and
 * overlay rows - with display positions. That is what a check reads instead of a screenshot.
 */
import { BT } from 'blit386';

window.BT = BT;
BT.frameTextRecordSet(true);
