/**
 * Dev-only client script for the live source panel: listens for the `blit386:source-updated` HMR
 * event (sent by `plugins/virtual-demos.js` after a demo entry edit is re-highlighted) and swaps the
 * highlighted code block in place, so the source panel stays fresh without a page reload.
 *
 * Injected into a demo page's HTML only in dev (see virtual-demos.js's isDevMode / renderHtml) – the
 * production build never references or ships this file.
 */

import { SOURCE_UPDATED_EVENT } from './source-panel-protocol.js';

if (import.meta.hot) {
    import.meta.hot.on(SOURCE_UPDATED_EVENT, ({ slug, sourceHtml }) => {
        if (document.body.dataset.slug !== slug) {
            return;
        }

        const sourceCode = document.querySelector('.demo-source-code');

        if (sourceCode) {
            sourceCode.innerHTML = sourceHtml;
        }
    });
}
