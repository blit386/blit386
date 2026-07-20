/**
 * Hot-reload snippet injection for the `blit386` Vite plugin: appends a tiny snippet to a
 * demo/game's entry module so it registers with the engine's hot-swap runtime (`src/hot/`).
 */

import MagicString from 'magic-string';

/** Marker comment guarding injection against running twice on the same module (idempotency). */
export const INJECTION_MARKER = '/* blit386:hot-reload-snippet */';

/**
 * Snippet appended to a matched entry module, verbatim. The literal `import.meta.hot.accept()` call
 * must appear in the emitted source - Vite marks self-accepting modules by static analysis, so an
 * indirect call would not register self-acceptance and every edit would fall back to a full reload.
 */
const SNIPPET = `
${INJECTION_MARKER}
import { registerHotReload } from 'blit386';
if (import.meta.hot) {
    import.meta.hot.accept();
    registerHotReload(import.meta.hot);
}
`;

/** Substring identifying a `bootstrap(` call site in a module's source. */
const BOOTSTRAP_CALL_TOKEN = 'bootstrap(';

/** Matches a `from 'blit386'` or `from "blit386"` import specifier. */
const BLIT386_IMPORT_PATTERN = /from\s*['"]blit386['"]/;

/**
 * Reports whether a module should get the hot-reload snippet appended.
 *
 * @param code - Module source, pre-transform.
 * @param id - Module id (path, possibly with a query suffix).
 * @param include - Predicate selecting eligible module ids.
 * @returns `true` when `id` matches `include`, `code` calls `bootstrap(` and imports from `'blit386'`, and the
 *   injection marker is not already present.
 */
export function shouldInjectSnippet(code: string, id: string, include: (id: string) => boolean): boolean {
    if (!include(id)) {
        return false;
    }

    if (code.includes(INJECTION_MARKER)) {
        return false;
    }

    return code.includes(BOOTSTRAP_CALL_TOKEN) && BLIT386_IMPORT_PATTERN.test(code);
}

/**
 * Appends the hot-reload snippet to `code` using `magic-string`, producing a sourcemap. Appends rather
 * than prepends, keeping the sourcemap trivial.
 *
 * @param code - Module source, pre-transform.
 * @returns Transformed code and sourcemap, matching the `transform` plugin hook's return shape.
 */
export function injectSnippet(code: string): { code: string; map: ReturnType<MagicString['generateMap']> } {
    const s = new MagicString(code);

    s.append(SNIPPET);

    return { code: s.toString(), map: s.generateMap({ hires: true }) };
}
