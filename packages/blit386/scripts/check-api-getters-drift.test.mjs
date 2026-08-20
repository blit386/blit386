import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    deriveBtMemberNames,
    findMissingRuleMentions,
    NO_INLINE_MENTION_ALLOWLIST,
} from './check-api-getters-drift.mjs';

describe('deriveBtMemberNames', () => {
    it('strips the BT. prefix and discards non-namespaced top-level exports', () => {
        const result = deriveBtMemberNames(['BT.paletteFade', 'Widget', 'BT.targetFPS']);

        assert.deepEqual(result, ['paletteFade', 'targetFPS']);
    });

    it('returns an empty array when no BT.* names are present', () => {
        const result = deriveBtMemberNames(['Vector2i', 'Rect2i']);

        assert.deepEqual(result, []);
    });

    it('respects a custom namespaceExportName', () => {
        const result = deriveBtMemberNames(['FixtureBT.value', 'Widget'], { namespaceExportName: 'FixtureBT' });

        assert.deepEqual(result, ['value']);
    });
});

describe('findMissingRuleMentions', () => {
    it('passes when the exact backtick-delimited name is present', () => {
        const failures = findMissingRuleMentions(['paletteFade'], 'See `paletteFade` for details.', new Set());

        assert.deepEqual(failures, []);
    });

    it('fails and names the missing member when absent entirely', () => {
        const failures = findMissingRuleMentions(['paletteFade'], 'Nothing relevant here.', new Set());

        assert.equal(failures.length, 1);
        assert.match(failures[0], /paletteFade/);
    });

    it('does not let a longer sibling mention satisfy a shorter missing name', () => {
        const failures = findMissingRuleMentions(['paletteFade'], 'See `paletteFadeRange` only.', new Set());

        assert.equal(failures.length, 1);
        assert.match(failures[0], /paletteFade/);
    });

    it('does not let a shorter mention satisfy a longer missing name', () => {
        const failures = findMissingRuleMentions(['paletteFadeRange'], 'See `paletteFade` only.', new Set());

        assert.equal(failures.length, 1);
        assert.match(failures[0], /paletteFadeRange/);
    });

    it('skips a missing name that is on the allowlist', () => {
        const failures = findMissingRuleMentions(['buttonDown'], 'Nothing relevant here.', new Set(['buttonDown']));

        assert.deepEqual(failures, []);
    });

    it('applies the allowlist per-name, not globally', () => {
        const failures = findMissingRuleMentions(
            ['buttonDown', 'paletteFade'],
            'Nothing relevant here.',
            new Set(['buttonDown']),
        );

        assert.equal(failures.length, 1);
        assert.match(failures[0], /paletteFade/);
    });

    it('collects every missing member instead of stopping at the first one', () => {
        const failures = findMissingRuleMentions(
            ['paletteFade', 'targetFPS', 'phantomMember'],
            'Nothing relevant here.',
            new Set(),
        );

        assert.equal(failures.length, 3);
        assert.match(failures[0], /paletteFade/);
        assert.match(failures[1], /targetFPS/);
        assert.match(failures[2], /phantomMember/);
    });

    it('returns an empty array for empty input regardless of content', () => {
        const failures = findMissingRuleMentions([], 'Nothing relevant here.', new Set());

        assert.deepEqual(failures, []);
    });

    it('uses the default allowlist when none is passed', () => {
        const failures = findMissingRuleMentions(['keyDown'], 'Nothing relevant here.');

        assert.deepEqual(failures, []);
    });
});

describe('NO_INLINE_MENTION_ALLOWLIST', () => {
    it('is seeded with exactly the documented deprecated aliases', () => {
        assert.deepEqual([...NO_INLINE_MENTION_ALLOWLIST].sort(), [
            'buttonDown',
            'buttonPressed',
            'buttonReleased',
            'gamepadConnected',
            'keyDown',
            'keyPressed',
            'keyReleased',
            'pointerPosValid',
        ]);
    });
});
