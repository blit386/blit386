import type { PreferredOrientation } from './IBTDemo';

/** Callback invoked when `screen.orientation` reports a type change. */
type ChangeHandler = (type: string) => void;

/**
 * Runtime shape of `screen.orientation` including optional `lock()`.
 *
 * TypeScript's DOM lib omits `lock` (not baseline across engines); feature-detect
 * before calling.
 */
type LockableOrientation = ScreenOrientation & {
    lock?: (orientation: Exclude<PreferredOrientation, 'any'>) => Promise<void>;
};

/**
 * Screen orientation detection and optional lock.
 *
 * Watches `screen.orientation` for `change` events and optionally requests
 * `screen.orientation.lock()` after {@link attach}. Silently no-ops on browsers
 * that do not expose the Screen Orientation API, and treats a rejected lock
 * (for example iOS Safari) as a silent no-op rather than a failed init.
 *
 * Named `Orientation` rather than `ScreenOrientation` to avoid colliding with
 * the DOM `ScreenOrientation` interface/constructor.
 */
export class Orientation {
    /** True between {@link attach} and {@link detach}. */
    private attached = false;

    /**
     * True while this instance successfully holds an orientation lock it requested.
     * Guards {@link detach} so we never call `unlock()` for `'any'`, unsupported
     * lock APIs, failed requests, or a host page lock we did not acquire.
     */
    private held = false;

    /**
     * Monotonic attach/detach generation. Each {@link attach} / {@link detach}
     * bumps it so an in-flight {@link lock} can tell whether it still belongs to
     * the current attachment (avoids a detach→reattach race claiming `held`).
     */
    private generation = 0;

    /** Demo callback for orientation changes, or null when the demo omitted the hook. */
    private onChange: ChangeHandler | null = null;

    /** Bound `change` handler so it can be removed in {@link detach}. */
    private readonly handleChange: () => void;

    /**
     * Creates an orientation subsystem. Call {@link attach} after a successful init.
     */
    constructor() {
        this.handleChange = () => {
            if (!this.attached || this.onChange === null) {
                return;
            }

            const type = Orientation.readType();

            if (type !== null) {
                this.onChange(type);
            }
        };
    }

    /**
     * Current `screen.orientation.type`, or `null` when the API is unavailable.
     *
     * Safe to call before {@link attach}; does not require a live listener.
     *
     * @returns Orientation type string, or `null`.
     */
    public static get type(): string | null {
        return Orientation.readType();
    }

    /**
     * Whether the current browser exposes `screen.orientation`.
     *
     * @returns `true` when the Screen Orientation API is available.
     */
    private static isSupported(): boolean {
        return typeof globalThis.screen !== 'undefined' && globalThis.screen.orientation != null;
    }

    /**
     * Reads `screen.orientation.type` when present.
     *
     * @returns Orientation type string, or `null` when unavailable.
     */
    private static readType(): string | null {
        if (!Orientation.isSupported()) {
            return null;
        }

        try {
            const { type } = globalThis.screen.orientation;

            return typeof type === 'string' ? type : null;
        } catch {
            return null;
        }
    }

    /**
     * Calls `orientation.unlock()` and ignores failures.
     *
     * @param orientation – Platform orientation object to unlock.
     */
    private static unlockQuietly(orientation: ScreenOrientation): void {
        try {
            orientation.unlock();
        } catch {
            // Already unlocked or unlock unsupported; nothing to do.
        }
    }

    /**
     * Installs the orientation `change` listener and optionally requests a lock.
     *
     * No-ops when the Screen Orientation API is unavailable. The lock request is
     * fire-and-forget – a rejection is swallowed and never throws, so callers
     * never need to await or catch this.
     *
     * @param preferred – Preferred lock target; `'any'` skips the lock attempt.
     * @param onChange – Optional demo callback for subsequent orientation changes.
     */
    public attach(preferred: PreferredOrientation, onChange: ChangeHandler | null): void {
        if (!Orientation.isSupported()) {
            return;
        }

        this.generation += 1;
        const generation = this.generation;

        this.onChange = onChange;
        this.attached = true;
        this.held = false;

        globalThis.screen.orientation.addEventListener('change', this.handleChange);

        if (preferred !== 'any') {
            void this.lock(preferred, generation);
        }
    }

    /**
     * Rebinds the demo callback for subsequent orientation changes, without touching the
     * live listener, lock state, or attach/detach generation.
     *
     * Used when a hot reload swaps in a new demo instance ({@link BTAPI.hotReplaceDemo}):
     * the `change` listener installed by {@link attach} closes over `this.onChange`, so
     * without this, orientation events would keep reaching the *previous* demo's bound
     * handler after the swap.
     *
     * @param onChange – Replacement demo callback, or `null` to stop forwarding events.
     */
    public setOnChange(onChange: ChangeHandler | null): void {
        this.onChange = onChange;
    }

    /**
     * Removes the `change` listener and unlocks only when this instance holds a lock.
     *
     * Safe to call repeatedly or when {@link attach} was never called (for example
     * because the browser does not support the Screen Orientation API).
     */
    public detach(): void {
        this.generation += 1;
        this.attached = false;
        this.onChange = null;

        if (!Orientation.isSupported()) {
            this.held = false;

            return;
        }

        const orientation = globalThis.screen.orientation;

        orientation.removeEventListener('change', this.handleChange);

        if (this.held) {
            this.held = false;
            Orientation.unlockQuietly(orientation);
        }
    }

    /**
     * Requests an orientation lock. Never throws on failure.
     *
     * No-ops when `lock` is missing from the platform object (for example iOS Safari).
     * Captures the {@link attach} generation so a lock that resolves after
     * detach→reattach is treated as stale: released when nothing newer holds a
     * lock, and never recorded as {@link held} for the new attachment.
     *
     * @param preferred - `'landscape'` or `'portrait'` lock target.
     * @param generation – Attach generation captured when this request started.
     */
    private async lock(preferred: Exclude<PreferredOrientation, 'any'>, generation: number): Promise<void> {
        const orientation = globalThis.screen.orientation as LockableOrientation;
        const lock = orientation.lock;

        if (typeof lock !== 'function') {
            return;
        }

        try {
            await lock.call(orientation, preferred);

            if (generation !== this.generation || !this.attached) {
                // Stale relative to the current attach/detach cycle. Unlock only when
                // a newer attach has not already recorded a held lock – unlocking
                // while held would release that newer lock (unlock is process-wide).
                if (!this.held) {
                    Orientation.unlockQuietly(orientation);
                }

                return;
            }

            this.held = true;
        } catch {
            // Lock rejected or unsupported for this orientation; leave held false.
        }
    }
}
