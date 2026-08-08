/**
 * Easing curves and typed interpolation helpers.
 *
 * Each curve maps a normalized time `t` in [0, 1] to an eased output value.
 * Used by palette fade effects, audio fades, and demo animation code.
 * Curve math matches RetroBlit's `Ease` class (Robert Penner's easing equations).
 */

import { Color32 } from './Color32';
import { Rect2i } from './Rect2i';
import { Vector2i } from './Vector2i';

const PI = Math.PI;
const HALF_PI = PI / 2;

/**
 * Supported easing function identifiers.
 *
 * `'ease-in'`, `'ease-out'`, and `'ease-in-out'` are the quadratic family (kept for
 * compatibility with existing palette and audio call sites).
 *
 * @since 1.0.3
 * @changed 1.5.0 Added sine, cubic, quartic, quintic, expo, circ, back, elastic, and bounce families.
 */
export type EasingFunction =
    | 'linear'
    | 'ease-in'
    | 'ease-out'
    | 'ease-in-out'
    | 'sine-in'
    | 'sine-out'
    | 'sine-in-out'
    | 'cubic-in'
    | 'cubic-out'
    | 'cubic-in-out'
    | 'quartic-in'
    | 'quartic-out'
    | 'quartic-in-out'
    | 'quintic-in'
    | 'quintic-out'
    | 'quintic-in-out'
    | 'expo-in'
    | 'expo-out'
    | 'expo-in-out'
    | 'circ-in'
    | 'circ-out'
    | 'circ-in-out'
    | 'back-in'
    | 'back-out'
    | 'back-in-out'
    | 'elastic-in'
    | 'elastic-out'
    | 'elastic-in-out'
    | 'bounce-in'
    | 'bounce-out'
    | 'bounce-in-out';

/** Curve evaluator: maps normalized `t` to an eased value. */
type Curve = (t: number) => number;

/**
 * Bounce-out curve shared by bounce-in / bounce-out / bounce-in-out.
 *
 * @param t – Normalized time in [0, 1].
 * @returns Eased value.
 */
function bounceOut(t: number): number {
    if (t < 4 / 11) {
        return (121 * t * t) / 16;
    }

    if (t < 8 / 11) {
        return (363 / 40) * t * t - (99 / 10) * t + 17 / 5;
    }

    if (t < 9 / 10) {
        return (4356 / 361) * t * t - (35442 / 1805) * t + 16061 / 1805;
    }

    return (54 / 5) * t * t - (513 / 25) * t + 268 / 25;
}

const CURVES: Record<EasingFunction, Curve> = {
    linear: (t) => t,
    'ease-in': (t) => t * t,
    'ease-out': (t) => t * (2 - t),
    'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    'sine-in': (t) => Math.sin((t - 1) * HALF_PI) + 1,
    'sine-out': (t) => Math.sin(t * HALF_PI),
    'sine-in-out': (t) => 0.5 * (1 - Math.cos(t * PI)),
    'cubic-in': (t) => t * t * t,
    'cubic-out': (t) => {
        const f = t - 1;

        return f * f * f + 1;
    },
    'cubic-in-out': (t) => {
        if (t < 0.5) {
            return 4 * t * t * t;
        }

        const f = 2 * t - 2;

        return 0.5 * f * f * f + 1;
    },
    'quartic-in': (t) => t * t * t * t,
    'quartic-out': (t) => {
        const f = t - 1;

        return f * f * f * (1 - t) + 1;
    },
    'quartic-in-out': (t) => {
        if (t < 0.5) {
            return 8 * t * t * t * t;
        }

        const f = t - 1;

        return -8 * f * f * f * f + 1;
    },
    'quintic-in': (t) => t * t * t * t * t,
    'quintic-out': (t) => {
        const f = t - 1;

        return f * f * f * f * f + 1;
    },
    'quintic-in-out': (t) => {
        if (t < 0.5) {
            return 16 * t * t * t * t * t;
        }

        const f = 2 * t - 2;

        return 0.5 * f * f * f * f * f + 1;
    },
    'expo-in': (t) => (t === 0 ? t : 2 ** (10 * (t - 1))),
    'expo-out': (t) => (t === 1 ? t : 1 - 2 ** (-10 * t)),
    'expo-in-out': (t) => {
        if (t === 0 || t === 1) {
            return t;
        }

        if (t < 0.5) {
            return 0.5 * 2 ** (20 * t - 10);
        }

        return -0.5 * 2 ** (-20 * t + 10) + 1;
    },
    'circ-in': (t) => 1 - Math.sqrt(1 - t * t),
    'circ-out': (t) => Math.sqrt((2 - t) * t),
    'circ-in-out': (t) => {
        if (t < 0.5) {
            return 0.5 * (1 - Math.sqrt(1 - 4 * (t * t)));
        }

        return 0.5 * (Math.sqrt(-((2 * t - 3) * (2 * t - 1))) + 1);
    },
    'back-in': (t) => t * t * t - t * Math.sin(t * PI),
    'back-out': (t) => {
        const f = 1 - t;

        return 1 - (f * f * f - f * Math.sin(f * PI));
    },
    'back-in-out': (t) => {
        if (t < 0.5) {
            const f = 2 * t;

            return 0.5 * (f * f * f - f * Math.sin(f * PI));
        }

        const f = 1 - (2 * t - 1);

        return 0.5 * (1 - (f * f * f - f * Math.sin(f * PI))) + 0.5;
    },
    'elastic-in': (t) => Math.sin(13 * HALF_PI * t) * 2 ** (10 * (t - 1)),
    'elastic-out': (t) => Math.sin(-13 * HALF_PI * (t + 1)) * 2 ** (-10 * t) + 1,
    'elastic-in-out': (t) => {
        if (t < 0.5) {
            return 0.5 * Math.sin(13 * HALF_PI * (2 * t)) * 2 ** (10 * (2 * t - 1));
        }

        return 0.5 * (Math.sin(-13 * HALF_PI * (2 * t - 1 + 1)) * 2 ** (-10 * (2 * t - 1)) + 2);
    },
    'bounce-in': (t) => 1 - bounceOut(1 - t),
    'bounce-out': bounceOut,
    'bounce-in-out': (t) => {
        if (t < 0.5) {
            return 0.5 * (1 - bounceOut(1 - t * 2));
        }

        return 0.5 * bounceOut(t * 2 - 1) + 0.5;
    },
};

/**
 * Applies an easing curve to a normalized time value.
 *
 * @since 1.0.3
 * @changed 1.5.0 Added sine, cubic, quartic, quintic, expo, circ, back, elastic, and bounce families.
 * @param t – Normalized time in [0, 1]. Values outside this range are not clamped.
 * @param easing – Easing curve to apply.
 * @returns Eased value. Guaranteed to return 0 for `t = 0` and 1 for `t = 1`.
 */
export function applyEasing(t: number, easing: EasingFunction): number {
    // eslint-disable-next-line security/detect-object-injection -- `easing` is a typed EasingFunction union key
    const curve = CURVES[easing];

    if (curve === undefined) {
        throw new Error(`Unsupported easing: ${easing}`);
    }

    return curve(t);
}

/**
 * Interpolates from `start` to `end` using an easing curve.
 *
 * At `t = 0` the result equals `start`; at `t = 1` it equals `end`.
 * `Vector2i` and `Rect2i` components are rounded to the nearest integer.
 * `Color32` channels are rounded and clamped to [0, 255].
 *
 * @since 1.5.0
 * @param easing – Easing curve to apply to `t` before interpolation.
 * @param start – Value at `t = 0`.
 * @param end – Value at `t = 1`.
 * @param t – Normalized time in [0, 1]. Values outside this range are not clamped.
 * @returns Interpolated value of the same type as `start` / `end`.
 */
export function interpolate(easing: EasingFunction, start: number, end: number, t: number): number;
/**
 * Interpolates two `Vector2i` values with an easing curve (components rounded).
 *
 * @since 1.5.0
 * @param easing – Easing curve to apply to `t` before interpolation.
 * @param start – Value at `t = 0`.
 * @param end – Value at `t = 1`.
 * @param t – Normalized time in [0, 1]. Values outside this range are not clamped.
 * @returns Interpolated `Vector2i`.
 */
// eslint-disable-next-line no-redeclare -- TypeScript call-signature overloads
export function interpolate(easing: EasingFunction, start: Vector2i, end: Vector2i, t: number): Vector2i;
/**
 * Interpolates two `Color32` values with an easing curve (channels rounded and clamped).
 *
 * @since 1.5.0
 * @param easing – Easing curve to apply to `t` before interpolation.
 * @param start – Value at `t = 0`.
 * @param end – Value at `t = 1`.
 * @param t – Normalized time in [0, 1]. Values outside this range are not clamped.
 * @returns Interpolated `Color32`.
 */
// eslint-disable-next-line no-redeclare -- TypeScript call-signature overloads
export function interpolate(easing: EasingFunction, start: Color32, end: Color32, t: number): Color32;
/**
 * Interpolates two `Rect2i` values with an easing curve (components rounded).
 *
 * @since 1.5.0
 * @param easing – Easing curve to apply to `t` before interpolation.
 * @param start – Value at `t = 0`.
 * @param end – Value at `t = 1`.
 * @param t – Normalized time in [0, 1]. Values outside this range are not clamped.
 * @returns Interpolated `Rect2i`.
 */
// eslint-disable-next-line no-redeclare -- TypeScript call-signature overloads
export function interpolate(easing: EasingFunction, start: Rect2i, end: Rect2i, t: number): Rect2i;
// eslint-disable-next-line no-redeclare -- TypeScript call-signature overloads
export function interpolate(
    easing: EasingFunction,
    start: number | Vector2i | Color32 | Rect2i,
    end: number | Vector2i | Color32 | Rect2i,
    t: number,
): number | Vector2i | Color32 | Rect2i {
    const eased = applyEasing(t, easing);

    if (typeof start === 'number' && typeof end === 'number') {
        return start + (end - start) * eased;
    }

    if (start instanceof Vector2i && end instanceof Vector2i) {
        return new Vector2i(
            Math.round(start.x + (end.x - start.x) * eased),
            Math.round(start.y + (end.y - start.y) * eased),
        );
    }

    if (start instanceof Color32 && end instanceof Color32) {
        return new Color32(
            Math.round(start.r + (end.r - start.r) * eased),
            Math.round(start.g + (end.g - start.g) * eased),
            Math.round(start.b + (end.b - start.b) * eased),
            Math.round(start.a + (end.a - start.a) * eased),
        );
    }

    if (start instanceof Rect2i && end instanceof Rect2i) {
        return new Rect2i(
            Math.round(start.x + (end.x - start.x) * eased),
            Math.round(start.y + (end.y - start.y) * eased),
            Math.round(start.width + (end.width - start.width) * eased),
            Math.round(start.height + (end.height - start.height) * eased),
        );
    }

    throw new Error('interpolate() start and end must be the same type (number, Vector2i, Color32, or Rect2i)');
}
