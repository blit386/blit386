/**
 * Shared HMR event name for the live source panel: `plugins/virtual-demos.js` (Node, sends it after
 * re-highlighting a changed demo entry) and `_partials/source-panel.js` (browser, listens for it and
 * patches the on-page source block) both import this rather than duplicating the string literal.
 */

/** Vite custom HMR event name broadcast after a demo entry's source is re-highlighted. */
export const SOURCE_UPDATED_EVENT = 'blit386:source-updated';
