/**
 * Helpers shared by several `BT` parts in this folder: beginner error reporting, the pointer clock, and the settings
 * fallback. A helper only one part uses lives in that part. Not public API.
 */

import { BTAPI } from '../core/BTAPI';
import { defaultConfig, type HardwareSettings } from '../core/IBTDemo';
import type { PointerClock } from '../input/PointerInput';
import { displayError, getErrorContainerID, logErrorOnce } from '../utils/BootstrapHelpers';

/**
 * Reports a beginner-friendly runtime error once per distinct message, without stopping the game.
 *
 * Dev builds show a panel in the bootstrap container (the canvas stays) and log it; release builds only log it, so
 * players never see engine wording. Repeats - a bad draw call runs every frame - do nothing.
 *
 * @param message - Human-readable guidance to display.
 * @param title - Short heading for the error panel.
 */
export function showBeginnerRuntimeError(message: string, title: string = 'Demo Error'): void {
    if (BTAPI.instance.isDevMode()) {
        displayError(title, message, getErrorContainerID());
    } else {
        logErrorOnce(title, message);
    }
}

/**
 * Shows a beginner-friendly error for a value thrown out of a draw call's body.
 *
 * Shared by every `BT` draw method's own `catch` block - kept as a plain function
 * taking the caught value (not a callback) so no per-call closure is needed on
 * the hot draw-call path.
 *
 * @param error - Value caught from a draw call's try block.
 */
export function reportDrawError(error: unknown): void {
    if (error instanceof Error) {
        showBeginnerRuntimeError(error.message);
    } else {
        showBeginnerRuntimeError(String(error));
    }
}

/**
 * Picks the pointer clock for a `BT.*` read: inside `update()` the update clock (state since the previous update),
 * anywhere else the frame clock (state since the previous rendered frame).
 *
 * @returns `'update'` while the demo's `update()` runs, otherwise `'frame'`.
 */
export function pointerClock(): PointerClock {
    return BTAPI.instance.isUpdating ? 'update' : 'frame';
}

/**
 * Returns the loaded hardware settings, or {@link defaultConfig} before `BT.init()` loads them, so a getter read
 * early reports the configure default.
 *
 * @returns Effective hardware settings.
 */
export function settingsOrDefault(): HardwareSettings {
    return BTAPI.instance.getHardwareSettings() ?? defaultConfig();
}
