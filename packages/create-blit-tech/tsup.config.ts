import { defineConfig } from 'tsup';

export default defineConfig({
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node22',
    clean: true,
    sourcemap: true,
    // The bin entry needs a shebang so it runs directly via `npm create blit-tech`.
    banner: { js: '#!/usr/bin/env node' },
});
