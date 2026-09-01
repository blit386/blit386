/**
 * Exposes `BT` on `window` for browser-console debugging (`window.BT.captureFrame()`).
 *
 * Dev-only by default, per BT-415's resolution: an explicit `BootstrapOptions.exposeGlobal`
 * override always wins, otherwise the assignment follows `BT.isDevMode` so a consumer's
 * production page never gets a global it did not ask for.
 *
 * The assignment itself is guarded with the `typeof globalThis.window === 'undefined'` idiom
 * already established by `BTAPI.ts`, `Orientation.ts`, and `WakeLock.ts` (BT-416), so importing
 * this module never throws under the default Node vitest environment or any other non-browser
 * context.
 */

import { isDevMode } from './devMode';

declare global {
    /** Ambient augmentation adding an optional `BT` property to `window`. */
    interface Window {
        /** The `BT` namespace, assigned by {@link exposeGlobal} for console debugging. */
        BT?: unknown;
    }
}

/** Inputs to {@link resolveExposeGlobal}, gathered by {@link exposeGlobal}. */
export interface ExposeGlobalSignals {
    /** Explicit `BootstrapOptions.exposeGlobal` override. Always wins when defined. */
    override?: boolean | undefined;

    /** Whether this is a development build, per `BT.isDevMode`. */
    devMode: boolean;
}

/**
 * Resolves whether `BT` should be assigned to `window`, from already-gathered signals.
 *
 * @param signals – See {@link ExposeGlobalSignals}.
 * @returns `true` when the assignment should happen.
 */
export function resolveExposeGlobal(signals: ExposeGlobalSignals): boolean {
    if (signals.override !== undefined) {
        return signals.override;
    }

    return signals.devMode;
}

/**
 * Assigns `value` to `window.BT` when gating allows it and a `window` is actually present.
 *
 * @param value – The `BT` namespace to expose.
 * @param override – Explicit `BootstrapOptions.exposeGlobal`, if the caller set one.
 */
export function exposeGlobal(value: unknown, override?: boolean): void {
    if (!resolveExposeGlobal({ override, devMode: isDevMode() })) {
        return;
    }

    if (typeof globalThis.window === 'undefined') {
        return;
    }

    globalThis.window.BT = value;
}
