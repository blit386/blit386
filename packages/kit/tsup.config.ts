import { defineConfig } from 'tsup';

export default defineConfig([
    {
        entry: { cli: 'src/cli.ts' },
        format: ['esm'],
        target: 'node22',
        clean: true,
        sourcemap: true,
        // The bin entry needs a shebang so it runs directly as `blit`.
        banner: { js: '#!/usr/bin/env node' },
    },
    {
        // Emitted as standalone modules so the unit tests can import the codemod engine, migration
        // registry, and env helpers (caret-range checks used by `blit doctor`).
        entry: {
            env: 'src/env.ts',
            'migrations/codemod': 'src/migrations/codemod.ts',
            'migrations/registry': 'src/migrations/registry.ts',
            'migrations/enableHotReload': 'src/migrations/enableHotReload.ts',
        },
        format: ['esm'],
        target: 'node22',
        sourcemap: true,
    },
]);
