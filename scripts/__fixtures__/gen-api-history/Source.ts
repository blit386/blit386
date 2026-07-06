/**
 * Fixture class with an existing @since and one @changed entry.
 *
 * @since 1.0.0
 * @changed 1.2.0 Added the resize option.
 */
export class Widget {
    /** Fixture field, present only so the class has a body. */
    value = 0;
}

/**
 * Fixture function with no version tag yet, simulating a symbol pending backfill.
 */
export function helper(): void {}

/**
 * Fixture function using the pre-existing date-only @deprecated form.
 *
 * @deprecated Deprecated since 2026-05-31. Use {@link helper} instead.
 */
export function legacyDeprecated(): void {}

/**
 * Fixture function using the versioned @deprecated form.
 *
 * @since 1.0.3
 * @deprecated Deprecated since 1.2.0 (2026-05-31). Use {@link helper} instead.
 */
export function versionedDeprecated(): void {}

/** Fixture type alias. */
export type FixtureType = { id: number };
