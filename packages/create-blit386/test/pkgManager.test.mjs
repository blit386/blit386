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

test('packageManagerField keeps a prerelease or build suffix', () => {
    assert.equal(packageManagerField('pnpm', 'pnpm/11.0.0-dev.1005 npm/? node/v22.18.0'), 'pnpm@11.0.0-dev.1005');
    assert.equal(packageManagerField('npm', 'npm/10.9.2+sha.1 node/v22.18.0'), 'npm@10.9.2+sha.1');
});

test('packageManagerField throws when the version is missing or not an exact semver', () => {
    assert.throws(() => packageManagerField('pnpm', ''), /Could not read an exact pnpm version/);
    assert.throws(() => packageManagerField('pnpm', 'pnpm/11 npm/?'), /Could not read an exact pnpm version/);
});

test('packageManagerField omits bun because Corepack rejects a bun pin', () => {
    assert.equal(packageManagerField('bun', 'bun/1.2.5+a1b2c3d npm/? node/v22.18.0'), undefined);
});
