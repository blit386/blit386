import { copyFileSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import handlebars from 'vite-plugin-handlebars';
import { viteStaticCopy } from 'vite-plugin-static-copy';

import { EXAMPLE_CONTEXTS } from './_config/contexts';

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

/**
 * Get context data for a page based on its filename.
 * @param pagePath - Absolute path to the HTML file
 * @returns Context object with template variables
 */
function getPageContext(pagePath) {
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
                    '001_basics': resolve(__dirname, 'demos/001-basics.html'),
                    '002_primitives': resolve(__dirname, 'demos/002-primitives.html'),
                    '003_colors': resolve(__dirname, 'demos/003-colors.html'),
                    '004_fonts': resolve(__dirname, 'demos/004-fonts.html'),
                    '005_pixel_art': resolve(__dirname, 'demos/005-pixel-art.html'),
                    '006_patterns': resolve(__dirname, 'demos/006-patterns.html'),
                    '007_camera': resolve(__dirname, 'demos/007-camera.html'),
                    '008_sprites': resolve(__dirname, 'demos/008-sprites.html'),
                    '009_animation': resolve(__dirname, 'demos/009-animation.html'),
                    '010_sprite_effects': resolve(__dirname, 'demos/010-sprite-effects.html'),
                    '011_starfield': resolve(__dirname, 'demos/011-starfield.html'),
                    '012_tilemap': resolve(__dirname, 'demos/012-tilemap.html'),
                    '013_image_output': resolve(__dirname, 'demos/013-image-output.html'),
                    '014_game_scene': resolve(__dirname, 'demos/014-game-scene.html'),
                    '015_palette_presets': resolve(__dirname, 'demos/015-palette-presets.html'),
                    '016_palette_animation': resolve(__dirname, 'demos/016-palette-animation.html'),
                    '017_palette_swap': resolve(__dirname, 'demos/017-palette-swap.html'),
                    '018_flurry': resolve(__dirname, 'demos/018-flurry.html'),
                    '019_palette_cycling': resolve(__dirname, 'demos/019-palette-cycling.html'),
                    '020_palette_fade': resolve(__dirname, 'demos/020-palette-fade.html'),
                    '021_error_preview': resolve(__dirname, 'demos/021-error-preview.html'),
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
