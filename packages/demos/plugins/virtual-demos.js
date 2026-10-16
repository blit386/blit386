import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import { SOURCE_UPDATED_EVENT } from '../_partials/source-panel-protocol.js';
import { sheetEntries } from '../_shots/sheet-entries.js';
import { buildRegistry, INDEX_SLUG, SHOTS_SLUG } from './demo-registry.js';
import { VINTAGE_URLS } from './demo-vintage-urls.js';
import { clearHighlightCache, highlightDemoSource } from './highlight-demo-source.js';
import { escapeHtml } from './html-escape.js';
import { buildSocialMeta, OG_IMAGE_DIR } from './social-meta.js';

const URL_PATTERN = /^\/demos\/([\w-]+)\.html$/;

// Set only in the deploy-demos-next CI job (see .github/workflows/deploy.yml). Read directly
// from process.env here (this plugin runs in Node during the build, not the browser), so no
// client-side env var plumbing is needed for the noindex meta tag or the unreleased-work banner.
const IS_NEXT_CHANNEL = process.env.BLIT386_CHANNEL === 'next';

const ROBOTS_NOINDEX_META = '<meta name="robots" content="noindex">';

// The one non-demo page this plugin serves: the capture gallery at /shots (dev: /shots and
// /shots.html; build: dist/shots.html, which Pages serves at /shots). check-demo-registry.mjs
// refuses a demo file with this name. The slug itself is defined in demo-registry.js.
export { SHOTS_SLUG };
const SHOTS_TEMPLATE_PATH = ['_shots', 'shots.html'];

// The public demo sheet at the site index (dev: /; build: dist/index.html), built
// on the /shots gallery. Indexable, unlike /shots, so it carries the social/SEO head block.
const SHEET_TEMPLATE_PATH = ['_shots', 'sheet.html'];
const SHOTS_MANIFEST_PATH = ['public', 'shots', 'manifest.json'];

// `slug: ''` makes buildSocialMeta's canonical and og:url the bare origin, and with no card of its
// own the page falls back to the shared OG image.
const SHEET_META_ENTRY = {
    slug: '',
    title: 'BLIT386 Demos',
    description: 'Every BLIT386 demo on one page: palette-first WebGPU retro rendering that runs in your browser.',
};

// id="channel-banner" lets layout.css hide this in embed mode (styles/layout.css,
// html[data-embed='true']) - the shell iframe loads this same page at ?embed, so without
// that rule the banner would render a second time inside the canvas iframe.
const CHANNEL_BANNER_HTML =
    '<div id="channel-banner" style="position:relative;padding:8px 16px;text-align:center;font:14px/1.4 system-ui,sans-serif;' +
    'background:#f5c518;color:#000;">' +
    'This site tracks unreleased work and may document features not yet on npm. ' +
    '<a href="https://demos.blit386.dev" style="color:#000;font-weight:600;">Go to the released site</a>.' +
    '</div>';

/**
 * Substitute a demo entry's rendered content into the shared layout template. Pure and
 * exported so it can be unit-tested without touching disk, a Vite server, or the highlighter.
 *
 * `pageSuffix` is what the shell appends when it builds navigation targets: dev serves only
 * /demos/<slug>.html (see URL_PATTERN), while the production build flattens pages to
 * dist/<slug>.html, which Cloudflare Pages serves at the extensionless /<slug>.
 * @param {object} options
 * @param {string} options.layoutTemplate - Raw contents of `_partials/layout.html`.
 * @param {{ title: string, scriptFile: string, slug: string }} options.entry - Registry entry.
 * @param {boolean} options.isDevMode - True under `vite dev`, false for a production build.
 * @param {string} options.demoListJson - JSON array of nav-visible demos.
 * @param {string} options.sourceHtml - Pre-rendered Twoslash/Shiki source panel markup.
 * @param {string} options.sourcePanelScript - Dev-only `<script>` tag, or '' in a build.
 * @param {string} options.robotsMeta - `<meta name="robots">` tag on the next channel, else ''.
 * @param {string} options.channelBanner - Unreleased-work banner HTML on the next channel, else ''.
 * @param {string} options.socialMeta - The full social/SEO head block from `buildSocialMeta`.
 * @returns {string} The rendered dual-mode demo page.
 */
export function renderDemoHtml({
    layoutTemplate,
    entry,
    isDevMode,
    demoListJson,
    sourceHtml,
    sourcePanelScript,
    robotsMeta,
    channelBanner,
    socialMeta,
}) {
    return (
        layoutTemplate
            .replaceAll('{{title}}', escapeHtml(entry.title))
            .replaceAll('{{scriptFile}}', entry.scriptFile)
            .replaceAll('{{slug}}', entry.slug)
            .replaceAll('{{pageSuffix}}', isDevMode ? '.html' : '')
            .replace('{{demoList}}', () => demoListJson)
            .replace('{{sourceHtml}}', () => sourceHtml)
            .replace('{{sourcePanelScript}}', () => sourcePanelScript)
            .replace('{{robotsMeta}}', () => robotsMeta)
            .replace('{{channelBanner}}', () => channelBanner)
            // Last in the chain on purpose. The function replacer keeps `$&` / `$1` in a demo's
            // description from being interpreted, and substituting after every other placeholder
            // means a description containing the literal text of one cannot trigger a second pass.
            .replace('{{socialMeta}}', () => socialMeta)
    );
}

/**
 * Substitute the shots gallery's values into its template. Pure and exported for unit tests.
 *
 * `demoBase` is where demo pages live relative to the gallery: `/demos/` under the dev
 * middleware, `./` once the build flattens everything to the dist root.
 * @param {object} options
 * @param {string} options.template - Raw contents of `_shots/shots.html`.
 * @param {string} options.demoListJson - JSON array of every registry entry's slug, navLabel, title.
 * @param {boolean} options.isDevMode - True under `vite dev`.
 * @param {string} [options.engineVersion] - Engine version stamped on `<body>` for capture mode.
 * @returns {string}
 */
export function renderShotsHtml({ template, demoListJson, isDevMode, engineVersion = '' }) {
    return template
        .replaceAll('{{demoBase}}', isDevMode ? '/demos/' : './')
        .replaceAll('{{pageSuffix}}', isDevMode ? '.html' : '')
        .replaceAll('{{engineVersion}}', engineVersion)
        .replace('{{demoList}}', () => demoListJson);
}

/**
 * Substitute the public demo sheet's values into its template: the same base and suffix as the
 * shots gallery, the tiles, and the head block and next-channel extras a demo page carries. Pure
 * and exported for unit tests.
 * @param {object} options
 * @param {string} options.template - Raw contents of `_shots/sheet.html`.
 * @param {string} options.entriesJson - JSON array of the tiles, from `sheetEntries()`.
 * @param {boolean} options.isDevMode - True under `vite dev`.
 * @param {string} options.robotsMeta - `<meta name="robots">` tag on the next channel, else ''.
 * @param {string} options.channelBanner - Unreleased-work banner HTML on the next channel, else ''.
 * @param {string} options.socialMeta - The social/SEO head block from `buildSocialMeta`.
 * @returns {string}
 */
export function renderSheetHtml({ template, entriesJson, isDevMode, robotsMeta, channelBanner, socialMeta }) {
    return (
        template
            .replaceAll('{{demoBase}}', isDevMode ? '/demos/' : './')
            .replaceAll('{{pageSuffix}}', isDevMode ? '.html' : '')
            .replace('{{sheetEntries}}', () => entriesJson)
            .replace('{{robotsMeta}}', () => robotsMeta)
            .replace('{{channelBanner}}', () => channelBanner)
            // Last, for the same reason as in renderDemoHtml.
            .replace('{{socialMeta}}', () => socialMeta)
    );
}

/**
 * Resolve a requested `/demos/<slug>.html` dev URL against VINTAGE_URLS: if the slug is a
 * vintage key whose target demo is still live in the registry, return that demo's canonical
 * urlPath for a 301 redirect. Pure and exported so it can be unit-tested without a real dev
 * server request/response pair.
 * @param {string} requestedSlug - The slug segment of the requested URL.
 * @param {Record<string, string>} vintageUrls - Vintage slug -> current slug map.
 * @param {Array<{ slug: string, urlPath: string }>} registry - Live demo registry entries.
 * @returns {string | null} The live entry's urlPath, or null when no redirect applies.
 */
export function resolveVintageRedirect(requestedSlug, vintageUrls, registry) {
    const vintageMapping = Object.entries(vintageUrls).find(([vintageSlug]) => vintageSlug === requestedSlug);

    if (!vintageMapping) {
        return null;
    }

    const currentSlug = vintageMapping[1];
    const liveEntry = registry.find((entry) => entry.slug === currentSlug);

    return liveEntry ? liveEntry.urlPath : null;
}

/**
 * Vite plugin that serves/generates demo HTML pages virtually from src/*.js demo files.
 * No per-demo HTML file is needed on disk; the template lives in _partials/layout.html
 * and is rendered via simple string substitution.
 *
 * Each page is dual-mode (static hosts serve one HTML for both URLs):
 * - Shell (default): persistent banner + iframe pointing at `?embed&source`.
 * - Embed (`?embed`): canvas only (no banner; source hidden) for docs on blit386.dev.
 *   Shell iframe adds `&source` so the Shiki/Twoslash panel stays under the canvas.
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
    let shotsDir = resolve(rootDir, '_shots');
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
        // Dev: always re-read the template. Vite's own watcher can full-reload the
        // browser without our change handler running, which would otherwise leave a
        // stale layoutTemplate (e.g. after extracting demo-shell.js).
        if (isDevMode) {
            reloadTemplate();
        }

        const demoListJson = JSON.stringify(
            registry.filter((e) => !e.isNavHidden).map((e) => ({ slug: e.slug, navLabel: e.navLabel, title: e.title })),
        ).replaceAll('<', '\\u003c');

        const sourceHtml = await highlightDemoSource(entry.sourcePath, rootDir);

        // Dev-only live source panel: load only inside embed documents. The shell strips
        // #demo-source and loads the iframe with ?embed&source, where highlighted source
        // and HMR updates live. Plain ?embed (docs) keeps the panel in the DOM but hidden.
        const sourcePanelScript = isDevMode
            ? `<script type="module">
    if (window.__blit386IsEmbedded) {
        await import('/_partials/source-panel.js');
    }
</script>`
            : '';

        // public/ is copied into dist/ verbatim, so a PNG present here is exactly what
        // /social/og-<slug>.png resolves to in production. Demos without their own capture fall
        // back to the shared card rather than advertising an og:image that 404s.
        const hasOgImage = existsSync(resolve(rootDir, 'public', OG_IMAGE_DIR, `og-${entry.slug}.png`));
        const socialMeta = buildSocialMeta({ entry, isNextChannel: IS_NEXT_CHANNEL, hasOgImage });

        return renderDemoHtml({
            layoutTemplate,
            entry,
            isDevMode,
            demoListJson,
            sourceHtml,
            sourcePanelScript,
            robotsMeta: IS_NEXT_CHANNEL ? ROBOTS_NOINDEX_META : '',
            channelBanner: IS_NEXT_CHANNEL ? CHANNEL_BANNER_HTML : '',
            socialMeta,
        });
    }

    /**
     * Render the /shots gallery page. Every registry entry is listed, nav-hidden ones included:
     * the gallery exists to look at all of them.
     * @returns {string}
     */
    function renderShots() {
        const template = readFileSync(resolve(rootDir, ...SHOTS_TEMPLATE_PATH), 'utf-8');
        const demoListJson = JSON.stringify(
            registry.map((e) => ({ slug: e.slug, navLabel: e.navLabel, title: e.title })),
        ).replaceAll('<', '\\u003c');

        const engineVersion = JSON.parse(
            readFileSync(resolve(rootDir, '..', 'blit386', 'package.json'), 'utf-8'),
        ).version;

        return renderShotsHtml({ template, demoListJson, isDevMode, engineVersion });
    }

    /**
     * Render the public demo sheet served at the site index. Nav-visible demos only, like the
     * shell's own list. The tiles are picked from the committed manifest here and inlined, not
     * fetched by the page: they then render before the load event, so the browser can restore the
     * scroll position on reload or Back. A missing or malformed manifest fails the render.
     * @returns {string}
     */
    function renderSheet() {
        const template = readFileSync(resolve(rootDir, ...SHEET_TEMPLATE_PATH), 'utf-8');
        const manifest = JSON.parse(readFileSync(resolve(rootDir, ...SHOTS_MANIFEST_PATH), 'utf-8'));

        if (!Array.isArray(manifest?.entries)) {
            throw new Error(`${SHOTS_MANIFEST_PATH.join('/')} has no entries array`);
        }

        const entriesJson = JSON.stringify(
            sheetEntries(
                manifest.entries,
                registry.filter((e) => !e.isNavHidden),
            ),
        ).replaceAll('<', '\\u003c');

        return renderSheetHtml({
            template,
            entriesJson,
            isDevMode,
            robotsMeta: IS_NEXT_CHANNEL ? ROBOTS_NOINDEX_META : '',
            channelBanner: IS_NEXT_CHANNEL ? CHANNEL_BANNER_HTML : '',
            socialMeta: buildSocialMeta({ entry: SHEET_META_ENTRY, isNextChannel: IS_NEXT_CHANNEL }),
        });
    }

    return {
        name: 'virtual-demos',
        enforce: 'pre',

        config(userConfig) {
            rootDir = resolve(userConfig.root ?? process.cwd());
            partialsDir = resolve(rootDir, '_partials');
            demosDir = resolve(rootDir, 'demos');
            srcDir = resolve(rootDir, 'src');
            shotsDir = resolve(rootDir, '_shots');

            reloadTemplate();
            reload();

            const input = {
                [SHOTS_SLUG]: resolve(demosDir, `${SHOTS_SLUG}.html`),
                [INDEX_SLUG]: resolve(demosDir, `${INDEX_SLUG}.html`),
            };
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
            shotsDir = resolve(rootDir, '_shots');
            isDevMode = config.command === 'serve';
        },

        resolveId(source) {
            if (!isAbsolute(source)) {
                return null;
            }

            if (
                findEntryByAbsPath(source) ||
                source === resolve(demosDir, `${SHOTS_SLUG}.html`) ||
                source === resolve(demosDir, `${INDEX_SLUG}.html`)
            ) {
                return source;
            }

            return null;
        },

        async load(id) {
            if (id === resolve(demosDir, `${SHOTS_SLUG}.html`)) {
                return renderShots();
            }

            if (id === resolve(demosDir, `${INDEX_SLUG}.html`)) {
                return renderSheet();
            }

            const entry = findEntryByAbsPath(id);

            if (!entry) {
                return null;
            }

            return renderHtml(entry);
        },

        configureServer(server) {
            // Watch the partials directory (not a glob): layout.html + chrome scripts
            // (demo-shell.js, source-panel*.js). Any edit invalidates page chrome.
            //
            // Deliberately NOT adding `join(srcDir, '*.js')` / `join(srcDir, 'shared', '*.js')`
            // here: Vite's watcher runs with chokidar's `disableGlobbing: true`, so a `*.js`
            // suffix is a literal (non-existent) filename, not a glob. Calling `.add()` on that
            // bogus path races chokidar's still-in-progress recursive scan of the target
            // directory and can corrupt its internal file tracking, silently dropping all future
            // `change` events for real files inside it (verified against `src/shared/`, which
            // stopped reporting edits entirely once this was added). The root recursive watch
            // already covers `src/**` on its own, so these calls were both redundant and unsafe.
            server.watcher.add(partialsDir);
            server.watcher.add(shotsDir);

            server.watcher.on('change', async (changedPath) => {
                // `relative` is separator-safe: partialsDir itself and files under it match;
                // siblings (e.g. `_partials-other/...`) resolve to a `..` path and are skipped.
                const partialsRel = relative(partialsDir, changedPath);
                const shotsRel = relative(shotsDir, changedPath);

                if (isInsideDir(partialsRel) || isInsideDir(shotsRel)) {
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
                    try {
                        let html = renderSheet();
                        html = await server.transformIndexHtml(`/${INDEX_SLUG}.html`, html);
                        res.setHeader('Content-Type', 'text/html; charset=utf-8');
                        res.end(html);
                    } catch (error) {
                        next(error);
                    }
                    return;
                }

                if (url === `/${SHOTS_SLUG}` || url === `/${SHOTS_SLUG}.html`) {
                    try {
                        let html = renderShots();
                        html = await server.transformIndexHtml(`/${SHOTS_SLUG}.html`, html);
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
                const vintageRedirect = resolveVintageRedirect(requestedSlug, VINTAGE_URLS, registry);

                if (vintageRedirect) {
                    res.statusCode = 301;
                    res.setHeader('Location', vintageRedirect);
                    res.end();
                    return;
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
 * True when a `path.relative(dir, file)` result means the file is the dir itself or under it.
 * @param {string} rel - Result of `relative(dir, file)`.
 * @returns {boolean}
 */
function isInsideDir(rel) {
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
