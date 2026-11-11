/**
 * Helpers for demos that optionally use fullscreen post-process effects.
 *
 * The engine picks WebGPU by default and falls back to Canvas 2D software mode
 * when WebGPU is missing. Software mode does not support BT.effectAdd and related
 * APIs. Demos call isAvailable() after init to check BT.activeBackend
 * (not BT.requestedBackend, which stays 'webgpu' when WebGPU fell back).
 */

import { BT } from 'blit386';

// On-screen note shown when effects are skipped, as two lines: the one-line form is 330
// pixels wide in the 6-pixel system font, wider than a 320-pixel screen. Kit labels do not
// wrap, so demos print one ui.label() per line.
const SOFTWARE_FALLBACK_LINES = Object.freeze(['Post-process needs WebGPU.', 'Running without CRT effects.']);

// The same note on one line. It is 330 pixels wide, so it only fits a screen wider than
// the 320-pixel one most demos use.
const SOFTWARE_FALLBACK_NOTE = SOFTWARE_FALLBACK_LINES.join(' ');

/**
 * @returns {boolean} True when fullscreen post-process effects can be registered.
 */
function isAvailable() {
    return BT.activeBackend === 'webgpu';
}

export { isAvailable, SOFTWARE_FALLBACK_LINES, SOFTWARE_FALLBACK_NOTE };
