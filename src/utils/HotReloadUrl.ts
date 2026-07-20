/**
 * Shared URL helpers for the engine's dev-only asset hot-replace path.
 *
 * Used by `AssetLoader`, `SpriteSheet`, `AudioClip`, and `BitmapFont` to cache-bust
 * a re-fetched asset while keeping its original cache key, and to canonicalize URLs
 * for hot-reload registry lookups that may see slightly different-looking but
 * equivalent URLs (relative vs. rooted, or a `blit386:asset-changed` payload URL
 * that formats a path differently than a demo's original load call).
 */

/**
 * Appends a cache-busting query parameter carrying the current timestamp, so a
 * re-fetch of an unchanged URL bypasses the browser's HTTP cache.
 *
 * The busted URL is only ever used for the actual `fetch`/`Image.src` request –
 * callers keep caching the result under the original, un-busted `url`.
 *
 * @param url - Original request URL.
 * @returns `url` with a `blit386-hmr=<timestamp>` query parameter appended.
 */
export function appendCacheBustQuery(url: string): string {
    return `${url}${url.includes('?') ? '&' : '?'}blit386-hmr=${Date.now()}`;
}

/**
 * Normalizes a URL to its pathname against the page origin, so hot-reload registry
 * lookups match regardless of superficial differences (relative vs. rooted paths,
 * or a trailing query string).
 *
 * @param url - URL to normalize.
 * @returns Normalized pathname, for example `/images/hero.png`.
 */
export function normalizeAssetUrl(url: string): string {
    return new URL(url, location.origin).pathname;
}
