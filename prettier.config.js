/**
 * Prettier configuration for BLIT386
 *
 * NOTE: Prettier is used for Markdown and YAML files only.
 * TypeScript, JavaScript, JSON, and CSS are formatted by Biome.
 *
 * Keep `singleQuote` and top-level `tabWidth`: Prettier still applies them to
 * YAML and to fenced code inside Markdown (Biome does not).
 *
 * @type {import('prettier').Config}
 */
export default {
    // Base settings (applied to Markdown/YAML)
    singleQuote: true,
    tabWidth: 4,
    printWidth: 120,
    endOfLine: 'lf',
    proseWrap: 'always',
    htmlWhitespaceSensitivity: 'css',

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
