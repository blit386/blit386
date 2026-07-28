/**
 * Prettier configuration for blit386-demos
 *
 * NOTE: Prettier is used for Markdown, Cursor rules (`.mdc`), and YAML files only.
 * TypeScript, JavaScript, JSON, and CSS are formatted by Biome.
 * HTML files are excluded (they use Handlebars syntax).
 *
 * The JS-looking options are not dead weight: Prettier applies them to fenced code
 * blocks inside Markdown, and `singleQuote`/`tabWidth` also to YAML (Biome does not).
 *
 * Markdown tables are printed with single-space padding by the local compact-tables
 * plugin, so editing one cell no longer reflows the whole table.
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
