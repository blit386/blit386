/**
 * Seeded, deterministic pseudo-random number generator (mulberry32).
 *
 * Integer-first helpers for demos and games: ints, floats, picks, shuffles,
 * weighted choice, and Vector2i/Rect2i spatial draws. Same seed always produces
 * the same sequence across platforms (pure `>>> 0` integer ops in the core).
 *
 * @since 1.5.0
 */

import {
    randomIntInclusiveRangeError,
    randomIntRangeError,
    randomPickEmptyError,
    randomWeightedEmptyError,
    randomWeightedLengthError,
    randomWeightedTotalError,
} from './errorMessages';
import type { Rect2i } from './Rect2i';
import { Vector2i } from './Vector2i';

/** Reciprocal of 2^32, used to map a uint32 into [0, 1). */
const INV_2_32 = 1 / 4294967296;

/** Two pi, used by {@link Random.angle}. */
const TWO_PI = Math.PI * 2;

/** Cardinal unit offsets for {@link Random.direction4} (Y-down). */
const CARDINALS: readonly (readonly [number, number])[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
];

/** Eight king-move unit offsets for {@link Random.direction8} (Y-down). */
const DIRECTIONS8: readonly (readonly [number, number])[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
];

/**
 * Seeded PRNG with integer-first generators and stream control (`seed` / `clone` / `fork`).
 *
 * @since 1.5.0
 */
export class Random {
    /** Internal 32-bit generator state, mutated on every draw. */
    private state: number;

    /** Last seed passed to the constructor or {@link seed}; `undefined` when not known. */
    private lastSeed: number | undefined;

    /**
     * Creates a PRNG. Omit `seed` to time-seed from `Date.now()` (lower 32 bits).
     *
     * @param seed - Any finite number; only its lower 32 bits affect the sequence.
     * @since 1.5.0
     */
    public constructor(seed: number = Date.now()) {
        this.state = seed >>> 0;
        this.lastSeed = this.state;
    }

    /**
     * The last seed passed to the constructor or {@link seed}. `undefined` after {@link setState} (the
     * stream position no longer corresponds to a known seed) or on a {@link fork}ed child (a fork is a new
     * stream and should not claim to have been seeded by its caller). {@link clone} copies whatever value
     * the parent currently holds.
     *
     * @returns Last known seed, or `undefined` if the origin seed is not known.
     * @since 1.5.0
     */
    public get seedValue(): number | undefined {
        return this.lastSeed;
    }

    /**
     * Reseeds the generator. Same seed restarts the same sequence.
     *
     * @param seed - Any finite number; only its lower 32 bits are used.
     * @since 1.5.0
     */
    public seed(seed: number): void {
        this.state = seed >>> 0;
        this.lastSeed = this.state;
    }

    /**
     * Returns the current 32-bit generator state.
     *
     * @returns Unsigned 32-bit state value.
     * @since 1.5.0
     */
    public getState(): number {
        return this.state >>> 0;
    }

    /**
     * Restores a previously saved 32-bit generator state.
     *
     * @param state - Value from {@link getState} (lower 32 bits used).
     * @since 1.5.0
     */
    public setState(state: number): void {
        this.state = state >>> 0;
        this.lastSeed = undefined;
    }

    /**
     * Returns a new generator with the same state (identical stream from this point).
     *
     * @returns Independent copy that will produce the same subsequent values.
     * @since 1.5.0
     */
    public clone(): Random {
        const copy = new Random(0);

        copy.state = this.state;
        copy.lastSeed = this.lastSeed;

        return copy;
    }

    /**
     * Returns an independent sub-stream. Advances this generator once to seed the child.
     *
     * @returns New generator whose sequence diverges from this one.
     * @since 1.5.0
     */
    public fork(): Random {
        const child = new Random(this.nextUint32());

        child.lastSeed = undefined;

        return child;
    }

    /**
     * Returns the next pseudo-random float in [0, 1).
     *
     * @returns Next value in the deterministic sequence.
     * @since 1.5.0
     */
    public next(): number {
        return this.nextUint32() * INV_2_32;
    }

    /**
     * Returns the next pseudo-random float in [min, max).
     *
     * @param min - Inclusive lower bound.
     * @param max - Exclusive upper bound.
     * @returns Float in [min, max).
     * @since 1.5.0
     */
    public float(min: number, max: number): number {
        return min + this.next() * (max - min);
    }

    /**
     * Returns a pseudo-random integer in [0, maxExclusive) or [min, maxExclusive).
     *
     * @param minOrMaxExclusive - When alone, exclusive upper bound from 0; otherwise inclusive min.
     * @param maxExclusive - Exclusive upper bound when two arguments are passed.
     * @returns Whole number in the half-open range.
     * @since 1.5.0
     */
    public int(minOrMaxExclusive: number, maxExclusive?: number): number {
        let min: number;
        let max: number;

        if (maxExclusive === undefined) {
            min = 0;
            max = minOrMaxExclusive | 0;
        } else {
            min = minOrMaxExclusive | 0;
            max = maxExclusive | 0;
        }

        if (max <= min) {
            throw new RangeError(randomIntRangeError(min, max));
        }

        return (min + Math.floor(this.next() * (max - min))) | 0;
    }

    /**
     * Returns a pseudo-random integer in [min, max] (inclusive on both ends).
     *
     * @param min - Inclusive lower bound.
     * @param max - Inclusive upper bound.
     * @returns Whole number in the closed range.
     * @since 1.5.0
     */
    public intInclusive(min: number, max: number): number {
        const lo = min | 0;
        const hi = max | 0;

        if (hi < lo) {
            throw new RangeError(randomIntInclusiveRangeError(lo, hi));
        }

        return (lo + Math.floor(this.next() * (hi - lo + 1))) | 0;
    }

    /**
     * Returns true with the given probability.
     *
     * @param probability - Chance in [0, 1]; defaults to 0.5.
     * @returns True when the next unit float is less than `probability`.
     * @since 1.5.0
     */
    public bool(probability = 0.5): boolean {
        return this.next() < probability;
    }

    /**
     * Returns -1 or 1 with equal probability.
     *
     * @returns Either `-1` or `1`.
     * @since 1.5.0
     */
    public sign(): -1 | 1 {
        return this.next() < 0.5 ? -1 : 1;
    }

    /**
     * Returns one element chosen uniformly from a non-empty array.
     *
     * @param arr - Array to pick from; must contain at least one element.
     * @returns Chosen element.
     * @since 1.5.0
     */
    public pick<T>(arr: readonly T[]): T {
        if (arr.length === 0) {
            throw new RangeError(randomPickEmptyError());
        }

        return arr[this.int(arr.length)] as T;
    }

    /**
     * Returns a new array with the same elements in shuffled order (Fisher-Yates).
     *
     * @param arr - Source array (not mutated).
     * @returns Shuffled copy.
     * @since 1.5.0
     */
    public shuffle<T>(arr: readonly T[]): T[] {
        const copy = arr.slice();

        this.shuffleInPlace(copy);

        return copy;
    }

    /**
     * Shuffles an array in place (Fisher-Yates) and returns it.
     *
     * @param arr - Array to mutate.
     * @returns The same array reference.
     * @since 1.5.0
     */
    public shuffleInPlace<T>(arr: T[]): T[] {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = this.int(i + 1);
            /* eslint-disable security/detect-object-injection -- i/j bounded by array length */
            const tmp = arr[i] as T;

            arr[i] = arr[j] as T;
            arr[j] = tmp;
            /* eslint-enable security/detect-object-injection */
        }

        return arr;
    }

    /**
     * Returns one item chosen by relative weights.
     *
     * @param items - Items to choose from.
     * @param weights - Non-negative weights parallel to `items`; total must be greater than 0.
     * @returns Chosen item.
     * @since 1.5.0
     */
    public weighted<T>(items: readonly T[], weights: readonly number[]): T {
        if (items.length === 0) {
            throw new RangeError(randomWeightedEmptyError());
        }

        if (items.length !== weights.length) {
            throw new RangeError(randomWeightedLengthError(items.length, weights.length));
        }

        let total = 0;

        for (let i = 0; i < weights.length; i++) {
            // eslint-disable-next-line security/detect-object-injection -- i bounded by weights.length
            const w = weights[i] as number;

            total += w > 0 ? w : 0;
        }

        if (!(total > 0)) {
            throw new RangeError(randomWeightedTotalError(total));
        }

        let cursor = this.next() * total;

        for (let i = 0; i < items.length; i++) {
            // eslint-disable-next-line security/detect-object-injection -- i bounded by items.length
            const w = weights[i] as number;

            if (w > 0) {
                cursor -= w;

                if (cursor < 0) {
                    // eslint-disable-next-line security/detect-object-injection -- i bounded by items.length
                    return items[i] as T;
                }
            }
        }

        return items[items.length - 1] as T;
    }

    /**
     * Returns a uniform angle in [0, 2π) radians.
     *
     * @returns Angle in radians.
     * @since 1.5.0
     */
    public angle(): number {
        return this.next() * TWO_PI;
    }

    /**
     * Returns a sample from an approximate normal distribution (Box-Muller, no spare).
     *
     * @param mean - Distribution mean; defaults to 0.
     * @param stddev - Standard deviation; defaults to 1.
     * @returns Gaussian sample.
     * @since 1.5.0
     */
    public gaussian(mean = 0, stddev = 1): number {
        // Box-Muller with two unit draws; no cached spare so getState stays one uint32.
        let u: number;

        // Guard against log(0) if next() ever yields exactly 0 (vanishingly rare for mulberry32).
        do {
            u = this.next();
        } while (u === 0);

        const v = this.next();
        const mag = Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO_PI * v);

        return mean + mag * stddev;
    }

    /**
     * Returns a random integer point inside a rectangle (half-open, like {@link Rect2i.isContaining}).
     *
     * @param rect - Rectangle to sample; must have positive width and height.
     * @returns New point with `x` in `[rect.x, rect.right)` and `y` in `[rect.y, rect.bottom)`.
     * @since 1.5.0
     */
    public insideRect(rect: Rect2i): Vector2i {
        return this.insideRectTo(rect, new Vector2i());
    }

    /**
     * Writes a random integer point inside a rectangle into `out` (zero-alloc).
     *
     * Half-open bounds match {@link Rect2i.isContaining}: `x` in `[rect.x, rect.right)`,
     * `y` in `[rect.y, rect.bottom)`.
     *
     * @param rect - Rectangle to sample; must have positive width and height.
     * @param out - Vector to write into.
     * @returns The same `out` reference.
     * @since 1.5.0
     */
    public insideRectTo(rect: Rect2i, out: Vector2i): Vector2i {
        out.x = this.int(rect.x, rect.right);
        out.y = this.int(rect.y, rect.bottom);

        return out;
    }

    /**
     * Returns a random integer point with each axis drawn from a half-open range.
     *
     * Per axis uses {@link int}: `x` in `[min.x, max.x)`, `y` in `[min.y, max.y)`.
     *
     * @param min - Inclusive lower bound per axis.
     * @param max - Exclusive upper bound per axis.
     * @returns New point in the half-open range.
     * @since 1.5.0
     */
    public pointInRange(min: Vector2i, max: Vector2i): Vector2i {
        return this.pointInRangeTo(min, max, new Vector2i());
    }

    /**
     * Writes a random integer point from a half-open per-axis range into `out` (zero-alloc).
     *
     * Per axis uses {@link int}: `x` in `[min.x, max.x)`, `y` in `[min.y, max.y)`.
     *
     * @param min - Inclusive lower bound per axis.
     * @param max - Exclusive upper bound per axis.
     * @param out - Vector to write into.
     * @returns The same `out` reference.
     * @since 1.5.0
     */
    public pointInRangeTo(min: Vector2i, max: Vector2i, out: Vector2i): Vector2i {
        out.x = this.int(min.x, max.x);
        out.y = this.int(min.y, max.y);

        return out;
    }

    /**
     * Returns one of the four cardinal unit directions (Y-down).
     *
     * Possible values: `(1, 0)`, `(-1, 0)`, `(0, 1)`, `(0, -1)`.
     *
     * @returns New unit vector.
     * @since 1.5.0
     */
    public direction4(): Vector2i {
        const [x, y] = CARDINALS[this.int(4)] as readonly [number, number];

        return Vector2i.fromXYUnchecked(x, y);
    }

    /**
     * Returns one of the eight king-move unit directions (Y-down).
     *
     * Cardinals plus diagonals: `(±1, 0)`, `(0, ±1)`, `(±1, ±1)`.
     *
     * @returns New unit vector.
     * @since 1.5.0
     */
    public direction8(): Vector2i {
        const [x, y] = DIRECTIONS8[this.int(8)] as readonly [number, number];

        return Vector2i.fromXYUnchecked(x, y);
    }

    /**
     * Advances mulberry32 and returns the next unsigned 32-bit integer.
     *
     * @returns Next uint32 in the sequence.
     */
    private nextUint32(): number {
        this.state = (this.state + 0x6d2b79f5) | 0;

        let t = this.state;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return (t ^ (t >>> 14)) >>> 0;
    }
}
