// @ts-nocheck
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Encode a screen capture into the two renditions `VideoEmbed` expects, plus a poster.
 *
 * Everything here is tuned for flat pixel-art screen capture - large areas of a single
 * color, hard edges, hard cuts - which compresses very differently from camera footage.
 * See the comments on AV1_PARAMS and buildH264Args for what each tuning flag buys.
 *
 * Usage: pnpm run encode:video -- <input> --out <dir> [options]
 */

// #region Configuration

export const DEFAULTS = {
    av1Crf: 28,
    av1Preset: 3,
    h264Crf: 20,
    h264Preset: 'veryslow',
    gopSeconds: 5,
    posterAt: '0',
    posterQuality: 90,
    posterLossy: false,
    keepPng: false,
    dryRun: false,
};

// Suffixes `VideoEmbed` appends to its `src` prop. Changing either means changing
// src/components/video-embed.tsx in the same commit; a test asserts they match.
const AV1_SUFFIX = '.av1.mp4';
const H264_SUFFIX = '.h264.mp4';
const POSTER_SUFFIX = '.webp';

// Crop rather than scale to reach even dimensions: this drops at most one row and one
// column and resamples nothing, which matters enormously for pixel art. Scaling would
// blur every hard edge in the frame.
const VIDEO_FILTER = 'crop=trunc(iw/2)*2:trunc(ih/2)*2';

// Tag the color space explicitly. Untagged captures make Safari and Chrome guess
// differently, and the same clip then renders at visibly different saturation.
const COLOR_FLAGS = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv'];

// One video stream, no audio at all, no subtitle or data streams, and no source metadata
// (macOS screen recordings embed the device and software name).
const STREAM_FLAGS = ['-map', '0:v:0', '-an', '-sn', '-dn', '-map_metadata', '-1'];

/**
 * - `scm=1` forces screen content mode on. This is the single most valuable flag here: it
 *   enables AV1 palette mode and intra block copy, built exactly for large flat color runs.
 *   The adaptive default (`scm=2`) can decide against it on a clip that mixes a game canvas
 *   with an editor pane.
 * - `tune=0` is the subjective/VQ tune. The default PSNR tune spends bits smoothing the
 *   hard edges this content is made of.
 * - `enable-variance-boost=1` protects detail in low-variance regions, i.e. most of a
 *   pixel-art frame, which would otherwise go blotchy at high CRF.
 * - `level=40` pins the sequence level so the `av01.0.08M.08` codec string in VideoEmbed is
 *   exact rather than a guess.
 *
 * Deliberately absent: `scd=1`. SVT-AV1 handles scene changes internally and warns about it.
 */
const AV1_PARAMS = 'tune=0:scm=1:enable-variance-boost=1:level=40';

const NUMERIC_OPTIONS = {
    '--av1-crf': 'av1Crf',
    '--av1-preset': 'av1Preset',
    '--h264-crf': 'h264Crf',
    '--gop-seconds': 'gopSeconds',
    '--poster-quality': 'posterQuality',
    '--fps': 'fps',
};

const STRING_OPTIONS = {
    '--out': 'outDir',
    '--name': 'name',
    '--poster-at': 'posterAt',
    '--h264-preset': 'h264Preset',
};

const BOOLEAN_OPTIONS = {
    '--poster-lossy': 'posterLossy',
    '--keep-png': 'keepPng',
    '--dry-run': 'dryRun',
};

const USAGE = `Usage: pnpm run encode:video -- <input> --out <dir> [options]

  --out <dir>           Output directory (required), e.g. public/media/blog/1-4-0
  --name <base>         Output base name (default: input filename without extension)
  --poster-at <ts>      Poster frame timestamp (default: ${DEFAULTS.posterAt}), e.g. 00:00:03.5
  --fps <n>             Force output frame rate (default: keep the source rate)
  --av1-crf <n>         Default ${DEFAULTS.av1Crf}
  --h264-crf <n>        Default ${DEFAULTS.h264Crf}
  --av1-preset <n>      libsvtav1 preset, default ${DEFAULTS.av1Preset} (use 6 while iterating)
  --h264-preset <s>     x264 preset, default ${DEFAULTS.h264Preset}
  --gop-seconds <n>     Keyframe interval in seconds, default ${DEFAULTS.gopSeconds}
  --poster-lossy        Encode the poster with cwebp -q instead of lossless
  --poster-quality <n>  Lossy poster quality, default ${DEFAULTS.posterQuality}
  --keep-png            Keep the intermediate poster PNG
  --dry-run             Print the commands and exit
`;

// #endregion

// #region Argument parsing

/**
 * The encoder knobs. Declared once here so the test suite, which runs under `checkJs`, sees
 * the full shape rather than inferring it from DEFAULTS alone. The arg builders take only
 * this - they receive their input and output paths as separate arguments.
 *
 * @typedef {object} EncodeSettings
 * @property {string} posterAt Timestamp of the frame to lift as the poster, in any syntax
 *   ffmpeg's `-ss` accepts (`'0'`, `'12.5'`, `'00:00:03.5'`). Pick a frame that reads well
 *   as a still, since it is what a visitor sees before playback starts.
 * @property {number} [fps] Output frame rate. Absent means keep the source rate, which is
 *   almost always right; set it only to halve a 60 fps capture for a smaller file.
 * @property {number} av1Crf AV1 constant-rate factor, 0-63, lower is better quality. 28 is
 *   visually clean on flat content; drop to 24 if monospace text rings, raise to 32 when
 *   size matters more than a crisp editor pane.
 * @property {number} av1Preset libsvtav1 speed preset, 0-13, lower is slower and smaller.
 *   3 is the committed-output setting; use 6-10 while iterating on framing and timing.
 * @property {number} h264Crf x264 constant-rate factor, 0-51, lower is better quality. 20
 *   is near-transparent on flat content; drop to 18 if hard edges ring.
 * @property {string} h264Preset x264 speed preset (`ultrafast` through `placebo`).
 *   `veryslow` is affordable for a one-off clip and buys a few percent.
 * @property {number} gopSeconds Keyframe interval in seconds, converted to a frame count in
 *   `main()` once the frame rate is known. Shorter means faster seeking and a larger file.
 * @property {number} posterQuality cwebp quality, 0-100, used only when `posterLossy` is
 *   set. Ignored for the lossless default.
 * @property {boolean} posterLossy Encode the poster with lossy cwebp instead of lossless.
 *   Lossless is the default because lossy WebP bleeds chroma across every hard edge; switch
 *   this on only when the capture has photographic or gradient regions and the poster is
 *   coming out oversized.
 * @property {boolean} keepPng Keep the intermediate poster PNG. Useful when a frame comes
 *   out wrong and you want to inspect it before re-running.
 * @property {boolean} dryRun Print each command and exit without encoding anything.
 * @property {number} [gop] Keyframe interval in frames. Resolved by `main()` from
 *   `gopSeconds` and the probed frame rate; the arg builders read this, never `gopSeconds`.
 */

/**
 * The knobs plus the paths resolved from argv. This is what `parseArgs` returns and what
 * `main()` threads through the run.
 *
 * @typedef {EncodeSettings & { input: string, outDir: string, name: string }} EncodeOptions
 */

/**
 * Parse argv into an options object. Throws on anything malformed rather than falling back
 * to a default, so a typo cannot silently produce a differently-encoded file. The input
 * array is not mutated.
 *
 * @param {string[]} argv Arguments after the script name, i.e. `process.argv.slice(2)`.
 * @returns {EncodeOptions} The parsed options, with `name` defaulted to the input's basename.
 * @throws {Error} When the input or `--out` is missing, an option lacks its value, a numeric
 *   option is not a number, an option is unrecognized, or a second positional input appears.
 */
export function parseArgs(argv) {
    const options = { ...DEFAULTS };
    let input;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (BOOLEAN_OPTIONS[arg] !== undefined) {
            options[BOOLEAN_OPTIONS[arg]] = true;
            continue;
        }

        if (STRING_OPTIONS[arg] !== undefined || NUMERIC_OPTIONS[arg] !== undefined) {
            const value = argv[index + 1];
            if (value === undefined || value.startsWith('--')) {
                throw new Error(`Missing value for ${arg}`);
            }
            index += 1;

            if (NUMERIC_OPTIONS[arg] !== undefined) {
                const parsed = Number(value);
                if (!Number.isFinite(parsed)) {
                    throw new Error(`Expected a number for ${arg}, got "${value}"`);
                }
                options[NUMERIC_OPTIONS[arg]] = parsed;
            } else {
                options[STRING_OPTIONS[arg]] = value;
            }
            continue;
        }

        if (arg.startsWith('--')) {
            throw new Error(`Unknown option ${arg}`);
        }

        if (input !== undefined) {
            throw new Error(`Unexpected second input "${arg}"`);
        }
        input = arg;
    }

    if (input === undefined) {
        throw new Error('Missing input file.');
    }
    if (options.outDir === undefined) {
        throw new Error('Missing --out directory.');
    }

    return { ...options, input, name: options.name ?? basename(input, extname(input)) };
}

/**
 * Turn an ffprobe `r_frame_rate` fraction into a number, rounded to two decimals so
 * 60000/1001 reads as 59.94.
 *
 * @param {string | undefined} rateString The raw `stream=r_frame_rate` field, a `num/den`
 *   fraction such as `'30/1'` or `'60000/1001'`. A bare numerator is also accepted.
 * @returns {number | undefined} The frame rate, or undefined when the field is missing,
 *   malformed, or works out to a non-positive rate - ffprobe reports `0/0` for streams it
 *   cannot determine. Callers substitute their own fallback.
 */
export function parseFrameRate(rateString) {
    if (typeof rateString !== 'string') return undefined;

    const [numerator, denominator] = rateString.trim().split('/');
    const parsedNumerator = Number(numerator);
    const parsedDenominator = denominator === undefined ? 1 : Number(denominator);

    if (!Number.isFinite(parsedNumerator) || !Number.isFinite(parsedDenominator) || parsedDenominator === 0) {
        return undefined;
    }

    const rate = parsedNumerator / parsedDenominator;
    return rate > 0 ? Math.round(rate * 100) / 100 : undefined;
}

/**
 * Build the four output paths for one base name. The suffixes must match what `VideoEmbed`
 * appends to its `src` prop; a test asserts the two stay in step.
 *
 * @param {string} outDir Directory the renditions are written to, e.g. `public/media/blog/1-4-0`.
 * @param {string} name Base name without extension or codec suffix, e.g. `hot-reload`.
 * @returns {{ av1: string, h264: string, posterPng: string, posterWebp: string }} The AV1 and
 *   H.264 MP4 paths, the intermediate PNG (deleted unless `--keep-png`), and the WebP poster.
 */
export function buildOutputPaths(outDir, name) {
    return {
        av1: join(outDir, `${name}${AV1_SUFFIX}`),
        h264: join(outDir, `${name}${H264_SUFFIX}`),
        posterPng: join(outDir, `${name}.png`),
        posterWebp: join(outDir, `${name}${POSTER_SUFFIX}`),
    };
}

// #endregion

// #region Command construction

/**
 * The `-r` flag pair, or nothing when no frame-rate override was requested. Omitting `-r`
 * entirely is what makes ffmpeg keep the source rate.
 *
 * @param {EncodeSettings} options
 * @returns {string[]} Either `['-r', '<fps>']` or an empty array, ready to spread.
 */
const frameRateFlags = (options) => (options.fps ? ['-r', String(options.fps)] : []);

/**
 * Build the ffmpeg argument list for the AV1 rendition, encoded with libsvtav1. See
 * AV1_PARAMS for why each tuning knob is set the way it is.
 *
 * @param {string} input Source capture path.
 * @param {string} output Destination `.av1.mp4` path.
 * @param {EncodeSettings} options Reads `av1Preset`, `av1Crf`, `gop`, and `fps`.
 * @returns {string[]} Arguments for `ffmpeg`, output path last.
 */
export function buildAv1Args(input, output, options) {
    return [
        '-hide_banner',
        '-y',
        '-i',
        input,
        ...STREAM_FLAGS,
        // macOS screen captures are variable-frame-rate; without this the MP4 timing is
        // wrong and the loop point visibly stutters.
        '-fps_mode',
        'cfr',
        ...frameRateFlags(options),
        '-vf',
        VIDEO_FILTER,
        '-pix_fmt',
        'yuv420p',
        ...COLOR_FLAGS,
        '-c:v',
        'libsvtav1',
        '-preset',
        String(options.av1Preset),
        '-crf',
        String(options.av1Crf),
        '-g',
        String(options.gop),
        '-svtav1-params',
        AV1_PARAMS,
        // Move the moov atom to the front so playback can start on the first range request
        // instead of after the whole file lands.
        '-movflags',
        '+faststart',
        output,
    ];
}

/**
 * H.264 High@4.0 fallback. `-tune animation` is the whole trick: x264's animation tune
 * exists for cel animation - flat color fields with hard edges - which is structurally
 * identical to pixel art. It relaxes deblocking, lowers psy-rd, and raises bframes/ref.
 * Do not stack `-x264-params` on top; that would override the tune with worse numbers.
 *
 * `-profile:v high -level:v 4.0` pins the codec string to exactly `avc1.640028`.
 *
 * @param {string} input Source capture path.
 * @param {string} output Destination `.h264.mp4` path.
 * @param {EncodeSettings} options Reads `h264Preset`, `h264Crf`, `gop`, and `fps`.
 * @returns {string[]} Arguments for `ffmpeg`, output path last.
 */
export function buildH264Args(input, output, options) {
    return [
        '-hide_banner',
        '-y',
        '-i',
        input,
        ...STREAM_FLAGS,
        '-fps_mode',
        'cfr',
        ...frameRateFlags(options),
        '-vf',
        VIDEO_FILTER,
        '-pix_fmt',
        'yuv420p',
        ...COLOR_FLAGS,
        '-c:v',
        'libx264',
        '-profile:v',
        'high',
        '-level:v',
        '4.0',
        '-preset',
        options.h264Preset,
        '-tune',
        'animation',
        '-crf',
        String(options.h264Crf),
        '-g',
        String(options.gop),
        '-keyint_min',
        String(Math.max(1, Math.round(options.gop / 2))),
        '-movflags',
        '+faststart',
        output,
    ];
}

/**
 * Extract the poster frame. `-ss` goes before `-i`, which in ffmpeg 5+ is both fast and
 * frame-accurate. The same crop filter runs so the poster's dimensions match the video's
 * exactly - otherwise the browser stretches it.
 *
 * @param {string} input Source capture path.
 * @param {string} output Destination PNG path, converted to WebP in the next stage.
 * @param {EncodeSettings} options Reads `posterAt`.
 * @returns {string[]} Arguments for `ffmpeg`, output path last.
 */
export function buildPosterFrameArgs(input, output, options) {
    return [
        '-hide_banner',
        '-y',
        '-ss',
        String(options.posterAt),
        '-i',
        input,
        '-map',
        '0:v:0',
        '-frames:v',
        '1',
        // Without `-update` the image2 muxer wants a `%03d` sequence pattern and warns
        // loudly even though it does write the single frame correctly.
        '-update',
        '1',
        '-vf',
        VIDEO_FILTER,
        '-c:v',
        'png',
        '-pix_fmt',
        'rgb24',
        output,
    ];
}

/**
 * The dimensions VIDEO_FILTER will produce. The printed `<VideoEmbed>` snippet has to carry
 * these rather than the source dimensions - an odd-sized capture is cropped, and passing the
 * uncropped numbers as width/height would stretch the video in the browser.
 *
 * @param {number} width Source width in pixels, as probed. May be NaN if the probe failed.
 * @param {number} height Source height in pixels, as probed. May be NaN if the probe failed.
 * @returns {{ width: number | undefined, height: number | undefined }} The even dimensions,
 *   or undefined for either axis whose probe was unusable, so the caller can fall back.
 */
export function croppedDimensions(width, height) {
    /** @param {number} value */
    const even = (value) => (Number.isFinite(value) && value > 0 ? value - (value % 2) : undefined);
    return { width: even(width), height: even(height) };
}

/**
 * Lossless by default: pixel art in a lossy WebP gets chroma bleed on every hard edge, and
 * the poster is the first frame a visitor sees. `-z 9` implies `-lossless -m 6`, so passing
 * those as well makes cwebp warn.
 *
 * @param {string} input Poster PNG produced by `buildPosterFrameArgs`.
 * @param {string} output Destination `.webp` path.
 * @param {EncodeSettings} options Reads `posterLossy` and `posterQuality`.
 * @returns {string[]} Arguments for `cwebp`.
 */
export function buildCwebpArgs(input, output, options) {
    const quality = options.posterLossy
        ? ['-q', String(options.posterQuality), '-m', '6', '-sharp_yuv']
        : ['-z', '9', '-exact'];

    return [...quality, '-metadata', 'none', input, '-o', output];
}

/**
 * Format a byte count for the summary table, scaling to KB or MB.
 *
 * @param {number} bytes Size in bytes. NaN when the file could not be stat'd.
 * @returns {string} A short size string such as `512 B`, `2.0 KB`, or `3.00 MB`; `-` when
 *   the count is unusable.
 */
export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// #endregion

// #region Runner

/**
 * Echo a command and run it, inheriting stdio so ffmpeg's progress reaches the terminal.
 *
 * @param {string} command Executable name, resolved from PATH.
 * @param {string[]} args Arguments from one of the `build*Args` helpers.
 * @param {boolean} dryRun When true, print the command and return without running it.
 * @returns {void}
 * @throws {Error} When the binary is missing or exits non-zero. Encoding stages run in
 *   sequence, so failing loudly here stops a half-finished set of renditions being written.
 */
const run = (command, args, dryRun) => {
    console.log(`\n$ ${command} ${args.join(' ')}\n`);
    if (dryRun) return;

    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.error) {
        throw new Error(`Failed to run ${command}: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`${command} exited with status ${result.status}`);
    }
};

/**
 * Read one field off the source's first video stream.
 *
 * @param {string} input Source capture path.
 * @param {string} field An ffprobe stream key, e.g. `'width'` or `'r_frame_rate'`.
 * @returns {string | undefined} The trimmed value, or undefined when ffprobe is unavailable
 *   or exits non-zero. Callers fall back rather than failing: a missing probe degrades the
 *   printed snippet, it does not invalidate the encode.
 */
const probe = (input, field) => {
    const result = spawnSync(
        'ffprobe',
        ['-v', 'error', '-select_streams', 'v:0', '-show_entries', `stream=${field}`, '-of', 'csv=p=0', input],
        { encoding: 'utf8' },
    );
    return result.status === 0 ? result.stdout.trim() : undefined;
};

/**
 * Size of a written output, for the summary table.
 *
 * @param {string} path Path to stat.
 * @returns {number} Size in bytes, or NaN when the file is missing or unreadable.
 */
const fileSize = (path) => {
    try {
        return statSync(path).size;
    } catch {
        return Number.NaN;
    }
};

/**
 * Parse argv, probe the source, run the three encode stages plus the WebP conversion, then
 * print a size table and a paste-ready `<VideoEmbed>` snippet.
 *
 * @returns {void}
 */
const main = () => {
    let options;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(`${error.message}\n\n${USAGE}`);
        process.exitCode = 1;
        return;
    }

    const fps = options.fps ?? parseFrameRate(probe(options.input, 'r_frame_rate')) ?? 60;
    const { width, height } = croppedDimensions(
        Number(probe(options.input, 'width')),
        Number(probe(options.input, 'height')),
    );
    const resolved = { ...options, gop: Math.max(1, Math.round(fps) * options.gopSeconds) };
    const paths = buildOutputPaths(options.outDir, options.name);

    if (!options.dryRun) {
        mkdirSync(options.outDir, { recursive: true });
    }

    run('ffmpeg', buildAv1Args(options.input, paths.av1, resolved), options.dryRun);
    run('ffmpeg', buildH264Args(options.input, paths.h264, resolved), options.dryRun);
    run('ffmpeg', buildPosterFrameArgs(options.input, paths.posterPng, resolved), options.dryRun);
    run('cwebp', buildCwebpArgs(paths.posterPng, paths.posterWebp, resolved), options.dryRun);

    if (options.dryRun) return;

    if (!options.keepPng) {
        rmSync(paths.posterPng, { force: true });
    }

    console.log('\nEncoded:');
    for (const path of [paths.av1, paths.h264, paths.posterWebp]) {
        console.log(`  ${formatBytes(fileSize(path)).padStart(9)}  ${path}`);
    }

    // The `src` prop is the path base, so strip the leading `public/` and the suffixes.
    const srcBase = `/${options.outDir.replace(/^public\//u, '')}/${options.name}`.replace(/\/{2,}/gu, '/');
    console.log(`\n<VideoEmbed
  src="${srcBase}"
  width={${width ?? 1280}}
  height={${height ?? 720}}
  caption="TODO"
/>\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}

// #endregion
