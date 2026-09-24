/**
 * Unit tests for package-manager detection and the Corepack packageManager field.
 *
 * Requires `pnpm run build` first (imports the built dist module); CI runs the build before the tests.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { packageManagerField, parsePackageManagerVersion } from '../dist/pkgManager.js';

test('parsePackageManagerVersion reads name/x.y.z from a user-agent string', () => {
    assert.equal(parsePackageManagerVersion('pnpm/11.20.0 npm/? node/v22.18.0 linux x64', 'pnpm'), '11.20.0');
    assert.equal(parsePackageManagerVersion('npm/10.9.2 node/v22.18.0 linux x64', 'npm'), '10.9.2');
    assert.equal(parsePackageManagerVersion('yarn/1.22.22 npm/? node/v22.18.0', 'yarn'), '1.22.22');
    assert.equal(parsePackageManagerVersion('bun/1.2.5+a1b2c3d npm/? node/v22.18.0', 'bun'), '1.2.5');
});

test('parsePackageManagerVersion returns undefined when the agent string lacks that manager', () => {
    assert.equal(parsePackageManagerVersion('npm/10.9.2 node/v22.18.0', 'pnpm'), undefined);
    assert.equal(parsePackageManagerVersion('', 'pnpm'), undefined);
});

test('packageManagerField prefers the user-agent version over the default pin', () => {
    assert.equal(
        packageManagerField('pnpm', 'pnpm/12.4.2 npm/? node/v22.18.0 linux x64'),
        'pnpm@12.4.2',
        'detected version stops Corepack from rewriting the field during install',
    );
});

test('packageManagerField falls back to the known default pin when the agent has no version', () => {
    assert.equal(packageManagerField('pnpm', ''), 'pnpm@11.20.0');
    assert.equal(packageManagerField('npm', ''), 'npm@10.9.2');
});
