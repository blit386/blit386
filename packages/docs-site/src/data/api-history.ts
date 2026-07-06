import raw from './api-history.generated.json';

/** Lifecycle status of a documented API symbol. */
export type SymbolStatus = 'stable' | 'unreleased' | 'deprecated';

/** Version history for a single documented API symbol. */
export interface SymbolHistory {
    kind: string;
    since: string;
    changes: { version: string; note: string }[];
    deprecated: string | null;
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

/** Looks up a symbol's version history by name, or `undefined` if it isn't documented. */
export const getSymbol = (name: string): SymbolHistory | undefined => apiHistory.symbols[name];

/** Lists the symbol names documented on a given page path, or `[]` if none are recorded. */
export const getPageSymbols = (page: string): string[] => apiHistory.pages[page] ?? [];

/**
 * Compares two dot-separated version strings segment by segment as numbers, so
 * `"1.10.0"` sorts above `"1.2.0"` (a plain string comparison would sort them the other
 * way round). Missing trailing segments are treated as `0`. Returns a negative number,
 * zero, or a positive number in the same sense as an `Array.prototype.sort` comparator.
 */
export function compareVersions(a: string, b: string): number {
    const segmentsA = a.split('.').map(Number);
    const segmentsB = b.split('.').map(Number);
    const length = Math.max(segmentsA.length, segmentsB.length);

    for (let i = 0; i < length; i += 1) {
        const diff = (segmentsA[i] ?? 0) - (segmentsB[i] ?? 0);

        if (diff !== 0) {
            return diff;
        }
    }

    return 0;
}
