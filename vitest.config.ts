import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        exclude: ['node_modules', 'dist'],

        // Default environment is node. Tests needing DOM use
        // the @vitest-environment happy-dom directive at file top.
        environment: 'node',

        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts', 'src/**/*.bench.ts', 'src/__test__/**'],
            thresholds: {
                statements: 80,
                branches: 80,
                functions: 80,
                lines: 80,
                // Glob thresholds do not inherit the global values above.
                'src/render/effects/**': {
                    statements: 80,
                    branches: 80,
                    functions: 80,
                    lines: 80,
                },
            },
            reporter: ['text', 'text-summary', 'lcov', 'json'],
            reportsDirectory: 'coverage',
        },

        globals: false,
        setupFiles: ['src/__test__/setup.ts'],
        reporters: ['default'],
        testTimeout: 10_000,

        benchmark: {
            include: ['src/**/*.bench.ts'],
            exclude: ['node_modules', 'dist'],
            reporters: ['default'],
        },
    },
});
