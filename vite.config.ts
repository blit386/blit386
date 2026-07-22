import process from 'node:process';

import type { LibraryFormats } from 'vite';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => {
    const isWatch = process.argv.includes('--watch');

    return {
        base: '/',

        plugins: [
            dts({
                include: ['src/**/*.ts'],
                rollupTypes: true,
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
