import { defineConfig } from 'tsup';

export default defineConfig({
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    target: 'node22',
    clean: true,
    sourcemap: true,
    // The bin entry needs a shebang so it runs directly as `blit`.
    banner: { js: '#!/usr/bin/env node' },
});
