/**
 * Unit tests for the pure helpers in scripts/capture-og-image.mjs.
 *
 * Everything here is argv-in/plain-data-out or string-out, so nothing touches a browser,
 * ffmpeg, or the filesystem.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEMO_ORDER } from '../../plugins/demo-order.js';
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, OG_SCALE_DEFAULT } from '../../plugins/social-meta.js';
import { CANVAS_ID } from '../agent-browser-session.mjs';
import {
    buildCanvasPrepScript,
    buildNativeImagePath,
    buildOgFfmpegArgs,
    buildOgFilterGraph,
    buildOgImagePath,
    computeOgScale,
    DEFAULTS,
    OG_CAPTURE_OVERRIDES,
    parseArgs,
    resolveOutDir,
    resolveScaleMode,
} from '../capture-og-image.mjs';

describe('parseArgs', () => {
    it('reads a single slug and applies the defaults', () => {
        const options = parseArgs(['basics']);

        assert.deepEqual(options.slugs, ['basics']);
        assert.equal(options.all, false);
        // Empty means "not passed", so resolveOutDir can anchor it to the package.
        assert.equal(options.out, '');
        assert.equal(options.baseUrl, DEFAULTS.baseUrl);
        assert.equal(options.settle, DEFAULTS.settle);
        // Empty means "no CLI override" – each demo's own @ogScale tag gets to decide.
        assert.equal(options.scaleMode, '');
    });

    it('expands --all to every ordered slug', () => {
        const options = parseArgs(['--all']);

        assert.deepEqual(options.slugs, DEMO_ORDER);
        assert.equal(options.slugs.length, 46);
    });

    it('parses string, numeric, and boolean overrides', () => {
        const options = parseArgs([
            'flurry',
            '--out',
            'tmp/cards',
            '--base-url',
            'http://localhost:4173',
            '--settle',
            '4.5',
            '--scale-mode',
            'fit',
            '--force',
            '--keep-intermediate',
            '--dry-run',
        ]);

        assert.equal(options.out, 'tmp/cards');
        assert.equal(options.baseUrl, 'http://localhost:4173');
        assert.equal(options.settle, 4.5);
        assert.equal(options.scaleMode, 'fit');
        assert.equal(options.force, true);
        assert.equal(options.keepIntermediate, true);
        assert.equal(options.dryRun, true);
    });

    it('rejects a missing slug', () => {
        assert.throws(() => parseArgs([]), /Missing demo slug/);
    });

    it('rejects an unknown slug', () => {
        assert.throws(() => parseArgs(['not-a-demo']), /Unknown demo slug/);
    });

    it('rejects a slug combined with --all', () => {
        assert.throws(() => parseArgs(['basics', '--all']), /not both/);
    });

    it('rejects a second positional argument', () => {
        assert.throws(() => parseArgs(['basics', 'flurry']), /second positional/);
    });

    it('rejects an option missing its value', () => {
        assert.throws(() => parseArgs(['basics', '--out']), /--out requires a value/);
    });

    it('rejects a following option token as a value', () => {
        // Otherwise `--out --force` writes every card into a directory named "--force".
        assert.throws(() => parseArgs(['basics', '--out', '--force']), /--out requires a value/);
        assert.throws(() => parseArgs(['basics', '--base-url', '--force']), /--base-url requires a value/);
        assert.throws(() => parseArgs(['basics', '--settle', '--dry-run']), /--settle requires a value/);
    });

    it('rejects a non-numeric or non-positive --settle', () => {
        assert.throws(() => parseArgs(['basics', '--settle', 'soon']), /must be a positive number/);
        assert.throws(() => parseArgs(['basics', '--settle', '0']), /must be a positive number/);
        assert.throws(() => parseArgs(['basics', '--settle', '-2']), /must be a positive number/);
    });

    it('rejects an unknown --scale-mode', () => {
        assert.throws(() => parseArgs(['basics', '--scale-mode', 'smooth']), /--scale-mode must be one of/);
    });

    it('rejects an unrecognized option', () => {
        assert.throws(() => parseArgs(['basics', '--upscale', '3']), /Unknown option/);
    });
});

describe('computeOgScale', () => {
    it('picks the largest whole factor for a 320x200 canvas', () => {
        // min(1200/320, 630/200) = min(3.75, 3.15) -> 3
        assert.deepEqual(computeOgScale(320, 200, 'integer'), { scale: 3, drawWidth: 960, drawHeight: 600 });
    });

    it('picks the largest whole factor for a 320x240 canvas', () => {
        // min(1200/320, 630/240) = min(3.75, 2.625) -> 2
        assert.deepEqual(computeOgScale(320, 240, 'integer'), { scale: 2, drawWidth: 640, drawHeight: 480 });
    });

    it('scales a tiny 80x60 canvas up by a large whole factor that still fits', () => {
        const target = computeOgScale(80, 60, 'integer');

        assert.equal(target.scale, 10);
        assert.ok(target.drawWidth <= OG_IMAGE_WIDTH && target.drawHeight <= OG_IMAGE_HEIGHT);
    });

    it('falls back to a fractional fit when the source is larger than the card', () => {
        const target = computeOgScale(1280, 800, 'integer');

        assert.ok(target.scale < 1);
        assert.ok(target.drawWidth <= OG_IMAGE_WIDTH && target.drawHeight <= OG_IMAGE_HEIGHT);
        assert.equal(target.drawWidth % 2, 0);
        assert.equal(target.drawHeight % 2, 0);
    });

    it('allows a fractional factor in fit mode even when a whole one exists', () => {
        const integer = computeOgScale(320, 240, 'integer');
        const fit = computeOgScale(320, 240, 'fit');

        assert.equal(integer.scale, 2);
        assert.ok(fit.scale > integer.scale);
        assert.ok(fit.drawWidth <= OG_IMAGE_WIDTH && fit.drawHeight <= OG_IMAGE_HEIGHT);
    });

    it('keeps integer scaling in auto mode when it already fills the card', () => {
        // 320x200 at 3x reaches 600 of 630 (95%), comfortably over the threshold.
        assert.deepEqual(computeOgScale(320, 200, 'auto'), { scale: 3, drawWidth: 960, drawHeight: 600 });
    });

    it('switches to fit in auto mode when integer scaling would leave the demo in black', () => {
        // 320x240 manages only 2x -> 480 of 630 (76%), so filling reads better as a thumbnail.
        const auto = computeOgScale(320, 240, 'auto');

        assert.ok(!Number.isInteger(auto.scale));
        assert.equal(auto.drawHeight, OG_IMAGE_HEIGHT);
    });

    it('defaults to auto', () => {
        assert.equal(OG_SCALE_DEFAULT, 'auto');
        assert.deepEqual(computeOgScale(320, 240), computeOgScale(320, 240, 'auto'));
    });

    it('never exceeds the card in either dimension, in any mode', () => {
        for (const mode of ['auto', 'integer', 'fit']) {
            for (const [width, height] of [
                [320, 200],
                [320, 240],
                [256, 256],
                [80, 60],
                [640, 480],
                [960, 720],
                [1280, 800],
            ]) {
                const target = computeOgScale(width, height, mode);

                assert.ok(
                    target.drawWidth <= OG_IMAGE_WIDTH && target.drawHeight <= OG_IMAGE_HEIGHT,
                    `${mode} ${width}x${height} overflowed the card`,
                );
            }
        }
    });
});

describe('resolveScaleMode', () => {
    it('lets an explicit --scale-mode override the demo tag', () => {
        assert.equal(resolveScaleMode('integer', 'fit'), 'integer');
    });

    it('uses the demo @ogScale tag when no flag was passed', () => {
        assert.equal(resolveScaleMode('', 'fit'), 'fit');
    });

    it('falls back to the default when neither is set', () => {
        assert.equal(resolveScaleMode('', ''), OG_SCALE_DEFAULT);
    });
});

describe('buildOgFilterGraph', () => {
    it('uses nearest-neighbor scaling and pads to the exact card size', () => {
        const graph = buildOgFilterGraph(computeOgScale(320, 200));

        assert.match(graph, /flags=neighbor/);
        assert.match(graph, new RegExp(`pad=${OG_IMAGE_WIDTH}:${OG_IMAGE_HEIGHT}`));
        assert.match(graph, /color=black/);
        assert.match(graph, /scale=\d+:\d+/);
    });
});

describe('buildOgFfmpegArgs', () => {
    it('puts the output path last, matching the ffmpeg calling convention', () => {
        const args = buildOgFfmpegArgs('in.png', 'out.png', computeOgScale(320, 200));

        assert.equal(args.at(-1), 'out.png');
        assert.ok(args.includes('in.png'));
        assert.ok(args.includes('-frames:v'));
    });
});

describe('output paths', () => {
    it('names the card and its intermediate distinctly', () => {
        assert.equal(buildOgImagePath('public/social', 'basics'), 'public/social/og-basics.png');
        assert.equal(buildNativeImagePath('public/social', 'basics'), 'public/social/og-basics.native.png');
    });
});

describe('resolveOutDir', () => {
    it('anchors the default to the package, not the caller cwd', () => {
        // Running from the repo root must not create a stray public/social there.
        assert.equal(
            resolveOutDir('', '/somewhere/else', '/repo/packages/demos'),
            '/repo/packages/demos/public/social',
        );
    });

    it('resolves an explicit --out against the caller cwd', () => {
        assert.equal(resolveOutDir('tmp/cards', '/work', '/repo/packages/demos'), '/work/tmp/cards');
    });

    it('leaves an absolute --out alone', () => {
        assert.equal(resolveOutDir('/tmp/cards', '/work', '/repo/packages/demos'), '/tmp/cards');
    });
});

describe('buildCanvasPrepScript', () => {
    it('overrides the engine and stylesheet sizing with !important', () => {
        const script = buildCanvasPrepScript(CANVAS_ID);

        // Regression guard for the single easiest thing to break silently here: without
        // 'important' these lose to applyCanvasLayoutStyles' inline !important, and the
        // screenshot comes back CSS-fit and resampled instead of pixel-exact.
        assert.match(script, /'important'/);
        assert.match(script, /max-width/);
        assert.match(script, /max-height/);
        assert.ok(script.includes(CANVAS_ID));
    });
});

describe('OG_CAPTURE_OVERRIDES', () => {
    it('only names slugs that still exist, so a rename cannot leave a stale entry', () => {
        for (const slug of Object.keys(OG_CAPTURE_OVERRIDES)) {
            assert.ok(DEMO_ORDER.includes(slug), `stale override for "${slug}"`);
        }
    });
});
