/**
 * Engine-level dev vs. release mode detection.
 *
 * `import.meta.env.DEV` cannot be used – the engine ships both ESM and CJS, and
 * the engine is pre-built into `dist` before a consumer's bundler ever sees it,
 * so a bundler `define` cannot reach this module either. The only signal that
 * survives being pre-built is a runtime global, assigned by the `blit386/vite`
 * plugin's injected snippet (see `src/vite/transform.ts`).
 *
 * Split into a pure resolver ({@link resolveDevMode}) and a thin reader
 * ({@link isDevMode}) so the precedence logic is unit-testable in the default
 * Node vitest environment, with no `happy-dom` opt-in – BT-416 depends on that
 * property holding.
 *
 * This is UX/DX gating, not DRM: any consumer can flip `globalThis.__BLIT386_DEV__`
 * by hand, and that is fine.
 */

import { isHotActive } from '../hot/HotRuntime';

declare global {
    // `var` is required here – `let`/`const` cannot ambient-declare a globalThis property.
    var __BLIT386_DEV__: boolean | undefined;
}

/** Inputs to {@link resolveDevMode}, gathered by {@link isDevMode}. */
export interface DevModeSignals {
    /** Explicit override from config, if one is offered. Always wins when defined. */
    override?: boolean | undefined;

    /** Whether the `blit386/vite` plugin's injected snippet marked this build as dev. */
    globalDevFlag: boolean;

    /** Whether a Vite HMR context is registered ({@link isHotActive}); a late fallback signal. */
    hotActive: boolean;
}

/**
 * Resolves dev vs. release from already-gathered signals, in priority order: explicit
 * override, then the runtime dev global, then hot-reload activity, otherwise release.
 *
 * @param signals - See {@link DevModeSignals}.
 * @returns `true` for a dev build, `false` for release.
 */
export function resolveDevMode(signals: DevModeSignals): boolean {
    if (signals.override !== undefined) {
        return signals.override;
    }

    if (signals.globalDevFlag) {
        return true;
    }

    return signals.hotActive;
}

/**
 * Reports whether this is a development build, gathering signals from `globalThis` (never a
 * bare `window` reference).
 *
 * @param override - Explicit override, if a caller offers one; always wins when defined.
 * @returns `true` for a dev build, `false` for release.
 */
export function isDevMode(override?: boolean): boolean {
    return resolveDevMode({
        override,

        // No `typeof ... !== 'undefined'` guard needed here: unlike `screen.orientation` or
        // `navigator.wakeLock`, nothing drills into a second property, so a missing global just
        // reads as `undefined` and `=== true` already treats that as release.
        globalDevFlag: globalThis.__BLIT386_DEV__ === true,

        hotActive: isHotActive(),
    });
}
