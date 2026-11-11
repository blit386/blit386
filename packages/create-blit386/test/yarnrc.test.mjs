/**
 * Yarn 2+ installs with Plug'n'Play by default and makes no `node_modules`, which `npx blit` and the agent hooks need.
 * A game pinned to Yarn 2 or later gets a `.yarnrc.yml` that switches Yarn to a classic `node_modules`; Yarn 1 and the
 * other managers do not need one.
 */

import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { scaffold } from '../dist/scaffold.js';
import { PNPM_SCAFFOLD_COMMANDS } from './helpers.mjs';

const work = mkdtempSync(join(tmpdir(), 'cbt-yarnrc-'));
after(() => rmSync(work, { recursive: true, force: true }));

/** The `.yarnrc.yml` a game pinned to `packageManager` gets, or null when it gets none. */
function yarnrcFor(packageManager) {
    const project = join(work, packageManager.replace(/[^a-z0-9]+/g, '-'));
    scaffold({ ...PNPM_SCAFFOLD_COMMANDS, targetDir: project, projectName: 'yarn-game', agents: [], packageManager });
    const path = join(project, '.yarnrc.yml');

    return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

test('a Yarn 2+ game gets nodeLinker node-modules', () => {
    assert.equal(yarnrcFor('yarn@4.5.3'), 'nodeLinker: node-modules\n');
    assert.equal(yarnrcFor('yarn@2.4.3'), 'nodeLinker: node-modules\n');
    assert.equal(yarnrcFor('yarn@10.0.0'), 'nodeLinker: node-modules\n');
});

test('Yarn 1 and other managers get no .yarnrc.yml', () => {
    assert.equal(yarnrcFor('yarn@1.22.22'), null);
    assert.equal(yarnrcFor('pnpm@11.20.0'), null);
    assert.equal(yarnrcFor('npm@10.9.2'), null);
});
