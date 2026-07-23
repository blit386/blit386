/**
 * Enable the blit386 Vite hot-reload plugin in a project's vite.config source.
 *
 * Pure string rewrite aimed at the scaffolder template and the same shape of defineConfig({...}) configs. Games that
 * already import from `blit386/vite` are left alone. Odd or hand-rolled configs are reported as unsupported so a human
 * (or the use-hot-reload skill) can finish the job.
 */

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

/** Filenames we look for at the project root, in preference order. */
export const VITE_CONFIG_NAMES = [
    'vite.config.js',
    'vite.config.ts',
    'vite.config.mjs',
    'vite.config.mts',
    'vite.config.cjs',
] as const;

/** Engine version that first shipped `blit386/vite`. */
export const HOT_RELOAD_SINCE = '1.4.0';

const IMPORT_LINE = "import { blit386 } from 'blit386/vite';";

/**
 * Whether the source already wires the hot-reload plugin.
 *
 * Matches an import from `blit386/vite` or a `blit386()` call (the plugin factory).
 */
export function hasBlit386VitePlugin(source: string): boolean {
    if (/from\s+['"]blit386\/vite['"]/.test(source)) {
        return true;
    }

    // Plugin call: blit386() or blit386({...}), not an unrelated identifier that merely starts with blit386.
    return /(?<![.\w$])blit386\s*\(/.test(source);
}

/**
 * Insert the `blit386/vite` import after the last existing import, or at the top of the file.
 */
function insertImport(source: string): string {
    if (/from\s+['"]blit386\/vite['"]/.test(source)) {
        return source;
    }

    const importMatches = [...source.matchAll(/^import\s.+;?\s*$/gm)];
    const last = importMatches.at(-1);
    if (!last || last.index === undefined) {
        return `${IMPORT_LINE}\n${source}`;
    }

    const insertAt = last.index + last[0].length;
    const before = source.slice(0, insertAt);
    const after = source.slice(insertAt);
    // Keep a single blank line between the import block and the rest when the file already had one.
    const spacer = after.startsWith('\n\n') || after.startsWith('\r\n\r\n') ? '' : '\n';
    return `${before}\n${IMPORT_LINE}${spacer}${after}`;
}

/**
 * Ensure `plugins: [blit386(), ...]` appears inside the first `defineConfig({ ... })` object literal.
 *
 * Returns null when the config shape is too unusual to rewrite safely.
 */
function ensurePluginsArray(source: string): string | null {
    if (/(?<![.\w$])blit386\s*\(/.test(source)) {
        // Import may still be missing; caller adds it. Plugins already list the factory.
        return source;
    }

    // Empty plugins array.
    const emptyPlugins = /plugins\s*:\s*\[\s*\]/;
    if (emptyPlugins.test(source)) {
        return source.replace(emptyPlugins, 'plugins: [blit386()]');
    }

    // Non-empty plugins array – prepend blit386().
    const pluginsOpen = /plugins\s*:\s*\[/;
    if (pluginsOpen.test(source)) {
        return source.replace(pluginsOpen, 'plugins: [blit386(), ');
    }

    // No plugins key yet – insert as the first property of defineConfig({ ... }).
    const defineConfigOpen = /defineConfig\s*\(\s*\{/;
    if (defineConfigOpen.test(source)) {
        return source.replace(defineConfigOpen, 'defineConfig({\n    plugins: [blit386()],');
    }

    return null;
}

/**
 * Rewrite a vite.config source string so it registers `blit386()` for hot reload.
 *
 * @param source - File contents of vite.config.js / .ts / etc.
 * @returns Status plus rewritten text when a safe change was possible.
 */
export function enableHotReloadInViteConfig(source: string): HotReloadViteResult {
    if (hasBlit386VitePlugin(source)) {
        return { text: source, changed: false, status: 'already' };
    }

    const withPlugins = ensurePluginsArray(source);
    if (withPlugins === null) {
        return { text: source, changed: false, status: 'unsupported' };
    }

    const text = insertImport(withPlugins);
    if (text === source) {
        return { text: source, changed: false, status: 'unsupported' };
    }

    return { text, changed: true, status: 'added' };
}
