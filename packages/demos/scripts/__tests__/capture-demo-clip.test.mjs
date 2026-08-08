import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import {
    DEFAULTS,
    buildEmbedUrl,
    buildIntermediatePaths,
    buildRecorderScript,
    buildStopScript,
    buildUpscaleArgs,
    computeUpscaleTarget,
    parseArgs,
    resolveEncodeVideoScriptPath,
    sliceRanges,
} from '../capture-demo-clip.mjs';

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

describe('buildEmbedUrl', () => {
    test('builds a canvas-only embed URL', () => {
        assert.equal(
            buildEmbedUrl('https://demos.blit386.dev', 'palette-cycling'),
            'https://demos.blit386.dev/palette-cycling?embed',
        );
    });

    test('strips a trailing slash from the base URL', () => {
        assert.equal(
            buildEmbedUrl('https://demos.blit386.dev/', 'palette-cycling'),
            'https://demos.blit386.dev/palette-cycling?embed',
        );
    });
});

describe('computeUpscaleTarget', () => {
    test('matches the worked recipe: 640x480 at 2x is 1280x960', () => {
        assert.deepEqual(computeUpscaleTarget(640, 480, 2), { width: 1280, height: 960 });
    });

    test('rounds a non-integer factor', () => {
        assert.deepEqual(computeUpscaleTarget(640, 480, 1.5), { width: 960, height: 720 });
    });
});

describe('buildIntermediatePaths', () => {
    test('builds the raw and upscaled intermediate paths', () => {
        const paths = buildIntermediatePaths('public/media/social', 'palette-cycling');
        assert.equal(paths.raw, join('public/media/social', 'palette-cycling.raw.webm'));
        assert.equal(paths.upscaled, join('public/media/social', 'palette-cycling.upscaled.mp4'));
    });
});

describe('buildUpscaleArgs', () => {
    test('builds the nearest-neighbor upscale command', () => {
        const args = buildUpscaleArgs('raw.webm', 'upscaled.mp4', { width: 1280, height: 960 });
        assert.deepEqual(args, [
            '-hide_banner',
            '-y',
            '-i',
            'raw.webm',
            '-vf',
            'scale=1280:960:flags=neighbor',
            '-c:v',
            'libx264',
            '-qp',
            '0',
            '-preset',
            'ultrafast',
            '-an',
            'upscaled.mp4',
        ]);
    });
});

describe('resolveEncodeVideoScriptPath', () => {
    test('resolves to packages/website/scripts/encode-video.mjs relative to this script', () => {
        const result = resolveEncodeVideoScriptPath('file:///repo/packages/demos/scripts/capture-demo-clip.mjs');
        assert.equal(result, join('/repo', 'packages', 'website', 'scripts', 'encode-video.mjs'));
    });
});

describe('buildRecorderScript', () => {
    test('references the canvas id, vp9/vp8 fallback, and the requested bitrate', () => {
        const script = buildRecorderScript(12_000_000);
        assert.match(script, /getElementById\('blit386-canvas'\)/u);
        assert.match(script, /MediaRecorder\.isTypeSupported/u);
        assert.match(script, /'video\/webm;codecs=vp9'/u);
        assert.match(script, /'video\/webm;codecs=vp8'/u);
        assert.match(script, /videoBitsPerSecond: 12000000/u);
        assert.match(script, /captureStream\(60\)/u);
    });
});

describe('buildStopScript', () => {
    test('stops the recorder, builds a Blob, and base64-encodes in push-chunk-sized slices', () => {
        const script = buildStopScript();
        assert.match(script, /window\.__btRecorder/u);
        assert.match(script, /addEventListener\('stop'/u);
        assert.match(script, /new Blob\(window\.__btChunks/u);
        assert.match(script, /btoa\(binary\)/u);
        assert.match(script, /chunkSize = 32768/u);
    });
});

describe('sliceRanges', () => {
    test('returns nothing for a zero length', () => {
        assert.deepEqual(sliceRanges(0, 300_000), []);
    });

    test('returns one range when the length fits in one chunk', () => {
        assert.deepEqual(sliceRanges(300_000, 300_000), [{ start: 0, length: 300_000 }]);
    });

    test('splits a length spanning multiple chunks, with a short final range', () => {
        assert.deepEqual(sliceRanges(700_000, 300_000), [
            { start: 0, length: 300_000 },
            { start: 300_000, length: 300_000 },
            { start: 600_000, length: 100_000 },
        ]);
    });
});
