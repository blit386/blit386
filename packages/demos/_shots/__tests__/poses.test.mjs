/**
 * The pose table drives every capture; a malformed entry would silently produce wrong tiles.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEMO_ORDER } from '../../plugins/demo-order.js';
import {
    COMMITTED_VARIANTS,
    DEFAULT_POSES,
    isKnownPose,
    jobsFor,
    POSES_BY_SLUG,
    posesFor,
    validatePoses,
    VARIANTS,
} from '../poses.js';

describe('posesFor', () => {
    it('falls back to the defaults for a demo without an entry', () => {
        assert.deepEqual(posesFor('no-such-demo'), DEFAULT_POSES);
    });

    it('returns the per-slug list when one exists', () => {
        const [slug, poses] = Object.entries(POSES_BY_SLUG)[0];

        assert.equal(posesFor(slug), poses);
    });
});

describe('isKnownPose', () => {
    it('accepts a listed pose and the defaults, and refuses a renamed or unknown one', () => {
        assert.ok(isKnownPose('basics', 'moving'));
        assert.ok(isKnownPose('no-such-demo', 'start'));
        assert.ok(!isKnownPose('basics', 'wandering'));
        assert.ok(!isKnownPose('no-such-demo', 'moving'));
    });
});

describe('jobsFor', () => {
    it('lists every pose of every demo once per variant, demo then pose then variant', () => {
        const jobs = jobsFor(['no-such-demo', 'basics'], ['display', 'uidebug']);

        assert.deepEqual(
            jobs.slice(0, 4).map((job) => `${job.slug}/${job.pose.id}/${job.variant}`),
            [
                'no-such-demo/start/display',
                'no-such-demo/start/uidebug',
                'no-such-demo/settled/display',
                'no-such-demo/settled/uidebug',
            ],
        );
        assert.equal(jobs.length, (DEFAULT_POSES.length + posesFor('basics').length) * 2);
    });

    it('returns nothing without demos or without variants', () => {
        assert.deepEqual(jobsFor([], ['display']), []);
        assert.deepEqual(jobsFor(['basics'], []), []);
    });
});

describe('validatePoses', () => {
    it('accepts the shipped table against the live registry', () => {
        assert.deepEqual(validatePoses(POSES_BY_SLUG, new Set(DEMO_ORDER)), []);
    });

    it('rejects an unknown slug, a duplicate id, a bad id, and two input kinds', () => {
        const problems = validatePoses(
            {
                ghost: [{ id: 'start', at: 0 }],
                basics: [
                    { id: 'start', at: 0 },
                    { id: 'start', at: 1 },
                    { id: 'Bad Id', at: 1 },
                    { id: 'two', at: 1, keys: ['KeyA'], touch: true },
                    { id: 'neg', at: -1 },
                ],
            },
            new Set(['basics']),
        );

        assert.deepEqual(problems, [
            'ghost: not a demo slug',
            'basics/start: duplicate pose id',
            'basics/Bad Id: id must be kebab-case',
            'basics/two: at most one of keys, pointer, touch',
            'basics/neg: at must be a number >= 0',
        ]);
    });
});

describe('variants', () => {
    it('commits display and uidebug only', () => {
        assert.deepEqual(COMMITTED_VARIANTS, ['display', 'uidebug']);
        assert.ok(COMMITTED_VARIANTS.every((variant) => VARIANTS.includes(variant)));
    });
});
