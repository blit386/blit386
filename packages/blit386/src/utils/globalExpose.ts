/**
 * Exposes `BT` on `window` for browser-console debugging (`window.BT.captureFrame()`).
 *
 * Dev-only by default, per BT-415's resolution: an explicit `BootstrapOptions.exposeGlobal`
 * override always wins, otherwise the assignment follows `BT.isDevMode` so a consumer's
 * production page never gets a global it did not ask for.
 *
 * The assignment itself is guarded with the same `typeof globalThis.<name>` idiom that
 * `Orientation.ts` and `WakeLock.ts` use (BT-416), so importing
 * this module never throws under the default Node vitest environment or any other non-browser
 * context.
 */

import type { InputTrace, InputTraceOptions, InputTraceResult } from '../input/InputTrace';
import type { OverlayRowText } from '../overlay';
import { isDevMode } from './devMode';

declare global {
    /** Ambient augmentation adding an optional `BT` property to `window`. */
    interface Window {
        /** The `BT` namespace, assigned by {@link exposeGlobal} for console debugging. */
        BT?: unknown;

        /** The dev-only input-edge trace, assigned by {@link exposeInputTrace} under the same gate as `BT`. */
        __btInputTrace?: InputTraceGlobal;

        /** The dev-only readout of the overlay rows the last frame drew, assigned by {@link exposeOverlayRows}. */
        __btOverlayRows?: OverlayRowsGlobal;
    }
}

/** What `window.__btInputTrace` offers: start, stop and a read-only recording flag, nothing else of the trace. */
export interface InputTraceGlobal {
    /** See {@link InputTrace#start}. */
    start: (options?: InputTraceOptions) => void;

    /** See {@link InputTrace#stop}. */
    stop: () => InputTraceResult;

    /** See {@link InputTrace#isRecording}. */
    readonly isRecording: boolean;
}

/** What `window.__btOverlayRows` offers: one read of the demo-row labels the last frame drew. */
export interface OverlayRowsGlobal {
    /**
     * The labels of the demo's `overlayRows()` as the last frame drew them, with display positions. Empty when the
     * overlay is off or hidden, or the demo supplies no rows.
     */
    read: () => OverlayRowText[];
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
 * @param signals - See {@link ExposeGlobalSignals}.
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
 * @param value - The `BT` namespace to expose.
 * @param override - Explicit `BootstrapOptions.exposeGlobal`, if the caller set one.
 */
export function exposeGlobal(value: unknown, override?: boolean): void {
    if (!canExpose(override)) {
        return;
    }

    globalThis.window.BT = value;
}

/**
 * Assigns a facade over `trace` to `window.__btInputTrace` when the `window.BT` gate allows it.
 *
 * @param trace - The engine's input trace.
 * @param override - Explicit `BootstrapOptions.exposeGlobal`, if the caller set one.
 */
export function exposeInputTrace(trace: InputTrace, override?: boolean): void {
    if (!canExpose(override)) {
        return;
    }

    globalThis.window.__btInputTrace = {
        start: (options?: InputTraceOptions): void => {
            trace.start(options);
        },

        stop: (): InputTraceResult => trace.stop(),

        get isRecording(): boolean {
            return trace.isRecording;
        },
    };
}

/**
 * Assigns a readout of the last frame's demo overlay rows to `window.__btOverlayRows` when the `window.BT` gate allows
 * it.
 *
 * @param read - Reads the rows the overlay drew on its last frame; `[]` when there is no overlay.
 * @param override - Explicit `BootstrapOptions.exposeGlobal`, if the caller set one.
 */
export function exposeOverlayRows(read: () => OverlayRowText[], override?: boolean): void {
    if (!canExpose(override)) {
        return;
    }

    globalThis.window.__btOverlayRows = { read };
}

/**
 * Returns whether gating allows a `window` assignment and a `window` is actually present.
 *
 * @param override - Explicit `BootstrapOptions.exposeGlobal`, if the caller set one.
 * @returns `true` when `exposeGlobal` / `exposeInputTrace` / `exposeOverlayRows` should assign.
 */
function canExpose(override?: boolean): boolean {
    return resolveExposeGlobal({ override, devMode: isDevMode() }) && typeof globalThis.window !== 'undefined';
}
