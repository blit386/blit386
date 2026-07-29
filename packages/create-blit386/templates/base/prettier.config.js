/**
 * Prettier configuration for {{packageName}}
 *
 * Prettier takes care of the writing (Markdown and YAML); Biome takes care of the
 * code (JavaScript, TypeScript, JSON). They never touch the same file.
 *
 * The code-looking options below still matter: Prettier applies them to code
 * examples fenced inside Markdown.
 *
 * Markdown tables use single-space padding (see ./scripts/prettier-plugin-compact-tables.mjs),
 * so editing one cell does not rewrite every row of the table.
 *
 * @type {import('prettier').Config}
 */
export default {
    plugins: ['./scripts/prettier-plugin-compact-tables.mjs'],

    // Base settings (applied to Markdown/YAML)
    semi: true,
    singleQuote: true,
    tabWidth: 4,
    useTabs: false,
    trailingComma: 'all',
    printWidth: 120,
    endOfLine: 'lf',
    proseWrap: 'always',
    htmlWhitespaceSensitivity: 'css',

    overrides: [
        {
            files: ['*.md', '*.mdx', '*.mdc'],
            options: {
                parser: 'markdown-compact',
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
