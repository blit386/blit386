import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blit386 } from 'blit386/vite';
import { defineConfig } from 'vite';

import { flattenDemos } from './plugins/flatten-demos.js';
import { buildRegistry } from './plugins/demo-registry.js';
import { channelHeadersPlugin } from './plugins/channel-headers.js';
import { VINTAGE_URLS } from './plugins/demo-vintage-urls.js';
import { sitemapPlugin } from './plugins/sitemap.js';
import { virtualDemos } from './plugins/virtual-demos.js';

/**
 * Vite plugin to flatten the demos/ subdirectory in the build output.
 * Moves all files from dist/demos/ to dist/ root for cleaner URLs.
 * Also rewrites asset paths in HTML files (../assets/ -> ./assets/).
 * @returns Vite plugin configuration
 */
function flattenDemosPlugin() {
    return {
        name: 'flatten-demos',
        apply: 'build',
        closeBundle() {
            flattenDemos(resolve(__dirname, 'dist'));
        },
    };
}

/**
 * Write `dist/_redirects` as the single authoritative Cloudflare Pages redirect artifact: 301s
 * for every vintage slug whose current target still exists in the live registry. The site index
 * needs no rule - it is the public demo sheet, built to `dist/index.html` by virtual-demos.
 * Overwrites any `public/` copy.
 * @returns {import('vite').Plugin}
 */
function demoRedirectsPlugin() {
    return {
        name: 'demo-redirects',
        apply: 'build',
        closeBundle() {
            const distDir = resolve(__dirname, 'dist');
            const registry = buildRegistry(__dirname);
            const liveSlugs = new Set(registry.map((entry) => entry.slug));

            const lines = [
                '# Generated at build time - do not edit dist/_redirects by hand.',
                '# Source: plugins/demo-vintage-urls.js, filtered to targets live in the registry.',
                '',
            ];

            lines.push('# Vintage (historical) slugs → current slugs (301 permanent).');

            for (const [vintageSlug, currentSlug] of Object.entries(VINTAGE_URLS)) {
                if (!liveSlugs.has(currentSlug)) {
                    continue;
                }

                // Both forms target the extensionless slug. Pages 308s /<slug>.html to /<slug>
                // anyway, so a `.html` target here would only chain a second hop.
                lines.push(`/${vintageSlug} /${currentSlug} 301`);
                lines.push(`/${vintageSlug}.html /${currentSlug} 301`);
            }

            writeFileSync(join(distDir, '_redirects'), `${lines.join('\n')}\n`);
        },
    };
}

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const blit386DistEntry = resolve(__dirname, '../blit386/dist/blit386.js');

/**
 * Full-reload the dev server when the linked blit386 library rebuilds.
 * Vite pre-bundles dependencies once; without this, configure() API changes
 * in the workspace package do not show up until you restart `pnpm dev`.
 * @returns {import('vite').Plugin}
 */
function blit386WatchReload() {
    return {
        name: 'blit386-watch-reload',
        apply: 'serve',
        configureServer(server) {
            server.watcher.add(blit386DistEntry);
            server.watcher.on('change', (file) => {
                if (file === blit386DistEntry) {
                    server.ws.send({ type: 'full-reload' });
                }
            });
        },
    };
}

export default defineConfig(({ command }) => {
    const isProduction = command === 'build';
    const isServe = command === 'serve';

    return {
        base: './',

        // Dev only: point at ../blit386/dist so dev:watch picks up library rebuilds.
        // Production build resolves blit386 via node_modules (workspace package).
        resolve: {
            alias: isServe
                ? {
                      blit386: blit386DistEntry,
                  }
                : {},
        },

        plugins: [
            virtualDemos(),
            // blit386WatchReload() full-reloads on an engine dist rebuild (a changed bundle invalidates
            // everything). blit386() from 'blit386/vite' wires per-demo hot reload: it injects the
            // registerHotReload snippet into demo entry modules and watches public/ for asset changes.
            ...(isServe ? [blit386WatchReload(), blit386()] : []),
            flattenDemosPlugin(),
            demoRedirectsPlugin(),
            sitemapPlugin(),
            channelHeadersPlugin(),
        ],

        build: {
            target: 'es2022',
            minify: isProduction ? 'esbuild' : false,
            sourcemap: !isProduction,
            emptyOutDir: true,
            rollupOptions: {
                output: isProduction
                    ? {
                          compact: true,
                          generatedCode: {
                              symbols: false,
                              constBindings: true,
                          },
                          manualChunks: undefined,
                      }
                    : undefined,
            },
        },

        optimizeDeps: {
            // Load the workspace package from dist on each refresh instead of a frozen pre-bundle.
            exclude: ['blit386'],
        },

        server: {
            hmr: true,
            watch: {
                // pnpm links ../blit386; watch its dist output during `dev:watch`.
                ignored: ['**/node_modules/**', '!**/blit386/dist/**'],
            },
        },
    };
});
