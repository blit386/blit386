import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import perfectionistPlugin from 'eslint-plugin-perfectionist';
import promisePlugin from 'eslint-plugin-promise';
import securityPlugin from 'eslint-plugin-security';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';

const TSCONFIG_PATH = './tsconfig.json';

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
            '**/node_modules/**',
            'scripts/__fixtures__/**',
            '.pnpm-store/**',
            '**/.pnpm-store/**',
            'vite.config.ts.timestamp-*',
            'tests/visual/**/*.html',
            '.remember/**',
            '.claude/**',
        ],
    },

    // TypeScript files
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                project: TSCONFIG_PATH,
            },
            globals: {
                ...globals.browser,
                ...globals.es2022,
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
            jsdoc: jsdocPlugin,
            perfectionist: perfectionistPlugin,
            promise: promisePlugin,
            security: securityPlugin,
            'simple-import-sort': simpleImportSort,
        },
        rules: {
            // Base ESLint rules
            ...eslint.configs.recommended.rules,
            'no-console': 'off',
            'no-debugger': 'error',
            'no-unused-vars': 'off', // TypeScript handles this

            // TypeScript rules
            ...tseslint.configs.recommended.rules,
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
            '@typescript-eslint/naming-convention': 'off',

            // Import sorting
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',

            // Class member ordering (matches docs/developer-experience-guide.md "File structure and
            // member order" and CLAUDE.md "TypeScript file structure"). type: 'unsorted' enforces the
            // group order only and preserves the hand-tuned order within each group.
            'perfectionist/sort-classes': [
                'error',
                {
                    type: 'unsorted',
                    groups: [
                        'index-signature',
                        // 1. Static fields (cached singletons, registries)
                        [
                            'static-property',
                            'protected-static-property',
                            'private-static-property',
                            'static-accessor-property',
                        ],
                        'static-block',
                        // 2. Instance fields: public -> protected -> private
                        ['property', 'accessor-property'],
                        ['protected-property', 'protected-accessor-property'],
                        ['private-property', 'private-accessor-property'],
                        // 3. Constructor
                        'constructor',
                        // 4. Accessors: static getters/setters, then instance getters/setters
                        [
                            'static-get-method',
                            'static-set-method',
                            'protected-static-get-method',
                            'protected-static-set-method',
                            'private-static-get-method',
                            'private-static-set-method',
                        ],
                        [
                            'get-method',
                            'set-method',
                            'protected-get-method',
                            'protected-set-method',
                            'private-get-method',
                            'private-set-method',
                        ],
                        // 5. Static methods: public -> protected -> private
                        ['static-method', 'static-function-property'],
                        ['protected-static-method', 'protected-static-function-property'],
                        ['private-static-method', 'private-static-function-property'],
                        // 6. Instance methods: public -> protected -> private
                        ['method', 'function-property'],
                        ['protected-method', 'protected-function-property'],
                        ['private-method', 'private-function-property'],
                        'unknown',
                    ],
                },
            ],

            // JSDoc rules
            'jsdoc/check-alignment': 'warn',
            'jsdoc/check-param-names': 'warn',
            'jsdoc/check-tag-names': ['warn', { definedTags: ['changed'] }],
            'jsdoc/require-jsdoc': [
                'warn',
                {
                    require: {
                        FunctionDeclaration: true,
                        MethodDefinition: true,
                        ClassDeclaration: true,
                    },
                    contexts: ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration'],
                },
            ],
            'jsdoc/require-param': 'warn',
            'jsdoc/require-returns': 'warn',
            'jsdoc/require-description': 'warn',

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
            ...securityPlugin.configs.recommended.rules,
            'security/detect-object-injection': 'warn',

            // General code style
            'max-len': ['warn', { code: 120, ignoreUrls: true, ignoreStrings: true }],
        },
    },

    // JavaScript config files
    {
        files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
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

            // JSDoc rules (relaxed for JS config files)
            'jsdoc/check-alignment': 'warn',
            'jsdoc/check-param-names': 'warn',
            'jsdoc/check-tag-names': ['warn', { definedTags: ['changed'] }],

            // Code quality rules
            complexity: ['warn', { max: 15 }],

            // Security rules
            'security/detect-object-injection': 'warn',

            // General code style
            'max-len': ['warn', { code: 120, ignoreUrls: true, ignoreStrings: true }],
        },
    },

    // Config files - relaxed rules
    {
        files: ['*.config.js', '*.config.ts', '*.config.mjs', '**/*.config.js', '**/*.config.ts', '**/*.config.mjs'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.es2022,
            },
        },
        rules: {
            'jsdoc/require-jsdoc': 'off',
        },
    },

    // Test files - relaxed rules
    {
        files: ['**/*.test.ts', 'src/__test__/**/*.ts', 'tests/visual/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2022,
            },
        },
        rules: {
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
            'jsdoc/require-returns': 'off',
            'jsdoc/require-description': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            'security/detect-non-literal-fs-filename': 'off',
            'no-undef': 'off',
        },
    },

    // Prettier config (must be last)
    prettierConfig,
];
