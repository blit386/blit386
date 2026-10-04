/**
 * Fixture public entrypoint mirroring BLIT386.ts's shape for gen-api-history.mjs tests:
 * a re-exported class/functions/type (exercising re-export resolution) plus a namespace
 * object literal (exercising getter/method/const member classification).
 */
export { helper, legacyDeprecated, versionedDeprecated, Widget } from './Source';
export type { FixtureType } from './Source';

/** Fixture BT-like namespace object exercising getter/method/const member kinds. */
export const FixtureBT = {
    /**
     * Fixture constant member, already tagged.
     *
     * @since 1.0.0
     */
    MAX: 4,

    /**
     * Fixture getter member.
     *
     * @since 1.0.0
     * @returns Always zero.
     */
    get value(): number {
        return 0;
    },

    /**
     * Fixture method member with no version tag yet.
     *
     * @param amount - Amount to add.
     * @returns The amount, unchanged.
     */
    add: (amount: number): number => amount,

    /**
     * Fixture overloaded method member, cast to an overloaded call-signature type like `BT.drawTile`.
     *
     * @since 1.0.0
     * @param a - First value.
     * @param b - Optional second value.
     * @returns The first value.
     */
    pick: ((a: number, b?: number): number => b ?? a) as {
        (a: number): number;
        (a: number, b: number): number;
    },

    /** Fixture single-line JSDoc member, no version tag yet - matches the real `BT` namespace style. */
    flag: 1,
};
