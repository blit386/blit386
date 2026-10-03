/**
 * Demo page dual-mode bootstrap and shell navigation.
 *
 * Loaded by `_partials/layout.html` as a module on every demo page:
 * - Embed (`?embed` / `?embed&source`): strip shell chrome; canvas (+ optional source) remain.
 * - Shell (default): strip in-page canvas/source, build the persistent banner, and drive the
 *   content iframe (`?embed&source`) so demo swaps discard the engine with the frame.
 *
 * Depends on `window.__blit386IsEmbedded` from the tiny first-paint stamp in layout.html.
 *
 * The banner (logo, arrows, combobox, shell/embed switch), the nav/URL/iframe model, the
 * fuzzy combobox, and Plausible analytics (shell and standalone embeds) each live in their own sibling module; this file
 * only wires them together.
 */

import { initAnalytics } from './demo-shell-analytics.js';
import { prepareEmbed, prepareShell, renderShell } from './demo-shell-banner.js';

if (window.__blit386IsEmbedded) {
    prepareEmbed();
} else {
    prepareShell();
    renderShell();
}

initAnalytics();
