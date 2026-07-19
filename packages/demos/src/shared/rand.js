/**
 * Shared random-number helpers for the demos.
 *
 * JavaScript gives us one random tool: Math.random(), which returns a decimal
 * between 0 (included) and 1 (excluded) - like rolling a dice with infinitely
 * many faces between 0 and 0.999... Every helper here reshapes that roll into
 * a more useful form: a whole number in a range, a decimal in a range, or a
 * random item from a list.
 *
 * Several demos used to carry their own private copies of these functions;
 * they now all import this one file instead.
 */

/**
 * A random whole number from `min` up to but NOT including `max`.
 *
 * "Half-open" ranges like this are handy for picking array positions:
 * randInt(0, arr.length) can return 0, 1, ... arr.length - 1, but never
 * arr.length itself (which would be one past the end of the array).
 *
 * @param {number} min - Lowest possible result (included).
 * @param {number} max - Upper limit (excluded).
 * @returns {number} A whole number in [min, max).
 */
function randInt(min, max) {
    // Math.random() * (max - min) gives a decimal spanning the range size,
    // Math.floor() chops off the decimals, and + min shifts it into place.
    return min + Math.floor(Math.random() * (max - min));
}

/**
 * A random whole number from `min` up to AND including `max`.
 *
 * Use this when both ends are valid answers - like a real dice roll, where
 * randIntInclusive(1, 6) can land on 1, 6, or anything between.
 *
 * @param {number} min - Lowest possible result (included).
 * @param {number} max - Highest possible result (included).
 * @returns {number} A whole number in [min, max].
 */
function randIntInclusive(min, max) {
    // The + 1 widens the range by one step so `max` itself can come up.
    return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * A random decimal number between `min` (included) and `max` (excluded).
 *
 * Good for things measured smoothly, like speeds and angles, where whole
 * numbers would feel too chunky.
 *
 * @param {number} min - Lowest possible result (included).
 * @param {number} max - Upper limit (excluded).
 * @returns {number} A decimal in [min, max).
 */
function randFloat(min, max) {
    return min + Math.random() * (max - min);
}

/**
 * One random item from an array - like drawing a card from a shuffled deck.
 *
 * @template T
 * @param {T[]} arr - The list to pick from (must not be empty).
 * @returns {T} One randomly chosen element.
 */
function randPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export { randFloat, randInt, randIntInclusive, randPick };
