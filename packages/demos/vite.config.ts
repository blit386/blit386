import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import handlebars from 'vite-plugin-handlebars';
import { viteStaticCopy } from 'vite-plugin-static-copy';

import { exampleContexts } from './_config/contexts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Get context data for a page based on its filename.
 * @param pagePath - Absolute path to the HTML file
 * @returns Context object with template variables
 */
function getPageContext(pagePath: string): Record<string, string> {
    const filename = basename(pagePath);
    // eslint-disable-next-line security/detect-object-injection -- Safe: exampleContexts is a static config object, filename is sanitized by basename()
    return exampleContexts[filename] ?? {};
}

export default defineConfig(({ command }) => {
    const isProduction = command === 'build';

    return {
        base: './',

        plugins: [
            tailwindcss(),
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
                ],
            }),
        ],

        build: {
            target: 'es2022',
            minify: isProduction ? 'esbuild' : false,
            sourcemap: !isProduction,
            emptyOutDir: true,
            rollupOptions: {
                input: {
                    main: resolve(__dirname, 'demos/index.html'),
                    landing: resolve(__dirname, 'demos/landing.html'),
                    basics: resolve(__dirname, 'demos/basics.html'),
                    primitives: resolve(__dirname, 'demos/primitives.html'),
                    camera: resolve(__dirname, 'demos/camera.html'),
                    patterns: resolve(__dirname, 'demos/patterns.html'),
                    sprites: resolve(__dirname, 'demos/sprites.html'),
                    animation: resolve(__dirname, 'demos/animation.html'),
                    'sprite-effects': resolve(__dirname, 'demos/sprite-effects.html'),
                    fonts: resolve(__dirname, 'demos/fonts.html'),
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
            open: '/demos/index.html',
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
