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
 * (for example iOS Safari) as a console warning rather than a failed init.
 *
 * Named `Orientation` rather than `ScreenOrientation` to avoid colliding with
 * the DOM `ScreenOrientation` interface/constructor.
 */
export class Orientation {
    /** True between {@link attach} and {@link detach}. */
    private attached = false;

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
     * Installs the orientation `change` listener and optionally requests a lock.
     *
     * No-ops when the Screen Orientation API is unavailable. The lock request is
     * fire-and-forget - a rejection logs a warning but never throws, so callers
     * never need to await or catch this.
     *
     * @param preferred - Preferred lock target; `'any'` skips the lock attempt.
     * @param onChange - Optional demo callback for subsequent orientation changes.
     */
    public attach(preferred: PreferredOrientation, onChange: ChangeHandler | null): void {
        if (!Orientation.isSupported()) {
            return;
        }

        this.onChange = onChange;
        this.attached = true;

        globalThis.screen.orientation.addEventListener('change', this.handleChange);

        if (preferred !== 'any') {
            void this.lock(preferred);
        }
    }

    /**
     * Removes the `change` listener and unlocks the orientation when possible.
     *
     * Safe to call repeatedly or when {@link attach} was never called (for example
     * because the browser does not support the Screen Orientation API).
     */
    public detach(): void {
        this.attached = false;
        this.onChange = null;

        if (!Orientation.isSupported()) {
            return;
        }

        const orientation = globalThis.screen.orientation;

        orientation.removeEventListener('change', this.handleChange);

        try {
            orientation.unlock();
        } catch {
            // Not locked, or unlock unsupported; nothing to do.
        }
    }

    /**
     * Requests an orientation lock. Logs a warning and never throws on failure.
     *
     * No-ops when `lock` is missing from the platform object (for example iOS Safari).
     *
     * @param preferred - `'landscape'` or `'portrait'` lock target.
     */
    private async lock(preferred: Exclude<PreferredOrientation, 'any'>): Promise<void> {
        const orientation = globalThis.screen.orientation as LockableOrientation;
        const lock = orientation.lock;

        if (typeof lock !== 'function') {
            return;
        }

        try {
            await lock.call(orientation, preferred);
        } catch (error) {
            console.warn('[BT] Failed to lock screen orientation:', error);
        }
    }
}
