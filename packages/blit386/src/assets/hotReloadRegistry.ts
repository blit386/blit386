/**
 * Dev-only registry of live assets keyed by normalized source URL, shared by `SpriteSheet`
 * and `BitmapFont`, so `HotRuntime.handleAssetChanged` can find every asset loaded from a
 * changed file. Callers check `isHotActive()` before adding: importing `HotRuntime` here
 * would close an import cycle through `HotRuntime` back to both asset classes.
 */

import { normalizeAssetUrl } from '../utils/HotReloadUrl';

/**
 * Live assets grouped by normalized source URL.
 */
export class HotReloadRegistry<T> {
    /** Assets per normalized source URL; a bucket is removed once it empties. */
    private readonly buckets = new Map<string, Set<T>>();

    /**
     * Registers `item` under `url`. Call only while hot reload is active, so production pays nothing.
     *
     * @param url - Source URL the asset was loaded from.
     * @param item - Asset to register.
     */
    add(url: string, item: T): void {
        const key = normalizeAssetUrl(url);
        const bucket = this.buckets.get(key) ?? new Set<T>();

        bucket.add(item);
        this.buckets.set(key, bucket);
    }

    /**
     * Returns every asset registered under a URL matching `url` after normalization.
     *
     * @param url - Changed asset URL to look up.
     * @returns Matching assets, or `undefined` when none are registered.
     */
    get(url: string): ReadonlySet<T> | undefined {
        return this.buckets.get(normalizeAssetUrl(url));
    }

    /**
     * Removes `item` from the bucket for `url`, dropping the bucket once it is empty.
     *
     * @param url - Source URL the asset was registered under.
     * @param item - Asset to remove.
     */
    delete(url: string, item: T): void {
        const key = normalizeAssetUrl(url);
        const bucket = this.buckets.get(key);

        bucket?.delete(item);

        if (bucket?.size === 0) {
            this.buckets.delete(key);
        }
    }
}
