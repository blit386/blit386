import { defineConfig } from 'vitest/config';

/**
 * Vitest covers `src/**` – the Fumapress `ServerPlugin`s that run in the deployed Worker.
 *
 * The `scripts/**` suite stays on `node --test` (see `test:scripts` in package.json): it is
 * plain `.mjs` with `node:assert`, it runs in under a second, and migrating it would be churn.
 * Two runners in one package is the same split `packages/blit386` already uses.
 *
 * Plain Vitest rather than `@cloudflare/vitest-pool-workers` – see `CLAUDE.md`, "Test runners",
 * for the trade-off and the accepted fidelity gap.
 */
export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        exclude: ['node_modules', 'dist', '.source'],

        // The plugins under test import `fumapress` type-only, so esbuild strips those imports
        // and Waku never loads. Node supplies Request/Response/Headers, which is the entire
        // web-standard surface the plugins touch – no setup file and no DOM are needed.
        environment: 'node',

        coverage: {
            provider: 'v8',

            // The Worker plugins plus the one data module with logic in it. `src/data/authors.ts`,
            // `community.ts`, `demos.ts`, and `site.ts` are static content constants with no
            // branches, and `src/components/**` is React – both are deliberately outside the
            // denominator rather than padding it.
            include: ['src/*.ts', 'src/data/api-history.ts'],
            exclude: ['src/**/*.test.ts', 'src/__test__/**', 'src/css-modules.d.ts'],

            thresholds: {
                statements: 80,
                branches: 80,
                functions: 80,
                lines: 80,
            },
            // The text table omits files at 100%, so a module missing from it is covered rather
            // than skipped. `--coverage.reporter=json-summary` lists every file if you need to
            // confirm one is in the denominator.
            reporter: ['text', 'text-summary'],
            reportsDirectory: 'coverage',
        },

        globals: false,
        reporters: ['default'],
    },
});
