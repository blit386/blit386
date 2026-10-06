/**
 * Every shipped skill's frontmatter must be YAML an assistant can parse, within the limits every agent
 * that reads skills enforces.
 *
 * Cursor and Claude Code both read `name` and `description` from it, and so does every agent that reads
 * the shared `.agents/skills/` folder - which is where the cross-agent limits below come from: `name` is
 * lowercase-hyphen, at most 64 characters, and equal to its folder; `description` is at most 1024
 * characters; the layout is flat, one `<name>/SKILL.md` per skill. A plain multi-line
 * description breaks when it contains an apostrophe or a colon followed by a space; those
 * have to be a folded scalar (`description: >-`) instead. This test is the gate.
 *
 * Imports the built dist module; the package `pretest` script runs `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { parse } from 'yaml';

import { generateClaudeAdapter, generateSharedSkills, kitRoot } from '../dist/adapters.js';

/** Lowercase letters and digits in hyphen-separated runs: no leading, trailing, or doubled hyphen. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const VARS = { pmInstall: 'npm install', pmRunDev: 'npm run dev', pmRunBuild: 'npm run build' };

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
        assert.match(doc.name, SKILL_NAME, `${entry.name} name should be lowercase-hyphen`);
        assert.ok(doc.name.length <= 64, `${entry.name} name should be at most 64 characters`);
        assert.ok(doc.description.length <= 1024, `${entry.name} description should be at most 1024 characters`);
    }
});

test('the skills layout is flat: one SKILL.md per folder, no nested skills', () => {
    const skillsDir = join(kitRoot(), 'content', 'skills');

    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
        assert.ok(entry.isDirectory(), `${entry.name} should be a skill folder, not a loose file`);
        assert.ok(existsSync(join(skillsDir, entry.name, 'SKILL.md')), `${entry.name} should hold a SKILL.md`);

        const nested = readdirSync(join(skillsDir, entry.name), { recursive: true }).filter(
            (path) => String(path).endsWith('SKILL.md') && path !== 'SKILL.md',
        );
        assert.deepEqual(nested, [], `${entry.name} should not nest another skill`);
    }
});

test('the shared skills folder carries each skill once, byte-equal to the Claude copy', () => {
    const shared = generateSharedSkills(kitRoot(), VARS);
    const claude = new Map(generateClaudeAdapter(kitRoot(), VARS).map((file) => [file.path, file.content]));

    assert.ok(shared.length > 0, 'expected at least one shared skill');

    for (const file of shared) {
        const name = file.path.match(/^\.agents\/skills\/([^/]+)\/SKILL\.md$/)?.[1];
        assert.ok(name, `${file.path} should be .agents/skills/<name>/SKILL.md`);
        assert.equal(
            file.content,
            claude.get(`.claude/skills/${name}/SKILL.md`),
            `${name} should match the Claude copy`,
        );
    }
});
