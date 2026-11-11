/**
 * Shared CRT "TV fault" glitch constants for the five glitch-driven demos.
 *
 * Two glitch-type sets exist here by design, not by accident: the full-color group
 * (crt-pipboy, snake-game, basics-enhanced) includes 'chromasplit', a color-channel
 * split that only reads as a glitch on a color CRT. The Tesla Orava B/W group
 * (sprite-effects, logo-lowres) swaps that for 'vroll', a vertical roll - a fault a
 * black-and-white tube shows instead, since it has no color channels to split. Before
 * this module existed the two groups' overlapping type keys (hshift/noise/flicker/
 * interference) had drifted to different on-screen labels between the two groups -
 * see .claude/rules/named-constants.md for the worked example. GLITCH_LABELS below is
 * the fix: one canonical label per key, covering both groups' full key set.
 *
 * applyGlitchUniforms()/resetGlitchUniforms() are shared ONLY by crt-pipboy.js,
 * snake-game.js, and basics-enhanced.js - their glitch-apply code and tuning constants
 * were verified byte-for-byte identical before this extraction. sprite-effects.js and
 * logo-lowres.js have real behavioral differences from that group and from each other
 * (different tuning constants, logo-lowres's hshift also drives chroma aberration, its
 * flicker scales by peak instead of envelope) and keep their own bespoke apply methods -
 * they only import the type list and labels from here, not the shared functions.
 *
 * isMotionEffect() is shared by every CRT demo that honors BT.isReducedMotionPreferred,
 * and applyCrtChain() is the remove-then-re-add rebuild those demos run when the
 * preference changes. stepGlitchMachine() is the burst state machine of the full-color
 * group, and createPipboyChain() builds the PipBoy CRT stack for demos that reuse that
 * look (snake-game.js).
 */

import {
    BarrelDistortion,
    Bloom,
    BT,
    ChromaticAberration,
    Flicker,
    Interference,
    Noise,
    PixelGlitch,
    RGBMask,
    RollLine,
    Scanlines,
    Vignette,
} from 'blit386';

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

// Every glitch key, once. Demos compare `this.glitchType` against these instead of
// re-typing the strings, and both type lists below are built from them. NONE is the idle
// value between bursts; it is in neither list, so a burst never picks it.
const GLITCH_TYPE = Object.freeze({
    NONE: 'none',
    HSHIFT: 'hshift',
    CHROMASPLIT: 'chromasplit',
    NOISE: 'noise',
    FLICKER: 'flicker',
    INTERFERENCE: 'interference',
    VROLL: 'vroll',
});

// The five full-color TV faults: horizontal tear, chroma split, snow, brightness
// waver, ghosting. Used by crt-pipboy.js, snake-game.js, basics-enhanced.js.
const GLITCH_TYPES_CHROMA = [
    GLITCH_TYPE.HSHIFT,
    GLITCH_TYPE.CHROMASPLIT,
    GLITCH_TYPE.NOISE,
    GLITCH_TYPE.FLICKER,
    GLITCH_TYPE.INTERFERENCE,
];

// The five Tesla Orava B/W faults: horizontal tear, snow, brightness waver, ghosting,
// vertical roll (no chroma split - a B/W tube has no color channels). Used by
// sprite-effects.js and logo-lowres.js.
const GLITCH_TYPES_VROLL = [
    GLITCH_TYPE.HSHIFT,
    GLITCH_TYPE.NOISE,
    GLITCH_TYPE.FLICKER,
    GLITCH_TYPE.INTERFERENCE,
    GLITCH_TYPE.VROLL,
];

// Canonical on-screen label for every glitch key across both groups. Any demo with a
// HUD looks a key up here instead of hand-typing its own label map.
const GLITCH_LABELS = {
    [GLITCH_TYPE.NONE]: 'NONE',
    [GLITCH_TYPE.HSHIFT]: 'H-HOLD',
    [GLITCH_TYPE.CHROMASPLIT]: 'CHROMA',
    [GLITCH_TYPE.NOISE]: 'SNOW',
    [GLITCH_TYPE.FLICKER]: 'DIM',
    [GLITCH_TYPE.INTERFERENCE]: 'GHOST',
    [GLITCH_TYPE.VROLL]: 'V-ROLL',
};

/**
 * Returns every glitch-driven effect uniform to its resting value. Shared by
 * crt-pipboy.js, snake-game.js, and basics-enhanced.js only.
 *
 * @param {object} instance - The demo's `this`. Must already have `.pixelGlitch`,
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
 * crt-pipboy.js, snake-game.js, and basics-enhanced.js only - verified byte-for-byte
 * identical across those three before extraction (same GLITCH_TYPES_CHROMA keys, same
 * tuning constants, same math per branch).
 *
 * @param {object} instance - The demo's `this`. Must have `.glitchType`, `.glitchPeak`,
 *   and the same five effect objects as resetGlitchUniforms().
 * @param {number} envelope - 0 -> 1 -> 0 over the lifetime of the burst.
 */
function applyGlitchUniforms(instance, envelope) {
    const peak = instance.glitchPeak * envelope;

    resetGlitchUniforms(instance);

    if (instance.glitchType === GLITCH_TYPE.HSHIFT) {
        instance.pixelGlitch.intensity = peak;
    } else if (instance.glitchType === GLITCH_TYPE.CHROMASPLIT) {
        instance.aberration.aberration = ABERRATION_BASE + peak * 4;
    } else if (instance.glitchType === GLITCH_TYPE.NOISE) {
        instance.noise.amount = NOISE_BASE + peak * 0.08;
    } else if (instance.glitchType === GLITCH_TYPE.FLICKER) {
        instance.flicker.amount = FLICKER_BASE - (FLICKER_BASE - FLICKER_DIP) * envelope;
    } else if (instance.glitchType === GLITCH_TYPE.INTERFERENCE) {
        instance.interference.amount = peak * 0.06;
    }
}

/**
 * Is this one of the CRT effects that moves or blinks on its own - grain that changes
 * every frame, a brightness flicker, a band rolling down the screen, or rows jittering
 * sideways? CRT demos leave these out of the chain while the player prefers reduced
 * motion (raycasting.js skips Noise and RollLine the same way).
 *
 * @param {object} fx - A post-process effect instance.
 * @returns {boolean}
 */
function isMotionEffect(fx) {
    return fx instanceof Flicker || fx instanceof Interference || fx instanceof Noise || fx instanceof RollLine;
}

/**
 * Takes every effect in `effects` off the post-process chain, then puts them back in the
 * same order - skipping the moving ones (isMotionEffect()) while the player prefers
 * reduced motion. Removing an effect that is not on the chain does nothing, so this also
 * builds the chain the first time. Call it again from onReducedMotionChange().
 *
 * @param {object[]} effects - Post-process effects in chain order.
 */
function applyCrtChain(effects) {
    for (const fx of effects) {
        BT.effectRemove(fx);
    }

    for (const fx of effects) {
        if (BT.isReducedMotionPreferred && isMotionEffect(fx)) {
            continue;
        }

        BT.effectAdd(fx);
    }
}

/**
 * Advances the glitch state machine of crt-pipboy.js, snake-game.js, and
 * basics-enhanced.js by one tick. Either a burst is running (shape it with a 0 -> 1 -> 0
 * envelope and drive the uniforms) or the screen is calm (count the cooldown down and
 * roll a fresh burst at zero).
 *
 * @param {object} instance - The demo's `this`: the five effects resetGlitchUniforms()
 *   needs, plus `.glitchCooldown`, `.glitchTicksLeft`, `.glitchDuration`, `.glitchType`,
 *   and `.glitchPeak`.
 * @returns {boolean} True on the tick a new burst starts, so a demo can tag it.
 */
function stepGlitchMachine(instance) {
    if (instance.glitchTicksLeft > 0) {
        // t runs from 0 at the start of the burst to 1 at its end; sin over 0..PI turns
        // that into a hump that rises, peaks in the middle, and falls back to zero.
        const t = 1 - instance.glitchTicksLeft / instance.glitchDuration;

        applyGlitchUniforms(instance, Math.sin(t * Math.PI));
        instance.glitchTicksLeft--;

        // The burst just ended: calm the uniforms and roll the wait for the next one.
        if (instance.glitchTicksLeft === 0) {
            resetGlitchUniforms(instance);
            instance.glitchCooldown = BT.random.int(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
        }

        return false;
    }

    instance.glitchCooldown--;

    if (instance.glitchCooldown > 0) {
        return false;
    }

    // Roll a new burst: pick() returns one item of the list, int() a whole number in
    // [min, max), float() a decimal in [min, max). The new seed gives the pixel glitch a
    // fresh band-noise pattern.
    instance.glitchType = BT.random.pick(GLITCH_TYPES_CHROMA);
    instance.glitchDuration = BT.random.int(GLITCH_ACTIVE_MIN, GLITCH_ACTIVE_MAX);
    instance.glitchTicksLeft = instance.glitchDuration;
    instance.glitchPeak = BT.random.float(GLITCH_INTENSITY_MIN, GLITCH_INTENSITY_MAX);
    instance.pixelGlitch.seed = BT.random.float(0, 1000);

    return true;
}

/**
 * Builds the PipBoy CRT stack and stores each effect on `instance` under the names the
 * glitch functions above expect. Manual-sync hazard: crt-pipboy.js wires the same stack
 * by hand on purpose (its lesson is every parameter in view), and basics-enhanced.js has
 * a copy too. Change the tuning in all three together. Registers nothing: the caller adds `instance.pixelGlitch` with
 * BT.effectAdd() and passes the returned display list to applyCrtChain().
 *
 * @param {object} instance - The demo's `this`.
 * @param {number} curvature - Barrel distortion strength; crt-pipboy.js uses 0.05.
 * @param {number} rows - Logical display height, so each pixel row gets one scanline.
 * @returns {object[]} The display-tier effects in chain order.
 */
function createPipboyChain(instance, curvature, rows) {
    // Pixel tier: PixelGlitch reads and writes the logical index buffer, so band shifts
    // stay palette-native. If the same shift ran after resolve + upscale, each band would
    // span several output pixels and lose the chunky retro look. bandHeight is the height
    // of each band in source pixels; intensity 0 means no glitch until a burst.
    instance.pixelGlitch = new PixelGlitch();
    instance.pixelGlitch.bandHeight = PIXEL_GLITCH_BAND_HEIGHT;
    instance.pixelGlitch.intensity = 0;

    // Display tier. Order matters: barrel first (it warps the UVs the rest of the chain
    // inherits), then color and signal artifacts, then scanlines and mask, then
    // vignette, noise, and flicker, and finally bloom on top of the modulated image.

    // Barrel distortion: the curved glass of a CRT tube. It runs after palette resolve +
    // upscale, so the curve is computed at output resolution and lines stay smooth.
    instance.barrel = new BarrelDistortion();
    instance.barrel.curvature = curvature;

    // Chromatic aberration: shifts the red and blue channels sideways. Calm at rest; the
    // GLITCH_TYPE.CHROMASPLIT burst spikes it.
    instance.aberration = new ChromaticAberration();
    instance.aberration.aberration = ABERRATION_BASE;

    // Interference: per-row horizontal jitter, like analog signal noise. 0 at rest; the
    // GLITCH_TYPE.INTERFERENCE burst spikes it.
    instance.interference = new Interference();
    instance.interference.amount = 0;

    // Roll line: a bright band slowly scrolling down, like a TV not quite in sync.
    instance.rollLine = new RollLine();
    instance.rollLine.amount = 0.1; // strength of the bright band
    instance.rollLine.speed = 1.0; // how fast it scrolls

    // Scanlines: bright and dark horizontal bands. A density of one cycle per logical
    // row lines them up with the pixel art instead of the denser output rows.
    instance.scanlines = new Scanlines();
    instance.scanlines.amount = 0.55; // mix factor: 0 disables, 1 full effect
    instance.scanlines.strength = -8; // sharper bands at more negative values
    instance.scanlines.density = rows;

    // RGB shadow mask: R/G/B vertical stripes with darkened cell borders, like the
    // phosphor grille of an aperture-grille CRT.
    instance.mask = new RGBMask();
    instance.mask.intensity = 0.18; // 0 hides the mask, 1 = max influence
    instance.mask.size = 6; // mask cell pitch in source pixels
    instance.mask.border = 0.5; // border darkening within each cell

    // Vignette: darker edges to sell the curved-glass illusion.
    instance.vignette = new Vignette();
    instance.vignette.amount = 0.35;

    // Noise: subtle film grain that changes every frame.
    instance.noise = new Noise();
    instance.noise.amount = NOISE_BASE;

    // Flicker: a brightness multiplier the glitch machine dips (1.0 means no change).
    instance.flicker = new Flicker();
    instance.flicker.amount = FLICKER_BASE;

    // Bloom: a soft glow on bright pixels, the phosphor halo of an old monitor. Last, so
    // it sees the final image.
    instance.bloom = new Bloom();
    instance.bloom.spread = 3.0; // size of the bloom kernel
    instance.bloom.glow = 0.18; // mix factor onto the original pixel

    return [
        instance.barrel,
        instance.aberration,
        instance.interference,
        instance.rollLine,
        instance.scanlines,
        instance.mask,
        instance.vignette,
        instance.noise,
        instance.flicker,
        instance.bloom,
    ];
}

export {
    ABERRATION_BASE,
    applyCrtChain,
    applyGlitchUniforms,
    createPipboyChain,
    FLICKER_BASE,
    FLICKER_DIP,
    GLITCH_ACTIVE_MAX,
    GLITCH_ACTIVE_MIN,
    GLITCH_COOLDOWN_MAX,
    GLITCH_COOLDOWN_MIN,
    GLITCH_INTENSITY_MAX,
    GLITCH_INTENSITY_MIN,
    GLITCH_LABELS,
    GLITCH_TYPE,
    GLITCH_TYPES_CHROMA,
    GLITCH_TYPES_VROLL,
    isMotionEffect,
    NOISE_BASE,
    PIXEL_GLITCH_BAND_HEIGHT,
    resetGlitchUniforms,
    stepGlitchMachine,
};
