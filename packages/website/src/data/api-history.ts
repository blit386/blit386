import raw from './api-history.generated.json';

/** Lifecycle status of a documented API symbol. */
export type SymbolStatus = 'stable' | 'unreleased' | 'deprecated';

/** Version history for a single documented API symbol. */
export interface SymbolHistory {
    kind: string;
    since: string;
    changes: { version: string; note: string }[];
    deprecated: { version: string | null; date: string | null; note: string } | null;
    status: SymbolStatus;
}

/**
 * Shape of the generated `api-history.generated.json` file. It is produced by the engine
 * repo's JSDoc-driven history extractor and copied here by `pnpm run sync:docs` (a later
 * task); this file only describes and consumes that shape.
 */
export interface ApiHistory {
    packageVersion: string;
    unreleasedVersion: string;
    versions: Record<string, string | null>;
    symbols: Record<string, SymbolHistory>;
    pages: Record<string, string[]>;
}

export const apiHistory = raw as ApiHistory;

/**
 * Looks up a symbol's version history by name, or `undefined` if it isn't documented.
 *
 * `apiHistory` comes from `JSON.parse`, so its records inherit `Object.prototype` – without the
 * own-property guard, `getSymbol('toString')` would hand back a function typed as `SymbolHistory`.
 */
export const getSymbol = (name: string): SymbolHistory | undefined =>
    Object.hasOwn(apiHistory.symbols, name) ? apiHistory.symbols[name] : undefined;

/**
 * Lists the symbol names documented on a given page path, or `[]` if none are recorded.
 *
 * Guarded the same way as {@link getSymbol}: a bare `?? []` never fires for an inherited key,
 * because `Object.prototype.constructor` is a function rather than nullish.
 */
export const getPageSymbols = (page: string): string[] =>
    Object.hasOwn(apiHistory.pages, page) ? (apiHistory.pages[page] ?? []) : [];

/** One dot-separated version segment: its numeric value, and whether a suffix followed it. */
interface VersionSegment {
    value: number;
    prerelease: boolean;
}

/**
 * Parses one segment. `"0"` yields `{ value: 0, prerelease: false }`, `"0-beta"` yields
 * `{ value: 0, prerelease: true }`, and anything without a leading integer yields
 * `{ value: 0, prerelease: true }` rather than `NaN`.
 */
function parseSegment(segment: string | undefined): VersionSegment {
    if (segment === undefined) {
        return { value: 0, prerelease: false };
    }

    const match = /^(\d+)(.*)$/.exec(segment);

    if (match === null) {
        return { value: 0, prerelease: true };
    }

    return { value: Number(match[1] ?? '0'), prerelease: match[2] !== '' };
}

/**
 * Compares two dot-separated version strings segment by segment as numbers, so
 * `"1.10.0"` sorts above `"1.2.0"` (a plain string comparison would sort them the other
 * way around). Missing trailing segments are treated as `0`. Returns a negative number,
 * zero, or a positive number in the same sense as an `Array.prototype.sort` comparator.
 *
 * A segment carrying a prerelease suffix sorts below the same segment without one, so
 * `"1.5.0-beta.1"` is below `"1.5.0"`. Every input yields a number: a segment that does not parse
 * cannot produce `NaN`, which an `Array.prototype.sort` comparator must never return.
 */
export function compareVersions(a: string, b: string): number {
    const segmentsA = a.split('.');
    const segmentsB = b.split('.');
    const length = Math.max(segmentsA.length, segmentsB.length);

    for (let i = 0; i < length; i += 1) {
        const segmentA = parseSegment(segmentsA[i]);
        const segmentB = parseSegment(segmentsB[i]);
        const diff = segmentA.value - segmentB.value;

        if (diff !== 0) {
            return diff;
        }

        if (segmentA.prerelease !== segmentB.prerelease) {
            return segmentA.prerelease ? -1 : 1;
        }
    }

    return 0;
}
