/**
 * Post-process effects: add, remove, clear, and the preset stacks.
 *
 * Part of the `BT` namespace; `BLIT386.ts` merges every part into `BT`.
 */

import { BTAPI } from '../core/BTAPI';
import type { Effect } from '../render/effects/Effect';
import { amber, crtPipBoy, green } from '../render/effects/presets';
import { drawReady, reportDrawError } from './internal';

/** Post-process effect members of `BT`. */
export const effects = {
    /**
     * Appends a fullscreen post-processing effect to whichever chain matches
     * its declared {@link Effect.tier}.
     *
     * - `tier='pixel'` -> pixel chain (logical resolution).
     * - `tier='display'` -> display chain (output resolution); requires
     *   `drawingBufferSize` in effective hardware settings (`configure()` or
     *   `defaultConfig()`).
     *
     * Effects run in registration order within each tier. The pixel chain runs
     * first, followed by the upscale pass, followed by the display chain. Each
     * {@link Effect} instance owns its own GPU resources and may be mutated
     * each frame from demo code.
     *
     * When the engine is not ready, or the effect call fails, reports the error once (a panel in dev builds, the
     * console in release) instead of throwing; the game keeps running.
     *
     * @since 1.0.3
     * @param effect - Effect instance to append.
     */
    effectAdd: (effect: Effect): void => {
        if (!drawReady('effectAdd')) {
            return;
        }

        try {
            BTAPI.instance.effectAdd(effect);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Removes a previously registered post-processing effect.
     *
     * Searches both tiers and disposes the effect from whichever chain holds
     * it. Removing an effect that was never added is a no-op.
     *
     * When the engine is not ready, or the effect call fails, reports the error once (a panel in dev builds, the
     * console in release) instead of throwing; the game keeps running.
     *
     * @since 1.0.3
     * @param effect - Effect instance to remove.
     */
    effectRemove: (effect: Effect): void => {
        if (!drawReady('effectRemove')) {
            return;
        }

        try {
            BTAPI.instance.effectRemove(effect);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Removes every registered post-processing effect across both tiers.
     *
     * When the engine is not ready, or the effect call fails, reports the error once (a panel in dev builds, the
     * console in release) instead of throwing; the game keeps running.
     *
     * @since 1.0.3
     */
    effectClear: (): void => {
        if (!drawReady('effectClear')) {
            return;
        }

        try {
            BTAPI.instance.effectClear();
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Pre-configured display-tier effect stacks ("looks").
     *
     * Each function returns a fresh array of effects. Add them to the engine
     * via {@link BT.effectAdd}.
     *
     * @since 1.0.3
     * @example
     * for (const fx of BT.preset.crtPipBoy()) {
     *     BT.effectAdd(fx);
     * }
     */
    preset: { crtPipBoy, amber, green },
};
