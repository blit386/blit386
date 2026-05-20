/**
 * Helpers for demos that optionally use fullscreen post-process effects.
 *
 * The engine picks WebGPU by default and falls back to Canvas 2D software mode
 * when WebGPU is missing. Software mode does not support BT.effectAdd and related
 * APIs. Demos call isPostProcessAvailable() after init starts to decide whether
 * to register CRT stacks.
 */

import { BT } from 'blit-tech';

// Short on-screen note shown when effects are skipped (fits one or two systemPrint lines).
export const SOFTWARE_FALLBACK_NOTE = 'Post-process needs WebGPU. Running without CRT effects.';

/**
 * @returns {boolean} True when fullscreen post-process effects can be registered.
 */
export function isPostProcessAvailable() {
    return BT.activeBackend === 'webgpu';
}
