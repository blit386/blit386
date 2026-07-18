import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { buildRegistry } from './demo-registry.js';
import { clearHighlightCache, highlightDemoSource } from './highlight-demo-source.js';

const URL_PATTERN = /^\/demos\/([\w-]+)\.html$/;

/**
 * Vite plugin that serves/generates demo HTML pages virtually from src/NNN-*.js files.
 * No per-demo HTML file is needed on disk; the template lives in _partials/layout.html
 * and is rendered via simple string substitution. Each page embeds a Shiki + Twoslash
 * highlighted copy of that demo's source below the canvas.
 * @returns {import('vite').Plugin}
 */
export function virtualDemos() {
    let rootDir = process.cwd();
    let partialsDir = resolve(rootDir, '_partials');
    let demosDir = resolve(rootDir, 'demos');
    let srcDir = resolve(rootDir, 'src');
    let registry = [];
    let layoutTemplate = '';

    /**
     * Re-read _partials/layout.html from disk into `layoutTemplate`.
     * @returns {void}
     */
    function reloadTemplate() {
        layoutTemplate = readFileSync(resolve(partialsDir, 'layout.html'), 'utf-8');
    }

    /**
     * Rebuild `registry` by rescanning src/*.js.
     * @returns {void}
     */
    function reload() {
        registry = buildRegistry(rootDir);
    }

    /**
     * Find the registry entry whose virtual HTML path matches an absolute module id.
     * @param {string} absPath - Absolute path, e.g. resolve(demosDir, "001-basics.html")
     * @returns {object | null}
     */
    function findEntryByAbsPath(absPath) {
        for (const entry of registry) {
            if (resolve(demosDir, `${entry.slug}.html`) === absPath) {
                return entry;
            }
        }
        return null;
    }

    /**
     * Find the registry entry for a demo slug.
     * @param {string} slug - Demo slug, e.g. "001-basics"
     * @returns {object | null}
     */
    function findEntryBySlug(slug) {
        for (const entry of registry) {
            if (entry.slug === slug) {
                return entry;
            }
        }
        return null;
    }

    /**
     * Render a demo entry's HTML page from the shared layout template, including a
     * Twoslash-highlighted copy of the demo source.
     * @param {object} entry - Registry entry (see buildRegistry's return type).
     * @returns {Promise<string>}
     */
    async function renderHtml(entry) {
        const demoListJson = JSON.stringify(
            registry.filter((e) => !e.isNavHidden).map((e) => ({ slug: e.slug, navLabel: e.navLabel })),
        ).replaceAll('<', '\\u003c');

        const sourceHtml = await highlightDemoSource(entry.sourcePath, rootDir);

        return layoutTemplate
            .replaceAll('{{title}}', escapeHtml(entry.title))
            .replaceAll('{{scriptFile}}', entry.scriptFile)
            .replaceAll('{{slug}}', entry.slug)
            .replace('{{demoList}}', () => demoListJson)
            .replace('{{sourceHtml}}', () => sourceHtml);
    }

    return {
        name: 'virtual-demos',
        enforce: 'pre',

        config(userConfig) {
            rootDir = resolve(userConfig.root ?? process.cwd());
            partialsDir = resolve(rootDir, '_partials');
            demosDir = resolve(rootDir, 'demos');
            srcDir = resolve(rootDir, 'src');

            reloadTemplate();
            reload();

            const input = {};
            for (const entry of registry) {
                const key = entry.slug.replace(/-/g, '_');
                // eslint-disable-next-line security/detect-object-injection -- Safe: key is derived from a slug matched by /^([0-9]{2}a|[0-9]{3})-[a-z0-9-]+$/, so it only contains digits, lowercase letters, and underscores.
                input[key] = resolve(demosDir, `${entry.slug}.html`);
            }

            return {
                build: {
                    rollupOptions: { input },
                },
            };
        },

        configResolved(config) {
            rootDir = config.root;
            partialsDir = resolve(rootDir, '_partials');
            demosDir = resolve(rootDir, 'demos');
            srcDir = resolve(rootDir, 'src');
        },

        resolveId(source) {
            if (!isAbsolute(source)) {
                return null;
            }

            if (findEntryByAbsPath(source)) {
                return source;
            }

            return null;
        },

        async load(id) {
            const entry = findEntryByAbsPath(id);

            if (!entry) {
                return null;
            }

            return renderHtml(entry);
        },

        configureServer(server) {
            server.watcher.add(join(partialsDir, '*.html'));
            server.watcher.add(join(srcDir, '*.js'));
            server.watcher.add(join(srcDir, 'shared', '*.js'));

            server.watcher.on('change', (changedPath) => {
                if (changedPath.startsWith(partialsDir)) {
                    reloadTemplate();
                    server.ws.send({ type: 'full-reload' });
                } else if (changedPath.startsWith(srcDir)) {
                    clearHighlightCache();
                    reload();
                    server.ws.send({ type: 'full-reload' });
                }
            });
            server.watcher.on('add', (addedPath) => {
                if (addedPath.startsWith(srcDir)) {
                    clearHighlightCache();
                    reload();
                    server.ws.send({ type: 'full-reload' });
                }
            });
            server.watcher.on('unlink', (removedPath) => {
                if (removedPath.startsWith(srcDir)) {
                    clearHighlightCache();
                    reload();
                    server.ws.send({ type: 'full-reload' });
                }
            });

            server.middlewares.use(async (req, res, next) => {
                if (!req.url) {
                    return next();
                }

                const url = req.url.split('?')[0];

                if (url === '/') {
                    const firstVisible = registry.find((entry) => !entry.isNavHidden);

                    if (firstVisible) {
                        res.statusCode = 302;
                        res.setHeader('Location', firstVisible.urlPath);
                        res.end();
                        return;
                    }
                }

                if (url === '/demos/' || url === '/demos') {
                    const html = renderIndexPage(registry);
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.end(html);
                    return;
                }

                const demoMatch = url.match(URL_PATTERN);

                if (!demoMatch) {
                    return next();
                }

                const entry = findEntryBySlug(demoMatch[1]);

                if (!entry) {
                    return next();
                }

                try {
                    let html = await renderHtml(entry);
                    html = await server.transformIndexHtml(url, html);
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.end(html);
                } catch (error) {
                    next(error);
                }
            });
        },
    };
}

/**
 * Render the dev-only auto-generated index page listing every demo (served at /demos/).
 * Not part of the production build; see plugins/virtual-demos.js's configureServer middleware.
 * @param {Array<object>} registry - Full demo registry, as returned by buildRegistry.
 * @returns {string}
 */
function renderIndexPage(registry) {
    const items = registry
        .map(
            (entry) =>
                `            <li><a href="/demos/${escapeHtml(entry.slug)}.html">${escapeHtml(entry.slug)} &mdash; ${escapeHtml(entry.title)}</a></li>`,
        )
        .join('\n');

    return `<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <title>BLIT386 Demos</title>
        <style>
            body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
            h1 { margin-bottom: 0.5rem; }
            ul { list-style: none; padding: 0; }
            li { padding: 0.25rem 0; }
            a { color: #0366d6; text-decoration: none; }
            a:hover { text-decoration: underline; }
        </style>
    </head>
    <body>
        <h1>BLIT386 Demos</h1>
        <ul>
${items}
        </ul>
    </body>
</html>
`;
}

/**
 * Escape a string for safe interpolation into HTML text content/attributes.
 * @param {string} str - Raw text.
 * @returns {string}
 */
function escapeHtml(str) {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
