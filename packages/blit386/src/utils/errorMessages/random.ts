/**
 * `Random`, seed, and noise messages.
 */

/**
 * Returns the error message for a seed that is not a finite number, on {@link Random} and the noise classes.
 *
 * Mirrors the `?seed=` URL parameter's warning in `core/SeedUrlParam.ts`: `seed >>> 0` would turn
 * `NaN`, `undefined`, or `Infinity` into seed `0` without a word.
 *
 * @param owner - Class being seeded (`'Random'`, `'PerlinNoise'`, ...).
 * @param seed - Invalid seed value that was supplied.
 * @returns User-facing error string.
 */
export function randomSeedNotFiniteError(owner: string, seed: unknown): string {
    return (
        `Can't seed ${owner} with ${String(seed)}: it must be a finite number. ` +
        'Pass a whole number such as 1234; only its lower 32 bits are used'
    );
}

/**
 * Error message for {@link Random.pick} when the array is empty.
 */
export const RANDOM_PICK_EMPTY_MESSAGE = "Can't pick from an empty array. Pass an array with at least one element";

/**
 * Returns the error message for {@link Random.weighted} when items and weights lengths differ.
 *
 * @param itemCount - Number of items supplied.
 * @param weightCount - Number of weights supplied.
 * @returns User-facing error string.
 */
export function randomWeightedLengthError(itemCount: number, weightCount: number): string {
    return (
        `Random.weighted() needs the same number of items and weights ` +
        `(got ${itemCount} items and ${weightCount} weights). Match the two arrays`
    );
}

/**
 * Error message for {@link Random.weighted} when there are no items.
 */
export const RANDOM_WEIGHTED_EMPTY_MESSAGE =
    "Can't pick a weighted item from an empty list. Pass at least one item and weight";

/**
 * Returns the error message for {@link Random.weighted} when total weight is not positive.
 *
 * @param total - Sum of the supplied weights.
 * @returns User-facing error string.
 */
export function randomWeightedTotalError(total: number): string {
    return (
        `Random.weighted() needs a positive total weight (got ${total}). ` +
        'Give each item a weight of 0 or more, with at least one greater than 0'
    );
}

/**
 * Returns the error message for a {@link Random.int} or {@link Random.intInclusive} bound outside the
 * 32-bit integer range, which `| 0` would otherwise wrap into an unrelated number.
 *
 * @param method - Method that received the bound (`'int'` or `'intInclusive'`).
 * @param value - Bound that was supplied.
 * @returns User-facing error string.
 */
export function randomIntBoundError(method: string, value: number): string {
    return (
        `Random.${method}() works with whole numbers from -2147483648 to 2147483647 (got ${value}). ` +
        'Use a smaller bound, or scale random.next() yourself for a wider range'
    );
}

/**
 * Returns the error message for {@link Random.weighted} when a weight is not a finite number.
 *
 * @param index - Position of the bad weight.
 * @param weight - Weight that was supplied.
 * @returns User-facing error string.
 */
export function randomWeightNotFiniteError(index: number, weight: number): string {
    return (
        `Random.weighted() needs finite weights (got ${weight} at index ${index}). ` +
        'Give each item a weight of 0 or more'
    );
}

/**
 * Returns the error message for an invalid half-open integer range on {@link Random.int}.
 *
 * @param min - Inclusive lower bound that was supplied.
 * @param maxExclusive - Exclusive upper bound that was supplied.
 * @returns User-facing error string.
 */
export function randomIntRangeError(min: number, maxExclusive: number): string {
    return (
        `Random.int() needs maxExclusive > min (got min=${min}, maxExclusive=${maxExclusive}). ` +
        'Use a larger exclusive upper bound'
    );
}

/**
 * Returns the error message for an invalid inclusive integer range on {@link Random.intInclusive}.
 *
 * @param min - Inclusive lower bound that was supplied.
 * @param max - Inclusive upper bound that was supplied.
 * @returns User-facing error string.
 */
export function randomIntInclusiveRangeError(min: number, max: number): string {
    return (
        `Random.intInclusive() needs max >= min (got min=${min}, max=${max}). ` +
        'Use a max that is at least as large as min'
    );
}
