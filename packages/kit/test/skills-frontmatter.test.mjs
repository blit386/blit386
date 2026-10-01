/**
 * Every shipped skill's frontmatter must be YAML an assistant can parse.
 *
 * Cursor and Claude Code both read `name` and `description` from it. A plain multi-line
 * description breaks when it contains an apostrophe or a colon followed by a space; those
 * have to be a folded scalar (`description: >-`) instead. This test is the gate.
 *
 * Imports the built dist module; the package `pretest` script runs `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { parse } from 'yaml';

import { kitRoot } from '../dist/adapters.js';

test('every skill frontmatter parses to a folder-matching name and a string description', () => {
    const skillsDir = join(kitRoot(), 'content', 'skills');
    const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());

    assert.ok(dirs.length > 0, 'expected at least one skill');

    for (const entry of dirs) {
        const text = readFileSync(join(skillsDir, entry.name, 'SKILL.md'), 'utf8');
        const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        assert.ok(match, `${entry.name} should start with YAML frontmatter`);

        const doc = parse(match[1]);
        assert.equal(doc?.name, entry.name, `${entry.name} frontmatter name should match the folder`);
        assert.equal(typeof doc?.description, 'string', `${entry.name} description should be a string`);
        assert.ok(doc.description.trim().length > 0, `${entry.name} description should not be empty`);
    }
});
