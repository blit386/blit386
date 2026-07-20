/**
 * Unit tests for {@link AssetLoader}.
 *
 * Verifies the image-loading contract exposed to the rest of the asset
 * pipeline:
 * - cache inspection and reset helpers
 * - single, batched, and concurrent image loads
 * - deduplication of in-flight requests
 * - rejection and cache cleanup when loads fail
 *
 * Browser image loading is simulated with stubbed `Image` globals so the suite
 * stays deterministic and does not depend on network or DOM behavior.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetLimitError, MAX_ASSET_DIMENSION } from '../utils/AssetLimits';
import { AssetLoader } from './AssetLoader';

afterEach(() => {
    AssetLoader.clear();
});

describe('AssetLoader', () => {
    describe('cache management', () => {
        it('should report isLoaded as false for an unloaded URL', () => {
            expect(AssetLoader.isLoaded('never-loaded.png')).toBe(false);
        });

        it('should return null from getImage for an unloaded URL', () => {
            expect(AssetLoader.getImage('never-loaded.png')).toBeNull();
        });

        it('should clear the cache', () => {
            // Verify clear doesn't throw on empty cache.
            AssetLoader.clear();

            expect(AssetLoader.isLoaded('test.png')).toBe(false);
        });

        it('should report getImage as null after clear', async () => {
            vi.stubGlobal(
                'Image',
                class {
                    onload: (() => void) | null = null;
                    onerror: (() => void) | null = null;
                    width = 100;
                    height = 100;

                    set src(_: string) {
                        this.onload?.();
                    }
                },
            );

            try {
                await AssetLoader.loadImage('before-clear.png');

                expect(AssetLoader.isLoaded('before-clear.png')).toBe(true);

                AssetLoader.clear();

                expect(AssetLoader.getImage('before-clear.png')).toBeNull();
            } finally {
                vi.unstubAllGlobals();
            }
        });
    });

    describe('image loading', () => {
        let createCount = 0;

        beforeEach(() => {
            createCount = 0;

            vi.stubGlobal(
                'Image',
                class {
                    onload: (() => void) | null = null;
                    onerror: (() => void) | null = null;
                    width = 100;
                    height = 100;

                    private _src = '';

                    get src(): string {
                        return this._src;
                    }

                    set src(value: string) {
                        this._src = value;

                        createCount++;

                        this.onload?.();
                    }
                },
            );
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('should load a single image from a URL', async () => {
            const img = await AssetLoader.loadImage('test.png');

            expect(img).toBeDefined();
            expect(AssetLoader.isLoaded('test.png')).toBe(true);
        });

        it('should return the cached image on subsequent calls', async () => {
            const first = await AssetLoader.loadImage('cached.png');
            const second = await AssetLoader.loadImage('cached.png');

            expect(second).toBe(first);
            expect(createCount).toBe(1);
        });

        it('should load multiple images in parallel', async () => {
            const images = await AssetLoader.loadImages(['img-a.png', 'img-b.png']);

            expect(images).toHaveLength(2);
            expect(AssetLoader.isLoaded('img-a.png')).toBe(true);
            expect(AssetLoader.isLoaded('img-b.png')).toBe(true);
        });

        it('should deduplicate concurrent requests for the same URL', async () => {
            const [first, second] = await Promise.all([
                AssetLoader.loadImage('shared.png'),
                AssetLoader.loadImage('shared.png'),
            ]);

            expect(first).toBe(second);
            expect(createCount).toBe(1);
        });
    });

    describe('error handling', () => {
        beforeEach(() => {
            vi.stubGlobal(
                'Image',
                class {
                    onload: (() => void) | null = null;
                    onerror: (() => void) | null = null;
                    width = 100;
                    height = 100;
                    private _src = '';

                    get src(): string {
                        return this._src;
                    }

                    set src(value: string) {
                        this._src = value;

                        // Simulate error for URLs containing 'fail'
                        if (value.includes('fail')) {
                            this.onerror?.();
                        } else {
                            this.onload?.();
                        }
                    }
                },
            );
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('should reject when the image fails to load', async () => {
            await expect(AssetLoader.loadImage('fail.png')).rejects.toThrow(
                "Can't find the image 'fail.png'. Make sure it's in your project folder and the path is correct.",
            );
        });

        it('should not cache images that failed to load', async () => {
            try {
                await AssetLoader.loadImage('fail.png');
            } catch {
                // Expected
            }

            expect(AssetLoader.isLoaded('fail.png')).toBe(false);
            expect(AssetLoader.getImage('fail.png')).toBeNull();
        });

        it('should reject loadImages when any image fails', async () => {
            await expect(AssetLoader.loadImages(['ok.png', 'fail.png'])).rejects.toThrow(
                "Can't find the image 'fail.png'. Make sure it's in your project folder and the path is correct.",
            );
        });

        it('should include a path hint when an image URL is missing / or ./', async () => {
            await expect(AssetLoader.loadImage('fail/sprites/hero.png')).rejects.toThrow(
                "Did you mean '/images/fail/sprites/hero.png' or './images/fail/sprites/hero.png'?",
            );
        });

        it('should reject oversized images after decode', async () => {
            vi.stubGlobal(
                'Image',
                class {
                    onload: (() => void) | null = null;
                    onerror: (() => void) | null = null;
                    width = MAX_ASSET_DIMENSION + 1;
                    height = 16;

                    set src(_: string) {
                        this.onload?.();
                    }
                },
            );

            await expect(AssetLoader.loadImage('huge.png')).rejects.toBeInstanceOf(AssetLimitError);
        });

        it('should suggest .png when a font extension is used for an image URL', async () => {
            await expect(AssetLoader.loadImage('fail/sprites/hero.btfont')).rejects.toThrow(
                "This looks like a font file. For images, use a file that ends with '.png'.",
            );
        });

        it('should not suggest font extension fix for png URLs with query suffixes', async () => {
            await expect(AssetLoader.loadImage('fail/sprites/hero.png?v=1')).rejects.not.toThrow(
                "This looks like a font file. For images, use a file that ends with '.png'.",
            );
        });
    });

    describe('evict', () => {
        beforeEach(() => {
            vi.stubGlobal(
                'Image',
                class {
                    onload: (() => void) | null = null;
                    onerror: (() => void) | null = null;
                    width = 100;
                    height = 100;

                    set src(_: string) {
                        this.onload?.();
                    }
                },
            );
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('returns false when nothing is cached under the URL', () => {
            expect(AssetLoader.evict('never-loaded.png')).toBe(false);
        });

        it('returns true and clears the cache entry when a cached image is evicted', async () => {
            await AssetLoader.loadImage('evict-me.png');
            expect(AssetLoader.isLoaded('evict-me.png')).toBe(true);

            expect(AssetLoader.evict('evict-me.png')).toBe(true);
            expect(AssetLoader.isLoaded('evict-me.png')).toBe(false);
            expect(AssetLoader.getImage('evict-me.png')).toBeNull();
        });

        it('allows a fresh load after eviction', async () => {
            const first = await AssetLoader.loadImage('reload-me.png');
            AssetLoader.evict('reload-me.png');
            const second = await AssetLoader.loadImage('reload-me.png');

            expect(second).not.toBe(first);
        });
    });

    describe('hotReloadImage', () => {
        let requestedUrls: string[];

        beforeEach(() => {
            requestedUrls = [];

            vi.stubGlobal(
                'Image',
                class {
                    onload: (() => void) | null = null;
                    onerror: (() => void) | null = null;
                    width = 100;
                    height = 100;

                    set src(value: string) {
                        requestedUrls.push(value);
                        this.onload?.();
                    }
                },
            );
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('re-caches the result under the original URL, not the busted one', async () => {
            await AssetLoader.loadImage('hot.png');

            const reloaded = await AssetLoader.hotReloadImage('hot.png');

            expect(reloaded).toBeDefined();
            expect(AssetLoader.isLoaded('hot.png')).toBe(true);
            expect(AssetLoader.getImage('hot.png')).toBe(reloaded);
        });

        it('requests the image with a cache-busting query parameter', async () => {
            await AssetLoader.hotReloadImage('bust.png');

            expect(requestedUrls).toHaveLength(1);
            expect(requestedUrls[0]).toMatch(/^bust\.png\?blit386-hmr=\d+$/);
        });

        it('replaces a previously cached image with the freshly loaded one', async () => {
            const before = await AssetLoader.loadImage('swap.png');
            const after = await AssetLoader.hotReloadImage('swap.png');

            expect(after).not.toBe(before);
            expect(AssetLoader.getImage('swap.png')).toBe(after);
        });

        it('rejects with an error keyed to the original URL when the reload fails', async () => {
            vi.stubGlobal(
                'Image',
                class {
                    onload: (() => void) | null = null;
                    onerror: (() => void) | null = null;
                    width = 100;
                    height = 100;

                    set src(_: string) {
                        this.onerror?.();
                    }
                },
            );

            await expect(AssetLoader.hotReloadImage('missing.png')).rejects.toThrow(
                "Can't find the image 'missing.png'",
            );
        });
    });

    describe('stale-completion safety', () => {
        /** Image stub whose `onload`/`onerror` must be fired manually, so tests control resolution order. */
        class DeferredImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            width = 100;
            height = 100;
            src = '';
        }

        let instances: DeferredImage[];

        beforeEach(() => {
            instances = [];

            vi.stubGlobal(
                'Image',
                class extends DeferredImage {
                    constructor() {
                        super();
                        instances.push(this);
                    }
                },
            );
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('keeps the newer hot-reloaded image when a superseded load resolves after it', async () => {
            const firstPromise = AssetLoader.hotReloadImage('race.png');
            const secondPromise = AssetLoader.hotReloadImage('race.png');

            expect(instances).toHaveLength(2);

            // The newer (second) request resolves first; the stale (first) one resolves after.
            instances[1]?.onload?.();
            const second = await secondPromise;

            instances[0]?.onload?.();
            await firstPromise;

            expect(AssetLoader.getImage('race.png')).toBe(second);
        });

        it('does not repopulate the cache when a stale in-flight load resolves after evict()', async () => {
            const promise = AssetLoader.loadImage('evicted.png');

            expect(instances).toHaveLength(1);

            AssetLoader.evict('evicted.png');

            instances[0]?.onload?.();
            await promise;

            expect(AssetLoader.getImage('evicted.png')).toBeNull();
        });
    });
});
