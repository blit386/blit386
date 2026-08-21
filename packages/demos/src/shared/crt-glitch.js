/**
 * Shared CRT "TV fault" glitch constants for the five glitch-driven demos.
 *
 * Two glitch-type sets exist here by design, not by accident: the full-color group
 * (crt-pipboy, snake-game, basics-enhanced) includes 'chromasplit', a color-channel
 * split that only reads as a glitch on a color CRT. The Tesla Orava B/W group
 * (sprite-effects, logo-lowres) swaps that for 'vroll', a vertical roll – a fault a
 * black-and-white tube shows instead, since it has no color channels to split. Before
 * this module existed the two groups' overlapping type keys (hshift/noise/flicker/
 * interference) had drifted to different on-screen labels between the two groups –
 * see .claude/rules/named-constants.md for the worked example. GLITCH_LABELS below is
 * the fix: one canonical label per key, covering both groups' full key set.
 *
 * applyGlitchUniforms()/resetGlitchUniforms() are shared ONLY by crt-pipboy.js,
 * snake-game.js, and basics-enhanced.js – their glitch-apply code and tuning constants
 * were verified byte-for-byte identical before this extraction. sprite-effects.js and
 * logo-lowres.js have real behavioral differences from that group and from each other
 * (different tuning constants, logo-lowres's hshift also drives chroma aberration, its
 * flicker scales by peak instead of envelope) and keep their own bespoke apply methods –
 * they only import the type list and labels from here, not the shared functions.
 */

// Glitch state-machine tuning shared by crt-pipboy.js, snake-game.js, and
// basics-enhanced.js. sprite-effects.js and logo-lowres.js use their own, different
// tuning constants and do not import these.
const GLITCH_COOLDOWN_MIN = 120;
const GLITCH_COOLDOWN_MAX = 360;
const GLITCH_ACTIVE_MIN = 5;
const GLITCH_ACTIVE_MAX = 30;
const GLITCH_INTENSITY_MIN = 0.35;
const GLITCH_INTENSITY_MAX = 1.0;

const FLICKER_BASE = 1.0;
const FLICKER_DIP = 0.6;
const ABERRATION_BASE = 0;
const NOISE_BASE = 0.025;

// Pixel-tier glitch band height, identical across the three full-color demos.
const PIXEL_GLITCH_BAND_HEIGHT = 6;

// The five full-color TV faults: horizontal tear, chroma split, snow, brightness
// waver, ghosting. Used by crt-pipboy.js, snake-game.js, basics-enhanced.js.
const GLITCH_TYPES_CHROMA = ['hshift', 'chromasplit', 'noise', 'flicker', 'interference'];

// The five Tesla Orava B/W faults: horizontal tear, snow, brightness waver, ghosting,
// vertical roll (no chroma split – a B/W tube has no color channels). Used by
// sprite-effects.js and logo-lowres.js.
const GLITCH_TYPES_VROLL = ['hshift', 'noise', 'flicker', 'interference', 'vroll'];

// Canonical on-screen label for every glitch key across both groups. Any demo with a
// HUD looks a key up here instead of hand-typing its own label map.
const GLITCH_LABELS = {
    none: 'NONE',
    hshift: 'H-HOLD',
    chromasplit: 'CHROMA',
    noise: 'SNOW',
    flicker: 'DIM',
    interference: 'GHOST',
    vroll: 'V-ROLL',
};

/**
 * Returns every glitch-driven effect uniform to its resting value. Shared by
 * crt-pipboy.js, snake-game.js, and basics-enhanced.js only.
 *
 * @param {object} instance – The demo's `this`. Must already have `.pixelGlitch`,
 *   `.aberration`, `.noise`, `.flicker`, `.interference` effect objects created.
 */
function resetGlitchUniforms(instance) {
    instance.pixelGlitch.intensity = 0;
    instance.aberration.aberration = ABERRATION_BASE;
    instance.noise.amount = NOISE_BASE;
    instance.flicker.amount = FLICKER_BASE;
    instance.interference.amount = 0;
}

/**
 * Layers the chosen glitch personality onto the resting effect uniforms. Shared by
 * crt-pipboy.js, snake-game.js, and basics-enhanced.js only – verified byte-for-byte
 * identical across those three before extraction (same GLITCH_TYPES_CHROMA keys, same
 * tuning constants, same math per branch).
 *
 * @param {object} instance – The demo's `this`. Must have `.glitchType`, `.glitchPeak`,
 *   and the same five effect objects as resetGlitchUniforms().
 * @param {number} envelope – 0 -> 1 -> 0 over the lifetime of the burst.
 */
function applyGlitchUniforms(instance, envelope) {
    const peak = instance.glitchPeak * envelope;

    resetGlitchUniforms(instance);

    if (instance.glitchType === 'hshift') {
        instance.pixelGlitch.intensity = peak;
    } else if (instance.glitchType === 'chromasplit') {
        instance.aberration.aberration = ABERRATION_BASE + peak * 4;
    } else if (instance.glitchType === 'noise') {
        instance.noise.amount = NOISE_BASE + peak * 0.08;
    } else if (instance.glitchType === 'flicker') {
        instance.flicker.amount = FLICKER_BASE - (FLICKER_BASE - FLICKER_DIP) * envelope;
    } else if (instance.glitchType === 'interference') {
        instance.interference.amount = peak * 0.06;
    }
}

export {
    ABERRATION_BASE,
    applyGlitchUniforms,
    FLICKER_BASE,
    FLICKER_DIP,
    GLITCH_ACTIVE_MAX,
    GLITCH_ACTIVE_MIN,
    GLITCH_COOLDOWN_MAX,
    GLITCH_COOLDOWN_MIN,
    GLITCH_INTENSITY_MAX,
    GLITCH_INTENSITY_MIN,
    GLITCH_LABELS,
    GLITCH_TYPES_CHROMA,
    GLITCH_TYPES_VROLL,
    NOISE_BASE,
    PIXEL_GLITCH_BAND_HEIGHT,
    resetGlitchUniforms,
};
