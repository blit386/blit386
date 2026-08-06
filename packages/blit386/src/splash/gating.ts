/**
 * Splash gating: whether the BLIT386 splash plays on this page load.
 *
 * Three layers, resolved in order: an explicit `configure()` flag, then the
 * valueless `?splash` / `?nosplash` URL flags, then `BT.isDevMode`. The URL and
 * configure layers deliberately sit *above* `src/utils/devMode.ts` and are
 * resolved here, not inside it – `devMode.ts` answers exactly one question and
 * must not grow feature-specific overrides (BT-419's layering rule).
 *
 * Split into a pure resolver ({@link resolveSplashEnabled}) and thin readers so
 * the precedence logic is unit-testable in the default Node vitest environment,
 * with no `happy-dom` opt-in.
 */

import { isDevMode } from '../utils/devMode';

/** Valueless URL flag that forces the splash on, including in development builds. */
const FLAG_ON = 'splash';

/** Valueless URL flag that forces the splash off. Beats {@link FLAG_ON}. */
const FLAG_OFF = 'nosplash';

/** Inputs to {@link resolveSplashEnabled}, gathered by {@link isSplashEnabled}. */
export interface SplashGatingSignals {
    /** Explicit `HardwareSettings.isSplashEnabled`. Always wins when defined. */
    configureFlag?: boolean | undefined;

    /** Whether `?splash` is present in the query string. */
    urlForceOn: boolean;

    /** Whether `?nosplash` is present in the query string. Beats `urlForceOn`. */
    urlForceOff: boolean;

    /** Whether this is a development build, per `BT.isDevMode`. */
    devMode: boolean;
}

/** Which valueless splash flags the current URL carries. */
export interface SplashUrlFlags {
    /** `?splash` is present. */
    forceOn: boolean;

    /** `?nosplash` is present. */
    forceOff: boolean;
}

/**
 * Resolves whether the splash plays, from already-gathered signals.
 *
 * An off switch should be unambiguous, so `?nosplash` beats `?splash` when both
 * are present.
 *
 * @param signals - See {@link SplashGatingSignals}.
 * @returns `true` when the splash should play.
 */
export function resolveSplashEnabled(signals: SplashGatingSignals): boolean {
    if (signals.configureFlag !== undefined) {
        return signals.configureFlag;
    }

    if (signals.urlForceOff) {
        return false;
    }

    if (signals.urlForceOn) {
        return true;
    }

    return !signals.devMode;
}

/**
 * Reads the valueless splash flags from the current URL.
 *
 * Uses the `globalThis.location` guard idiom established by
 * `BTAPI.getBackendQueryOverride`, so this stays safe in Node and SSR.
 *
 * @returns Which flags are present; both `false` when there is no location.
 */
export function readUrlFlags(): SplashUrlFlags {
    const search = typeof globalThis.location?.search === 'string' ? globalThis.location.search : '';

    if (!search) {
        return { forceOn: false, forceOff: false };
    }

    try {
        const params = new URLSearchParams(search);

        return { forceOn: params.has(FLAG_ON), forceOff: params.has(FLAG_OFF) };
    } catch (error) {
        console.warn('[BT] Failed to parse splash URL flags:', error);

        return { forceOn: false, forceOff: false };
    }
}

/**
 * Gathers every gating signal and resolves them.
 *
 * @param configureFlag - Explicit `HardwareSettings.isSplashEnabled`, if the demo set one.
 * @returns `true` when the splash should play on this page load.
 */
export function isSplashEnabled(configureFlag?: boolean): boolean {
    const flags = readUrlFlags();

    return resolveSplashEnabled({
        configureFlag,
        urlForceOn: flags.forceOn,
        urlForceOff: flags.forceOff,
        devMode: isDevMode(),
    });
}
