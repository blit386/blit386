/**
 * Unit tests for {@link resolveIsWatch} and {@link createDeclarationPlugins}.
 *
 * Guards the BT-426 fix: a Vite watch build must never run api-extractor's declaration
 * rollup, since it crashes on every rebuild after the first. Only the final, non-watch
 * production build may write `dist/blit386.d.ts`. Vite spells the flag `-w, --watch`, so
 * both spellings have to be recognized.
 */

import { describe, expect, it } from 'vitest';

import { createDeclarationPlugins, resolveIsWatch } from './vite.config';

describe('resolveIsWatch', () => {
    it('detects the long --watch flag', () => {
        expect(resolveIsWatch(['vite', 'build', '--watch'])).toBe(true);
    });

    it('detects the -w shorthand', () => {
        expect(resolveIsWatch(['vite', 'build', '-w'])).toBe(true);
    });

    it('detects a watch flag regardless of its position in argv', () => {
        expect(resolveIsWatch(['-w', 'vite', 'build'])).toBe(true);
    });

    it('reports a normal production build as non-watch', () => {
        expect(resolveIsWatch(['vite', 'build'])).toBe(false);
    });

    it('reports empty argv as non-watch', () => {
        expect(resolveIsWatch([])).toBe(false);
    });
});

describe('createDeclarationPlugins', () => {
    it('emits no declaration plugin under watch', () => {
        expect(createDeclarationPlugins(true)).toEqual([]);
    });

    it('emits a single declaration plugin for a production build', () => {
        expect(createDeclarationPlugins(false)).toHaveLength(1);
    });
});
