/**
 * Helpers for demos that optionally use fullscreen post-process effects.
 *
 * The engine picks WebGPU by default and falls back to Canvas 2D software mode
 * when WebGPU is missing. Software mode does not support BT.effectAdd and related
 * APIs. Demos call isPostProcessAvailable() after init to check BT.activeBackend
 * (not BT.requestedBackend, which stays 'webgpu' when WebGPU fell back).
 */

// #region Imports

import { BT } from 'blit-tech';

// #endregion

// #region Configuration

// Short on-screen note shown when effects are skipped (fits one or two systemPrint lines).
const SOFTWARE_FALLBACK_NOTE = 'Post-process needs WebGPU. Running without CRT effects.';

// #endregion

// #region Helper Functions

/**
 * @returns {boolean} True when fullscreen post-process effects can be registered.
 */
function isPostProcessAvailable() {
    return BT.activeBackend === 'webgpu';
}

// #endregion

// #region Exports

export { isPostProcessAvailable, SOFTWARE_FALLBACK_NOTE };

// #endregion
