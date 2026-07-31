import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LibraryFormats } from 'vite';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    plugins: [
        dts({
            // `vite-plugin-dts`'s `rollupTypes` mode resolves both the source and destination path for its
            // single-entry bundle from the nearest `package.json`'s `types` field (walking up from `root`) before
            // falling back to `outDir`/`fileName`. This repo's root `package.json` already declares
            // `types: "./dist/blit386.d.ts"` for the main build, so without this override the second (node) build
            // would silently reuse that same path instead of writing `dist/vite.d.ts` – it would read
            // `dist/blit386.d.ts` as its bundle entry point and write the (unchanged) result back to it, leaving no
            // `vite.d.ts` behind at all. Pointing `root` at the filesystem root stops the package.json lookup from
            // ever reaching this repo's `package.json` (`/package.json` does not exist), so the plugin falls back to
            // its `outDir`/`fileName`-derived path (`dist/vite.d.ts`) instead. `outDir`, `tsconfigPath`, and
            // `include` are given as absolute paths so they still resolve correctly against the real project despite
            // the detached `root`.
            root: '/',
            outDir: path.resolve(__dirname, 'dist'),
            tsconfigPath: path.resolve(__dirname, 'tsconfig.json'),
            include: [path.resolve(__dirname, 'src/vite/**'), path.resolve(__dirname, 'src/hot/protocol.ts')],
            rollupTypes: true,
        }),
    ],

    build: {
        lib: {
            entry: 'src/vite/index.ts',
            fileName: 'vite',
            formats: ['es', 'cjs'] as LibraryFormats[],
        },
        target: 'node22',
        minify: false,
        emptyOutDir: false,
        rolldownOptions: {
            external: ['vite', /^node:/],
        },
    },
});
