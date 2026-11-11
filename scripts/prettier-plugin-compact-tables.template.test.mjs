import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import prettier from 'prettier';

/**
 * The scaffolder ships its own copy of the compact-tables plugin into every generated game
 * (`packages/create-blit386/templates/base/scripts/`), under a beginner-facing header. The root suite
 * (`prettier-plugin-compact-tables.test.mjs`) covers the canonical copy in depth; this one formats a
 * corpus through both copies and requires identical output, so the shipped copy cannot drift in
 * behavior unseen.
 */
const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_PLUGIN = join(SCRIPTS_DIR, 'prettier-plugin-compact-tables.mjs');
const TEMPLATE_PLUGIN = join(
    SCRIPTS_DIR,
    '../packages/create-blit386/templates/base/scripts/prettier-plugin-compact-tables.mjs',
);

/** @param {string} plugin @param {string} source @returns {Promise<string>} */
const format = (plugin, source) =>
    prettier.format(source, {
        parser: 'markdown-compact',
        plugins: [plugin],
        proseWrap: 'always',
        printWidth: 120,
        tabWidth: 2,
    });

/** @type {Record<string, string>} */
const CORPUS = {
    'uneven widths':
        '| Command | Description |\n| --- | --- |\n| a | short |\n| a-much-longer-command | a longer one |\n',
    'padded input': '| Command    | Description |\n| ---------- | ----------- |\n| a          | short       |\n',
    alignment: '| L | R | C | D |\n| :-- | --: | :-: | -- |\n| 1 | 2 | 3 | 4 |\n',
    'inline content': '| A | B |\n| --- | --- |\n| some *emphasis* and `code` | a \\| b |\n',
    'short row': '| A | B | C |\n| --- | --- | --- |\n| only one |\n',
    'wider than printWidth': `| A | B |\n| --- | --- |\n| ${'w'.repeat(200)} | x |\n`,
    'prose around a table': '# Title\n\nSome text.\n\n| A |\n| --- |\n| 1 |\n\nMore text.\n',
};

describe('prettier-plugin-compact-tables template copy', () => {
    for (const [name, source] of Object.entries(CORPUS)) {
        it(`formats "${name}" exactly like the root copy`, async () => {
            assert.equal(await format(TEMPLATE_PLUGIN, source), await format(ROOT_PLUGIN, source));
        });
    }
});
