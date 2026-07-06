/**
 * Easing functions for palette effects and animations.
 *
 * Each function maps a normalized time `t` in [0, 1] to an eased output value.
 * Used by palette fade effects to control interpolation curves.
 */

/**
 * Supported easing function identifiers.
 *
 * @since 1.0.3
 */
export type EasingFunction = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

/**
 * Applies an easing curve to a normalized time value.
 *
 * @since 1.0.3
 * @param t - Normalized time in [0, 1]. Values outside this range are not clamped.
 * @param easing - Easing curve to apply.
 * @returns Eased value. Guaranteed to return 0 for `t = 0` and 1 for `t = 1`.
 */
export function applyEasing(t: number, easing: EasingFunction): number {
    switch (easing) {
        case 'linear':
            return t;
        case 'ease-in':
            return t * t;
        case 'ease-out':
            return t * (2 - t);
        case 'ease-in-out':
            return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        default:
            throw new Error(`Unsupported easing: ${easing}`);
    }
}
