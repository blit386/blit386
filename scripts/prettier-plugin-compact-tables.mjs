/**
 * Prettier plugin: compact Markdown tables.
 *
 * Canonical copy: `blit386/scripts/prettier-plugin-compact-tables.mjs`. The same file is mirrored into
 * `blit386-demos`, `blit386-dev-fumapress`, `create-blit386`, and `_GAMES_/blit-ball` - keep them identical. The
 * scaffolder template (`create-blit386/packages/create-blit386/templates/base/scripts/`) carries the same code under a
 * beginner-facing opening comment.
 *
 * Prettier pads every table cell out to the width of the widest cell in its column, so editing a single cell rewrites
 * every row of the table. This plugin keeps Prettier's whole Markdown printer and replaces only the `table` case with
 * a single-space layout, so a table diff touches just the lines that actually changed.
 *
 * Cell contents still go through Prettier's own inline printer, so emphasis normalization, escaped pipes, and
 * short-row padding behave exactly as before. The only behavioral change is the removal of alignment whitespace.
 *
 * Wiring: a config points its Markdown files at the `markdown-compact` parser exported below, which is Prettier's own
 * Markdown parser retargeted at this plugin's printer. The stock `markdown` parser is left untouched.
 */

import { doc } from 'prettier';
import * as markdown from 'prettier/plugins/markdown.mjs';

/**
 * One column's alignment as mdast records it, read from the source delimiter row.
 *
 * @typedef {'left' | 'right' | 'center' | null} ColumnAlignment
 */

/**
 * The subset of the mdast `table` node this plugin reads.
 *
 * @typedef {object} TableNode
 * @property {'table'} type Node kind; the printer dispatches on this.
 * @property {ColumnAlignment[]} [align] Per-column alignment, one entry per declared column.
 * @property {unknown[]} children The `tableRow` nodes, header row first.
 */

/**
 * Prettier's child printer, as handed to a printer's `print` method.
 *
 * @typedef {(path: import('prettier').AstPath) => import('prettier').Doc} PrintChild
 */

const { hardline, join } = doc.builders;
const { printDocToString } = doc.printer;

/** Prettier's own Markdown printer. Wrapped below so every node except `table` keeps its stock output. */
const basePrinter = markdown.printers.mdast;

/**
 * Delimiter-row cell for each mdast alignment value.
 *
 * Three dashes is the form every Markdown renderer accepts, so the output stays portable. A column with no explicit
 * alignment is absent from this map on purpose and falls through to the `---` default at the call site.
 *
 * @type {Record<Exclude<ColumnAlignment, null>, string>}
 */
const DELIMITERS = {
    left: ':---',
    right: '---:',
    center: ':---:',
};

/**
 * Print one table cell to a flat string using Prettier's own inline printer.
 *
 * Wrapping is disabled (`printWidth: Infinity`) because a table row is always one line: the row, not the print width,
 * decides where output breaks. Printing through `print` rather than slicing the source is what keeps Prettier's usual
 * inline normalization - emphasis style, escaping, link shortening - identical to stock output.
 *
 * @param {import('prettier').AstPath} cellPath Path positioned at a `tableCell` node.
 * @param {import('prettier').ParserOptions} options Resolved Prettier options for the file being formatted.
 * @param {PrintChild} print Prettier's child printer.
 * @returns {string} The cell's rendered content, with no surrounding pipes or padding.
 */
const printCell = (cellPath, options, print) =>
    printDocToString(print(cellPath), { ...options, printWidth: Number.POSITIVE_INFINITY }).formatted;

/**
 * Render a table with single-space cell padding instead of column alignment.
 *
 * The column count is the widest of the declared alignments and the longest row, so a row with missing cells is padded
 * out with empty ones exactly as Prettier's own printer would. Rows are joined with `hardline` rather than a literal
 * newline so that Prettier reapplies list indentation and blockquote `>` prefixes when the table is nested.
 *
 * @param {import('prettier').AstPath} path Path positioned at a `table` node (`path.node` is a {@link TableNode}).
 * @param {import('prettier').ParserOptions} options Resolved Prettier options for the file being formatted.
 * @param {PrintChild} print Prettier's child printer.
 * @returns {import('prettier').Doc} The table as a doc: header row, delimiter row, then one line per body row.
 */
const printTable = (path, options, print) => {
    const { node } = path;

    const rows = path.map(
        (rowPath) => rowPath.map((cellPath) => printCell(cellPath, options, print), 'children'),
        'children',
    );

    const columns = Math.max(node.align?.length ?? 0, ...rows.map((row) => row.length));

    /** Pad (or trim) one row's rendered cells to the table's column count. */
    const cellsOf = (row) => Array.from({ length: columns }, (_unused, index) => row.at(index) ?? '');

    /** Wrap one row's cells in pipes with exactly one space of padding on each side. */
    const lineOf = (row) => `| ${cellsOf(row).join(' | ')} |`;

    const delimiters = Array.from({ length: columns }, (_unused, index) => DELIMITERS[node.align?.at(index)] ?? '---');
    const [head, ...body] = rows;

    return join(hardline, [lineOf(head), `| ${delimiters.join(' | ')} |`, ...body.map(lineOf)]);
};

/**
 * Prettier's Markdown printer with the `table` case swapped out.
 *
 * Everything else - paragraphs, lists, code fences, prose wrapping - delegates to {@link basePrinter}, so this plugin
 * can only ever change table layout.
 *
 * @type {import('prettier').Printer}
 */
const printer = {
    ...basePrinter,

    /**
     * Print one mdast node, intercepting tables and delegating everything else.
     *
     * @param {import('prettier').AstPath} path Path positioned at the node to print.
     * @param {import('prettier').ParserOptions} options Resolved Prettier options for the file being formatted.
     * @param {PrintChild} print Prettier's child printer.
     * @param {unknown} args Opaque printer arguments; forwarded to the base printer untouched.
     * @returns {import('prettier').Doc} The printed node.
     */
    print(path, options, print, args) {
        if (path.node.type === 'table') {
            return printTable(path, options, print);
        }

        return basePrinter.print(path, options, print, args);
    },
};

/**
 * Parsers this plugin contributes.
 *
 * `markdown-compact` is Prettier's own Markdown parser retargeted at the `mdast-compact` printer below. Naming it in a
 * config's `overrides` is what opts a file into compact tables; nothing changes for anyone who does not ask.
 *
 * @type {Record<string, import('prettier').Parser>}
 */
export const parsers = {
    'markdown-compact': { ...markdown.parsers.markdown, astFormat: 'mdast-compact' },
};

/**
 * Printers this plugin contributes, keyed by the `astFormat` the parsers above declare.
 *
 * @type {Record<string, import('prettier').Printer>}
 */
export const printers = {
    'mdast-compact': printer,
};
