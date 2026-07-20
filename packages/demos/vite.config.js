import { copyFileSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blit386 } from 'blit386/vite';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

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
            const distDir = resolve(__dirname, 'dist');
            const demosDir = join(distDir, 'demos');

            try {
                const files = readdirSync(demosDir);

                for (const file of files) {
                    const srcPath = join(demosDir, file);
                    const destPath = join(distDir, file);

                    // For HTML files, rewrite asset paths before copying.
                    if (file.endsWith('.html')) {
                        let content = readFileSync(srcPath, 'utf-8');

                        // Fix asset paths: ../assets/ -> ./assets/, ../fonts/ -> ./fonts/
                        content = content.replace(/\.\.\/assets\//g, './assets/');
                        content = content.replace(/\.\.\/fonts\//g, './fonts/');

                        writeFileSync(destPath, content);
                    } else {
                        copyFileSync(srcPath, destPath);
                    }
                    unlinkSync(srcPath);
                }

                // Remove empty demos directory.
                rmSync(demosDir, { recursive: true });
            } catch {
                // Demos directory may not exist in dev mode.
            }
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
            viteStaticCopy({
                targets: [
                    {
                        src: 'public/fonts/*',
                        dest: 'fonts',
                    },
                    {
                        src: 'public/_headers',
                        dest: '.',
                    },
                ],
            }),
            flattenDemosPlugin(),
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
            open: '/demos/001-basics.html',
            hmr: true,
            watch: {
                // pnpm links ../blit386; watch its dist output during `dev:watch`.
                ignored: ['**/node_modules/**', '!**/blit386/dist/**'],
            },
        },

        preview: {
            open: true,
        },
    };
});
