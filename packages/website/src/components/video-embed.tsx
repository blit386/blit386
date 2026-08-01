import styles from './video-embed.module.css';

interface VideoEmbedProps {
    /** Path base for the encoded renditions, without the extension or codec suffix. */
    src: string;

    /** Intrinsic width of the encoded video in pixels. Required: it establishes the aspect box. */
    width: number;

    /** Intrinsic height of the encoded video in pixels. Required: it establishes the aspect box. */
    height: number;

    /** Visible caption, and the text alternative for a clip that carries no audio track. */
    caption: string;

    className?: string;
}

// Both renditions come out of `pnpm run encode:video`, which pins the AV1 sequence level to
// 4.0 and H.264 to High@4.0 – so these codec strings are exact rather than a guess, and a
// browser without AV1 skips the first source without opening a connection to it.
const AV1_TYPE = 'video/mp4; codecs="av01.0.08M.08"';
const H264_TYPE = 'video/mp4; codecs="avc1.640028"';

// CSS cannot stop a video from autoplaying, and a client component would only get to run
// after hydration – by which point the clip is already moving. This runs synchronously as
// soon as the element beside it is connected: during parse on the initial static HTML, and
// on subtree insertion during a Waku client-side route change. If it never runs the clip
// simply autoplays, which is the previous behavior rather than a broken page. `controls` is
// rendered unconditionally, so a pause affordance exists either way (WCAG 2.2.2).
const REDUCED_MOTION_SCRIPT = [
    '(function(){',
    'var s=document.currentScript,v=s&&s.previousElementSibling;',
    "if(!v||v.tagName!=='VIDEO')return;",
    "if(!window.matchMedia||!matchMedia('(prefers-reduced-motion: reduce)').matches)return;",
    "v.autoplay=false;v.removeAttribute('autoplay');v.pause();",
    '})();',
].join('');

/**
 * A self-hosted, audio-free screen capture. AV1 first with an H.264 High fallback, a WebP
 * poster, and intrinsic width/height so the layout box exists before the first byte lands.
 *
 * `src` is the path base written by `scripts/encode-video.mjs`: this appends `.av1.mp4`,
 * `.h264.mp4`, and `.webp`. Keep the two in step – the encode script's test asserts the
 * same suffixes.
 */
export function VideoEmbed({ src, width, height, caption, className }: VideoEmbedProps) {
    return (
        <figure className={`not-prose ${styles.figure} ${className ?? ''}`}>
            {/* No <track>: the clip is a silent screen capture, so the figcaption is its text alternative. */}
            <video
                className={styles.video}
                width={width}
                height={height}
                poster={`${src}.webp`}
                preload="metadata"
                autoPlay
                muted
                loop
                playsInline
                controls
                controlsList="nodownload noplaybackrate"
                disablePictureInPicture
                disableRemotePlayback
            >
                <source src={`${src}.av1.mp4`} type={AV1_TYPE} />
                <source src={`${src}.h264.mp4`} type={H264_TYPE} />
            </video>

            <script>{REDUCED_MOTION_SCRIPT}</script>

            <figcaption className={styles.caption}>{caption}</figcaption>
        </figure>
    );
}
