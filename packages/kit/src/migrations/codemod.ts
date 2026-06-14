/**
 * Pure codemod engine: rewrite old API identifiers to new ones in a source string.
 *
 * Matching is line-based and anchored so it is safe without type information. `auto` renames are applied; `review`
 * renames are only located and reported (with a suggested rewrite) so a human or the AI migration skill can decide.
 */

import type { Migration, Rename } from './types';

/** A single place a rename matched, with the original line and what it would become. */
export interface RenameHit {
    /** The rename that matched. */
    rename: Rename;

    /** 1-based line number in the source. */
    line: number;

    /** The original line text. */
    before: string;

    /** The line after applying this rename (the suggestion, even for `review` hits). */
    after: string;
}

/** The result of running renames over one file's text. */
export interface CodemodResult {
    /** Source text with all `auto` renames applied. */
    text: string;

    /** Whether `text` differs from the input. */
    changed: boolean;

    /** `auto` renames that were applied. */
    applied: RenameHit[];

    /** `review` matches that were found but left untouched. */
    review: RenameHit[];
}

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build the anchored pattern that matches a rename in source. */
function patternFor(rename: Rename): RegExp {
    const from = escapeRegExp(rename.from);

    if (rename.kind === 'memberCall') {
        const receiver = escapeRegExp(rename.receiver ?? '');
        return new RegExp(`(?<![\\w$])${receiver}\\.${from}(?![\\w$])`, 'g');
    }

    if (rename.kind === 'objectKey') {
        return new RegExp(`(?<![\\w$])${from}(?=\\s*:)`, 'g');
    }

    return new RegExp(`\\.${from}(?=\\s*\\()`, 'g');
}

/** The replacement text for a rename (preserves the receiver or leading dot). */
function replacementFor(rename: Rename): string {
    if (rename.kind === 'memberCall') {
        return `${rename.receiver ?? ''}.${rename.to}`;
    }

    if (rename.kind === 'objectKey') {
        return rename.to;
    }

    return `.${rename.to}`;
}

/** Flatten a set of migrations into their renames, in order. */
export function renamesFromMigrations(migrations: readonly Migration[]): Rename[] {
    return migrations.flatMap((migration) => migration.renames);
}

/**
 * Apply `auto` renames to `text` and locate `review` renames without changing them.
 *
 * Processing is line-by-line so reported line numbers are exact; anchored patterns mean an applied rename never
 * re-triggers another rename on the same pass.
 */
export function applyRenames(text: string, renames: readonly Rename[]): CodemodResult {
    const applied: RenameHit[] = [];
    const review: RenameHit[] = [];

    const lines = text.split('\n');

    const newLines = lines.map((original, index) => {
        let current = original;

        for (const rename of renames) {
            const replaced = current.replace(patternFor(rename), replacementFor(rename));
            if (replaced === current) {
                continue;
            }

            const hit: RenameHit = { rename, line: index + 1, before: current, after: replaced };

            if (rename.safety === 'review') {
                review.push(hit);
                continue;
            }

            applied.push(hit);
            current = replaced;
        }

        return current;
    });

    const newText = newLines.join('\n');

    return { text: newText, changed: newText !== text, applied, review };
}
