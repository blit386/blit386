/**
 * Covers `src/data/api-history.ts`, the typed loader behind `Since`, `ApiAvailability`, and
 * `PageChangelog`.
 *
 * The generated JSON it wraps is re-copied from the engine on every `pnpm run sync:docs`, so
 * these tests assert invariants over whatever it currently holds rather than naming specific
 * symbols – otherwise an unrelated engine doc change would turn this suite red.
 */

import { describe, expect, it } from 'vitest';
import { apiHistory, compareVersions, getPageSymbols, getSymbol, type SymbolStatus } from './api-history';

const STATUSES: SymbolStatus[] = ['stable', 'unreleased', 'deprecated'];
const NUMERIC_VERSION = /^\d+(\.\d+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

describe('compareVersions', () => {
    it('orders segments numerically rather than lexically', () => {
        // The whole reason this function exists: '1.10.0' < '1.2.0' as strings.
        expect(compareVersions('1.10.0', '1.2.0')).toBeGreaterThan(0);
        expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0);
    });

    it('treats missing trailing segments as zero', () => {
        expect(compareVersions('1.0', '1.0.0')).toBe(0);
        expect(compareVersions('1.0.0', '1.0')).toBe(0);
    });

    it('reports equality for identical versions', () => {
        expect(compareVersions('1.4.2', '1.4.2')).toBe(0);
    });

    it('is antisymmetric', () => {
        expect(Math.sign(compareVersions('1.5.0', '1.4.0'))).toBe(-Math.sign(compareVersions('1.4.0', '1.5.0')));
    });

    it('sorts a prerelease below its release', () => {
        expect(compareVersions('1.5.0-beta.1', '1.5.0')).toBeLessThan(0);
        expect(compareVersions('1.5.0-beta.1', '1.5.0-beta.2')).toBeLessThan(0);
    });

    it.each([
        ['1.5.0-beta.1', '1.5.0'],
        ['not-a-version', '1.0.0'],
        ['', '1.0.0'],
        ['1.0.0', ''],
    ])('never returns NaN for %s vs %s', (a, b) => {
        // An Array.prototype.sort comparator returning NaN has implementation-defined behavior,
        // so this holds for any input, not only well-formed versions.
        expect(Number.isNaN(compareVersions(a, b))).toBe(false);
    });

    it('sorts the generated version list into ascending order', () => {
        const versions = Object.keys(apiHistory.versions);
        const shuffled = [...versions].reverse();

        expect([...shuffled].sort(compareVersions)).toEqual([...versions].sort(compareVersions));
        expect(versions.length).toBeGreaterThan(0);
    });
});

describe('getSymbol', () => {
    it('returns the history for a documented symbol', () => {
        const [name] = Object.keys(apiHistory.symbols);

        expect(name).toBeDefined();
        expect(getSymbol(name ?? '')).toBe(apiHistory.symbols[name ?? '']);
    });

    it('returns undefined for an undocumented symbol', () => {
        expect(getSymbol('definitely-not-a-symbol')).toBeUndefined();
    });

    it.each(['toString', 'constructor', 'hasOwnProperty'])(
        'returns undefined for the inherited key %s',
        (inherited) => {
            // The record comes from JSON.parse, so it inherits Object.prototype. Without the
            // own-property guard this would hand a function back typed as SymbolHistory.
            expect(getSymbol(inherited)).toBeUndefined();
        },
    );
});

describe('getPageSymbols', () => {
    it('lists the symbols recorded for a page', () => {
        const [page] = Object.keys(apiHistory.pages);

        expect(page).toBeDefined();
        expect(getPageSymbols(page ?? '')).toBe(apiHistory.pages[page ?? '']);
    });

    it('returns an empty array for a page with no record', () => {
        expect(getPageSymbols('nope/missing')).toEqual([]);
    });

    it.each(['toString', 'constructor'])('returns an empty array for the inherited key %s', (inherited) => {
        // `?? []` never fires here on its own: Object.prototype.constructor is a function, not
        // nullish, so only the own-property guard keeps the return type honest.
        expect(getPageSymbols(inherited)).toEqual([]);
    });
});

describe('the generated history', () => {
    it('declares both package versions as semver, with unreleased ahead of released', () => {
        expect(apiHistory.packageVersion).toMatch(SEMVER);
        expect(apiHistory.unreleasedVersion).toMatch(SEMVER);
        expect(compareVersions(apiHistory.unreleasedVersion, apiHistory.packageVersion)).toBeGreaterThan(0);
    });

    it('gives every symbol a well-formed record', () => {
        const entries = Object.entries(apiHistory.symbols);

        expect(entries.length).toBeGreaterThan(0);

        for (const [name, symbol] of entries) {
            expect(symbol.kind, name).toBeTruthy();
            expect(symbol.since, name).toMatch(NUMERIC_VERSION);
            expect(STATUSES, name).toContain(symbol.status);
            expect(Array.isArray(symbol.changes), name).toBe(true);

            for (const change of symbol.changes) {
                expect(change.version, name).toMatch(NUMERIC_VERSION);
                expect(typeof change.note, name).toBe('string');
            }

            if (symbol.deprecated !== null) {
                expect(typeof symbol.deprecated.note, name).toBe('string');
            }
        }
    });

    it('references only symbols it also defines', () => {
        const dangling = Object.entries(apiHistory.pages).flatMap(([page, names]) =>
            names.filter((name) => !Object.hasOwn(apiHistory.symbols, name)).map((name) => `${page} -> ${name}`),
        );

        expect(dangling).toEqual([]);
    });

    it('dates every symbol at or below the unreleased version', () => {
        const ahead = Object.entries(apiHistory.symbols)
            .filter(([, symbol]) => compareVersions(symbol.since, apiHistory.unreleasedVersion) > 0)
            .map(([name]) => name);

        expect(ahead).toEqual([]);
    });
});
