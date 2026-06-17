/**
 * Unit tests for the codemod engine and migration registry.
 *
 * These cover the risky part of `blit migrate`: anchored matching that must rename real API usage without touching
 * lookalike identifiers, and the auto-vs-review split. Imports the built dist modules; the package `pretest` script
 * runs `pnpm run build` first, so `pnpm run test` works on a clean checkout.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { applyRenames, renamesFromMigrations } from '../dist/migrations/codemod.js';
import { MIGRATIONS, migrationsThrough } from '../dist/migrations/registry.js';

const renames = renamesFromMigrations(MIGRATIONS);

test('renames a BT member call and reports it as applied', () => {
    const result = applyRenames('if (BT.buttonDown(BT.BTN_A)) fire();', renames);

    assert.equal(result.text, 'if (BT.isDown(BT.BTN_A)) fire();');
    assert.equal(result.changed, true);
    assert.equal(result.applied.length, 1);
    assert.equal(result.applied[0].rename.from, 'buttonDown');
    assert.equal(result.applied[0].line, 1);
});

test('renames all BT input aliases', () => {
    const pairs = [
        ['BT.pointerPosValid()', 'BT.isPointerActive()'],
        ['BT.buttonPressed(x)', 'BT.isPressed(x)'],
        ['BT.buttonReleased(x)', 'BT.isReleased(x)'],
        ['BT.gamepadConnected(0)', 'BT.isGamepadConnected(0)'],
        ['BT.keyDown("KeyW")', 'BT.isKeyDown("KeyW")'],
        ['BT.keyPressed("a")', 'BT.isKeyPressed("a")'],
        ['BT.keyReleased("a")', 'BT.isKeyReleased("a")'],
    ];

    for (const [input, expected] of pairs) {
        assert.equal(applyRenames(input, renames).text, expected, `${input} should become ${expected}`);
    }
});

test('does not touch a lookalike receiver or longer identifier', () => {
    // MyBT.buttonDown and BT.buttonDownLater must not match BT.buttonDown.
    const a = applyRenames('MyBT.buttonDown(x);', renames);
    assert.equal(a.changed, false, 'a different receiver must not be rewritten');

    const b = applyRenames('BT.buttonDownLater(x);', renames);
    assert.equal(b.changed, false, 'a longer identifier must not be rewritten');
});

test('renames configure() object keys but not the already-new name', () => {
    const before = 'return { overlayEnabled: true, detectDroppedFrames: false };';
    const after = 'return { isOverlayEnabled: true, isDetectingDroppedFrames: false };';
    assert.equal(applyRenames(before, renames).text, after);

    const already = 'return { isOverlayEnabled: true };';
    assert.equal(applyRenames(already, renames).changed, false, 'the new key name must be left alone');
});

test('flags generic bootstrap option keys for review instead of renaming them', () => {
    // canvasId / containerId / waitForDOMReady are generic enough to appear on unrelated objects, so they
    // are reported, not auto-rewritten.
    const input = 'bootstrap(Game, { canvasId: "c", containerId: "wrap", waitForDOMReady: true });';
    const result = applyRenames(input, renames);

    assert.equal(result.changed, false, 'generic bootstrap keys must not be auto-renamed');

    const froms = result.review.map((hit) => hit.rename.from).sort();
    assert.deepEqual(froms, ['canvasId', 'containerId', 'waitForDOMReady']);
});

test('auto-renames distinctive method names', () => {
    assert.equal(applyRenames('sheet.isIndexized()', renames).text, 'sheet.isIndexed()');
    assert.equal(applyRenames('rect.containsXY(x, y)', renames).text, 'rect.isContainingXY(x, y)');
    assert.equal(applyRenames('a.intersectionTo(b, out)', renames).text, 'a.intersectTo(b, out)');
});

test('flags common-word methods for review instead of rewriting them', () => {
    const result = applyRenames('if (a.equals(b) && r.contains(p) && r.intersects(o)) {}', renames);

    assert.equal(result.changed, false, 'review-only renames must not change the text');
    assert.equal(result.applied.length, 0);

    const froms = result.review.map((hit) => hit.rename.from).sort();
    assert.deepEqual(froms, ['contains', 'equals', 'intersects']);

    // The review hit still carries a suggested rewrite for the report.
    const equalsHit = result.review.find((hit) => hit.rename.from === 'equals');
    assert.ok(equalsHit.after.includes('isEqual'), 'review hit should suggest the new name');
});

test('containsXY does not collide with the contains review rename', () => {
    const result = applyRenames('rect.containsXY(x, y)', renames);

    assert.equal(result.text, 'rect.isContainingXY(x, y)');
    assert.equal(result.review.length, 0, 'containsXY must not also trigger the contains review match');
});

test('reports accurate line numbers across a multi-line file', () => {
    const src = ['const a = 1;', 'BT.keyDown("KeyW");', '', 'BT.buttonDown(BT.BTN_A);'].join('\n');
    const result = applyRenames(src, renames);

    assert.equal(result.applied.length, 2);
    assert.equal(result.applied[0].line, 2);
    assert.equal(result.applied[1].line, 4);
});

test('is idempotent: a second pass changes nothing', () => {
    const once = applyRenames('BT.buttonDown(BT.BTN_A); sheet.isIndexized();', renames);
    const twice = applyRenames(once.text, renames);

    assert.equal(twice.changed, false, 'already-migrated code should not change again');
});

test('migrationsThrough includes the 1.x rename migration and excludes future ones', () => {
    assert.equal(migrationsThrough('1.0.0').length, 1, 'the 2026-05-31 api-naming migration applies from 1.0.0');
    assert.equal(migrationsThrough('1.1.0').length, 2, 'both migrations apply from 1.1.0');
    assert.equal(migrationsThrough('1.5.0').length, 2, 'both still apply on a newer 1.x');
    assert.equal(migrationsThrough('0.9.0').length, 0, 'does not apply below its since version');
});

test('applyRenames rewrites importPath specifiers without a leading dot', () => {
    const importPathRename = [{ from: 'blit-tech', to: 'blit386', kind: 'importPath', safety: 'auto' }];

    const esm = "import { BT } from 'blit-tech';";
    const cjs = "const bt = require('blit-tech');";
    const scoped = "import { BT } from 'blit-tech-extra';";

    assert.equal(applyRenames(esm, importPathRename).text, "import { BT } from 'blit386';", 'ESM import rewrites');
    assert.equal(applyRenames(cjs, importPathRename).text, "const bt = require('blit386');", 'CJS require rewrites');
    assert.equal(applyRenames(scoped, importPathRename).text, scoped, 'longer package name is not touched');
});

test('every rename declares the fields the engine needs', () => {
    for (const migration of MIGRATIONS) {
        for (const rename of migration.renames) {
            assert.ok(rename.from && rename.to, 'from/to are required');
            assert.ok(['memberCall', 'objectKey', 'method', 'importPath'].includes(rename.kind), 'kind must be known');
            assert.ok(['auto', 'review'].includes(rename.safety), 'safety must be known');
            if (rename.kind === 'memberCall') {
                assert.ok(rename.receiver, 'memberCall renames need a receiver');
            }
        }
    }
});
