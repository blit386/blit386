import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { SOURCE_UPDATED_EVENT } from '../_partials/source-panel-protocol.js';
import { buildRegistry } from './demo-registry.js';
import { VINTAGE_URLS } from './demo-vintage-urls.js';
import { clearHighlightCache, highlightDemoSource } from './highlight-demo-source.js';

const URL_PATTERN = /^\/demos\/([\w-]+)\.html$/;

/**
 * Vite plugin that serves/generates demo HTML pages virtually from src/*.js demo files.
 * No per-demo HTML file is needed on disk; the template lives in _partials/layout.html
 * and is rendered via simple string substitution.
 *
 * Each page is dual-mode (static hosts serve one HTML for both URLs):
 * - Shell (default): persistent banner + iframe pointing at the same path with `?embed`.
 * - Embed (`?embed`): canvas + Shiki/Twoslash source panel (no banner). Used by the shell
 *   iframe and by external embeds on blit386.dev.
 *
 * Client-side JS in the layout stamps `data-shell` / `data-embed` and strips the inactive
 * region; the plugin always renders the full dual-mode template.
 * @returns {import('vite').Plugin}
 */
export function virtualDemos() {
    let rootDir = process.cwd();
    let partialsDir = resolve(rootDir, '_partials');
    let demosDir = resolve(rootDir, 'demos');
    let srcDir = resolve(rootDir, 'src');
    let registry = [];
    let layoutTemplate = '';
    let isDevMode = false;

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
     * @param {string} absPath - Absolute path, e.g. resolve(demosDir, "basics.html")
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
     * @param {string} slug - Demo slug, e.g. "basics"
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
     * Find the registry entry whose source file is the given absolute path. Used by the watcher to
     * tell a top-level demo entry (src/<slug>.js) apart from a src/shared/*.js change.
     * @param {string} absPath - Absolute path, e.g. resolve(srcDir, "basics.js")
     * @returns {object | null}
     */
    function findEntryBySourcePath(absPath) {
        for (const entry of registry) {
            if (entry.sourcePath === absPath) {
                return entry;
            }
        }
        return null;
    }

    /**
     * Render a demo entry's dual-mode HTML page from the shared layout template
     * (shell banner + iframe, and embed canvas + Twoslash source). The nav list
     * includes `title` so the shell can update `document.title` on demo swaps.
     * @param {object} entry - Registry entry (see buildRegistry's return type).
     * @returns {Promise<string>}
     */
    async function renderHtml(entry) {
        const demoListJson = JSON.stringify(
            registry.filter((e) => !e.isNavHidden).map((e) => ({ slug: e.slug, navLabel: e.navLabel, title: e.title })),
        ).replaceAll('<', '\\u003c');

        const sourceHtml = await highlightDemoSource(entry.sourcePath, rootDir);
        // Dev-only live source panel: load only inside embed documents (shell strips
        // #demo-source; the iframe is where highlighted source and HMR updates live).
        const sourcePanelScript = isDevMode
            ? `<script type="module">
    if (window.__blit386IsEmbedded) {
        await import('/_partials/source-panel.js');
    }
</script>`
            : '';

        return layoutTemplate
            .replaceAll('{{title}}', escapeHtml(entry.title))
            .replaceAll('{{scriptFile}}', entry.scriptFile)
            .replaceAll('{{slug}}', entry.slug)
            .replace('{{demoList}}', () => demoListJson)
            .replace('{{sourceHtml}}', () => sourceHtml)
            .replace('{{sourcePanelScript}}', () => sourcePanelScript);
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
                // `key` is derived from a lowercase slug and can contain only letters, digits, and underscores.
                // eslint-disable-next-line security/detect-object-injection
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
            isDevMode = config.command === 'serve';
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

            server.watcher.on('change', async (changedPath) => {
                if (changedPath.startsWith(partialsDir)) {
                    reloadTemplate();
                    server.ws.send({ type: 'full-reload' });
                    return;
                }

                if (!changedPath.startsWith(srcDir)) {
                    return;
                }

                clearHighlightCache();
                reload();

                // Only a top-level demo entry (src/<slug>.js) drives the live source panel. A
                // src/shared/*.js change needs neither a full-reload nor a source-panel event: Vite's
                // own module-graph HMR propagates the update to every importing demo entry, which
                // self-accepts via the blit386/vite-injected snippet (see vite.config.js).
                if (dirname(changedPath) !== srcDir) {
                    return;
                }

                const entry = findEntryBySourcePath(changedPath);

                if (!entry) {
                    return;
                }

                try {
                    const sourceHtml = await highlightDemoSource(entry.sourcePath, rootDir);
                    server.ws.send({
                        type: 'custom',
                        event: SOURCE_UPDATED_EVENT,
                        data: { slug: entry.slug, sourceHtml },
                    });
                } catch (error) {
                    console.error(`[virtual-demos] Failed to re-highlight ${entry.slug} after edit:`, error);
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
                    try {
                        // Same Vite HTML/CSS pipeline as demo pages (PostCSS, hashed assets).
                        let html = renderIndexPage(registry);
                        html = await server.transformIndexHtml('/demos/', html);
                        res.setHeader('Content-Type', 'text/html; charset=utf-8');
                        res.end(html);
                    } catch (error) {
                        next(error);
                    }
                    return;
                }

                const demoMatch = url.match(URL_PATTERN);

                if (!demoMatch) {
                    return next();
                }

                const requestedSlug = demoMatch[1];
                const vintageMapping = Object.entries(VINTAGE_URLS).find(
                    ([vintageSlug]) => vintageSlug === requestedSlug,
                );

                if (vintageMapping) {
                    const vintageEntry = findEntryBySlug(vintageMapping[1]);

                    if (vintageEntry) {
                        res.statusCode = 301;
                        res.setHeader('Location', vintageEntry.urlPath);
                        res.end();
                        return;
                    }
                }

                const entry = findEntryBySlug(requestedSlug);

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
                `            <li><a href="${escapeHtml(entry.urlPath)}">${escapeHtml(entry.slug)} &mdash; ${escapeHtml(entry.title)}</a></li>`,
        )
        .join('\n');

    return `<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <title>BLIT386 Demos</title>
        <link rel="stylesheet" href="../styles/demos-index.css" />
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
