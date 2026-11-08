import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { readExistingCommandNames, readSkillNames, syncCursorCommands } from './sync-cursor-commands.mjs';

/** Run a sync with console output silenced; returns the exit code and the captured stderr. */
function run(root, isCheck) {
    const originals = { log: console.log, error: console.error };
    let stderr = '';

    console.log = () => {};
    console.error = (line) => {
        stderr += `${line}\n`;
    };

    try {
        return { code: syncCursorCommands({ root, isCheck }), stderr };
    } finally {
        console.log = originals.log;
        console.error = originals.error;
    }
}

describe('sync-cursor-commands disk side', () => {
    it('reports missing, stale and orphaned commands in check mode, then is clean after a write', () => {
        const root = realpathSync(mkdtempSync(join(tmpdir(), 'sync-cursor-')));

        try {
            const skills = join(root, '.claude', 'skills');
            const commands = join(root, '.cursor', 'commands');

            mkdirSync(join(skills, 'alpha'), { recursive: true });
            mkdirSync(join(skills, 'beta'), { recursive: true });
            mkdirSync(join(skills, 'no-skill-md'), { recursive: true });
            writeFileSync(join(skills, 'alpha', 'SKILL.md'), '---\nname: alpha\n---\n\n# Alpha\n');
            writeFileSync(join(skills, 'beta', 'SKILL.md'), '# Beta\n');
            writeFileSync(join(skills, 'no-skill-md', 'notes.md'), 'not a skill\n');
            mkdirSync(commands, { recursive: true });
            // alpha is missing, beta is stale, no-skill-md and gone are orphans.
            writeFileSync(join(commands, 'beta.md'), 'old\n');
            writeFileSync(join(commands, 'no-skill-md.md'), 'x\n');
            writeFileSync(join(commands, 'gone.md'), 'x\n');

            assert.deepEqual(readSkillNames(root), ['alpha', 'beta']);
            assert.deepEqual(readExistingCommandNames(root).sort(), ['beta', 'gone', 'no-skill-md']);

            const check = run(root, true);

            assert.equal(check.code, 1);
            assert.match(check.stderr, /\.cursor\/commands\/alpha\.md\n/u);
            assert.match(check.stderr, /\.cursor\/commands\/beta\.md\n/u);
            assert.match(check.stderr, /no-skill-md\.md \(orphaned/u);
            assert.match(check.stderr, /gone\.md \(orphaned/u);
            assert.deepEqual(readdirSync(commands).sort(), ['beta.md', 'gone.md', 'no-skill-md.md']);

            assert.equal(run(root, false).code, 0);
            assert.deepEqual(readdirSync(commands).sort(), ['alpha.md', 'beta.md']);
            assert.equal(run(root, true).code, 0);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
