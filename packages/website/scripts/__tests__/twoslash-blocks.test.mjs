import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTwoslasher } from 'twoslash';
import { TWOSLASH_COMPILER_OPTIONS } from '../twoslash-config.mjs';

// Built the same way fumadocs-twoslash builds its shared instance (dist/index.js,
// `transformerTwoslash`'s `lazyInstance().get()`), so this sweep exercises the exact
// language service the production build uses instead of a copy that could drift.
const twoslasher = createTwoslasher({
    compilerOptions: { moduleResolution: 100, baseUrl: undefined, ...TWOSLASH_COMPILER_OPTIONS },
});

const websiteRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const docsDir = path.join(websiteRoot, 'content', 'docs');

const TWOSLASH_FENCE_OPEN = /^```(ts|tsx) twoslash\b/;

/**
 * Extract every twoslash-tagged ts/tsx fenced code block from an MDX file's source.
 *
 * @param {string} source
 * @returns {{ lang: string; code: string }[]}
 */
function extractTwoslashBlocks(source) {
    const lines = source.split('\n');
    const blocks = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line === undefined) continue;

        const openMatch = line.match(TWOSLASH_FENCE_OPEN);

        if (!openMatch?.[1]) continue;

        const lang = openMatch[1];
        const bodyLines = [];
        let closed = false;

        for (let j = i + 1; j < lines.length; j++) {
            if (lines[j] === '```') {
                closed = true;
                i = j;
                break;
            }

            bodyLines.push(lines[j]);
        }

        assert.ok(closed, `unterminated twoslash fence starting at line ${i + 1}`);
        blocks.push({ lang, code: bodyLines.join('\n') });
    }

    return blocks;
}

/**
 * @returns {Promise<{ file: string; index: number; lang: string; code: string }[]>}
 */
async function collectAllTwoslashBlocks() {
    /** @type {{ file: string; index: number; lang: string; code: string }[]} */
    const collected = [];

    for await (const entry of glob('**/*.mdx', { cwd: docsDir })) {
        const absolutePath = path.join(docsDir, entry);
        const source = readFileSync(absolutePath, 'utf8');
        const blocks = extractTwoslashBlocks(source);

        blocks.forEach((block, index) => {
            collected.push({ file: entry, index, ...block });
        });
    }

    return collected;
}

describe('Twoslash block sweep (BT-483)', () => {
    test('compiles every twoslash block in the docs mirror without throwing', async () => {
        const blocks = await collectAllTwoslashBlocks();

        assert.ok(blocks.length > 0, 'expected to find twoslash blocks under content/docs');

        /** @type {string[]} */
        const failures = [];

        for (const block of blocks) {
            try {
                twoslasher(block.code, block.lang);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                failures.push(`${block.file} (block #${block.index}): ${message}`);
            }
        }

        assert.deepEqual(failures, [], `twoslash blocks failed to compile:\n${failures.join('\n')}`);
    });
});
