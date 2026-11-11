/**
 * One Node floor across the lockstep packages and the games they scaffold. The engine, the kit and this scaffolder
 * each declare `engines.node`; the scaffolder reads its own at runtime (`NODE_FLOOR`) and threads it into the
 * generated `package.json` and `.node-version`, so these tests are what keeps the three declarations and the output
 * in step.
 */

import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { NODE_FLOOR } from '../dist/env.js';
import { here, scaffoldNoAgent } from './helpers.mjs';

/** `engines.node` of a sibling package in this monorepo. */
function enginesNode(packageDir) {
    return JSON.parse(readFileSync(join(here, '..', '..', packageDir, 'package.json'), 'utf8')).engines?.node;
}

test('the engine, the kit and the scaffolder declare the same Node floor', () => {
    assert.equal(enginesNode('create-blit386'), `>=${NODE_FLOOR}`, 'NODE_FLOOR comes from this package.json');
    assert.equal(enginesNode('kit'), `>=${NODE_FLOOR}`, 'the kit floor (blit doctor) should match');
    assert.equal(enginesNode('blit386'), `>=${NODE_FLOOR}`, 'the engine floor should match');
});

test('a scaffolded game carries the Node floor in engines and its major in .node-version', () => {
    const work = mkdtempSync(join(tmpdir(), 'cbt-node-floor-'));

    try {
        const project = scaffoldNoAgent(work, 'floor-game');
        const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));

        assert.equal(pkg.engines?.node, `>=${NODE_FLOOR}`);
        assert.equal(readFileSync(join(project, '.node-version'), 'utf8'), `${NODE_FLOOR.split('.')[0]}\n`);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});
