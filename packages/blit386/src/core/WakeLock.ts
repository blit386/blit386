/**
 * Screen Wake Lock subsystem.
 *
 * Requests a `navigator.wakeLock` screen lock after {@link WakeLock.attach} and keeps
 * it alive across page visibility changes – the platform releases the sentinel
 * automatically while the page is hidden, so a `visibilitychange` listener
 * re-requests it once the page is visible again. Silently no-ops on browsers that
 * do not expose the Wake Lock API.
 */
export class WakeLock {
    /** Held sentinel, or null when not currently holding a lock. */
    private sentinel: WakeLockSentinel | null = null;

    /** True while a {@link request} call is in flight, to avoid overlapping requests. */
    private isRequesting = false;

    /** True between {@link attach} and {@link detach}; guards a request that resolves after detach. */
    private attached = false;

    /** Bound `visibilitychange` handler so it can be removed in {@link detach}. */
    private readonly onVisibilityChange: () => void;

    /** Bound sentinel `release` handler so it can be removed from the held sentinel. */
    private readonly onSentinelRelease: () => void;

    /**
     * Creates a wake lock subsystem. Call {@link attach} to start requesting the lock.
     */
    constructor() {
        this.onVisibilityChange = () => this.handleVisibilityChange();
        this.onSentinelRelease = () => {
            this.sentinel = null;
        };
    }

    /**
     * Whether the current browser exposes the Wake Lock API.
     *
     * @returns `true` when `navigator.wakeLock` is available.
     */
    private static isSupported(): boolean {
        return typeof globalThis.navigator !== 'undefined' && 'wakeLock' in globalThis.navigator;
    }

    /**
     * Installs the `visibilitychange` listener and requests the initial lock.
     *
     * No-ops when the Wake Lock API is unavailable. The request itself is
     * fire-and-forget – a failed acquire logs a warning but never throws, so
     * callers never need to await or catch this.
     */
    public attach(): void {
        if (!WakeLock.isSupported()) {
            return;
        }

        if (typeof globalThis.document !== 'undefined') {
            globalThis.document.addEventListener('visibilitychange', this.onVisibilityChange);
        }

        this.attached = true;

        void this.request();
    }

    /**
     * Removes the `visibilitychange` listener and releases the held lock, if any.
     *
     * Safe to call repeatedly or when {@link attach} was never called (for example
     * because the browser does not support the Wake Lock API).
     */
    public detach(): void {
        this.attached = false;

        if (typeof globalThis.document !== 'undefined') {
            globalThis.document.removeEventListener('visibilitychange', this.onVisibilityChange);
        }

        if (this.sentinel) {
            const sentinel = this.sentinel;

            sentinel.removeEventListener('release', this.onSentinelRelease);

            sentinel.release().catch(() => {
                // Already released or releasing; nothing to do.
            });

            this.sentinel = null;
        }
    }

    /**
     * Re-requests the lock once the page becomes visible again, if not already held.
     *
     * The platform releases the sentinel automatically while the page is hidden,
     * which {@link onSentinelRelease} reflects into `sentinel = null`, so this only
     * needs to check current state rather than track the hide/show transition itself.
     */
    private handleVisibilityChange(): void {
        if (globalThis.document.visibilityState === 'visible' && this.sentinel === null) {
            void this.request();
        }
    }

    /**
     * Requests a screen wake lock and stores the resulting sentinel.
     *
     * Guarded by {@link isRequesting} so overlapping calls (for example a rapid
     * hide/show toggle while a previous request is still pending) never race.
     * Logs a warning and leaves {@link sentinel} null on failure (for example a
     * low-battery OS override) – never throws, so a failed acquire never fails
     * `BTAPI.init()`. If {@link detach} runs before this request resolves, the
     * newly-acquired sentinel is released immediately instead of being stored,
     * so no lock is left orphaned with no owner able to release it.
     */
    private async request(): Promise<void> {
        if (this.isRequesting) {
            return;
        }

        this.isRequesting = true;

        try {
            const sentinel = await globalThis.navigator.wakeLock.request('screen');

            if (!this.attached) {
                void sentinel.release().catch(() => {
                    // Already released or releasing; nothing to do.
                });

                return;
            }

            this.sentinel = sentinel;
            this.sentinel.addEventListener('release', this.onSentinelRelease);
        } catch (error) {
            console.warn('[BT] Failed to acquire wake lock:', error);
        } finally {
            this.isRequesting = false;
        }
    }
}
