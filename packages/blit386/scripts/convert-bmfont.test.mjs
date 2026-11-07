import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('convert-bmfont.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'convert-bmfont-'));

// The converter only checks that the texture file exists, so any bytes will do.
writeFileSync(join(dir, 'font.png'), 'png');

after(() => rmSync(dir, { recursive: true, force: true }));

/** Runs the converter on a one-glyph font whose only char has the given id attribute. */
function convert(idAttr) {
    const fnt = join(dir, 'font.fnt');
    const out = join(dir, 'font.btfont');

    writeFileSync(
        fnt,
        [
            '<font>',
            '<info face="T" size="8"/>',
            '<common lineHeight="8" base="7"/>',
            '<page id="0" file="font.png"/>',
            `<char id="${idAttr}" x="0" y="0" width="1" height="1" xoffset="0" yoffset="0" xadvance="1"/>`,
            '</font>',
        ].join('\n'),
    );

    const result = spawnSync(process.execPath, [SCRIPT, fnt, out], { encoding: 'utf8' });

    return { result, out };
}

describe('convert-bmfont glyph ids', () => {
    it('keys a character above U+FFFF by its full code point', () => {
        const { result, out } = convert('128512');

        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(Object.keys(JSON.parse(readFileSync(out, 'utf8')).glyphs), ['\u{1F600}']);
    });

    it('rejects an id above 0x10FFFF', () => {
        const { result } = convert('1114112');

        assert.equal(result.status, 1);
        assert.match(result.stderr, /outside the Unicode range/);
    });

    it('rejects a negative id', () => {
        const { result } = convert('-5');

        assert.equal(result.status, 1);
        assert.match(result.stderr, /outside the Unicode range/);
    });

    it('rejects an id with trailing text', () => {
        const { result } = convert('65abc');

        assert.equal(result.status, 1);
        assert.match(result.stderr, /non-numeric id/);
    });
});
