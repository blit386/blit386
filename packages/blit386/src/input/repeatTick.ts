/**
 * Shared tick-repeat rule for held keys and buttons (`BT.isKeyPressed`, `BT.isPressed`, the any-key / any-button
 * queries): a held input fires again every `repeatRate` ticks after its first press.
 */

/**
 * Whether `tick` is a repeat tick for an input first pressed on `first`.
 *
 * @param first - Tick of the first press, or `undefined` when none is recorded.
 * @param repeatRate - Ticks between repeats; must be positive.
 * @param tick - Current fixed-update tick.
 * @returns `true` on every `repeatRate`-th tick after `first`, never on `first` itself.
 */
export const isRepeatTick = (first: number | undefined, repeatRate: number, tick: number): boolean => {
    if (first === undefined) {
        return false;
    }

    const dt = tick - first;

    return dt > 0 && dt % repeatRate === 0;
};
