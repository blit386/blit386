/**
 * Enable the blit386 Vite hot-reload plugin in a project's vite.config source.
 *
 * Pure string rewrite aimed at the scaffolder template and the same shape of a single
 * `defineConfig({...})` object. Plugin detection and rewriting are scoped to that object - an
 * import from `blit386/vite` alone is not enough. Odd or hand-rolled configs (no unique
 * defineConfig object, CommonJS, etc.) are reported as unsupported so a human (or the
 * use-hot-reload skill) can finish the job.
 */

import { maskSource } from '../source-mask';

/** Outcome of inspecting / rewriting one vite.config source string. */
export type HotReloadViteStatus = 'already' | 'added' | 'missing-config' | 'unsupported' | 'skipped-engine';

/** Result of {@link enableHotReloadInViteConfig}. */
export interface HotReloadViteResult {
    /** Rewritten source (same as input when unchanged). */
    text: string;

    /** Whether `text` differs from the input. */
    changed: boolean;

    /** What happened. */
    status: HotReloadViteStatus;
}

/** Filenames we look for at the project root, in preference order (ESM only - no .cjs). */
export const VITE_CONFIG_NAMES = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts'] as const;

/** Engine version that first shipped `blit386/vite`. */
export const HOT_RELOAD_SINCE = '1.4.0';

const IMPORT_LINE = "import { blit386 } from 'blit386/vite';";

/** Plugin factory call: blit386() or blit386({...}), not an identifier that merely starts with blit386. */
const PLUGIN_CALL = /(?<![.\w$])blit386\s*\(/;

/**
 * Whether the source already mentions the hot-reload plugin (import or factory call).
 *
 * Prefer {@link enableHotReloadInViteConfig} for migrate decisions - import alone is not "wired up".
 */
export function hasBlit386VitePlugin(source: string): boolean {
    if (/from\s+['"]blit386\/vite['"]/.test(source)) {
        return true;
    }

    return PLUGIN_CALL.test(source);
}

/**
 * Locate the `{` … `}` of the single `defineConfig({ ... })` call in a masked source (see `maskSource`), so calls and
 * braces inside comments and strings do not count.
 *
 * Returns null when there is not exactly one match, or when braces do not balance.
 */
function findUniqueDefineConfigObject(masked: string): { openBrace: number; closeBrace: number } | null {
    const hits = [...masked.matchAll(/defineConfig\s*\(\s*\{/g)];
    const hit = hits.length === 1 ? hits[0] : undefined;
    if (hit?.index === undefined) {
        return null;
    }

    const openBrace = hit.index + hit[0].length - 1;
    let depth = 0;
    for (let i = openBrace; i < masked.length; i++) {
        if (masked[i] === '{') {
            depth++;
        } else if (masked[i] === '}' && --depth === 0) {
            return { openBrace, closeBrace: i };
        }
    }

    return null;
}

/**
 * Insert the `blit386/vite` import on the line after the last existing import statement, or at the top of the file.
 *
 * Searches a masked copy (comments and string contents blanked), so a statement spanning several lines is found whole
 * and a commented-out import counts for nothing. Returns null when code follows the last import on its own line (an
 * import attribute such as `with { type: 'json' }`, or a second statement), where no insertion point is safe.
 */
function insertImport(source: string): string | null {
    if (/from\s+['"]blit386\/vite['"]/.test(maskSource(source, true))) {
        return source;
    }

    // An import statement ends at its module string: `import x from 'm'`, `import { a,\n b } from 'm'`, `import 'm'`.
    // A line comment after it is blank in the mask, so the match runs on to the end of that line.
    const masked = maskSource(source);
    const statements = [...masked.matchAll(/^import\s[^'"]*(['"])[^'"\n]*\1[ \t]*;?[ \t]*(?=\r?\n|$)/gm)];
    const last = statements.at(-1);
    if (!last || last.index === undefined) {
        return `${IMPORT_LINE}\n${source}`;
    }

    const insertAt = last.index + last[0].length;
    // A block comment opened on that line would swallow the new import.
    if (source.slice(last.index, insertAt).includes('/*')) {
        return null;
    }

    // The last import that does not end its own line is not this match: some import ends later in the file.
    const lastStart = [...masked.matchAll(/^import\s/gm)].at(-1)?.index;
    if (lastStart !== last.index) {
        return null;
    }

    const eol = source.startsWith('\r\n', insertAt) ? '\r\n' : '\n';
    return `${source.slice(0, insertAt)}${eol}${IMPORT_LINE}${source.slice(insertAt)}`;
}

/**
 * Ensure `plugins: [blit386(), ...]` appears at the top level of the unique `defineConfig({ ... })` object.
 *
 * Returns null when the config shape is too unusual to rewrite safely: a `plugins` key that is not one plain
 * `plugins: [` (quoted, shorthand, a variable, or two of them), or a spread, which could replace the key we add. A
 * `plugins` list nested deeper (`build.rollupOptions.plugins`) or inside a comment is not the Vite list and is ignored.
 */
function ensurePluginsInDefineConfig(source: string): { text: string; already: boolean } | null {
    const masked = maskSource(source);
    const block = findUniqueDefineConfigObject(masked);
    if (!block) {
        return null;
    }

    if (PLUGIN_CALL.test(masked.slice(block.openBrace + 1, block.closeBrace))) {
        return { text: source, already: true };
    }

    // The object's top level, comments blanked and every nested bracket's contents blanked, at the source's offsets.
    // Top-level strings stay, so a quoted `'plugins'` key is seen; a string value holding `plugins` or `...` only
    // makes the answer unsupported, never a wrong edit.
    const text = maskSource(source, true);
    let depth = 0;
    let top = '';
    for (let i = block.openBrace + 1; i < block.closeBrace; i++) {
        const ch = masked.charAt(i);
        if ('{[('.includes(ch)) {
            top += depth++ === 0 ? ch : ' ';
        } else if ('}])'.includes(ch)) {
            top += --depth === 0 ? ch : ' ';
        } else {
            top += depth === 0 ? text.charAt(i) : ' ';
        }
    }

    const mentions = [...top.matchAll(/\bplugins\b/g)];
    if (top.includes('...') || mentions.length > 1) {
        return null;
    }

    const at = block.openBrace + 1;
    if (mentions.length === 0) {
        const indent = /\n([ \t]*)\S/.exec(source.slice(at, block.closeBrace))?.[1] ?? '    ';
        const eol = source.includes('\r\n') ? '\r\n' : '\n';
        return {
            text: `${source.slice(0, at)}${eol}${indent}plugins: [blit386()],${source.slice(at)}`,
            already: false,
        };
    }

    const key = /(?<![\w$'"`])plugins\s*:\s*\[/.exec(top);
    if (key === null || key.index !== mentions[0]?.index) {
        return null;
    }

    const open = at + key.index + key[0].length;
    const call = /^\s*\]/.test(masked.slice(open)) ? 'blit386()' : 'blit386(), ';
    return { text: `${source.slice(0, open)}${call}${source.slice(open)}`, already: false };
}

/**
 * Rewrite a vite.config source string so it registers `blit386()` for hot reload.
 *
 * @param source - File contents of vite.config.js / .ts / etc.
 * @returns Status plus rewritten text when a safe change was possible.
 */
export function enableHotReloadInViteConfig(source: string): HotReloadViteResult {
    const ensured = ensurePluginsInDefineConfig(source);
    if (ensured === null) {
        return { text: source, changed: false, status: 'unsupported' };
    }

    if (ensured.already) {
        return { text: source, changed: false, status: 'already' };
    }

    const text = insertImport(ensured.text);
    if (text === null || text === source) {
        return { text: source, changed: false, status: 'unsupported' };
    }

    return { text, changed: true, status: 'added' };
}
