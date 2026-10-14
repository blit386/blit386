/**
 * Unit tests for the pure helpers in scripts/capture-demo-shots.mjs.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { DEMO_ORDER } from '../../plugins/demo-order.js';
import { buildAutoUrl, DEFAULTS, parseArgs, resolveImageTarget, selectChanged } from '../capture-demo-shots.mjs';

describe('parseArgs', () => {
    it('captures every demo with the committed variants by default', () => {
        const options = parseArgs(['--all']);

        assert.deepEqual(options.slugs, [...DEMO_ORDER]);
        assert.deepEqual(options.variants, ['display', 'uidebug']);
        assert.equal(options.baseUrl, DEFAULTS.baseUrl);
        assert.equal(options.out, '');
    });

    it('reads a slug list and a variant list', () => {
        const options = parseArgs(['--demos', 'basics,sprites', '--variants', 'display,output']);

        assert.deepEqual(options.slugs, ['basics', 'sprites']);
        assert.deepEqual(options.variants, ['display', 'output']);
    });

    it('rejects an unknown slug, an unknown variant, and a missing selection', () => {
        assert.throws(() => parseArgs(['--demos', 'ghost']), /Unknown demo slug: ghost/);
        assert.throws(() => parseArgs(['--all', '--variants', 'huge']), /Unknown variant: huge/);
        assert.throws(() => parseArgs([]), /Pass --all, --demos, or --changed/);
        assert.throws(() => parseArgs(['--all', '--demos', 'basics']), /only one of/);
        assert.throws(() => parseArgs(['--out']), /--out requires a value/);
    });

    it('rejects an empty slug list', () => {
        assert.throws(() => parseArgs(['--demos', ',']), /--demos requires at least one slug/);
    });

    it('skips the literal -- that pnpm forwards', () => {
        assert.deepEqual(parseArgs(['--', '--all']), parseArgs(['--all']));
    });
});

describe('selectChanged', () => {
    it('picks demos whose source changed', () => {
        const slugs = selectChanged(['packages/demos/src/basics.js', 'packages/demos/README.md'], DEMO_ORDER);

        assert.deepEqual(slugs, ['basics']);
    });

    it('picks every demo when the shared kit changed', () => {
        const slugs = selectChanged(['packages/demos/src/shared/ui-core.js'], ['basics', 'sprites']);

        assert.deepEqual(slugs, ['basics', 'sprites']);
    });

    it('keeps demo order and ignores unknown files', () => {
        const slugs = selectChanged(
            ['packages/demos/src/sprites.js', 'packages/demos/src/basics.js', 'x.js'],
            ['basics', 'sprites'],
        );

        assert.deepEqual(slugs, ['basics', 'sprites']);
    });
});

describe('buildAutoUrl', () => {
    it('targets the shots page in auto mode', () => {
        assert.equal(
            buildAutoUrl('http://localhost:5173/', ['basics', 'sprites'], ['display']),
            'http://localhost:5173/shots?auto&demos=basics%2Csprites&variants=display',
        );
    });
});

describe('resolveImageTarget', () => {
    const outDir = resolve('/tmp/shots-out');

    it('resolves a normal image path inside the output directory', () => {
        assert.equal(
            resolveImageTarget(outDir, 'basics/start.display.png'),
            resolve(outDir, 'basics/start.display.png'),
        );
    });

    it('refuses a parent-relative or absolute path', () => {
        assert.equal(resolveImageTarget(outDir, '../escape.png'), null);
        assert.equal(resolveImageTarget(outDir, '/abs/x.png'), null);
    });
});
