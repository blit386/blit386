/**
 * The two Node hook scripts every generated game gets: format-file.cjs (formats the one edited file)
 * and protect-files.cjs (blocks hand edits to lock files and .env files, through guard-core.cjs).
 */

import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { hooksDir, runHook } from './hook-harness.mjs';

/**
 * A throwaway project with format-file.cjs in `.claude/hooks/` and a fake Biome that upper-cases the file it is given.
 */
function makeProject() {
    const root = mkdtempSync(join(tmpdir(), 'blit-hook-'));
    const biomeDir = join(root, 'node_modules', '@biomejs', 'biome');

    mkdirSync(join(root, '.claude', 'hooks'), { recursive: true });
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(biomeDir, 'bin'), { recursive: true });
    cpSync(join(hooksDir, 'format-file.cjs'), join(root, '.claude', 'hooks', 'format-file.cjs'));
    writeFileSync(
        join(biomeDir, 'package.json'),
        JSON.stringify({ name: '@biomejs/biome', bin: { biome: 'bin/biome' } }),
    );
    writeFileSync(
        join(biomeDir, 'bin', 'biome'),
        "const fs = require('node:fs'); const f = process.argv.at(-1); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').toUpperCase());",
    );
    writeFileSync(join(root, 'src', 'game.js'), 'edited');
    writeFileSync(join(root, 'src', 'other.js'), 'untouched');

    return root;
}

describe('format-file.cjs', () => {
    it('formats only the edited file, for both the Claude and the Cursor payload shape', () => {
        for (const payload of [{ tool_input: { file_path: 'src/game.js' } }, { file_path: 'src/game.js' }]) {
            const root = makeProject();

            try {
                const result = runHook(join(root, '.claude', 'hooks', 'format-file.cjs'), { input: payload });

                assert.equal(result.status, 0);
                assert.equal(readFileSync(join(root, 'src', 'game.js'), 'utf8'), 'EDITED');
                assert.equal(readFileSync(join(root, 'src', 'other.js'), 'utf8'), 'untouched');
            } finally {
                rmSync(root, { recursive: true, force: true });
            }
        }
    });

    it('leaves the file alone and still exits 0 when it cannot format', () => {
        const root = makeProject();

        try {
            const script = join(root, '.claude', 'hooks', 'format-file.cjs');
            const outside = join(tmpdir(), `blit-hook-outside-${process.pid}.js`);
            writeFileSync(outside, 'outside');
            writeFileSync(join(root, 'notes.md'), 'no prettier installed');

            assert.equal(runHook(script, { input: { file_path: outside } }).status, 0);
            assert.equal(readFileSync(outside, 'utf8'), 'outside', 'a file outside the project is never formatted');
            rmSync(outside);

            assert.equal(
                runHook(script, { input: { file_path: 'notes.md' } }).status,
                0,
                'a missing formatter is not an error',
            );
            assert.equal(runHook(script, { input: { file_path: 'src/missing.js' } }).status, 0);
            assert.equal(runHook(script, { input: 'not json' }).status, 0);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('protect-files.cjs', () => {
    const script = join(hooksDir, 'protect-files.cjs');
    const edit = (/** @type {string} */ file) => runHook(script, { input: { tool_input: { file_path: file } } });

    it('blocks lock files and .env files with exit code 2', () => {
        for (const file of [
            'pnpm-lock.yaml',
            '/game/package-lock.json',
            'yarn.lock',
            'bun.lock',
            'bun.lockb',
            'tools/custom.lock',
            '.env',
            'a/.env.local',
        ]) {
            const result = edit(file);

            assert.equal(result.status, 2, `${file} should be blocked`);
            assert.match(result.stderr, /\[BLOCKED\]/);
        }
    });

    it('lets every other file through', () => {
        for (const file of ['src/game.ts', 'package.json', '.env.example', 'docs/environment.md', 'src/lock.ts']) {
            assert.equal(edit(file).status, 0, `${file} should be allowed`);
        }
    });

    it('fails closed: a payload it cannot read, or one without a file path, blocks the edit', () => {
        for (const input of ['not json', JSON.stringify({ tool_input: {} })]) {
            const result = runHook(script, { input });

            assert.equal(result.status, 2, input);
            assert.match(result.stderr, /\[BLOCKED\] The guard could not read the request/);
        }
    });
});
