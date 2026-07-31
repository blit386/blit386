/**
 * Build-time (and on-demand in Vite dev) Shiki + Twoslash highlighter for demo
 * source files. Produces HTML with CSS hover popovers matching blit386.dev's
 * code-block look (github-light / github-dark, Pragmata via page CSS).
 */

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { transformerTwoslash } from '@shikijs/twoslash';
import { createHighlighter } from 'shiki';
import ts from 'typescript';

/** @type {Promise<import('shiki').Highlighter> | null} */
let highlighterPromise = null;

/** @type {Map<string, { mtimeMs: number, html: string }>} */
const cache = new Map();

/**
 * Lazily create a shared Shiki highlighter (themes + langs needed for Twoslash
 * popup type snippets, which highlight as TypeScript). Concurrent callers share
 * one Promise so Vite's parallel page loads do not spawn many instances.
 * @returns {Promise<import('shiki').Highlighter>}
 */
function getHighlighter() {
    if (!highlighterPromise) {
        highlighterPromise = createHighlighter({
            themes: ['github-light', 'github-dark'],
            langs: ['javascript', 'typescript'],
        });
    }

    return highlighterPromise;
}

/**
 * Twoslash transformer configured for plain demo JS: allowJs/checkJs, resolve
 * `./shared/*` via vfsRoot = src/, and blit386 types from the workspace package.
 * @param {string} srcDir - Absolute path to the demos `src/` directory.
 * @returns {import('shiki').ShikiTransformer}
 */
function createDemoTwoslash(srcDir) {
    return transformerTwoslash({
        throws: false,
        explicitTrigger: false,
        langs: ['js', 'javascript', 'ts', 'typescript'],
        twoslashOptions: {
            vfsRoot: srcDir,
            compilerOptions: {
                allowJs: true,
                checkJs: true,
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ESNext,
                moduleResolution: ts.ModuleResolutionKind.Bundler,
                esModuleInterop: true,
                skipLibCheck: true,
                lib: ['ES2022', 'DOM'],
            },
            handbookOptions: {
                noErrorValidation: true,
                noErrors: true,
            },
        },
    });
}

/**
 * Highlight a demo source file to HTML (Shiki dual-theme + Twoslash hovers).
 * Results are cached by absolute path + mtime.
 * @param {string} sourcePath - Absolute path to the demo `.js` file.
 * @param {string} rootDir - Demos package root (parent of `src/`).
 * @returns {Promise<string>} Highlighted HTML (a `.shiki.twoslash` pre/code tree).
 */
export async function highlightDemoSource(sourcePath, rootDir) {
    const { mtimeMs } = statSync(sourcePath);
    const cached = cache.get(sourcePath);

    if (cached && cached.mtimeMs === mtimeMs) {
        return cached.html;
    }

    const srcDir = resolve(rootDir, 'src');
    const source = readFileSync(sourcePath, 'utf-8');
    const shiki = await getHighlighter();

    const html = shiki.codeToHtml(source, {
        lang: 'javascript',
        themes: {
            light: 'github-light',
            dark: 'github-dark',
        },
        defaultColor: false,
        transformers: [createDemoTwoslash(srcDir)],
    });

    cache.set(sourcePath, { mtimeMs, html });

    return html;
}

/**
 * Drop every cached highlight. Call when `src/` changes so the next page
 * render re-runs Twoslash against the new source.
 * @returns {void}
 */
export function clearHighlightCache() {
    cache.clear();
}
