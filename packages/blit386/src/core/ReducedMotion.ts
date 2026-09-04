/**
 * Detects the `prefers-reduced-motion` media feature and forwards changes.
 */

/** Callback invoked when the reduced-motion preference changes. */
type ChangeHandler = (prefersReduced: boolean) => void;

/** Valueless URL flag that forces reduced motion on. */
const FLAG_ON = 'reducedmotion';

/** Valueless URL flag that forces reduced motion off. Beats {@link FLAG_ON}. */
const FLAG_OFF = 'noreducedmotion';

/** CSS media query used to detect the platform's own preference. */
const MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

/** Inputs to {@link resolveReducedMotionPreferred}, gathered by {@link ReducedMotion.isPreferred}. */
export interface ReducedMotionSignals {
    /** Whether `?reducedmotion` is present in the query string. */
    urlForceOn: boolean;

    /** Whether `?noreducedmotion` is present in the query string. Beats `urlForceOn`. */
    urlForceOff: boolean;

    /** The platform's own `prefers-reduced-motion: reduce` match, from `matchMedia`. */
    platformPrefersReduced: boolean;
}

/** Which valueless reduced-motion flags the current URL carries. */
export interface ReducedMotionUrlFlags {
    /** `?reducedmotion` is present. */
    forceOn: boolean;

    /** `?noreducedmotion` is present. */
    forceOff: boolean;
}

/**
 * Resolves whether reduced motion is preferred, from already-gathered signals.
 *
 * An off switch should be unambiguous, so `?noreducedmotion` beats `?reducedmotion` when both
 * are present – the same rule `resolveSplashEnabled` follows for `?nosplash` / `?splash`.
 *
 * @param signals – See {@link ReducedMotionSignals}.
 * @returns `true` when reduced motion should be preferred.
 */
export function resolveReducedMotionPreferred(signals: ReducedMotionSignals): boolean {
    if (signals.urlForceOff) {
        return false;
    }

    if (signals.urlForceOn) {
        return true;
    }

    return signals.platformPrefersReduced;
}

/**
 * Reads the valueless reduced-motion flags from the current URL.
 *
 * Uses the `globalThis.location` guard idiom established by `BTAPI.getBackendQueryOverride`
 * and splash's `gating.ts`, so this stays safe in Node and SSR.
 *
 * @returns Which flags are present; both `false` when there is no location.
 */
export function readReducedMotionUrlFlags(): ReducedMotionUrlFlags {
    const search = typeof globalThis.location?.search === 'string' ? globalThis.location.search : '';

    if (!search) {
        return { forceOn: false, forceOff: false };
    }

    try {
        const params = new URLSearchParams(search);

        return { forceOn: params.has(FLAG_ON), forceOff: params.has(FLAG_OFF) };
    } catch (error) {
        console.warn('[BT] Failed to parse reduced-motion URL flags:', error);

        return { forceOn: false, forceOff: false };
    }
}

/**
 * Reads the platform's `prefers-reduced-motion: reduce` match.
 *
 * @returns `true` when the platform prefers reduced motion; `false` when it does not or
 *   `matchMedia` is unavailable (Node, SSR, old browsers).
 */
function readPlatformPreference(): boolean {
    if (typeof globalThis.matchMedia !== 'function') {
        return false;
    }

    try {
        return globalThis.matchMedia(MEDIA_QUERY).matches;
    } catch {
        return false;
    }
}

/**
 * Detects `prefers-reduced-motion` and forwards subsequent changes.
 *
 * Watches the platform media query for `change` events after {@link attach}. Silently
 * no-ops on platforms that do not expose `matchMedia`.
 */
export class ReducedMotion {
    /** Demo callback for preference changes, or null when the demo omitted the hook. */
    private onChange: ChangeHandler | null = null;

    /** Bound `change` handler so it can be removed in {@link detach}. */
    private readonly handleChange: (event: MediaQueryListEvent) => void;

    /** Live media query list this instance is listening on, or null when not attached. */
    private mediaQueryList: MediaQueryList | null = null;

    /**
     * Resolved preference last reported to {@link onChange} (or read at {@link attach} time).
     * Guards against notifying with a value the demo has already observed – see {@link handleChange}.
     */
    private lastNotified = false;

    /**
     * Creates a reduced-motion subsystem. Call {@link attach} after a successful init.
     */
    constructor() {
        this.handleChange = (event: MediaQueryListEvent): void => {
            const flags = readReducedMotionUrlFlags();

            const prefersReduced = resolveReducedMotionPreferred({
                urlForceOn: flags.forceOn,
                urlForceOff: flags.forceOff,
                platformPrefersReduced: event.matches,
            });

            if (prefersReduced === this.lastNotified) {
                // The URL override already resolved to this value, or the resolved preference
                // otherwise didn't actually change – notifying would disagree with what
                // BT.isReducedMotionPreferred already reports, or repeat a stale event.
                return;
            }

            this.lastNotified = prefersReduced;
            this.onChange?.(prefersReduced);
        };
    }

    /**
     * Whether reduced motion is currently preferred.
     *
     * Resolves the `?reducedmotion` / `?noreducedmotion` URL flags over the platform's own
     * `prefers-reduced-motion: reduce` match. Safe to call before {@link attach}.
     *
     * @returns `true` when reduced motion should be preferred.
     */
    public static get isPreferred(): boolean {
        const flags = readReducedMotionUrlFlags();

        return resolveReducedMotionPreferred({
            urlForceOn: flags.forceOn,
            urlForceOff: flags.forceOff,
            platformPrefersReduced: readPlatformPreference(),
        });
    }

    /**
     * Installs the `change` listener on the platform media query.
     *
     * No-ops when `matchMedia` is unavailable.
     *
     * @param onChange – Optional demo callback for subsequent preference changes.
     */
    public attach(onChange: ChangeHandler | null): void {
        if (typeof globalThis.matchMedia !== 'function') {
            return;
        }

        this.onChange = onChange;
        this.lastNotified = ReducedMotion.isPreferred;
        this.mediaQueryList = globalThis.matchMedia(MEDIA_QUERY);
        this.mediaQueryList.addEventListener('change', this.handleChange);
    }

    /**
     * Rebinds the demo callback for subsequent changes, without touching the live listener.
     *
     * Used when a hot reload swaps in a new demo instance ({@link BTAPI.hotReplaceDemo}) – the
     * `change` listener installed by {@link attach} closes over `this.onChange`, so without
     * this, preference changes would keep reaching the *previous* demo's bound handler.
     *
     * @param onChange – Replacement demo callback, or `null` to stop forwarding events.
     */
    public setOnChange(onChange: ChangeHandler | null): void {
        this.onChange = onChange;
    }

    /**
     * Removes the `change` listener.
     *
     * Safe to call repeatedly or when {@link attach} was never called (for example because
     * `matchMedia` is unavailable).
     */
    public detach(): void {
        this.mediaQueryList?.removeEventListener('change', this.handleChange);
        this.mediaQueryList = null;
        this.onChange = null;
    }
}
