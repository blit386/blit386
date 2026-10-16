/**
 * Unit tests for the pure validation helpers behind `check-demo-registry.mjs`. This is a
 * CI / lint-staged gate, so it fails open if a rule stops actually rejecting bad input - these
 * tests exist to prove each rule still rejects what it claims to.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    extractReadmeDemoSlugs,
    findDescriptionFailures,
    findOgScaleFailure,
    findReadmeListFailures,
    findReservedSlugFailures,
    findVintageUrlFailures,
    RESERVED_SLUGS,
} from '../check-demo-registry.mjs';

describe('findDescriptionFailures', () => {
    it('fails on a missing tag, and only that failure', () => {
        const failures = findDescriptionFailures('basics', '');

        assert.equal(failures.length, 1);
        assert.match(failures[0], /has no "@description/);
    });

    it('accepts a description at exactly the 60-char floor', () => {
        const description = `${'a'.repeat(59)}.`;
        assert.equal(description.length, 60);
        assert.deepEqual(findDescriptionFailures('basics', description), []);
    });

    it('fails a description one character under the 60-char floor', () => {
        const description = `${'a'.repeat(58)}.`;
        assert.equal(description.length, 59);
        const failures = findDescriptionFailures('basics', description);

        assert.equal(failures.length, 1);
        assert.match(failures[0], /under the 60-char minimum/);
    });

    it('accepts a description at exactly the 104-char ceiling', () => {
        const description = `${'a'.repeat(103)}.`;
        assert.equal(description.length, 104);
        assert.deepEqual(findDescriptionFailures('basics', description), []);
    });

    it('fails a description one character over the 104-char ceiling', () => {
        const description = `${'a'.repeat(104)}.`;
        assert.equal(description.length, 105);
        const failures = findDescriptionFailures('basics', description);

        assert.equal(failures.length, 1);
        assert.match(failures[0], /over the 104-char ceiling/);
    });

    it('counts code points, not UTF-16 units, so an astral character counts once', () => {
        // U+20000 (a CJK Extension B ideograph) is a surrogate pair (2 UTF-16 units) but a
        // single code point. 102 code points plus one astral character plus the trailing period
        // is exactly the 104-char ceiling - 104 code points, but 105 UTF-16 units. A buggy
        // UTF-16-based implementation would reject this as over the ceiling; the code-point-based
        // implementation must accept it.
        const description = `${'a'.repeat(102)}\u{20000}.`;
        assert.equal([...description].length, 104);
        assert.equal(description.length, 105);
        assert.deepEqual(findDescriptionFailures('basics', description), []);
    });

    it('fails on a forbidden angle bracket', () => {
        const description = `${'a'.repeat(58)}<b.`;
        const failures = findDescriptionFailures('basics', description);

        assert.ok(failures.some((message) => /contains < or >/.test(message)));
    });

    it('fails when the description does not end in a period', () => {
        const description = 'a'.repeat(60);
        const failures = findDescriptionFailures('basics', description);

        assert.ok(failures.some((message) => /should end in a period/.test(message)));
    });

    it('reports multiple simultaneous failures', () => {
        // Too short, no trailing period.
        const failures = findDescriptionFailures('basics', 'Too short');

        assert.equal(failures.length, 2);
    });
});

describe('findOgScaleFailure', () => {
    it('accepts every real mode', () => {
        for (const mode of ['auto', 'integer', 'fit']) {
            assert.equal(findOgScaleFailure('basics', mode), null);
        }
    });

    it('accepts an absent tag', () => {
        assert.equal(findOgScaleFailure('basics', ''), null);
    });

    it('fails on an unknown mode and lists the real ones', () => {
        const failure = findOgScaleFailure('basics', 'enormous');

        assert.ok(failure);
        assert.match(failure, /@ogScale "enormous"/);
        assert.match(failure, /auto/);
        assert.match(failure, /integer/);
        assert.match(failure, /fit/);
    });
});

describe('findVintageUrlFailures', () => {
    it('passes a target that is live and not retired', () => {
        const failures = findVintageUrlFailures({ '001-basics': 'basics' }, new Set(['basics']), new Set());
        assert.deepEqual(failures, []);
    });

    it('passes a target that is retired and not live', () => {
        const failures = findVintageUrlFailures(
            { 'old-demo': 'retired-demo' },
            new Set(['basics']),
            new Set(['retired-demo']),
        );
        assert.deepEqual(failures, []);
    });

    it('fails a target that is neither live nor retired', () => {
        const failures = findVintageUrlFailures({ 'old-demo': 'ghost-demo' }, new Set(['basics']), new Set());

        assert.equal(failures.length, 1);
        assert.match(failures[0], /neither a live src\/ghost-demo\.js nor listed in RETIRED_SLUGS/);
    });

    it('fails a target that is both live and retired', () => {
        // Also trips "still exists on disk" from the RETIRED_SLUGS pass, since the same slug is
        // both live and retired here - two failures are expected.
        const failures = findVintageUrlFailures({ 'old-demo': 'basics' }, new Set(['basics']), new Set(['basics']));

        assert.ok(failures.some((message) => /is both live on disk and listed in RETIRED_SLUGS/.test(message)));
    });

    it('fails a RETIRED_SLUGS entry that still exists on disk', () => {
        const failures = findVintageUrlFailures(
            { 'old-demo': 'retired-demo' },
            new Set(['retired-demo']),
            new Set(['retired-demo']),
        );

        assert.ok(failures.some((message) => /still exists/.test(message)));
    });

    it('fails a RETIRED_SLUGS entry with no VINTAGE_URLS target', () => {
        const failures = findVintageUrlFailures({}, new Set(['basics']), new Set(['orphaned-demo']));

        assert.equal(failures.length, 1);
        assert.match(failures[0], /no VINTAGE_URLS entry targets it/);
    });
});

describe('extractReadmeDemoSlugs', () => {
    it('reads entries out of the ## Demos section', () => {
        const readme = [
            '# Title',
            '',
            'Hosted site: [demos.blit386.dev](https://demos.blit386.dev/).',
            '',
            '## Demos',
            '',
            '### Drawing Basics',
            '',
            '- [basics](https://demos.blit386.dev/basics) - Engine basics',
            '- [colors](https://demos.blit386.dev/colors) - Color32 deep dive',
            '',
            '## Shared UI kit',
            '',
            'Text mentioning [demos.blit386.dev](https://demos.blit386.dev) again.',
        ].join('\n');

        assert.deepEqual(extractReadmeDemoSlugs(readme), ['basics', 'colors']);
    });

    it('ignores a bare-domain link in the intro before the heading', () => {
        const readme = [
            'Hosted site: [demos.blit386.dev](https://demos.blit386.dev/). Live URLs use a slug.',
            '',
            '## Demos',
            '',
            '- [basics](https://demos.blit386.dev/basics) - Engine basics',
            '',
            '## Shared UI kit',
        ].join('\n');

        assert.deepEqual(extractReadmeDemoSlugs(readme), ['basics']);
    });

    it('ignores a bare-domain link after the ## Demos section ends', () => {
        const readme = [
            '## Demos',
            '',
            '- [basics](https://demos.blit386.dev/basics) - Engine basics',
            '',
            '## Browser and Renderer',
            '',
            'The splash plays on [demos.blit386.dev](https://demos.blit386.dev) too.',
        ].join('\n');

        assert.deepEqual(extractReadmeDemoSlugs(readme), ['basics']);
    });

    it('returns an empty array when there is no ## Demos heading', () => {
        assert.deepEqual(extractReadmeDemoSlugs('# Title\n\nNo demos section here.'), []);
    });

    it('preserves list order, including duplicates', () => {
        const readme = [
            '## Demos',
            '',
            '- [basics](https://demos.blit386.dev/basics) - Engine basics',
            '- [basics](https://demos.blit386.dev/basics) - Engine basics again',
        ].join('\n');

        assert.deepEqual(extractReadmeDemoSlugs(readme), ['basics', 'basics']);
    });

    it('catches a second, stale demo link on the same list-item line', () => {
        const readme = [
            '## Demos',
            '',
            '- [basics](https://demos.blit386.dev/basics) - See also [ghost-demo](https://demos.blit386.dev/ghost-demo)',
        ].join('\n');

        assert.deepEqual(extractReadmeDemoSlugs(readme), ['basics', 'ghost-demo']);
    });
});

describe('findReadmeListFailures', () => {
    it('passes when disk and README agree exactly', () => {
        const failures = findReadmeListFailures(['basics', 'colors'], ['basics', 'colors']);
        assert.deepEqual(failures, []);
    });

    it('fails a disk slug missing from the README list', () => {
        const failures = findReadmeListFailures(['basics', 'colors'], ['basics']);

        assert.equal(failures.length, 1);
        assert.match(failures[0], /src\/colors\.js is missing from the README\.md demo list/);
    });

    it('fails a README entry for a slug that does not exist on disk', () => {
        const failures = findReadmeListFailures(['basics'], ['basics', 'ghost-demo']);

        assert.equal(failures.length, 1);
        assert.match(failures[0], /links to "ghost-demo" but src\/ghost-demo\.js is missing/);
    });

    it('fails a duplicated README entry for a live slug', () => {
        const failures = findReadmeListFailures(['basics'], ['basics', 'basics']);

        assert.equal(failures.length, 1);
        assert.match(failures[0], /links to "basics" 2 times, expected exactly once/);
    });

    it('reports all three failure kinds together without cross-contamination', () => {
        const failures = findReadmeListFailures(['basics', 'colors', 'sprites'], ['basics', 'basics', 'ghost-demo']);

        assert.equal(failures.length, 4);
        assert.ok(failures.some((message) => /src\/colors\.js is missing/.test(message)));
        assert.ok(failures.some((message) => /src\/sprites\.js is missing/.test(message)));
        assert.ok(failures.some((message) => /ghost-demo" but src\/ghost-demo\.js is missing/.test(message)));
        assert.ok(failures.some((message) => /"basics" 2 times/.test(message)));
    });
});

describe('findReservedSlugFailures', () => {
    it('passes when no demo uses a reserved slug', () => {
        assert.deepEqual(findReservedSlugFailures(['basics', 'sprites'], RESERVED_SLUGS), []);
    });

    it('names the colliding file when a demo takes a reserved slug', () => {
        assert.deepEqual(findReservedSlugFailures(['basics', 'shots'], new Set(['shots'])), [
            'src/shots.js collides with the reserved page path /shots - rename the demo',
        ]);
    });

    it('reserves exactly the shots gallery and the site index page paths', () => {
        assert.deepEqual([...RESERVED_SLUGS], ['shots', 'index']);
    });
});
