/**
 * F9 dev-mode frame-capture shortcut: gating and the default timestamped filename.
 *
 * Split into a pure resolver ({@link resolveFrameCaptureShortcutEnabled}) and a thin
 * reader ({@link isFrameCaptureShortcutEnabled}), mirroring `globalExpose.ts`'s
 * `resolveExposeGlobal` / `exposeGlobal` split, so the precedence logic is
 * unit-testable in the default Node vitest environment with no `happy-dom` opt-in.
 */

import { isDevMode } from './devMode';

/** Inputs to {@link resolveFrameCaptureShortcutEnabled}, gathered by {@link isFrameCaptureShortcutEnabled}. */
export interface FrameCaptureShortcutSignals {
    /** Explicit `HardwareSettings.isFrameCaptureShortcutEnabled`. Always wins when defined. */
    configureFlag?: boolean | undefined;

    /** Whether this is a development build, per `BT.isDevMode`. */
    devMode: boolean;
}

/**
 * Resolves whether the F9 frame-capture shortcut is active, from already-gathered signals.
 *
 * @param signals – See {@link FrameCaptureShortcutSignals}.
 * @returns `true` when F9 should capture and download the current frame.
 */
export function resolveFrameCaptureShortcutEnabled(signals: FrameCaptureShortcutSignals): boolean {
    if (signals.configureFlag !== undefined) {
        return signals.configureFlag;
    }

    return signals.devMode;
}

/**
 * Gathers the frame-capture shortcut's gating signal and resolves it.
 *
 * @param configureFlag – Explicit `HardwareSettings.isFrameCaptureShortcutEnabled`, if the demo set one.
 * @returns `true` when F9 should capture and download the current frame.
 */
export function isFrameCaptureShortcutEnabled(configureFlag?: boolean): boolean {
    return resolveFrameCaptureShortcutEnabled({ configureFlag, devMode: isDevMode() });
}

/**
 * Zero-pads a number to two digits.
 *
 * @param value – Number to pad (0-59 in practice: month, day, hour, minute, or second).
 * @returns A two-character string.
 */
function pad2(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
}

/**
 * Builds the default filename for an F9 frame capture: the local date and time it was
 * taken, so repeated presses never overwrite each other and sort chronologically.
 *
 * @param date – Capture moment. Defaults to now.
 * @returns A `blit386-capture-YYYY-MM-DD-HH-MM-SS.png` filename.
 */
export function defaultFrameCaptureFilename(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = pad2(date.getMonth() + 1);
    const day = pad2(date.getDate());
    const hours = pad2(date.getHours());
    const minutes = pad2(date.getMinutes());
    const seconds = pad2(date.getSeconds());

    return `blit386-capture-${year}-${month}-${day}-${hours}-${minutes}-${seconds}.png`;
}
