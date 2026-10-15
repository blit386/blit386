/**
 * Puts the engine on `window.BT` for the /shots capture page.
 *
 * The capture page drives a demo through a same-origin iframe: it calls BT.renderAt() to seek a
 * deterministic frame and BT.captureFrame() to read the pixels. Capture mode itself only runs on
 * the dev server; this partial exists so that dev page can drive the engine, and it is harmless
 * in production, where only a same-origin page can reach the iframe's window. Loaded under
 * `?capture` (see layout.html). Same module instance as the demo's own `import { BT } from 'blit386'`, so this is
 * the live engine, not a copy.
 */
import { BT } from 'blit386';

window.BT = BT;
