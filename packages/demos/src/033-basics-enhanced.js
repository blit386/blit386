// @pageTitle Blit-Tech Demo 033 - Basics Enhanced
//
// Demo 033 - Basics Enhanced.
//
// Same bouncing-sprite behavior as demo 001, but every frame is now routed
// through a hand-built CRT stack that mimics the look of an old phosphor
// monitor. If 001 was "the engine works", this demo is "the engine works,
// and here is the kind of finish you can layer on top once you understand
// the post-process pipeline".
//
// The pipeline has two tiers. Both come from the engine's post-process
// system we explored in 023 and 024:
//
//   1. Pixel tier - runs ON the logical index buffer (320x240, palette
//      indices, BEFORE the palette is resolved into RGB). Effects that
//      live here distort the indexed image itself - for example pushing
//      horizontal scanline bands sideways. Only PixelGlitch sits here.
//      We learned about the pixel tier in the CRT toggle demo:
//      https://vancura.dev/articles/blit-tech-basics
//
//   2. Display tier - runs AFTER the palette is resolved and the image is
//      upscaled to the canvas. Effects here work in full-colour RGB and
//      can blur, warp, tint, and bloom the final image. The other ten
//      effects in this demo live here.
//
// Why ten separate display-tier effects instead of one ready-made preset
// (like BT.preset.crtPipBoy used in 024)? Because hand-composing the chain
// makes it possible to drive individual uniforms from a state machine -
// the glitch state machine below picks ONE of five glitch styles, ramps
// it up for a few frames, and ramps it down again. A preset is a sealed
// recipe; a hand-built chain is an instrument.

// #region Imports

import {
    BarrelDistortion,
    Bloom,
    bootstrap,
    BT,
    ChromaticAberration,
    Color32,
    Flicker,
    Interference,
    Noise,
    PixelGlitch,
    RGBMask,
    RollLine,
    Scanlines,
    SpriteSheet,
    Vector2i,
    Vignette,
} from 'blit-tech';

import { createDemoFooter } from './shared/demo-footer.js';

// #endregion

// #region Configuration

const C_BG = 1;
const C_GREEN = 2;
const C_AMBER = 3;
const C_HEADER = 4;

const SPRITE_BASE = 10;
const SPRITE_URL = '/sprites/logo-1.png';
const TARGET_FPS = 30;

// Run the display-tier post-process at a larger output buffer than the
// 320x240 logical screen. The engine still THINKS in 320x240 (sprite
// positions, palette indices), but the CRT effects render into a
// 960x720 canvas. Curvature, scanlines, and bloom all need that extra
// pixel density - otherwise the scanlines would alias and the barrel
// warp would look chunky.
const OUTPUT_W = 960;
const OUTPUT_H = 720;

// The glitch state machine alternates between "cooldown" (nothing
// happening) and "active" (one glitch type ramping up and down).
// COOLDOWN_MIN/MAX = how many ticks of calm between glitches.
// ACTIVE_MIN/MAX = how many ticks a single glitch lasts.
// All values are tick counts at 30 FPS (see TARGET_FPS), so 120 ticks
// = 4 seconds.
const GLITCH_COOLDOWN_MIN = 120;
const GLITCH_COOLDOWN_MAX = 360;
const GLITCH_ACTIVE_MIN = 5;
const GLITCH_ACTIVE_MAX = 30;

// Each glitch is one of five distinct CRT failure modes:
//   hshift       - horizontal scanline bands slip sideways (pixel tier)
//   chromasplit  - red/green/blue channels separate (chromatic aberration)
//   noise        - extra static layered over the image
//   flicker      - whole image dims briefly, like a power dip
//   interference - shimmering analog-signal wave across the image
// One is picked at random each time the cooldown expires.
const GLITCH_TYPES = ['hshift', 'chromasplit', 'noise', 'flicker', 'interference'];
const GLITCH_INTENSITY_MIN = 0.35;
const GLITCH_INTENSITY_MAX = 1.0;

// "Base" values are the calm-state uniform values - what the effect looks
// like when no glitch is active. The glitch state machine perturbs these
// upward toward a peak, then eases them back to base.
const FLICKER_BASE = 1.0;
const FLICKER_DIP = 0.6;
const ABERRATION_BASE = 0;
const NOISE_BASE = 0.025;

const GLITCH_LABELS = {
    none: 'NONE',
    hshift: 'H-SHIFT',
    chromasplit: 'CHROMA',
    noise: 'NOISE',
    flicker: 'FLICKER',
    interference: 'INTERFERENCE',
};

// #endregion

// #region Type Definitions

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #endregion

// #region Helper Functions

// Pick a whole number from min (inclusive) to max (exclusive). Used for
// tick counts (cooldown length, glitch duration).
/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min));
}

// Pick a real number from min (inclusive) to max (exclusive). Used for
// glitch intensity peaks.
/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randFloat(min, max) {
    return min + Math.random() * (max - min);
}

// Pick a random element from an array. Used to choose which of the five
// glitch types fires next.
/**
 * @template T
 * @param {readonly T[]} arr
 * @returns {T}
 */
function randPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// #endregion

const footer = createDemoFooter({ leftColor: C_GREEN, rightColor: C_HEADER });

// #region Main Logic

/**
 * @implements {IBlitTechDemo}
 */
class Demo {
    pos = new Vector2i(160, 120);
    speed = new Vector2i(1, 1);
    size = new Vector2i(16, 16);
    bounces = 0;

    palette = null;
    spriteSheet = null;
    spriteRect = null;

    // Pixel tier (logical index buffer).
    pixelGlitch = null;

    // Display tier (resolved/upscaled RGBA output).
    barrel = null;
    aberration = null;
    interference = null;
    rollLine = null;
    scanlines = null;
    mask = null;
    vignette = null;
    noise = null;
    flicker = null;
    bloom = null;

    // Glitch state machine.
    glitchCooldown = 0;
    glitchActive = 0;
    glitchDuration = 0;
    glitchType = 'none';
    glitchPeak = 0;

    configure() {
        // Keep the logical drawing surface at the classic 320x240 - sprite
        // coordinates and palette work exactly like in 001. The CRT chain
        // composes onto a 960x720 canvas (three times bigger each way),
        // and the engine upscales the indexed buffer into that canvas
        // before the display-tier effects run. 'nearest' upscaling keeps
        // the original pixels crisp and chunky before curvature and
        // scanlines soften them.
        return {
            displaySize: new Vector2i(320, 240),
            canvasDisplaySize: new Vector2i(OUTPUT_W, OUTPUT_H),
            maxCanvasDisplaySize: new Vector2i(320 * 4, 240 * 4),
            outputUpscaleFilter: 'nearest',
            targetFPS: TARGET_FPS,
            detectDroppedFrames: true,
        };
    }

    async init() {
        // The first block is identical to demo 001 - build a palette,
        // load the sprite with its colors indexed against that palette,
        // and center the sprite on screen. Everything below is what makes
        // 033 different from 001.
        this.palette = BT.paletteCreate(256);
        this.palette.applyHUD();
        this.palette.set(C_BG, new Color32(16, 28, 16));
        this.palette.set(C_GREEN, new Color32(80, 200, 110));
        this.palette.set(C_AMBER, new Color32(220, 180, 60));
        this.palette.set(C_HEADER, new Color32(160, 230, 170));

        await SpriteSheet.loadColorsIntoPalette(SPRITE_URL, this.palette, SPRITE_BASE);
        const indexed = await SpriteSheet.loadIndexed(SPRITE_URL, this.palette, SPRITE_BASE, { sort: 'none' });
        this.spriteSheet = indexed.sheet;
        this.spriteRect = indexed.srcRect;

        BT.paletteSet(this.palette);

        this.size = new Vector2i(this.spriteSheet.size.x, this.spriteSheet.size.y);
        this.pos = new Vector2i(
            Math.floor(BT.displaySize.x / 2 - this.size.x / 2),
            Math.floor(BT.displaySize.y / 2 - this.size.y / 2),
        );

        // Pixel-tier pass. PixelGlitch runs on the 320x240 indexed buffer
        // BEFORE the palette is resolved, so it can shove whole bands of
        // palette indices sideways - the result looks like analog
        // horizontal sync drift. bandHeight = 6 means each torn band is
        // six pixels tall. intensity starts at 0 (no glitch); the state
        // machine in update() drives it up and down.
        this.pixelGlitch = new PixelGlitch();
        this.pixelGlitch.bandHeight = 6;
        this.pixelGlitch.intensity = 0;
        BT.effectAdd(this.pixelGlitch);

        // Display-tier CRT chain. The order matters: each effect reads the
        // RGB output of the previous one, so the chain follows the same
        // physical order light goes through a real tube:
        //   1. BarrelDistortion - bend the image like a curved glass screen
        //   2. ChromaticAberration - separate R/G/B channels at the edges
        //   3. Interference - shimmering analog signal noise
        //   4. RollLine - a slow horizontal "rolling" bar
        //   5. Scanlines - the dark horizontal lines of a CRT
        //   6. RGBMask - the phosphor dot/stripe pattern
        //   7. Vignette - darken the corners
        //   8. Noise - fine grain over everything
        //   9. Flicker - global brightness wobble
        //  10. Bloom - bright pixels bleed light into their neighbors
        // This is the same composition as the preset in demo 024, but
        // built from individual effects so we can poke at them later.
        this.barrel = new BarrelDistortion();
        this.barrel.curvature = 0.05;

        this.aberration = new ChromaticAberration();
        this.aberration.aberration = ABERRATION_BASE;

        this.interference = new Interference();
        this.interference.amount = 0;

        this.rollLine = new RollLine();
        this.rollLine.amount = 0.1;
        this.rollLine.speed = 1.0;

        this.scanlines = new Scanlines();
        this.scanlines.amount = 0.55;
        this.scanlines.strength = -8;
        this.scanlines.density = 240;

        this.mask = new RGBMask();
        this.mask.intensity = 0.18;
        this.mask.size = 6;
        this.mask.border = 0.5;

        this.vignette = new Vignette();
        this.vignette.amount = 0.35;

        this.noise = new Noise();
        this.noise.amount = NOISE_BASE;

        this.flicker = new Flicker();
        this.flicker.amount = FLICKER_BASE;

        this.bloom = new Bloom();
        this.bloom.spread = 3.0;
        this.bloom.glow = 0.18;

        // Register the display-tier effects in order. BT.effectAdd
        // appends to the chain, so the array order above IS the render
        // order. Reordering this list changes the look.
        for (const fx of [
            this.barrel,
            this.aberration,
            this.interference,
            this.rollLine,
            this.scanlines,
            this.mask,
            this.vignette,
            this.noise,
            this.flicker,
            this.bloom,
        ]) {
            BT.effectAdd(fx);
        }

        // Prime the glitch state machine. It starts in cooldown - calm
        // image for a random number of ticks - then picks a glitch type
        // and fires.
        this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
        this.glitchActive = 0;
        this.glitchDuration = 0;
        this.glitchType = 'none';
        this.glitchPeak = 0;

        return true;
    }

    update() {
        // Sprite motion is identical to demo 001 - move by speed, flip
        // direction when we hit a screen edge.
        this.pos = this.pos.add(this.speed);

        if (this.pos.x <= 0 || this.pos.x >= BT.displaySize.x - this.size.x) {
            this.speed.x = -this.speed.x;
            this.bounces++;
        }

        if (this.pos.y <= 0 || this.pos.y >= BT.displaySize.y - this.size.y) {
            this.speed.y = -this.speed.y;
            this.bounces++;
        }

        // Some display-tier effects need to know how much time has passed
        // so they can shimmer over time. The engine exposes this as
        // BT.timeSeconds (a real-number count of seconds since startup).
        // We push it into each effect's "time" uniform every frame.
        const seconds = BT.timeSeconds;
        this.rollLine.time = seconds;
        this.noise.time = seconds;
        this.interference.time = seconds;

        // Glitch state machine. Two states:
        //
        //   ACTIVE  - a glitch is currently happening. glitchActive
        //             counts DOWN from glitchDuration to 0. We compute
        //             a normalized progress "t" from 0 (just started) to
        //             1 (about to finish), shape it with a sine envelope
        //             so the effect ramps smoothly from 0 -> peak -> 0,
        //             and write that into the relevant effect's uniform.
        //             When the counter hits zero we reset uniforms and
        //             move back to cooldown.
        //
        //   COOLDOWN - calm image. glitchCooldown counts down each tick.
        //             When it reaches zero, we pick a new glitch type,
        //             roll a random duration and peak intensity, and
        //             switch into the active state.
        if (this.glitchActive > 0) {
            // t goes from 0 at the START of the glitch to 1 at the END.
            // (We invert glitchActive/glitchDuration because glitchActive
            // counts DOWN, so 1 - that ratio counts UP.)
            const t = 1 - (this.glitchActive - 1) / this.glitchDuration;
            // Math.sin(t * Math.PI) is a one-shot bell curve: 0 at t=0,
            // 1 at t=0.5 (the middle), 0 again at t=1. Multiplying any
            // uniform by this envelope makes it ramp in and out smoothly,
            // never popping on or off.
            const envelope = Math.sin(t * Math.PI);
            this.applyGlitchUniforms(envelope);

            this.glitchActive--;
            if (this.glitchActive <= 0) {
                this.resetGlitchUniforms();
                this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
            }
            return;
        }

        this.glitchCooldown--;
        if (this.glitchCooldown <= 0) {
            // Cooldown is over - schedule the next glitch. Pick one of the
            // five types, choose how long it lasts and how strong it gets,
            // and re-seed the pixel-tier glitch so the torn bands shift to
            // a new pattern.
            this.glitchType = randPick(GLITCH_TYPES);
            this.glitchDuration = randInt(GLITCH_ACTIVE_MIN, GLITCH_ACTIVE_MAX);
            this.glitchActive = this.glitchDuration;
            this.glitchPeak = randFloat(GLITCH_INTENSITY_MIN, GLITCH_INTENSITY_MAX);
            this.pixelGlitch.seed = Math.random() * 1000;
        }
    }

    // Apply the current glitch envelope to exactly ONE effect uniform,
    // depending on which glitch type the state machine picked. "Uniforms"
    // are the parameters a post-process effect reads each frame - think
    // of them as the knobs on the front of an effect pedal. We turn one
    // knob up, leave the others alone.
    //
    // We reset first, then write the chosen uniform, so switching glitch
    // types in mid-flight never leaves a stale value behind.
    /**
     * @param {number} envelope
     */
    applyGlitchUniforms(envelope) {
        const peak = this.glitchPeak * envelope;
        this.resetGlitchUniforms();

        if (this.glitchType === 'hshift') {
            // Pixel-tier horizontal band shift.
            this.pixelGlitch.intensity = peak;
        } else if (this.glitchType === 'chromasplit') {
            // R/G/B channel separation. peak * 4 pushes the aberration
            // well past its calm value (which is 0).
            this.aberration.aberration = ABERRATION_BASE + peak * 4;
        } else if (this.glitchType === 'noise') {
            // Add up to 0.08 on top of the resting noise amount.
            this.noise.amount = NOISE_BASE + peak * 0.08;
        } else if (this.glitchType === 'flicker') {
            // Flicker is the only effect that goes DOWN from its base:
            // a power dip darkens the image, so we subtract instead of
            // adding.
            this.flicker.amount = FLICKER_BASE - (FLICKER_BASE - FLICKER_DIP) * envelope;
        } else if (this.glitchType === 'interference') {
            // Subtle analog shimmer. 0.06 is the maximum visible amount
            // before the image becomes unreadable.
            this.interference.amount = peak * 0.06;
        }
    }

    // Restore every glitch-driven uniform to its calm baseline. Called
    // before applying a new glitch frame (so we never stack values) and
    // once when a glitch finishes (so the image looks pristine again).
    resetGlitchUniforms() {
        this.pixelGlitch.intensity = 0;
        this.aberration.aberration = ABERRATION_BASE;
        this.noise.amount = NOISE_BASE;
        this.flicker.amount = FLICKER_BASE;
        this.interference.amount = 0;
    }

    render() {
        BT.clear(C_BG);
        BT.drawSprite(this.spriteSheet, this.spriteRect, this.pos, 0);

        BT.systemPrint(new Vector2i(3, 0), C_HEADER, '033 BASICS ENHANCED');
        BT.systemPrint(new Vector2i(3, 14), C_GREEN, 'CRT STACK: ON');
        BT.systemPrint(new Vector2i(3, 28), C_GREEN, `POS: ${this.pos.x},${this.pos.y}`);
        BT.systemPrint(new Vector2i(3, 56), C_GREEN, `BOUNCES: ${this.bounces}`);

        const glitchLabel = GLITCH_LABELS[this.glitchType] ?? 'NONE';
        const glitchValue = this.glitchActive > 0 ? Math.round(this.glitchPeak * 100) : 0;
        BT.systemPrint(
            new Vector2i(3, BT.displaySize.y - 27),
            C_AMBER,
            `GLITCH: ${glitchLabel} ${String(glitchValue).padStart(2, '0')}%`,
        );

        footer.draw();
    }
}

// #endregion

// #region Exports

bootstrap(Demo);

// #endregion
