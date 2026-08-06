/**
 * Splash subsystem types.
 */

import type { Color32 } from '../utils/Color32';

/**
 * Lifecycle state of the BLIT386 splash.
 *
 * `disabled` and `done` are indistinguishable to every consumer outside the
 * engine – both mean "not on screen, never will be again" – which is why
 * {@link BT.isSplashVisible} exists as the derived one-term query.
 *
 * With the splash disabled, `disabled` is the only value game code ever reads.
 * With it enabled, an `init()` observes `fadingIn` and, if it lives long enough,
 * `shown`; its first `update()` after handoff reads `done`. `fadingOut` is
 * engine-internal - `update()` and `render()` are suspended for the splash's
 * whole duration, so nothing outside the engine runs while it is current.
 *
 * @since 1.5.0
 */
export type SplashState = 'disabled' | 'fadingIn' | 'shown' | 'fadingOut' | 'done';

/** Construction options for {@link Splash}. */
export interface SplashOptions {
    /** Dark endpoint of the gray ramp. Defaults to black. */
    colorDark?: Color32 | undefined;

    /** Light endpoint of the gray ramp. Defaults to white. */
    colorLight?: Color32 | undefined;
}
