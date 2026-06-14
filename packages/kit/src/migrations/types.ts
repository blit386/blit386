/**
 * Data model for engine migrations - the structured, machine-applicable form of `blit-tech`'s `docs/deprecations.md`.
 *
 * A migration bundles a set of one-to-one identifier renames (a codemod) plus a human-readable summary of intent.
 * `blit migrate` and `blit upgrade` consume this to rewrite a game's source from old API names to current ones.
 */

/**
 * How a rename is matched in source code.
 *
 * - `memberCall`: a call on a fixed receiver, e.g. `BT.buttonDown(` -> `BT.isDown(`. Anchored on the receiver, so it is
 *   unambiguous and safe to apply automatically.
 * - `objectKey`: a property key in an object literal, e.g. `overlayEnabled:` -> `isOverlayEnabled:`. Anchored on the
 *   trailing colon.
 * - `method`: a method call on an unknown receiver, e.g. `.intersectionTo(` -> `.intersectTo(`. Only safe when the old
 *   name is distinctive enough to not collide with unrelated code.
 */
export type RenameKind = 'memberCall' | 'objectKey' | 'method';

/**
 * Whether a rename can be applied automatically.
 *
 * - `auto`: distinctive or receiver-anchored; safe to rewrite without type information.
 * - `review`: the old name is a common word (`equals`, `tick`, ...) that could match unrelated code, so it is reported
 *   for a human or the AI migration skill to handle instead of being rewritten blindly.
 */
export type RenameSafety = 'auto' | 'review';

/** A single old-to-new identifier rename within a migration. */
export interface Rename {
    /** The old identifier (without receiver or punctuation), e.g. `buttonDown`. */
    from: string;

    /** The replacement identifier, e.g. `isDown`. */
    to: string;

    /** How the identifier appears in source. */
    kind: RenameKind;

    /** Whether it is safe to rewrite automatically. */
    safety: RenameSafety;

    /** For `memberCall`, the fixed receiver the call sits on (e.g. `BT`). */
    receiver?: string;

    /** Optional human note explaining the rename or why it needs review. */
    note?: string;
}

/** A dated set of renames shipped together, mirroring one section of the engine's deprecation timeline. */
export interface Migration {
    /** Stable identifier, e.g. `2026-05-31-api-naming`. */
    id: string;

    /** ISO date the aliases were introduced. */
    date: string;

    /**
     * The engine version from which the new names are canonical. A project on this version or newer should use the new
     * names, so `blit upgrade` offers this migration once the installed engine reaches it.
     */
    since: string;

    /** One-line, beginner-friendly summary of what changed and why. */
    summary: string;

    /** The renames this migration performs. */
    renames: Rename[];
}
