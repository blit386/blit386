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

/** Reverse of `apiHistory.pages`: symbol name -> the page it is documented on. Built once, lazily. */
let symbolPageIndex: Map<string, string> | undefined;

function getSymbolPageIndex(): Map<string, string> {
    if (!symbolPageIndex) {
        symbolPageIndex = new Map();

        for (const [page, symbols] of Object.entries(apiHistory.pages)) {
            for (const name of symbols) {
                symbolPageIndex.set(name, page);
            }
        }
    }

    return symbolPageIndex;
}

/**
 * Turns a documented symbol name into the `id` its `<Since>` badge renders (see
 * `since-badge.tsx`), and the fragment a link should target to jump straight to it. `.` is not
 * a valid bare token in a URL fragment some tooling round-trips through query-string parsing, so
 * it is replaced with `-`; case is left untouched since fragments are matched case-sensitively
 * against the rendered `id`.
 */
export const symbolAnchorId = (name: string): string => name.replaceAll('.', '-');

/** Where a `{@link Name}` / `{@link Name.member}` target is documented. */
export interface SymbolLink {
    page: string;
    /** The resolved symbol's own name – e.g. `HardwareSettings` for a `HardwareSettings.foo` link – for use with {@link symbolAnchorId}. */
    symbol: string;
}

/**
 * Resolves a `{@link Name}` or `{@link Name.member}` target to the page and symbol it is
 * documented under, or `undefined` when neither the full name nor its base symbol (before the
 * first `.`) is tracked in `apiHistory.pages` – e.g. a deprecated helper that never received a
 * `<Since>` tag of its own.
 */
export function resolveSymbolLink(name: string): SymbolLink | undefined {
    const index = getSymbolPageIndex();
    const base = name.split('.', 1)[0] ?? name;
    const symbol = index.has(name) ? name : base;
    const page = index.get(symbol);

    return page ? { page, symbol } : undefined;
}

/** One dot-separated version segment: its digits, and whether a suffix followed them. */
interface VersionSegment {
    /** Leading zeros stripped, so `""` means zero. Kept as digits rather than a `number`. */
    digits: string;
    prerelease: boolean;
}

/**
 * Parses one segment. `"0"` yields `{ digits: '', prerelease: false }`, `"7-beta"` yields
 * `{ digits: '7', prerelease: true }`, and anything without a leading integer yields
 * `{ digits: '', prerelease: true }`.
 */
function parseSegment(segment: string | undefined): VersionSegment {
    if (segment === undefined) {
        return { digits: '', prerelease: false };
    }

    const match = /^(\d+)(.*)$/.exec(segment);

    if (match === null) {
        return { digits: '', prerelease: true };
    }

    return { digits: (match[1] ?? '').replace(/^0+/, ''), prerelease: match[2] !== '' };
}

/**
 * Orders two zero-stripped digit strings. More digits is always the larger number, and equal
 * lengths compare lexicographically – which for equal-length digit strings is numeric order.
 *
 * Deliberately not `Number(a) - Number(b)`: a segment of more than 308 digits converts to
 * `Infinity`, and two such segments would then subtract to `NaN`.
 */
function compareDigits(a: string, b: string): number {
    if (a.length !== b.length) {
        return a.length < b.length ? -1 : 1;
    }

    if (a === b) {
        return 0;
    }

    return a < b ? -1 : 1;
}

/**
 * Compares two dot-separated version strings segment by segment as numbers, so
 * `"1.10.0"` sorts above `"1.2.0"` (a plain string comparison would sort them the other
 * way around). Missing trailing segments are treated as `0`. Returns a negative number,
 * zero, or a positive number in the same sense as an `Array.prototype.sort` comparator.
 *
 * A segment carrying a prerelease suffix sorts below the same segment without one, so
 * `"1.5.0-beta.1"` is below `"1.5.0"`. Every input yields `-1`, `0`, or `1` – neither a segment of
 * any length nor one that fails to parse can produce `NaN`, which an `Array.prototype.sort`
 * comparator must never return.
 */
export function compareVersions(a: string, b: string): number {
    const segmentsA = a.split('.');
    const segmentsB = b.split('.');
    const length = Math.max(segmentsA.length, segmentsB.length);

    for (let i = 0; i < length; i += 1) {
        const segmentA = parseSegment(segmentsA[i]);
        const segmentB = parseSegment(segmentsB[i]);
        const diff = compareDigits(segmentA.digits, segmentB.digits);

        if (diff !== 0) {
            return diff;
        }

        if (segmentA.prerelease !== segmentB.prerelease) {
            return segmentA.prerelease ? -1 : 1;
        }
    }

    return 0;
}
