/**
 * The public sheet's tile selection: one display capture per nav-visible demo, in nav order,
 * with anything the review page would badge (errors, lint, extra variants) left out.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { filterSheetEntries, sheetEntries } from '../sheet-entries.js';

const demos = [
    { slug: 'basics', navLabel: 'Basics' },
    { slug: 'sprites', navLabel: 'Sprites' },
    { slug: 'camera', navLabel: 'Camera' },
];

function entry(slug, pose, extra = {}) {
    return {
        slug,
        pose,
        width: 320,
        height: 240,
        variants: { display: `${slug}/${pose}.display.png`, uidebug: `${slug}/${pose}.uidebug.png` },
        lint: [],
        error: null,
        ...extra,
    };
}

describe('sheetEntries', () => {
    it('keeps the demo list order, not the manifest order', () => {
        const result = sheetEntries(
            [entry('camera', 'start'), entry('basics', 'start'), entry('sprites', 'start')],
            demos,
        );

        assert.deepEqual(
            result.map((row) => row.slug),
            ['basics', 'sprites', 'camera'],
        );
    });

    it('takes the first pose of each demo', () => {
        const result = sheetEntries([entry('basics', 'start'), entry('basics', 'settled')], demos);

        assert.equal(result.length, 1);
        assert.equal(result[0].pose, 'start');
    });

    it('keeps only the display variant, drops lint, and labels the tile with navLabel', () => {
        const [row] = sheetEntries([entry('basics', 'start', { lint: [{ rule: 'overlap', message: 'x' }] })], demos);

        assert.deepEqual(row.variants, { display: 'basics/start.display.png' });
        assert.deepEqual(row.lint, []);
        assert.equal(row.label, 'Basics');
        assert.equal(row.width, 320);
    });

    it('skips errored and display-less captures and falls through to the next pose', () => {
        const result = sheetEntries(
            [
                entry('basics', 'start', { error: 'timeout' }),
                entry('basics', 'settled', { variants: { uidebug: 'basics/settled.uidebug.png' } }),
                entry('basics', 'late'),
            ],
            demos,
        );

        assert.deepEqual(
            result.map((row) => row.pose),
            ['late'],
        );
    });

    it('drops demos without a usable capture and manifest slugs that are not in the list', () => {
        const result = sheetEntries([entry('retired', 'start'), entry('sprites', 'start')], demos);

        assert.deepEqual(
            result.map((row) => row.slug),
            ['sprites'],
        );
    });

    it('ignores malformed rows', () => {
        const result = sheetEntries(
            [
                null,
                'basics',
                { slug: 'basics' },
                { slug: 'basics', pose: 'start', variants: null },
                entry('basics', 'ok'),
            ],
            demos,
        );

        assert.deepEqual(
            result.map((row) => row.pose),
            ['ok'],
        );
    });
});

describe('filterSheetEntries', () => {
    const rows = [
        { slug: 'pixel-art', label: 'Pixel Art' },
        { slug: 'crt-pipboy', label: 'PipBoy CRT' },
        { slug: 'basics', label: 'Basics' },
    ];
    const slugs = (query) => filterSheetEntries(rows, query).map((row) => row.slug);

    it('returns every entry for an empty or blank query', () => {
        assert.deepEqual(slugs(''), ['pixel-art', 'crt-pipboy', 'basics']);
        assert.deepEqual(slugs('   '), ['pixel-art', 'crt-pipboy', 'basics']);
    });

    it('matches the label case-insensitively, spaces included', () => {
        assert.deepEqual(slugs('pixel A'), ['pixel-art']);
        assert.deepEqual(slugs('PIPBOY crt'), ['crt-pipboy']);
    });

    it('matches the slug too', () => {
        assert.deepEqual(slugs('crt-pip'), ['crt-pipboy']);
    });

    it('returns nothing when no entry matches', () => {
        assert.deepEqual(slugs('zzz'), []);
    });
});
