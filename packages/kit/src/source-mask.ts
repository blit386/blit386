/**
 * Blank out the comments (and, by default, the string contents) of JavaScript or JSONC source, so a regex over the
 * result never matches inside them.
 *
 * The result has the same length as the input and keeps every newline and quote character, so an index found in the
 * mask is the same index in the original text: search the mask, edit the original.
 *
 * shortcut: regex literals are not recognized, so a quote or `//` inside one is misread; upgrade to a real tokenizer if
 * a vite.config with one ever needs rewriting.
 */

/** Replace every character but a newline with a space. */
function blank(text: string): string {
    return text.replace(/[^\n]/g, ' ');
}

/**
 * @param source - JavaScript, TypeScript, or JSONC text
 * @param keepStrings - keep string contents and blank only the comments
 * @returns the masked text, the same length as `source`
 */
export function maskSource(source: string, keepStrings = false): string {
    let out = '';
    let i = 0;

    while (i < source.length) {
        const ch = source.charAt(i);
        const next = source.charAt(i + 1);

        if (ch === '/' && (next === '/' || next === '*')) {
            const close = next === '/' ? source.indexOf('\n', i) : source.indexOf('*/', i + 2);
            const end = close === -1 ? source.length : next === '/' ? close : close + 2;
            out += blank(source.slice(i, end));
            i = end;
        } else if (ch === "'" || ch === '"' || ch === '`') {
            let end = i + 1;

            while (end < source.length && source.charAt(end) !== ch) {
                end += source.charAt(end) === '\\' ? 2 : 1;
            }

            const body = source.slice(i + 1, Math.min(end, source.length));
            out += `${ch}${keepStrings ? body : blank(body)}${end < source.length ? ch : ''}`;
            i = end + 1;
        } else {
            out += ch;
            i++;
        }
    }

    return out;
}
