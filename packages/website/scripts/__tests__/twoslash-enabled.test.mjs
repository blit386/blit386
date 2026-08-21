import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isTwoslashEnabled, TWOSLASH_ENV_VAR } from '../twoslash-config.mjs';

describe('isTwoslashEnabled (BT-188)', () => {
    test('is off when nothing is set', () => {
        assert.equal(isTwoslashEnabled({}), false);
    });

    test('is on for CLOUDFLARE', () => {
        assert.equal(isTwoslashEnabled({ CLOUDFLARE: '1' }), true);
    });

    test('is on for WORKERS_CI', () => {
        // The BT-188 regression guard. Waku selects its Cloudflare adapter on either
        // var, so a Cloudflare Workers Builds run used to produce a build with every
        // Twoslash popup missing, and silently, because `throws: false` degrades a
        // failing block to plain highlighting rather than erroring.
        assert.equal(isTwoslashEnabled({ WORKERS_CI: '1' }), true);
    });

    test(`is on for ${TWOSLASH_ENV_VAR} alone, with no adapter var present`, () => {
        assert.equal(isTwoslashEnabled({ [TWOSLASH_ENV_VAR]: '1' }), true);
    });

    test(`${TWOSLASH_ENV_VAR}=0 overrides an adapter var`, () => {
        assert.equal(isTwoslashEnabled({ CLOUDFLARE: '1', [TWOSLASH_ENV_VAR]: '0' }), false);
    });

    test(`${TWOSLASH_ENV_VAR}=false is off, case-insensitively`, () => {
        assert.equal(isTwoslashEnabled({ [TWOSLASH_ENV_VAR]: 'false' }), false);
        assert.equal(isTwoslashEnabled({ [TWOSLASH_ENV_VAR]: 'FALSE' }), false);
    });

    test(`an empty ${TWOSLASH_ENV_VAR} falls through to adapter detection`, () => {
        assert.equal(isTwoslashEnabled({ [TWOSLASH_ENV_VAR]: '' }), false);
        assert.equal(isTwoslashEnabled({ [TWOSLASH_ENV_VAR]: '', CLOUDFLARE: '1' }), true);
    });

    test('CLOUDFLARE=0 is on, deliberately mirroring Waku', () => {
        // Not a bug to fix: getDefaultAdapter() in waku/dist/lib/utils/config.js reads
        // these vars for plain truthiness, so CLOUDFLARE=0 still selects the Cloudflare
        // adapter. The gate must agree with the adapter, not with intent.
        assert.equal(isTwoslashEnabled({ CLOUDFLARE: '0' }), true);
    });

    test('reads process.env when called with no argument', (t) => {
        const original = process.env.CLOUDFLARE;
        t.after(() => {
            if (original === undefined) delete process.env.CLOUDFLARE;
            else process.env.CLOUDFLARE = original;
        });

        process.env.CLOUDFLARE = '1';
        assert.equal(isTwoslashEnabled(), true);
    });
});

describe('package.json scripts stay in sync with the gate', () => {
    const scripts = JSON.parse(readFileSync(join(import.meta.dirname, '../../package.json'), 'utf8')).scripts;

    test('dev:twoslash sets the env var the gate reads', () => {
        // The only copy of TWOSLASH_ENV_VAR that lives outside TypeScript, so nothing
        // but this assertion keeps the two spellings honest.
        assert.match(scripts['dev:twoslash'], new RegExp(`${TWOSLASH_ENV_VAR}=1\\b`));
    });

    test('dev leaves Twoslash off', () => {
        assert.equal(scripts.dev.includes(TWOSLASH_ENV_VAR), false);
    });

    test('build still sets CLOUDFLARE=1', () => {
        assert.match(scripts.build, /CLOUDFLARE=1\b/);
    });
});
