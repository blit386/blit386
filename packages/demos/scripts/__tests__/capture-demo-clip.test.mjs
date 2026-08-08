import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULTS, parseArgs } from '../capture-demo-clip.mjs';

describe('parseArgs', () => {
    test('reads the slug, --duration, and --out', () => {
        const result = parseArgs(['palette-cycling', '--duration', '20', '--out', 'public/media/social']);
        assert.equal(result.slug, 'palette-cycling');
        assert.equal(result.duration, 20);
        assert.equal(result.out, 'public/media/social');
    });

    test('derives --name from the slug when omitted', () => {
        const result = parseArgs(['palette-cycling', '--duration', '20', '--out', 'out']);
        assert.equal(result.name, 'palette-cycling');
    });

    test('prefers an explicit --name over the slug', () => {
        const result = parseArgs(['palette-cycling', '--duration', '20', '--out', 'out', '--name', 'clip']);
        assert.equal(result.name, 'clip');
    });

    test('applies DEFAULTS for every unspecified option', () => {
        const result = parseArgs(['palette-cycling', '--duration', '20', '--out', 'out']);
        assert.equal(result.upscale, DEFAULTS.upscale);
        assert.equal(result.baseUrl, DEFAULTS.baseUrl);
        assert.equal(result.posterAt, DEFAULTS.posterAt);
        assert.equal(result.bitrate, DEFAULTS.bitrate);
        assert.equal(result.keepIntermediate, false);
        assert.equal(result.dryRun, false);
    });

    test('parses numeric and boolean overrides', () => {
        const result = parseArgs([
            'palette-cycling',
            '--duration',
            '20',
            '--out',
            'out',
            '--upscale',
            '3',
            '--bitrate',
            '8000000',
            '--keep-intermediate',
            '--dry-run',
        ]);
        assert.equal(result.upscale, 3);
        assert.equal(result.bitrate, 8_000_000);
        assert.equal(result.keepIntermediate, true);
        assert.equal(result.dryRun, true);
    });

    test('rejects an unknown slug', () => {
        assert.throws(
            () => parseArgs(['not-a-real-demo', '--duration', '20', '--out', 'out']),
            /Unknown demo slug "not-a-real-demo"/u,
        );
    });

    test('rejects a missing slug', () => {
        assert.throws(() => parseArgs(['--duration', '20', '--out', 'out']), /Missing demo slug/u);
    });

    test('rejects a missing --duration', () => {
        assert.throws(() => parseArgs(['palette-cycling', '--out', 'out']), /Missing --duration/u);
    });

    test('rejects a non-positive --duration', () => {
        assert.throws(
            () => parseArgs(['palette-cycling', '--duration', '0', '--out', 'out']),
            /--duration must be a positive number/u,
        );
    });

    test('rejects a missing --out', () => {
        assert.throws(() => parseArgs(['palette-cycling', '--duration', '20']), /Missing --out/u);
    });

    test('rejects a non-positive --upscale', () => {
        assert.throws(
            () => parseArgs(['palette-cycling', '--duration', '20', '--out', 'out', '--upscale', '0']),
            /--upscale must be a positive number/u,
        );
    });

    test('rejects an unknown option', () => {
        assert.throws(
            () => parseArgs(['palette-cycling', '--duration', '20', '--out', 'out', '--bogus']),
            /Unknown option --bogus/u,
        );
    });

    test('rejects a missing value for an option', () => {
        assert.throws(() => parseArgs(['palette-cycling', '--duration', '20', '--out']), /Missing value for --out/u);
    });

    test('rejects a second positional argument', () => {
        assert.throws(
            () => parseArgs(['palette-cycling', 'extra', '--duration', '20', '--out', 'out']),
            /Unexpected second positional argument "extra"/u,
        );
    });
});
