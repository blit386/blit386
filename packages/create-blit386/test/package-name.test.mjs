/**
 * The generated package name comes from the folder name. A folder named like one of the game's own dependencies
 * would make the game depend on itself, which npm refuses to install (ENOSELF), so such a name gets a suffix.
 */

import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { scaffold } from '../dist/scaffold.js';
import { PNPM_SCAFFOLD_COMMANDS } from './helpers.mjs';

const work = mkdtempSync(join(tmpdir(), 'cbt-package-name-'));
after(() => rmSync(work, { recursive: true, force: true }));

/** Scaffold a game in a folder called `folder` and return its package.json. */
function scaffoldNamed(folder, language) {
    const project = join(work, `${language}-${folder}`);
    scaffold({ ...PNPM_SCAFFOLD_COMMANDS, targetDir: project, projectName: folder, agents: [], language });

    return JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));
}

test('a folder named after a dependency gets a -game package name', () => {
    assert.equal(scaffoldNamed('blit386', 'js').name, 'blit386-game');
    assert.equal(scaffoldNamed('Vite', 'js').name, 'vite-game');
    assert.equal(scaffoldNamed('typescript', 'ts').name, 'typescript-game');
});

test('an ordinary folder name is kept', () => {
    assert.equal(scaffoldNamed('Space Catcher', 'js').name, 'space-catcher');
    assert.equal(scaffoldNamed('typescript', 'js').name, 'typescript', 'the JS layer does not depend on typescript');
});
