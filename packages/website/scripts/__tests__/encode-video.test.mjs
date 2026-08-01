import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULTS,
    buildAv1Args,
    buildCwebpArgs,
    buildH264Args,
    buildOutputPaths,
    buildPosterFrameArgs,
    croppedDimensions,
    formatBytes,
    parseArgs,
    parseFrameRate,
} from '../encode-video.mjs';

// Every assertion here is on argument arrays and the parser, so the suite runs without
// ffmpeg or cwebp installed - which matters, because CI has neither.
const options = { ...DEFAULTS, gop: 300, fps: undefined };

/**
 * The value an ffmpeg flag carries. Fails the test outright when the flag is absent, rather
 * than returning undefined and letting the assertion compare two nothings.
 *
 * @param {string[]} args Argument list from one of the `build*Args` helpers.
 * @param {string} flag The flag to look up, e.g. `'-crf'`.
 * @returns {string} The argument immediately after `flag`.
 */
const valueAfter = (args, flag) => {
    const index = args.indexOf(flag);
    assert.notEqual(index, -1, `expected ${flag} to be present`);

    const value = args[index + 1];
    assert.equal(typeof value, 'string', `expected a value after ${flag}`);

    return /** @type {string} */ (value);
};

describe('parseArgs', () => {
    test('reads the positional input and --out', () => {
        const result = parseArgs(['clip.mov', '--out', 'public/media/blog/1-4-0']);
        assert.equal(result.input, 'clip.mov');
        assert.equal(result.outDir, 'public/media/blog/1-4-0');
    });

    test('derives --name from the input basename when omitted', () => {
        const result = parseArgs(['captures/hot-reload.mov', '--out', 'out']);
        assert.equal(result.name, 'hot-reload');
    });

    test('prefers an explicit --name over the basename', () => {
        const result = parseArgs(['captures/hot-reload.mov', '--out', 'out', '--name', 'demo']);
        assert.equal(result.name, 'demo');
    });

    test('applies DEFAULTS for every unspecified option', () => {
        const result = parseArgs(['clip.mov', '--out', 'out']);
        assert.equal(result.av1Crf, DEFAULTS.av1Crf);
        assert.equal(result.h264Crf, DEFAULTS.h264Crf);
        assert.equal(result.h264Preset, DEFAULTS.h264Preset);
        assert.equal(result.posterLossy, false);
    });

    test('parses boolean flags', () => {
        const result = parseArgs(['clip.mov', '--out', 'out', '--poster-lossy', '--keep-png', '--dry-run']);
        assert.equal(result.posterLossy, true);
        assert.equal(result.keepPng, true);
        assert.equal(result.dryRun, true);
    });

    test('parses numeric options as numbers, not strings', () => {
        const result = parseArgs(['clip.mov', '--out', 'out', '--av1-crf', '32']);
        assert.equal(result.av1Crf, 32);
    });

    test('throws when the input is missing', () => {
        assert.throws(() => parseArgs(['--out', 'out']), /Missing input file/u);
    });

    test('throws when --out is missing', () => {
        assert.throws(() => parseArgs(['clip.mov']), /Missing --out/u);
    });

    test('throws on a non-numeric --av1-crf rather than silently defaulting', () => {
        assert.throws(() => parseArgs(['clip.mov', '--out', 'out', '--av1-crf', 'high']), /Expected a number/u);
    });

    test('throws when an option is missing its value', () => {
        assert.throws(() => parseArgs(['clip.mov', '--out', '--dry-run']), /Missing value for --out/u);
    });

    test('throws on an unknown option', () => {
        assert.throws(() => parseArgs(['clip.mov', '--out', 'out', '--turbo']), /Unknown option --turbo/u);
    });

    test('throws on a second positional input', () => {
        assert.throws(() => parseArgs(['a.mov', 'b.mov', '--out', 'out']), /Unexpected second input/u);
    });

    test('does not mutate the argv array', () => {
        const argv = ['clip.mov', '--out', 'out'];
        parseArgs(argv);
        assert.deepEqual(argv, ['clip.mov', '--out', 'out']);
    });
});

describe('parseFrameRate', () => {
    test('reads a whole-number fraction', () => {
        assert.equal(parseFrameRate('30/1'), 30);
    });

    test('rounds NTSC rates to two decimals', () => {
        assert.equal(parseFrameRate('60000/1001'), 59.94);
    });

    test('accepts a bare numerator', () => {
        assert.equal(parseFrameRate('60'), 60);
    });

    test('returns undefined for a zero denominator', () => {
        assert.equal(parseFrameRate('0/0'), undefined);
    });

    test('returns undefined for a non-string input', () => {
        assert.equal(parseFrameRate(undefined), undefined);
    });
});

describe('buildOutputPaths', () => {
    test('appends the codec and poster suffixes to the base name', () => {
        const paths = buildOutputPaths('public/media/blog/1-4-0', 'hot-reload');
        assert.equal(paths.av1, 'public/media/blog/1-4-0/hot-reload.av1.mp4');
        assert.equal(paths.h264, 'public/media/blog/1-4-0/hot-reload.h264.mp4');
        assert.equal(paths.posterWebp, 'public/media/blog/1-4-0/hot-reload.webp');
    });

    // Guards the naming contract with src/components/video-embed.tsx, which builds its
    // source URLs by appending these same suffixes to the `src` prop.
    test('matches the suffixes VideoEmbed derives from its src prop', () => {
        const src = '/media/blog/1-4-0/hot-reload';
        const paths = buildOutputPaths('public/media/blog/1-4-0', 'hot-reload');
        assert.ok(paths.av1.endsWith(`${src}.av1.mp4`.replace('/media', 'media')));
        assert.ok(paths.h264.endsWith(`${src}.h264.mp4`.replace('/media', 'media')));
        assert.ok(paths.posterWebp.endsWith(`${src}.webp`.replace('/media', 'media')));
    });
});

describe('buildAv1Args', () => {
    test('selects libsvtav1', () => {
        assert.equal(valueAfter(buildAv1Args('in.mov', 'out.mp4', options), '-c:v'), 'libsvtav1');
    });

    test('strips the audio track', () => {
        assert.ok(buildAv1Args('in.mov', 'out.mp4', options).includes('-an'));
    });

    test('pins the sequence level to 4.0 so the codec string stays av01.0.08M.08', () => {
        const params = valueAfter(buildAv1Args('in.mov', 'out.mp4', options), '-svtav1-params');
        assert.match(params, /(^|:)level=40(:|$)/u);
    });

    test('forces screen content mode on for flat color runs', () => {
        const params = valueAfter(buildAv1Args('in.mov', 'out.mp4', options), '-svtav1-params');
        assert.match(params, /(^|:)scm=1(:|$)/u);
    });

    test('uses the visual-quality tune rather than the PSNR default', () => {
        const params = valueAfter(buildAv1Args('in.mov', 'out.mp4', options), '-svtav1-params');
        assert.match(params, /(^|:)tune=0(:|$)/u);
    });

    test('does not set scd, which SVT-AV1 warns about', () => {
        const params = valueAfter(buildAv1Args('in.mov', 'out.mp4', options), '-svtav1-params');
        assert.doesNotMatch(params, /(^|:)scd=/u);
    });

    test('forces yuv420p for broad decoder support', () => {
        assert.equal(valueAfter(buildAv1Args('in.mov', 'out.mp4', options), '-pix_fmt'), 'yuv420p');
    });

    test('emits +faststart so playback can start on the first range request', () => {
        assert.equal(valueAfter(buildAv1Args('in.mov', 'out.mp4', options), '-movflags'), '+faststart');
    });

    test('crops to even dimensions rather than scaling', () => {
        const filter = valueAfter(buildAv1Args('in.mov', 'out.mp4', options), '-vf');
        assert.match(filter, /^crop=/u);
        assert.doesNotMatch(filter, /scale=/u);
    });

    test('forces constant frame rate for variable-rate screen captures', () => {
        assert.equal(valueAfter(buildAv1Args('in.mov', 'out.mp4', options), '-fps_mode'), 'cfr');
    });

    test('omits -r when no fps override is given', () => {
        assert.ok(!buildAv1Args('in.mov', 'out.mp4', options).includes('-r'));
    });

    test('includes -r when an fps override is given', () => {
        const args = buildAv1Args('in.mov', 'out.mp4', { ...options, fps: 30 });
        assert.equal(valueAfter(args, '-r'), '30');
    });

    test('passes the CRF and GOP through', () => {
        const args = buildAv1Args('in.mov', 'out.mp4', { ...options, av1Crf: 32, gop: 150 });
        assert.equal(valueAfter(args, '-crf'), '32');
        assert.equal(valueAfter(args, '-g'), '150');
    });

    test('places the output path last', () => {
        const args = buildAv1Args('in.mov', 'out.mp4', options);
        assert.equal(args.at(-1), 'out.mp4');
    });
});

describe('buildH264Args', () => {
    test('selects libx264', () => {
        assert.equal(valueAfter(buildH264Args('in.mov', 'out.mp4', options), '-c:v'), 'libx264');
    });

    test('pins High profile at level 4.0 so the codec string stays avc1.640028', () => {
        const args = buildH264Args('in.mov', 'out.mp4', options);
        assert.equal(valueAfter(args, '-profile:v'), 'high');
        assert.equal(valueAfter(args, '-level:v'), '4.0');
    });

    test('uses -tune animation for flat, hard-edged content', () => {
        assert.equal(valueAfter(buildH264Args('in.mov', 'out.mp4', options), '-tune'), 'animation');
    });

    test('does not override the tune with explicit -x264-params', () => {
        assert.ok(!buildH264Args('in.mov', 'out.mp4', options).includes('-x264-params'));
    });

    test('strips the audio track', () => {
        assert.ok(buildH264Args('in.mov', 'out.mp4', options).includes('-an'));
    });

    test('emits +faststart', () => {
        assert.equal(valueAfter(buildH264Args('in.mov', 'out.mp4', options), '-movflags'), '+faststart');
    });

    test('derives keyint_min from the GOP', () => {
        const args = buildH264Args('in.mov', 'out.mp4', { ...options, gop: 300 });
        assert.equal(valueAfter(args, '-keyint_min'), '150');
    });
});

describe('buildPosterFrameArgs', () => {
    test('places -ss before -i for accurate fast seeking', () => {
        const args = buildPosterFrameArgs('in.mov', 'p.png', options);
        assert.ok(args.indexOf('-ss') < args.indexOf('-i'));
    });

    test('extracts exactly one frame', () => {
        assert.equal(valueAfter(buildPosterFrameArgs('in.mov', 'p.png', options), '-frames:v'), '1');
    });

    test('applies the same crop filter as the video so the poster is not stretched', () => {
        const posterFilter = valueAfter(buildPosterFrameArgs('in.mov', 'p.png', options), '-vf');
        const videoFilter = valueAfter(buildAv1Args('in.mov', 'out.mp4', options), '-vf');
        assert.equal(posterFilter, videoFilter);
    });

    test('honors the poster timestamp', () => {
        const args = buildPosterFrameArgs('in.mov', 'p.png', { ...options, posterAt: '00:00:02' });
        assert.equal(valueAfter(args, '-ss'), '00:00:02');
    });

    test('sets -update so the image2 muxer does not warn about a missing sequence pattern', () => {
        assert.equal(valueAfter(buildPosterFrameArgs('in.mov', 'p.png', options), '-update'), '1');
    });
});

describe('croppedDimensions', () => {
    // The printed <VideoEmbed> snippet must carry post-crop dimensions; the source numbers
    // would stretch the video in the browser.
    test('rounds odd dimensions down to even, matching the crop filter', () => {
        assert.deepEqual(croppedDimensions(641, 361), { width: 640, height: 360 });
    });

    test('leaves even dimensions alone', () => {
        assert.deepEqual(croppedDimensions(1280, 720), { width: 1280, height: 720 });
    });

    test('returns undefined when a probe failed', () => {
        assert.deepEqual(croppedDimensions(Number.NaN, Number.NaN), { width: undefined, height: undefined });
    });
});

describe('buildCwebpArgs', () => {
    test('is lossless by default', () => {
        const args = buildCwebpArgs('p.png', 'p.webp', options);
        assert.equal(valueAfter(args, '-z'), '9');
    });

    test('does not pass -lossless alongside -z, which makes cwebp warn', () => {
        assert.ok(!buildCwebpArgs('p.png', 'p.webp', options).includes('-lossless'));
    });

    test('switches to -q when --poster-lossy is set', () => {
        const args = buildCwebpArgs('p.png', 'p.webp', { ...options, posterLossy: true, posterQuality: 85 });
        assert.equal(valueAfter(args, '-q'), '85');
    });

    test('never mixes -z and -q', () => {
        for (const posterLossy of [true, false]) {
            const args = buildCwebpArgs('p.png', 'p.webp', { ...options, posterLossy });
            assert.ok(!(args.includes('-z') && args.includes('-q')));
        }
    });

    test('strips metadata and writes to the -o path', () => {
        const args = buildCwebpArgs('p.png', 'p.webp', options);
        assert.equal(valueAfter(args, '-metadata'), 'none');
        assert.equal(valueAfter(args, '-o'), 'p.webp');
    });
});

describe('formatBytes', () => {
    test('reports bytes below 1 KB', () => {
        assert.equal(formatBytes(512), '512 B');
    });

    test('reports kilobytes', () => {
        assert.equal(formatBytes(2048), '2.0 KB');
    });

    test('reports megabytes', () => {
        assert.equal(formatBytes(3 * 1024 * 1024), '3.00 MB');
    });

    test('returns a placeholder for an unreadable size', () => {
        assert.equal(formatBytes(Number.NaN), '-');
    });
});
