// @vitest-environment happy-dom

/**
 * Unit tests for the shared hot-reload URL helpers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appendCacheBustQuery, normalizeAssetUrl } from './HotReloadUrl';

describe('HotReloadUrl', () => {
    describe('appendCacheBustQuery', () => {
        beforeEach(() => {
            vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('appends a ? query when the URL has none', () => {
            expect(appendCacheBustQuery('sprites/hero.png')).toBe('sprites/hero.png?blit386-hmr=1700000000000');
        });

        it('appends an & continuation when the URL already has a query string', () => {
            expect(appendCacheBustQuery('sprites/hero.png?v=2')).toBe('sprites/hero.png?v=2&blit386-hmr=1700000000000');
        });

        it('uses the current timestamp on every call', () => {
            vi.spyOn(Date, 'now').mockReturnValueOnce(1).mockReturnValueOnce(2);

            expect(appendCacheBustQuery('a.png')).toBe('a.png?blit386-hmr=1');
            expect(appendCacheBustQuery('a.png')).toBe('a.png?blit386-hmr=2');
        });

        it('inserts the query before a fragment identifier, not after it', () => {
            expect(appendCacheBustQuery('sprites.png#atlas')).toBe('sprites.png?blit386-hmr=1700000000000#atlas');
        });

        it('inserts the query before a fragment even when a query string is already present', () => {
            expect(appendCacheBustQuery('sprites.png?v=2#atlas')).toBe(
                'sprites.png?v=2&blit386-hmr=1700000000000#atlas',
            );
        });
    });

    describe('normalizeAssetUrl', () => {
        it('resolves a rooted path to its pathname', () => {
            expect(normalizeAssetUrl('/images/hero.png')).toBe('/images/hero.png');
        });

        it('resolves a relative path against the page origin', () => {
            expect(normalizeAssetUrl('images/hero.png')).toBe('/images/hero.png');
        });

        it('strips a query string', () => {
            expect(normalizeAssetUrl('/images/hero.png?v=2')).toBe('/images/hero.png');
        });

        it('treats equivalent relative and rooted forms as the same pathname', () => {
            expect(normalizeAssetUrl('./images/hero.png')).toBe(normalizeAssetUrl('/images/hero.png'));
        });

        it('resolves a relative URL against a nested document base, not just the origin', () => {
            const originalBaseURI = document.baseURI;

            Object.defineProperty(document, 'baseURI', {
                value: 'http://localhost:3000/games/my-game/index.html',
                configurable: true,
            });

            try {
                // A browser resolves <img src="images/hero.png"> against the document's own
                // directory, not the domain root - the normalized key must match that, or a
                // sheet loaded on a nested page would never be found by the hot-reload registry.
                expect(normalizeAssetUrl('images/hero.png')).toBe('/games/my-game/images/hero.png');
            } finally {
                Object.defineProperty(document, 'baseURI', {
                    value: originalBaseURI,
                    configurable: true,
                });
            }
        });
    });
});
