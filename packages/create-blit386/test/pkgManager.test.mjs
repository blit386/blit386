/**
 * Unit tests for the Corepack packageManager field.
 *
 * Requires `pnpm run build` first (imports the built dist module); CI runs the build before the tests.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { packageManagerField } from '../dist/pkgManager.js';

test('packageManagerField reads name/x.y.z from the user agent', () => {
    assert.equal(packageManagerField('pnpm', 'pnpm/12.4.2 npm/? node/v22.18.0 linux x64'), 'pnpm@12.4.2');
});

test('packageManagerField throws when the user agent has no version for that manager', () => {
    assert.throws(() => packageManagerField('pnpm', ''), /Could not read a pnpm version/);
});
