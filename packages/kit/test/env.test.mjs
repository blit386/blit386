/**
 * Unit tests for the caret-range helpers used by `blit doctor` (D14 kit vs engine range).
 *
 * Imports the built dist module; the package `pretest` script runs `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { exceedsCaretRange, satisfiesCaretRange } from '../dist/env.js';

const RANGE = '^1.4.0';

test('satisfiesCaretRange accepts same-major versions at or above the floor', () => {
    assert.equal(satisfiesCaretRange('1.4.0', RANGE), true);
    assert.equal(satisfiesCaretRange('1.9.0', RANGE), true);
});

test('satisfiesCaretRange rejects lower same-major, other-major, and above-major versions', () => {
    assert.equal(satisfiesCaretRange('1.3.9', RANGE), false);
    assert.equal(satisfiesCaretRange('0.9.0', RANGE), false);
    assert.equal(satisfiesCaretRange('2.0.0', RANGE), false);
});

test('exceedsCaretRange is true only when installed major is above the range major', () => {
    assert.equal(exceedsCaretRange('2.0.0', RANGE), true);
    assert.equal(exceedsCaretRange('1.9.0', RANGE), false);
    assert.equal(exceedsCaretRange('1.3.9', RANGE), false);
    assert.equal(exceedsCaretRange('0.9.0', RANGE), false);
});
