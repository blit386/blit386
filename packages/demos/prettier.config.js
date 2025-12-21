/**
 * Prettier configuration for Blit-Tech
 *
 * NOTE: Prettier is used for Markdown and YAML files only.
 * TypeScript, JavaScript, JSON, and CSS are formatted by Biome.
 * HTML files are excluded (they use Handlebars syntax).
 *
 * @type {import('prettier').Config}
 */
export default {
    // Base settings (applied to Markdown/YAML)
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    useTabs: false,
    trailingComma: 'all',
    printWidth: 120,
    endOfLine: 'lf',

    overrides: [
        {
            files: ['*.md', '*.mdx'],
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
