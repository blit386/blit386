import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { findJsdocLinkProblems, LINK_INSTANCE_MEMBER, LINK_UNRESOLVED } from './check-jsdoc-links.mjs';
import { createProgramFromFiles } from './gen-api-history.mjs';

const dir = mkdtempSync(join(tmpdir(), 'jsdoc-links-'));

after(() => rmSync(dir, { recursive: true, force: true }));

writeFileSync(
    join(dir, 'sheet.ts'),
    `export class Sheet {
    static create(): Sheet { return new Sheet(); }
    replace(): void {}
}
export interface Options { size: number; }
`,
);
writeFileSync(join(dir, 'internal.ts'), 'export class Hidden {}\n');
const entryFile = join(dir, 'index.ts');
writeFileSync(
    entryFile,
    "export { Sheet } from './sheet';\nexport type { Options } from './sheet';\nimport './internal';\n",
);

let fileCount = 0;

/**
 * Scans a one-file program whose only JSDoc link is `link`.
 *
 * @param {string} link - Link body, e.g. `Sheet#replace`.
 * @param {{ isImporting?: boolean }} [options] - Whether the file imports `Sheet` and `Options`.
 * @returns {{ kind: string, suggestion?: string }[]} The problems found.
 */
function scan(link, { isImporting = true } = {}) {
    const file = join(dir, `use-${fileCount++}.ts`);
    const imports = isImporting
        ? "import type { Options } from './sheet';\nimport { Sheet } from './sheet';\n"
        : 'export {};\n';
    writeFileSync(file, `${imports}/** See {@link ${link}}. */\nexport const marker = 1;\n`);
    const program = createProgramFromFiles([file, entryFile]);

    return findJsdocLinkProblems(program, { entryFile, isTarget: (name) => name === file }).map(
        ({ kind, suggestion }) => ({ kind, suggestion }),
    );
}

describe('findJsdocLinkProblems', () => {
    it('flags an instance method written with a dot and suggests the # form', () => {
        assert.deepEqual(scan('Sheet.replace'), [{ kind: LINK_INSTANCE_MEMBER, suggestion: 'Sheet#replace' }]);
    });

    it('accepts an instance method written with #', () => {
        assert.deepEqual(scan('Sheet#replace'), []);
    });

    it('accepts a static method written with a dot', () => {
        assert.deepEqual(scan('Sheet.create'), []);
    });

    it('flags an interface member written with a dot and accepts the # form', () => {
        assert.deepEqual(scan('Options.size'), [{ kind: LINK_INSTANCE_MEMBER, suggestion: 'Options#size' }]);
        assert.deepEqual(scan('Options#size'), []);
    });

    it('flags a name that is not in scope', () => {
        assert.deepEqual(scan('NotImported'), [{ kind: LINK_UNRESOLVED, suggestion: undefined }]);
    });

    it('accepts a public export that is not imported, and still checks its member form', () => {
        assert.deepEqual(scan('Sheet#replace', { isImporting: false }), []);
        assert.deepEqual(scan('Sheet.replace', { isImporting: false }), [
            { kind: LINK_INSTANCE_MEMBER, suggestion: 'Sheet#replace' },
        ]);
    });

    it('flags an internal name that is neither imported nor publicly exported', () => {
        assert.deepEqual(scan('Hidden', { isImporting: false }), [{ kind: LINK_UNRESOLVED, suggestion: undefined }]);
    });

    it('accepts a URL link, with or without a label', () => {
        assert.deepEqual(scan('https://blit386.dev'), []);
        assert.deepEqual(scan('https://blit386.dev | the site'), []);
    });

    it('flags a missing member on an imported class', () => {
        assert.deepEqual(scan('Sheet#missing'), [{ kind: LINK_UNRESOLVED, suggestion: undefined }]);
    });
});
