/**
 * Hot-reload snippet injection for the `blit386` Vite plugin: appends a tiny snippet to a
 * demo/game's entry module so it registers with the engine's hot-swap runtime (`src/hot/`).
 *
 * Also does a plain-JS entry's only syntax check (see {@link checkPlainJsSyntax}): Vite's own
 * default transform pipeline excludes `.js`/`.mjs` from server-side parsing, so without this a
 * broken entry module surfaces only as a caught client-side `import()` rejection - logged, but
 * never shown in Vite's error overlay (BT-318).
 */

import { parse } from 'acorn';
import MagicString from 'magic-string';

/** Marker comment guarding injection against running twice on the same module (idempotency). */
export const INJECTION_MARKER = '/* blit386:hot-reload-snippet */';

/**
 * Snippet appended to a matched entry module, verbatim. The literal `import.meta.hot.accept()` call
 * must appear in the emitted source - Vite marks self-accepting modules by static analysis, so an
 * indirect call would not register self-acceptance and every edit would fall back to a full reload.
 *
 * `registerHotReload` is imported under a plugin-specific alias: importing it under its own name would
 * be a duplicate lexical declaration - a hard `SyntaxError` - if the entry module already imports or
 * declares a `registerHotReload` binding of its own (for example, a game that wired hot reload by hand
 * before adopting this plugin).
 */
const SNIPPET = `
${INJECTION_MARKER}
import { registerHotReload as __blit386_registerHotReload } from 'blit386';
if (import.meta.hot) {
    import.meta.hot.accept();
    __blit386_registerHotReload(import.meta.hot);
}
`;

/** Substring identifying a `bootstrap(` call site in a module's source. */
const BOOTSTRAP_CALL_TOKEN = 'bootstrap(';

/** Matches a `from 'blit386'` or `from "blit386"` import specifier. */
const BLIT386_IMPORT_PATTERN = /from\s*['"]blit386['"]/;

/**
 * Matches a plain JS module id (ignoring any query suffix) - the extensions Vite's own default
 * transform pipeline excludes from server-side parsing. `.ts`/`.mts` are deliberately not matched:
 * they already get real syntax validation from Vite's own transform, and acorn (a plain-ES parser)
 * would reject valid TypeScript-only syntax as a false positive.
 */
const PLAIN_JS_MODULE_ID_PATTERN = /\.m?js$/;

/**
 * A syntax error found by {@link checkPlainJsSyntax}, shaped for a Rollup/Vite plugin context's
 * `this.error(message, pos)` call.
 */
export interface PlainJsSyntaxError {
    /** Parser error message. */
    message: string;

    /** Character offset into `code` where the error was raised. */
    pos: number;
}

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
 * Syntax-checks a plain `.js`/`.mjs` module id's source. No-ops (`null`) for any other extension -
 * `.ts`/`.mts` entries are already validated by Vite's own transform pipeline before this plugin's
 * `transform` hook ever runs, and acorn cannot parse TypeScript-only syntax.
 *
 * A non-`SyntaxError` parse failure (acorn hitting something unexpected in valid-looking code) is
 * treated as a no-op rather than surfaced: this check exists to close a gap in Vite's own error
 * reporting, not to become a second, stricter parser gate on top of it.
 *
 * @param code - Module source, pre-transform.
 * @param id - Module id (path, possibly with a query suffix).
 * @returns The first syntax error found, or `null` when `id` isn't plain JS or `code` parses cleanly.
 */
export function checkPlainJsSyntax(code: string, id: string): PlainJsSyntaxError | null {
    const [pathWithoutQuery = id] = id.split('?');

    if (!PLAIN_JS_MODULE_ID_PATTERN.test(pathWithoutQuery)) {
        return null;
    }

    try {
        parse(code, { ecmaVersion: 'latest', sourceType: 'module' });

        return null;
    } catch (err) {
        if (err instanceof SyntaxError && 'pos' in err && typeof err.pos === 'number') {
            return { message: err.message, pos: err.pos };
        }

        return null;
    }
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
