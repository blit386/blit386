/** Matches demo registry titles: "BLIT386 Demo 006 - Patterns". */
const REGISTRY_TITLE_PATTERN = /^BLIT386 Demo\s+.+?\s+-\s+(.+)$/;

/**
 * Turns the browser page title into a short top-left overlay label.
 *
 * @param pageTitle - Browser document title when available.
 * @returns Short label for the top-left bar (registry titles such as
 *   `BLIT386 Demo 002 - Primitives` become `Primitives Demo`).
 */
export function resolveOverlayTopLeftLabel(pageTitle: string | undefined): string {
    const raw = typeof pageTitle === 'string' ? pageTitle.trim() : '';

    if (raw.length === 0) {
        return 'Demo';
    }

    const match = raw.match(REGISTRY_TITLE_PATTERN);

    if (match) {
        return `${match[1]} Demo`;
    }

    return raw;
}
