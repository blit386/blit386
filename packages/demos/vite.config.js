import { copyFileSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

export default defineConfig(({ command }) => {
    const isProduction = command === 'build';

    return {
        base: './',

        plugins: [
            virtualDemos(),
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

        server: {
            open: '/demos/001-basics.html',
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
