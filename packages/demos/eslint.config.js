import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import perfectionistPlugin from 'eslint-plugin-perfectionist';
import promisePlugin from 'eslint-plugin-promise';
import securityPlugin from 'eslint-plugin-security';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';

export default [
    // Global ignores
    {
        ignores: [
            '.env*',
            '**/*.md',
            '**/*.mdx',
            '**/*.min.js',
            '**/build/**',
            '**/coverage/**',
            '**/dist/**',
            '**/.wrangler/**',
            '**/node_modules/**',
            '.pnpm-store/**',
            '**/.pnpm-store/**',
        ],
    },

    // JavaScript config files (vite.config.js, eslint.config.js, etc.)
    {
        files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
        ignores: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.es2022,
            },
        },
        plugins: {
            jsdoc: jsdocPlugin,
            perfectionist: perfectionistPlugin,
            promise: promisePlugin,
            security: securityPlugin,
        },
        rules: {
            ...eslint.configs.recommended.rules,
            'no-console': 'off',
            'no-debugger': 'error',
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

            // JSDoc rules (relaxed for config files)
            'jsdoc/check-alignment': 'warn',
            'jsdoc/check-param-names': 'warn',
            'jsdoc/check-tag-names': 'warn',

            // Code quality rules
            complexity: ['warn', { max: 15 }],

            // Security rules
            'security/detect-object-injection': 'warn',

            // General code style
            'max-len': ['warn', { code: 120, ignoreUrls: true, ignoreStrings: true }],
        },
    },

    // Demo source files (src/*.js) - browser environment, relaxed rules
    {
        files: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.es2022,
            },
        },
        plugins: {
            jsdoc: jsdocPlugin,
            perfectionist: perfectionistPlugin,
            promise: promisePlugin,
            security: securityPlugin,
            'simple-import-sort': simpleImportSort,
        },
        rules: {
            ...eslint.configs.recommended.rules,
            'no-console': 'off',
            'no-debugger': 'error',
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

            // Import sorting
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',

            // JSDoc rules (relaxed for demos)
            'jsdoc/check-alignment': 'warn',
            'jsdoc/check-param-names': 'off',
            'jsdoc/check-tag-names': 'warn',
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
            'jsdoc/require-returns': 'off',
            'jsdoc/require-description': 'off',

            // Code quality rules
            complexity: ['warn', { max: 15 }],

            // Promise rules
            ...promisePlugin.configs.recommended.rules,
            'promise/always-return': 'warn',
            'promise/catch-or-return': 'warn',
            'promise/no-return-wrap': 'error',
            'promise/param-names': 'error',
            'promise/no-nesting': 'warn',

            // Security rules
            // detect-object-injection is disabled for demos: all array/object indexing here
            // uses controlled game-state values, never untrusted user input.
            ...securityPlugin.configs.recommended.rules,
            'security/detect-object-injection': 'off',

            // General code style
            'max-len': ['warn', { code: 120, ignoreUrls: true, ignoreStrings: true }],
        },
    },

    // Config files - relaxed JSDoc
    {
        files: ['*.config.js', '*.config.mjs'],
        rules: {
            'jsdoc/require-jsdoc': 'off',
        },
    },

    // Prettier config (must be last)
    prettierConfig,
];
