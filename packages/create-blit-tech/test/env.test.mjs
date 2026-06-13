/**
 * Unit tests for the environment guards.
 *
 * meetsNodeFloor is the logic behind the Node version gate; we check it across the boundary and on odd inputs.
 * Requires `pnpm run build` first (imports the built dist module); CI runs the build before the tests.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { meetsNodeFloor, NODE_FLOOR } from '../dist/env.js';

test('meetsNodeFloor accepts the floor and newer versions', () => {
    assert.equal(meetsNodeFloor(NODE_FLOOR), true, 'exact floor must pass');
    assert.equal(meetsNodeFloor('22.18.1'), true, 'newer patch must pass');
    assert.equal(meetsNodeFloor('22.19.0'), true, 'newer minor must pass');
    assert.equal(meetsNodeFloor('23.0.0'), true, 'newer major must pass');
    assert.equal(meetsNodeFloor('24.5.2'), true, 'much newer must pass');
});

test('meetsNodeFloor rejects versions below the floor', () => {
    assert.equal(meetsNodeFloor('22.17.9'), false, 'older patch must fail');
    assert.equal(meetsNodeFloor('22.0.0'), false, 'older minor must fail');
    assert.equal(meetsNodeFloor('20.19.0'), false, 'older major must fail');
    assert.equal(meetsNodeFloor('18.0.0'), false, 'much older must fail');
});

test('meetsNodeFloor tolerates pre-release and short version strings', () => {
    assert.equal(meetsNodeFloor('23.0.0-nightly'), true, 'pre-release tag is ignored');
    assert.equal(meetsNodeFloor('22.18'), true, 'missing patch is treated as 0 and still meets the floor');
    assert.equal(meetsNodeFloor('22'), false, 'missing minor is treated as 0 and falls below the floor');
});

test('meetsNodeFloor compares against a custom floor', () => {
    assert.equal(meetsNodeFloor('1.2.3', '1.2.3'), true);
    assert.equal(meetsNodeFloor('1.2.2', '1.2.3'), false);
    assert.equal(meetsNodeFloor('2.0.0', '1.9.9'), true);
});
