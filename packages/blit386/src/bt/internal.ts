/**
 * Helpers shared by the `BT` parts in this folder: error reporting, readiness, argument description, and the
 * input clocks. Not public API.
 */

import { BTAPI } from '../core/BTAPI';
import { defaultConfig, type HardwareSettings } from '../core/IBTDemo';
import * as flags from '../input/buttonFlags';
import { getKeyboardFaceButtonKeys } from '../input/keyboardRuntimeMaps';
import type { PointerClock } from '../input/PointerInput';
import { displayError, getErrorContainerID, logErrorOnce } from '../utils/BootstrapHelpers';
import { Color32 } from '../utils/Color32';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';

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
 * Checks that the renderer exists and, when it does not, reports a draw call made before bootstrap finished.
 *
 * @param methodName - BT method name being called.
 * @returns `true` when the call can go ahead.
 */
export function drawReady(methodName: string): boolean {
    if (BTAPI.instance.getRenderer() !== null) {
        return true;
    }

    showBeginnerRuntimeError(
        `Can't use BT.${methodName}() yet because the engine is still starting.\n` +
            "The engine isn't ready yet. Make sure all drawing happens inside update() or render().",
        'Engine Not Ready',
    );

    return false;
}

/**
 * Treats any non-null object argument as a `Vector2i` for `BT.drawTile` dispatch.
 *
 * A bare `typeof value === 'object'` also matches `null`, which would let an untyped
 * `null` argument reach `.x` / `.y` and surface a raw TypeError instead of the
 * wrong-arguments error. Still `typeof`-based, so the dispatch stays `instanceof`-free.
 *
 * @param value - Argument to classify.
 * @returns `true` for a non-null object.
 */
export function isVectorArg(value: unknown): value is Vector2i {
    return typeof value === 'object' && value !== null;
}

/**
 * Converts an unknown runtime value into a concise display type label.
 *
 * @param value - Runtime value to inspect.
 * @returns A short readable type description.
 */
export function describeRuntimeType(value: unknown): string {
    if (value === null) {
        return 'null';
    }

    if (value === undefined) {
        return 'undefined';
    }

    if (value instanceof Vector2i) {
        return 'Vector2i';
    }

    if (value instanceof Rect2i) {
        return 'Rect2i';
    }

    if (value instanceof Color32) {
        return 'Color32';
    }

    if (value instanceof Promise) {
        return 'Promise (missing await?)';
    }

    if (typeof value === 'object') {
        const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
        return ctor && ctor.length > 0 ? ctor : 'object';
    }

    return typeof value;
}

/**
 * Shows a friendly hint when a Promise was passed instead of an awaited asset.
 *
 * @param loadCall - Asset loader call name to reference in the message.
 */
export function reportMissingAwait(loadCall: string): void {
    showBeginnerRuntimeError(`Did you forget to use 'await' before ${loadCall}?`, 'Missing await');
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

/** `BT.testState()`'s `error` when the thrown value yields no readable message. */
const TEST_STATE_UNREADABLE_ERROR = 'testState() threw a value with no readable message';

/**
 * Turns whatever a `testState()` hook (or its serialization) threw into an error message,
 * without ever throwing itself: no `String(err)` (a null-prototype object has no primitive
 * conversion), and the `message` read is guarded (a getter can throw).
 *
 * @param err - Value caught from the hook call or the JSON round-trip.
 * @returns The `Error` message or thrown string, else {@link TEST_STATE_UNREADABLE_ERROR}.
 */
export function describeTestStateError(err: unknown): string {
    if (typeof err === 'string') {
        return err;
    }

    try {
        if (err instanceof Error) {
            // Read once: a `message` getter could return a string on one read and not the next.
            const message: unknown = err.message;

            if (typeof message === 'string') {
                return message;
            }
        }
    } catch {
        // Fall through: a throwing `message` getter or `instanceof` check.
    }

    return TEST_STATE_UNREADABLE_ERROR;
}

/**
 * Returns runtime keyboard `KeyboardEvent.code` list for a face button and player,
 * or `null` when there is no keyboard fallback (e.g. players 2-3 for face buttons).
 *
 * @param button - Face button constant (`BT.BTN_UP` … `BT.BTN_SELECT`).
 * @param player - Zero-based player index.
 * @returns Key codes for that mapping, or `null` if unsupported.
 */
export function faceButtonKeys(button: number, player: number): readonly string[] | null {
    if (!flags.FACE_BUTTON_FLAGS.includes(button as flags.FaceButtonCode)) {
        return null;
    }

    return getKeyboardFaceButtonKeys(player, button);
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
