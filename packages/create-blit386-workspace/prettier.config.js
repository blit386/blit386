/**
 * Prettier configuration.
 *
 * NOTE: Prettier handles Markdown, Cursor rules (`.mdc`), and YAML only. TypeScript, JavaScript, and JSON are formatted by Biome.
 *
 * @type {import('prettier').Config}
 */
export default {
    semi: true,
    singleQuote: true,
    tabWidth: 4,
    useTabs: false,
    trailingComma: 'all',
    printWidth: 120,
    endOfLine: 'lf',
    proseWrap: 'always',

    overrides: [
        {
            files: ['*.md', '*.mdx', '*.mdc'],
            options: {
                parser: 'markdown',
                proseWrap: 'always',
                tabWidth: 2,
            },
        },
        {
            files: ['*.yml', '*.yaml'],
            options: {
                tabWidth: 2,
            },
        },
    ],
};
