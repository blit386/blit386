/**
 * Splash subsystem types.
 */

import type { Color32 } from '../utils/Color32';

/**
 * Lifecycle state of the BLIT386 splash.
 *
 * `disabled` and `done` are indistinguishable to every consumer outside the
 * engine – both mean "not on screen, never will be again" – which is why
 * {@link BT.isSplashVisible} exists as the derived one-term query. Because the
 * game's `update()` and `render()` are suspended for the splash's whole
 * duration, game code can only ever observe `fadingIn` (from `init()`) and
 * `done` (from its first `update()` after handoff).
 *
 * @since 1.5.0
 */
export type SplashState = 'disabled' | 'fadingIn' | 'shown' | 'fadingOut' | 'done';

/** Construction options for {@link Splash}. */
export interface SplashOptions {
    /** Dark endpoint of the grey ramp. Defaults to black. */
    colorDark?: Color32 | undefined;

    /** Light endpoint of the grey ramp. Defaults to white. */
    colorLight?: Color32 | undefined;
}
