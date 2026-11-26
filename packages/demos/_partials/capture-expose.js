/**
 * Puts the engine on `window.BT` for the /shots capture page and `scripts/capture-og-image.mjs`.
 *
 * The capture page drives a demo through a same-origin iframe: it calls BT.renderAt() to seek a
 * deterministic frame and BT.captureFrame() to read the pixels. The OG card script loads the same
 * `?embed&capture` URL from a preview build. The partial is harmless in production, where only a
 * same-origin page can reach the iframe's window. Loaded under
 * `?capture` (see layout.html). Same module instance as the demo's own `import { BT } from 'blit386'`, so this is
 * the live engine, not a copy.
 *
 * It also taps `BT.systemPrint` and publishes `window.__blitDrawnText.read()`, the last-frame text readout.
 */
import { BT } from 'blit386';

import { installTextTap, readDrawnText } from '../src/shared/drawn-text.js';

window.BT = BT;

// The strings the last frame drew (kit, BT.systemPrint, overlay rows), each with its display position. See
// src/shared/drawn-text.js. Read it with `window.__blitDrawnText.read()`.
installTextTap(BT);
window.__blitDrawnText = { read: readDrawnText };
