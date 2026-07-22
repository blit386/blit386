import { assertImageElementWithinLimits } from '../utils/AssetLimits';
import { appendCacheBustQuery } from '../utils/HotReloadUrl';

/**
 * Successfully loaded images keyed by request URL.
 *
 * This acts as the resolved asset cache for callers that want instant reuse of
 * images that have already completed loading.
 */
const loadedImages = new Map<string, HTMLImageElement>();

/**
 * In-flight image requests keyed by request URL.
 *
 * Keeping pending promises here lets concurrent callers share the same browser
 * load rather than creating duplicate `Image` instances for the same asset.
 */
const loadingPromises = new Map<string, Promise<HTMLImageElement>>();

/**
 * Raster image file extensions accepted by {@link AssetLoader.loadImage}.
 * Allocated once at module load; checked inside {@link buildExtensionHint}.
 */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);

/**
 * Returns whether a URL is absolute or uses a special browser scheme.
 *
 * @param url - Path or URL to inspect.
 * @returns True when the URL already has an explicit scheme.
 */
function isExplicitUrl(url: string): boolean {
    const lowerUrl = url.toLowerCase();

    // URL scheme prefixes that identify an absolute or special-scheme URL.
    // Checked after the `://` shortcut in {@link isExplicitUrl}.
    const specialSchemePrefixes = ['//', 'data:', 'blob:'] as const;

    // Lowercase scheme prefixes treated as explicit browser locations (after `://` check).
    return lowerUrl.includes('://') || specialSchemePrefixes.some((prefix) => lowerUrl.startsWith(prefix));
}

/**
 * Returns whether a URL already points at an explicit location: an absolute URL,
 * a special browser scheme, or a rooted/relative (`/`, `./`) path. When this is
 * false, the caller suggests an `images/` location.
 *
 * @param url - Path or URL to inspect.
 * @returns True when the URL needs no `images/` prefix hint.
 */
function hasExplicitLocation(url: string): boolean {
    // Path prefixes that already point at an explicit location,
    // so no `images/` directory hint is appended in error messages.
    const rootedPathPrefixes = ['/', './'] as const;

    // URL prefixes that already point at an explicit location, so no `images/` hint is needed.
    return isExplicitUrl(url) || rootedPathPrefixes.some((prefix) => url.startsWith(prefix));
}

/**
 * Extracts the lowercase file extension (including the dot) from a URL,
 * ignoring any query string or fragment.
 *
 * @param url - Path or URL to inspect.
 * @returns Extension like `.png`, or an empty string when none is present.
 */
function extractExtension(url: string): string {
    const path = url.split(/[?#]/)[0] ?? url;
    const fileName = path.slice(path.lastIndexOf('/') + 1);
    const dotIndex = fileName.lastIndexOf('.');

    return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '';
}

/**
 * Builds the extension-specific hint for a failing image URL.
 *
 * @param extension - Lowercase extension including the dot (or empty string).
 * @returns Hint text, or null when the extension warrants no hint.
 */
function buildExtensionHint(extension: string): string | null {
    let hint: string | null = null;

    if (extension === '.btfont') {
        hint = "This looks like a font file. For images, use a file that ends with '.png'.";
    } else if (extension !== '' && !IMAGE_EXTENSIONS.has(extension)) {
        hint = `The extension '${extension}' does not look like an image file. Did you mean '.png'?`;
    }

    return hint;
}

/**
 * Appends beginner-friendly path and extension hints for image URLs.
 *
 * @param url - Failing image path.
 * @returns Extra hint text (or empty string when no hint applies).
 */
function buildImageHints(url: string): string {
    const pathHint = hasExplicitLocation(url) ? null : `Did you mean '/images/${url}' or './images/${url}'?`;
    const hints = [pathHint, buildExtensionHint(extractExtension(url))].filter((hint): hint is string => hint !== null);

    return hints.length > 0 ? ` ${hints.join(' ')}` : '';
}

/**
 * Builds the rejection error for a failed browser image load.
 *
 * @param url - Path or URL that failed to load.
 * @returns Error with path, extension, and location hints.
 */
function buildImageNotFoundError(url: string): Error {
    return new Error(
        `Can't find the image '${url}'. Make sure it's in your project folder and the path is correct. ` +
            'Check for typos, wrong letter casing, or a missing file extension.' +
            buildImageHints(url),
    );
}

/**
 * Removes an in-flight entry so a later request can retry the same URL.
 *
 * @param url - Path or URL whose pending load should be cleared.
 */
function clearInFlight(url: string): void {
    loadingPromises.delete(url);
}

/**
 * Monotonic per-cache-key generation counter.
 *
 * Bumped whenever a fresh load starts for a key ({@link startLoading}) or the key is
 * explicitly evicted ({@link AssetLoader.evict}), so a superseded in-flight request's
 * `onload`/`onerror` handler can tell it is no longer the current request for that key and
 * skip mutating the shared caches - otherwise a stale request that finishes after a newer one
 * (or after an eviction) could silently overwrite the correct result with old data.
 */
const loadGenerations = new Map<string, number>();

/**
 * Advances and returns the generation for `cacheKey`.
 *
 * @param cacheKey - Cache key whose generation should advance.
 * @returns The new, current generation number for `cacheKey`.
 */
function bumpGeneration(cacheKey: string): number {
    const generation = (loadGenerations.get(cacheKey) ?? 0) + 1;

    loadGenerations.set(cacheKey, generation);

    return generation;
}

/**
 * Reports whether `generation` is still the current one for `cacheKey`.
 *
 * @param cacheKey - Cache key to check.
 * @param generation - Generation captured when the request being checked started.
 * @returns `true` if no newer load or eviction has superseded `generation`.
 */
function isCurrentGeneration(cacheKey: string, generation: number): boolean {
    return loadGenerations.get(cacheKey) === generation;
}

/**
 * Starts a browser image load and registers the in-flight promise.
 *
 * The returned promise always settles with this specific request's own outcome, even once
 * superseded - only the shared `loadedImages`/`loadingPromises` caches are skipped for a
 * superseded request, via the {@link loadGenerations} guard, so a stale completion can never
 * clobber a newer load's result.
 *
 * @param fetchUrl - Path or URL to actually request (may carry a hot-reload cache-bust query).
 * @param cacheKey - Key to cache the result and track the in-flight load under. Defaults to
 *   `fetchUrl` for a normal load; a hot reload passes the original, un-busted URL here so the
 *   result re-caches under the same key callers already hold.
 * @returns Promise that resolves to the loaded image element.
 */
function startLoading(fetchUrl: string, cacheKey: string = fetchUrl): Promise<HTMLImageElement> {
    const generation = bumpGeneration(cacheKey);

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            const isCurrent = isCurrentGeneration(cacheKey, generation);

            if (isCurrent) {
                clearInFlight(cacheKey);
            }

            try {
                assertImageElementWithinLimits('image', img);

                if (isCurrent) {
                    loadedImages.set(cacheKey, img);
                }

                resolve(img);
            } catch (error) {
                reject(error);
            }
        };

        img.onerror = () => {
            if (isCurrentGeneration(cacheKey, generation)) {
                clearInFlight(cacheKey);
            }

            reject(buildImageNotFoundError(cacheKey));
        };

        img.src = fetchUrl;
    });

    loadingPromises.set(cacheKey, promise);

    return promise;
}

/**
 * Shared image-loading utility for runtime asset code.
 *
 * `AssetLoader` exposes a small static API that:
 * - loads individual images or batches of images
 * - caches successfully resolved `HTMLImageElement` instances by URL
 * - deduplicates concurrent requests for the same URL
 * - exposes cache inspection and reset helpers for engine code and tests
 *
 * @since 0.1.0
 */
export class AssetLoader {
    /**
     * Gets the number of image loads currently in flight.
     *
     * @since 1.4.0
     * @returns Count of URLs with a pending {@link AssetLoader.loadImage} or
     *   {@link AssetLoader.hotReloadImage} request.
     */
    static get loadingCount(): number {
        return loadingPromises.size;
    }

    /**
     * Loads an image and caches the resolved element by URL.
     *
     * Reuses an already-cached image immediately and shares a single in-flight
     * promise when multiple callers request the same URL concurrently.
     *
     * @param url - Path or URL to the image file.
     * @returns Loaded image element for the requested URL.
     * @throws Error if the image cannot be loaded.
     */
    static async loadImage(url: string): Promise<HTMLImageElement> {
        return loadedImages.get(url) ?? loadingPromises.get(url) ?? (await startLoading(url));
    }

    /**
     * Loads multiple images concurrently.
     *
     * @param urls - Array of image paths or URLs.
     * @returns Loaded image elements in the same order as `urls`.
     * @throws Error if any requested image fails to load.
     */
    static async loadImages(urls: string[]): Promise<HTMLImageElement[]> {
        return Promise.all(urls.map((url) => AssetLoader.loadImage(url)));
    }

    /**
     * Checks if an image is already loaded and cached.
     *
     * @param url - Path or URL to check.
     * @returns `true` if the image is already cached and ready to use.
     */
    static isLoaded(url: string): boolean {
        return loadedImages.has(url);
    }

    /**
     * Returns a previously loaded image from the cache without starting a new request.
     *
     * @param url - Path or URL of the cached image.
     * @returns The cached image, or null if not loaded.
     */
    static getImage(url: string): HTMLImageElement | null {
        return loadedImages.get(url) ?? null;
    }

    /**
     * Removes a URL's cached image and any in-flight load, so a later call to
     * {@link AssetLoader.loadImage} starts fresh.
     *
     * Also bumps the URL's load generation, so an in-flight request that was already under way
     * before this call can no longer repopulate the cache once it completes - see
     * {@link isCurrentGeneration}.
     *
     * @param url - Path or URL whose cache entry (and in-flight load, if any) should be evicted.
     * @returns `true` if a cached image was removed; `false` if nothing was cached under `url`.
     * @since 1.4.0
     */
    static evict(url: string): boolean {
        bumpGeneration(url);

        const removed = loadedImages.delete(url);

        loadingPromises.delete(url);

        return removed;
    }

    /**
     * Re-loads an already-cached image with a cache-busted request, re-caching the
     * result under the original `url` key so demo-held references from
     * {@link AssetLoader.getImage} stay valid.
     *
     * Internal – routed from `HotRuntime.handleAssetChanged` when the dev asset
     * watcher reports a changed image file.
     *
     * @param url - Cache key (and fetch URL) of the image to hot-reload.
     * @returns The freshly loaded image element, cached under `url`.
     * @throws Error if the cache-busted image fails to load.
     */
    static async hotReloadImage(url: string): Promise<HTMLImageElement> {
        return startLoading(appendCacheBustQuery(url), url);
    }

    /**
     * Clears all in-memory caches. In-flight image requests aren't aborted
     * and may repopulate the cache once complete.
     *
     * Primarily intended for tests or explicit asset-lifecycle resets.
     */
    static clear(): void {
        loadedImages.clear();
        loadingPromises.clear();
    }
}
