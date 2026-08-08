import process from 'node:process';

import type { LibraryFormats } from 'vite';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

/**
 * Whether the dts plugin should run api-extractor's declaration rollup.
 *
 * Api-extractor's rollup crashes intermittently when a watch rebuild's per-file `.d.ts`
 * tree is still being rewritten as it starts reading it – see BT-426. It only ever needs
 * to run for the final, non-watch production build.
 *
 * @param argv – The process argv to check for a `--watch` flag.
 * @returns `false` under `--watch`, `true` otherwise.
 */
export const resolveDtsRollupTypes = (argv: readonly string[]): boolean => !argv.includes('--watch');

export default defineConfig(() => {
    const isWatch = process.argv.includes('--watch');

    return {
        base: '/',

        plugins: [
            dts({
                include: ['src/**/*.ts'],
                rollupTypes: resolveDtsRollupTypes(process.argv),
                beforeWriteFile: (filePath, content) => ({
                    filePath: filePath.replace(/BLIT386\.d\.ts$/, 'blit386.d.ts'),
                    content,
                }),
            }),
        ],

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
