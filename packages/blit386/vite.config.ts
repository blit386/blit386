import process from 'node:process';

import type { LibraryFormats, PluginOption } from 'vite';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

/**
 * Whether this build is a Vite watch build.
 *
 * Vite's CLI registers the flag as `-w, --watch`, so both spellings have to count: reading only
 * `--watch` leaves `vite build -w` running every production-only setting while the CLI watches.
 *
 * @param argv – The process argv to check for a watch flag.
 * @returns `true` under `--watch` or `-w`, `false` otherwise.
 */
export const resolveIsWatch = (argv: readonly string[]): boolean => argv.includes('--watch') || argv.includes('-w');

/**
 * The declaration-emit plugins for a build, empty under watch.
 *
 * Api-extractor's rollup crashes on every rebuild after the first in a watch session, throwing an
 * internal error while re-reading the previous cycle's `dist/*.d.ts` output – see BT-426. Emitting
 * per-file declarations instead only trades that crash for a `dist/blit386.d.ts` overwritten with
 * un-rolled output plus a growing tree of stale per-file declarations beside it. Nothing consumes
 * declarations mid-watch (`packages/demos` aliases the JS bundle and types `blit386` from `src/`),
 * so a watch build skips declaration emit entirely and leaves the preceding full build's rolled-up
 * `dist/blit386.d.ts` in place.
 *
 * @param isWatch – Whether this is a watch build.
 * @returns The dts plugin for a production build, or no plugins under watch.
 */
export const createDeclarationPlugins = (isWatch: boolean): PluginOption[] =>
    isWatch
        ? []
        : [
              dts({
                  include: ['src/**/*.ts'],
                  rollupTypes: true,
                  beforeWriteFile: (filePath, content) => ({
                      filePath: filePath.replace(/BLIT386\.d\.ts$/, 'blit386.d.ts'),
                      content,
                  }),
              }),
          ];

export default defineConfig(() => {
    const isWatch = resolveIsWatch(process.argv);

    return {
        base: '/',

        plugins: [...createDeclarationPlugins(isWatch)],

        // Handle WGSL shader files as raw text
        assetsInclude: ['**/*.wgsl'],

        build: {
            // Library build configuration
            lib: {
                entry: 'src/BLIT386.ts',
                name: 'BLIT386',
                fileName: 'blit386',
                formats: ['es', 'cjs'] as LibraryFormats[],
            },
            target: 'es2022',
            minify: isWatch ? false : ('esbuild' as const),
            sourcemap: isWatch,
            // Load-bearing under watch: not emptying `dist` is what preserves the rolled-up
            // `dist/blit386.d.ts` that the preceding full build produced.
            emptyOutDir: !isWatch,
            watch: isWatch ? {} : null,
            rolldownOptions: {
                treeshake: {
                    moduleSideEffects: false,
                    propertyReadSideEffects: false,
                } as const,
            },
        },
    };
});
