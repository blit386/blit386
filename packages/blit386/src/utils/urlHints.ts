/**
 * Shared URL hint helpers for beginner-friendly "can't find this file" error
 * messages.
 *
 * Used by `AssetLoader`, the `.btfont` loader (`btfontFile`), and the audio
 * error message builders so the explicit-location check, folder hint, and
 * extension-parsing logic are defined once instead of duplicated per asset type.
 */

import { resolveAgainstDocument } from './HotReloadUrl';

/** URL scheme prefixes that already point at an explicit location. */
const EXPLICIT_URL_SCHEME_PREFIXES = ['//', 'data:', 'blob:'] as const;

/** Path prefixes that already point at an explicit location. */
const EXPLICIT_PATH_PREFIXES = ['/', './'] as const;

/**
 * Returns whether a URL already points at an explicit location: an absolute
 * URL, a special browser scheme, or a rooted/relative (`/`, `./`) path.
 *
 * @param url - Path or URL to inspect.
 * @returns True when no relative-path hint is needed.
 */
export function hasExplicitLocation(url: string): boolean {
    const lowerUrl = url.toLowerCase();

    return (
        lowerUrl.includes('://') ||
        EXPLICIT_URL_SCHEME_PREFIXES.some((prefix) => lowerUrl.startsWith(prefix)) ||
        EXPLICIT_PATH_PREFIXES.some((prefix) => url.startsWith(prefix))
    );
}

/** Image URL schemes the browser loads under CORS rules (`data:` and `blob:` never need CORS). */
const CORS_IMAGE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:', 'file:']);

/** Serialized origin of a page opened from a file or running in a sandboxed frame. */
const OPAQUE_ORIGIN = 'null';

/** Hint for an image on another site than the page. */
const OTHER_SITE_IMAGE_HINT =
    'If the address is right, this image is on another site, which must send CORS headers' +
    " (Access-Control-Allow-Origin). Otherwise put the image on your page's own site, or embed it as a data: URL";

/** Hint for an image loaded by a page with no origin of its own. */
const OPAQUE_ORIGIN_IMAGE_HINT =
    'This page has no web address of its own (opened from a file, or in a sandboxed frame).' +
    ' Serve it from a local web server, or embed the image as a data: URL';

/**
 * Builds the CORS hint for an image that failed to load. The engine loads every image with CORS because it reads
 * their pixels, so an image on another site, or any image on a page with no origin, fails unless CORS allows it.
 *
 * @param url - Failing image path or URL.
 * @returns Hint text, or an empty string when CORS cannot be the cause (same site, `data:`, `blob:`, or a URL that
 *   does not parse, which the base message already covers).
 */
export function buildCorsImageHint(url: string): string {
    let imageUrl: URL;

    try {
        imageUrl = resolveAgainstDocument(url);
    } catch {
        return '';
    }

    if (!CORS_IMAGE_PROTOCOLS.has(imageUrl.protocol)) {
        return '';
    }

    if (globalThis.origin === OPAQUE_ORIGIN) {
        return OPAQUE_ORIGIN_IMAGE_HINT;
    }

    return imageUrl.origin === resolveAgainstDocument('/').origin ? '' : OTHER_SITE_IMAGE_HINT;
}

/**
 * Suggests common absolute and relative URL forms when the path looks ambiguous.
 *
 * @param url - Original URL string.
 * @param folderName - Typical folder prefix to suggest (for example `'fonts'` or `'audio'`).
 * @returns Hint text, or an empty string when the path already looks explicit.
 */
export function buildPathHint(url: string, folderName: string): string {
    let hint = '';

    if (!hasExplicitLocation(url)) {
        hint = `Did you mean '/${folderName}/${url}' or './${folderName}/${url}'?`;
    }

    return hint;
}

/**
 * Extracts the lowercase file extension (including the dot) from a URL,
 * ignoring any query string or fragment.
 *
 * @param url - Path or URL to inspect.
 * @returns Extension like `.png`, or an empty string when none is present.
 */
export function extractExtension(url: string): string {
    const path = url.split(/[?#]/)[0] ?? url;
    const fileName = path.slice(path.lastIndexOf('/') + 1);
    const dotIndex = fileName.lastIndexOf('.');

    return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '';
}
