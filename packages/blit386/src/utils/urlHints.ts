/**
 * Shared URL hint helpers for beginner-friendly "can't find this file" error
 * messages.
 *
 * Used by `BitmapFont` and the `AudioClip` error message builders so the
 * explicit-location check, folder hint, and extension-parsing logic are
 * defined once instead of duplicated per asset type.
 */

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
    let explicit = lowerUrl.includes('://');

    if (!explicit) {
        explicit = EXPLICIT_URL_SCHEME_PREFIXES.some((prefix) => lowerUrl.startsWith(prefix));
    }

    if (!explicit) {
        explicit = EXPLICIT_PATH_PREFIXES.some((prefix) => url.startsWith(prefix));
    }

    return explicit;
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
    const fileName = url.slice(url.lastIndexOf('/') + 1).replace(/[?#].*$/, '');
    const dotIndex = fileName.lastIndexOf('.');

    return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '';
}
