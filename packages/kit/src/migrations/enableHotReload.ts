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
 * Locate the `{` … `}` of a single `defineConfig({ ... })` call.
 *
 * Returns null when there is not exactly one match, or when braces do not balance.
 */
function findUniqueDefineConfigObject(source: string): { openBrace: number; closeBrace: number } | null {
    const hits: number[] = [];
    const re = /defineConfig\s*\(\s*\{/g;
    let match = re.exec(source);
    while (match !== null) {
        hits.push(match.index + match[0].length - 1);
        match = re.exec(source);
    }

    if (hits.length !== 1) {
        return null;
    }

    const openBrace = hits[0];
    if (openBrace === undefined) {
        return null;
    }
    const closeBrace = matchingBraceEnd(source, openBrace);
    if (closeBrace === null) {
        return null;
    }

    return { openBrace, closeBrace };
}

/** Walk from an opening `{` to its matching `}`, ignoring braces inside strings and comments. */
function matchingBraceEnd(source: string, openIndex: number): number | null {
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = openIndex; i < source.length; i++) {
        const ch = source.charAt(i);
        const next = source[i + 1];

        if (inLineComment) {
            if (ch === '\n') {
                inLineComment = false;
            }
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                i++;
            }
            continue;
        }
        if (inSingle) {
            if (ch === '\\') {
                i++;
                continue;
            }
            if (ch === "'") {
                inSingle = false;
            }
            continue;
        }
        if (inDouble) {
            if (ch === '\\') {
                i++;
                continue;
            }
            if (ch === '"') {
                inDouble = false;
            }
            continue;
        }
        if (inTemplate) {
            if (ch === '\\') {
                i++;
                continue;
            }
            if (ch === '`') {
                inTemplate = false;
            }
            continue;
        }

        if (ch === '/' && next === '/') {
            inLineComment = true;
            i++;
            continue;
        }
        if (ch === '/' && next === '*') {
            inBlockComment = true;
            i++;
            continue;
        }
        if (ch === "'") {
            inSingle = true;
            continue;
        }
        if (ch === '"') {
            inDouble = true;
            continue;
        }
        if (ch === '`') {
            inTemplate = true;
            continue;
        }

        if (ch === '{') {
            depth++;
        } else if (ch === '}') {
            depth--;
            if (depth === 0) {
                return i;
            }
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
 * Ensure `plugins: [blit386(), ...]` appears inside the unique `defineConfig({ ... })` object.
 *
 * Returns null when the config shape is too unusual to rewrite safely. Does not touch `plugins`
 * arrays that live outside that object.
 */
function ensurePluginsInDefineConfig(source: string): { text: string; already: boolean } | null {
    const block = findUniqueDefineConfigObject(source);
    if (!block) {
        return null;
    }

    const body = source.slice(block.openBrace + 1, block.closeBrace);
    if (PLUGIN_CALL.test(body)) {
        return { text: source, already: true };
    }

    let newBody: string;
    const emptyPlugins = /plugins\s*:\s*\[\s*\]/;
    const pluginsOpen = /plugins\s*:\s*\[/;

    if (emptyPlugins.test(body)) {
        newBody = body.replace(emptyPlugins, 'plugins: [blit386()]');
    } else if (pluginsOpen.test(body)) {
        newBody = body.replace(pluginsOpen, 'plugins: [blit386(), ');
    } else {
        newBody = `\n    plugins: [blit386()],${body}`;
    }

    const text = `${source.slice(0, block.openBrace + 1)}${newBody}${source.slice(block.closeBrace)}`;
    return { text, already: false };
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
