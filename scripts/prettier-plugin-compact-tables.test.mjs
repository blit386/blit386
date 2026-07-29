import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import prettier from 'prettier';

/**
 * Everything here formats through `prettier.format`, the same entry point the repo's `format` script
 * and the editor integrations use. Calling the printer directly would let the plugin pass while the
 * doc-building code around it is broken.
 *
 * Most cases pass `parser` and `plugins` explicitly so a behavior failure points straight at the
 * plugin. That deliberately bypasses config resolution, so the `repository configuration` suite at
 * the bottom formats through `prettier.config.js` instead - without it, deleting the plugin from the
 * config would leave every other case in this file green while the repo formatted padded tables.
 */
const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPTS_DIR, '..');
const PLUGIN = join(SCRIPTS_DIR, 'prettier-plugin-compact-tables.mjs');

/**
 * The Markdown options this repo's `prettier.config.js` resolves to, plus the plugin under test.
 *
 * @type {import('prettier').Options}
 */
const OPTIONS = {
    parser: 'markdown-compact',
    plugins: [PLUGIN],
    proseWrap: 'always',
    printWidth: 120,
    tabWidth: 2,
};

/**
 * Format a Markdown source string through the plugin.
 *
 * @param {string} source Markdown to format.
 * @param {import('prettier').Options} [overrides] Options layered over {@link OPTIONS}.
 * @returns {Promise<string>} The formatted document.
 */
const format = (source, overrides = {}) => prettier.format(source, { ...OPTIONS, ...overrides });

/**
 * Join lines into a Markdown document with a trailing newline, so fixtures stay readable.
 *
 * @param {...string} lines Lines of the document, without newlines.
 * @returns {string} The joined document.
 */
const doc = (...lines) => `${lines.join('\n')}\n`;

describe('prettier-plugin-compact-tables', () => {
    describe('cell padding', () => {
        it('pads every cell with exactly one space regardless of column width', async () => {
            const source = doc(
                '| Command | Description |',
                '| --- | --- |',
                '| a | short |',
                '| a-very-much-longer-command | a considerably longer description |',
            );

            assert.equal(
                await format(source),
                doc(
                    '| Command | Description |',
                    '| --- | --- |',
                    '| a | short |',
                    '| a-very-much-longer-command | a considerably longer description |',
                ),
            );
        });

        it('collapses an already-aligned table down to compact form', async () => {
            const source = doc(
                '| Command                    | Description                    |',
                '| -------------------------- | ------------------------------ |',
                '| a                          | short                          |',
            );

            assert.equal(await format(source), doc('| Command | Description |', '| --- | --- |', '| a | short |'));
        });

        it('leaves a table wider than printWidth compact rather than wrapping it', async () => {
            const wide = 'w'.repeat(200);
            const formatted = await format(doc('| A | B |', '| --- | --- |', `| ${wide} | ${wide} |`));

            assert.equal(formatted, doc('| A | B |', '| --- | --- |', `| ${wide} | ${wide} |`));
        });
    });

    describe('alignment', () => {
        it('emits a three-dash delimiter for each alignment variant', async () => {
            const source = doc('| L | R | C | D |', '| :-- | --: | :-: | -- |', '| 1 | 2 | 3 | 4 |');

            assert.equal(
                await format(source),
                doc('| L | R | C | D |', '| :--- | ---: | :---: | --- |', '| 1 | 2 | 3 | 4 |'),
            );
        });

        it('preserves alignment when collapsing a padded delimiter row', async () => {
            const source = doc('| Left      | Right     |', '| :-------- | --------: |', '| 1         | 2         |');

            assert.equal(await format(source), doc('| Left | Right |', '| :--- | ---: |', '| 1 | 2 |'));
        });
    });

    describe('cell content', () => {
        it('normalizes inline formatting exactly as Prettier does elsewhere', async () => {
            const formatted = await format(doc('| A |', '| --- |', '| some *emphasis* and `code` |'));

            assert.match(formatted, /\| some _emphasis_ and `code` \|/u);
        });

        it('keeps an escaped pipe inside a cell escaped, without splitting the cell', async () => {
            const formatted = await format(doc('| Pattern | Meaning |', '| --- | --- |', '| a \\| b | union |'));

            assert.equal(formatted, doc('| Pattern | Meaning |', '| --- | --- |', '| a \\| b | union |'));
        });

        it('pads a short row out to the column count with empty cells', async () => {
            const formatted = await format(doc('| A | B | C |', '| --- | --- | --- |', '| 1 |'));

            assert.equal(formatted, doc('| A | B | C |', '| --- | --- | --- |', '| 1 |  |  |'));
        });
    });

    describe('nesting', () => {
        it('keeps list indentation on a table inside a list item', async () => {
            const source = doc('- item:', '', '  | A | Bee |', '  | --- | --- |', '  | 1 | 2222222222 |');

            assert.equal(
                await format(source),
                doc('- item:', '', '  | A | Bee |', '  | --- | --- |', '  | 1 | 2222222222 |'),
            );
        });

        it('keeps the blockquote prefix on every row of a quoted table', async () => {
            const source = doc('> | A | Bee |', '> | --- | --- |', '> | 1 | 2222222222 |');

            assert.equal(await format(source), doc('> | A | Bee |', '> | --- | --- |', '> | 1 | 2222222222 |'));
        });
    });

    describe('non-table content', () => {
        it('still wraps prose at printWidth', async () => {
            const long = `${'word '.repeat(40).trim()}\n`;
            const formatted = await format(long);

            assert.ok(formatted.split('\n').length > 2, 'long prose should wrap onto several lines');
            assert.ok(
                formatted.split('\n').every((line) => line.length <= 120),
                'no wrapped prose line should exceed printWidth',
            );
        });

        it('leaves a document with no tables byte-identical to stock Markdown output', async () => {
            const source = doc('# Title', '', '- one', '- two', '', '```js', "const a = 'b';", '```');
            const stock = await prettier.format(source, { ...OPTIONS, parser: 'markdown', plugins: [] });

            assert.equal(await format(source), stock);
        });
    });

    describe('idempotence', () => {
        it('produces identical output on a second pass', async () => {
            const source = doc(
                '# Heading',
                '',
                'Prose that is long enough that Prettier has to make a wrapping decision about it somewhere.',
                '',
                '| Command | Description | Notes |',
                '| :-- | --: | :-: |',
                '| a | short |',
                '| bbbbbbbbbbbb | a *longer* one with `code` | y |',
                '',
                '- item:',
                '',
                '  | A | B |',
                '  | --- | --- |',
                '  | 1 | 2 |',
            );

            const once = await format(source);

            assert.equal(await format(once), once);
        });
    });

    describe('cursor preservation', () => {
        /**
         * Prettier's own table printer also takes only `.formatted` from `printDocToString`, so cell
         * sub-docs carry no cursor markers upstream either. What must hold is that `formatWithCursor`
         * still lands the caret on the same character it started on.
         */
        it('lands the caret on the same character as stock Prettier does', async () => {
            const source = doc('| Name | Description |', '| --- | --- |', '| alpha | some text here |', '| beta | b |');
            const cursorOffset = source.indexOf('some text') + 3;

            const stock = await prettier.formatWithCursor(source, {
                ...OPTIONS,
                parser: 'markdown',
                plugins: [],
                cursorOffset,
            });
            const compact = await prettier.formatWithCursor(source, { ...OPTIONS, cursorOffset });

            /**
             * The three characters on each side of where the caret ended up.
             *
             * @param {{ formatted: string, cursorOffset: number }} result A `formatWithCursor` result.
             * @returns {string} The text the caret landed in.
             */
            const around = ({ formatted, cursorOffset: offset }) => formatted.slice(offset - 3, offset + 3);

            assert.equal(around(compact), around(stock));
        });
    });

    describe('repository configuration', () => {
        /**
         * Paths need not exist: `resolveConfig` locates `prettier.config.js` by walking up from the
         * path and matches the `overrides` globs against it, so synthetic names keep this suite from
         * breaking when a real doc is renamed.
         *
         * @param {string} name File name to resolve config for, relative to the repo root.
         * @returns {string} Absolute path to the synthetic fixture.
         */
        const fixture = (name) => join(REPO_ROOT, name);

        it('selects the compact parser and the plugin for every Markdown extension', async () => {
            for (const name of ['fixture.md', 'fixture.mdx']) {
                const config = await prettier.resolveConfig(fixture(name));

                assert.equal(config?.parser, 'markdown-compact', `${name} should resolve to the compact parser`);
                assert.ok(
                    config?.plugins?.some((plugin) => plugin === PLUGIN),
                    `${name} should resolve the compact-tables plugin`,
                );
            }
        });

        it('emits compact tables when formatting through the repo config alone', async () => {
            const path = fixture('fixture.md');
            const config = await prettier.resolveConfig(path);
            const source = doc(
                '| Command | Description |',
                '| --- | --- |',
                '| a | short |',
                '| a-very-much-longer-command | a considerably longer description |',
            );

            // No parser and no plugins here on purpose: prettier.config.js has to supply both.
            const formatted = await prettier.format(source, { ...config, filepath: path });

            assert.equal(formatted, source);
        });
    });
});
