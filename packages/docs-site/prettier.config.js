/**
 * Prettier configuration for blit386-dev-fumapress.
 *
 * Prettier formats Markdown, MDX, Cursor rules (.mdc), and YAML only. TypeScript, JSON, and CSS use Biome.
 *
 * @type {import('prettier').Config}
 */
export default {
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
                parser: 'markdown',
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
