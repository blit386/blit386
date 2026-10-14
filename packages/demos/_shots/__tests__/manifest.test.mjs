/**
 * Manifest merging is what keeps a subset capture run from wiping every other demo's tiles.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emptyManifest, entryKey, imagePath, mergeManifest } from '../manifest.js';

const entry = (slug, pose, extra = {}) => ({
    slug,
    pose,
    variants: { display: imagePath(slug, pose, 'display') },
    width: 320,
    height: 200,
    lint: [],
    error: null,
    ...extra,
});

describe('paths', () => {
    it('builds the key and image path the page and driver share', () => {
        assert.equal(entryKey('basics', 'start'), 'basics/start');
        assert.equal(imagePath('basics', 'start', 'uidebug'), 'basics/start.uidebug.png');
    });
});

describe('mergeManifest', () => {
    const order = ['hello-world', 'basics', 'sprites'];

    it('replaces matching entries, keeps the rest, and sorts by demo order', () => {
        const existing = {
            ...emptyManifest(),
            entries: [entry('sprites', 'start'), entry('basics', 'start', { width: 1 })],
        };
        const incoming = [entry('basics', 'start'), entry('hello-world', 'start')];
        const merged = mergeManifest(existing, incoming, order);

        assert.deepEqual(
            merged.entries.map((item) => entryKey(item.slug, item.pose)),
            ['hello-world/start', 'basics/start', 'sprites/start'],
        );
        assert.equal(merged.entries[1].width, 320);
    });

    it("keeps an entry's other variants when the incoming one carries fewer", () => {
        const existing = {
            ...emptyManifest(),
            entries: [entry('basics', 'start', { variants: { display: 'a', uidebug: 'b' } })],
        };
        const merged = mergeManifest(existing, [entry('basics', 'start', { variants: { display: 'c' } })], order);

        assert.deepEqual(merged.entries[0].variants, { display: 'c', uidebug: 'b' });
    });

    it('keeps pose order within a demo as the incoming list gives it', () => {
        const merged = mergeManifest(emptyManifest(), [entry('basics', 'settled'), entry('basics', 'start')], order);

        assert.deepEqual(
            merged.entries.map((item) => item.pose),
            ['settled', 'start'],
        );
    });

    it('lets the incoming pose order win over the existing order for the same keys', () => {
        const existing = {
            ...emptyManifest(),
            entries: [entry('basics', 'start'), entry('basics', 'settled')],
        };
        const merged = mergeManifest(existing, [entry('basics', 'settled'), entry('basics', 'start')], order);

        assert.deepEqual(
            merged.entries.map((item) => item.pose),
            ['settled', 'start'],
        );
    });

    it('stamps generatedAt and never mutates its inputs', () => {
        const existing = emptyManifest();
        const merged = mergeManifest(existing, [entry('basics', 'start')], order);

        assert.equal(existing.entries.length, 0);
        assert.match(merged.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    });
});
