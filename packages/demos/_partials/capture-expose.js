/**
 * Puts the engine on `window.BT` for the /shots capture page.
 *
 * The capture page drives a demo through a same-origin iframe: it calls BT.renderAt() to seek a
 * deterministic frame and BT.captureFrame() to read the pixels. bootstrap() only exposes BT in
 * dev builds, and the release build of this site is where committed captures are viewed, not
 * made - but a maintainer may still want to capture against a production-style `vite preview`.
 * Loading this partial under `?capture` (see layout.html) makes that work the same way
 * everywhere. Same module instance as the demo's own `import { BT } from 'blit386'`, so this is
 * the live engine, not a copy.
 */
import { BT } from 'blit386';

window.BT = BT;
