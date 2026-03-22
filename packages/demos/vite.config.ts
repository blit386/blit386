import { copyFileSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin } from 'vite';
import handlebars from 'vite-plugin-handlebars';
import { viteStaticCopy } from 'vite-plugin-static-copy';

import { EXAMPLE_CONTEXTS } from './_config/contexts';

/**
 * Vite plugin to flatten the demos/ subdirectory in the build output.
 * Moves all files from dist/demos/ to dist/ root for cleaner URLs.
 * Also rewrites asset paths in HTML files (../assets/ -> ./assets/).
 * @returns Vite plugin configuration
 */
function flattenDemosPlugin(): Plugin {
    return {
        name: 'flatten-demos',
        apply: 'build',
        closeBundle() {
            const distDir = resolve(__dirname, 'dist');
            const demosDir = join(distDir, 'demos');

            try {
                // eslint-disable-next-line security/detect-non-literal-fs-filename -- Safe: demosDir is built from __dirname constant
                const files = readdirSync(demosDir);

                for (const file of files) {
                    const srcPath = join(demosDir, file);
                    const destPath = join(distDir, file);

                    // For HTML files, rewrite asset paths before copying.
                    if (file.endsWith('.html')) {
                        // eslint-disable-next-line security/detect-non-literal-fs-filename -- Safe: srcPath derived from __dirname
                        let content = readFileSync(srcPath, 'utf-8');

                        // Fix asset paths: ../assets/ -> ./assets/, ../fonts/ -> ./fonts/
                        content = content.replace(/\.\.\/assets\//g, './assets/');
                        content = content.replace(/\.\.\/fonts\//g, './fonts/');

                        // eslint-disable-next-line security/detect-non-literal-fs-filename -- Safe: destPath derived from __dirname
                        writeFileSync(destPath, content);
                    } else {
                        copyFileSync(srcPath, destPath);
                    }
                    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Safe: srcPath derived from __dirname
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

/**
 * Get context data for a page based on its filename.
 * @param pagePath - Absolute path to the HTML file
 * @returns Context object with template variables
 */
function getPageContext(pagePath: string): Record<string, string> {
    const filename = basename(pagePath);
    // eslint-disable-next-line security/detect-object-injection -- Safe: EXAMPLE_CONTEXTS is a static config object, filename is sanitized by basename()
    return EXAMPLE_CONTEXTS[filename] ?? {};
}

export default defineConfig(({ command }) => {
    const isProduction = command === 'build';

    return {
        base: './',

        plugins: [
            handlebars({
                partialDirectory: resolve(__dirname, '_partials'),
                context: getPageContext,
            }),
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
                input: {
                    basics: resolve(__dirname, 'demos/basics.html'),
                },
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

        server: {
            open: '/demos/basics.html',
            hmr: true,
        },

        preview: {
            open: true,
        },

        optimizeDeps: {
            include: [],
            exclude: [],
        },
    };
});
