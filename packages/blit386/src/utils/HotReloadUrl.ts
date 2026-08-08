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
 * Inserted before any fragment identifier (`#...`) rather than after it – a query string
 * appended past a fragment is invalid URL syntax and browsers treat it as part of the
 * fragment, so the parameter would never actually reach the server.
 *
 * The busted URL is only ever used for the actual `fetch`/`Image.src` request –
 * callers keep caching the result under the original, un-busted `url`.
 *
 * @param url – Original request URL.
 * @returns `url` with a `blit386-hmr=<timestamp>` query parameter inserted before any fragment.
 */
export function appendCacheBustQuery(url: string): string {
    const fragmentIndex = url.indexOf('#');
    const base = fragmentIndex === -1 ? url : url.slice(0, fragmentIndex);
    const fragment = fragmentIndex === -1 ? '' : url.slice(fragmentIndex);
    const separator = base.includes('?') ? '&' : '?';

    return `${base}${separator}blit386-hmr=${Date.now()}${fragment}`;
}

/**
 * Normalizes a URL to its pathname against the document's base URL, so hot-reload registry
 * lookups match regardless of superficial differences (relative vs. rooted paths, or a
 * trailing query string).
 *
 * Resolves against `document.baseURI` rather than `location.origin` - a relative URL passed
 * to `Image.src`/`fetch` is resolved by the browser against the document's base (the page's
 * own URL, or an explicit `<base href>`), not just its origin, so a page served from a nested
 * path (for example `/games/my-game/`) needs the same resolution here to produce a matching key.
 *
 * @param url – URL to normalize.
 * @returns Normalized pathname, for example `/images/hero.png`.
 */
export function normalizeAssetUrl(url: string): string {
    return new URL(url, document.baseURI).pathname;
}
