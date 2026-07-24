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
        // Emitted as standalone modules so the scaffolder, unit tests, and CLI can import them
        // without pulling in the full blit bin (adapters, codemod engine, migration registry, env).
        entry: {
            adapters: 'src/adapters.ts',
            env: 'src/env.ts',
            'migrations/codemod': 'src/migrations/codemod.ts',
            'migrations/registry': 'src/migrations/registry.ts',
            'migrations/enableHotReload': 'src/migrations/enableHotReload.ts',
        },
        format: ['esm'],
        target: 'node22',
        sourcemap: true,
        // Declaration files so create-blit386 can typecheck `import … from '@blit386/kit/adapters'`.
        dts: true,
    },
]);
