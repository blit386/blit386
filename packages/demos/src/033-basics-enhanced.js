/**
 * Demo 033 - Basics Enhanced.
 *
 * Same bouncing-sprite behavior as demo 001 (https://blit-tech-demos.vancura.dev/001-basics),
 * with the same PipBoy palette and overlay rows for position and bounces. Every
 * frame is also routed through a hand-built CRT stack on WebGPU. If 001 was "the engine
 * works", this demo is "the engine works, and here is the kind of finish you can layer
 * on top once you understand the post-process pipeline".
 *
 * Prerequisites: 001-Basics (https://blit-tech-demos.vancura.dev/001-basics),
 * 023-PipBoy-CRT (https://blit-tech-demos.vancura.dev/023-crt-pipboy),
 * 024-CRT-Toggle (https://blit-tech-demos.vancura.dev/024-crt-toggle).
 *
 * The pipeline has two tiers. Both come from the engine's post-process system we
 * explored in 023 and 024:
 *
 *   1. Pixel tier - runs ON the logical index buffer (320x240, palette indices, BEFORE
 *      the palette is resolved into RGB). Effects here distort the indexed image itself.
 *      Only PixelGlitch sits here. See:
 *      https://vancura.dev/articles/blit-tech-crt-toggle
 *
 *   2. Display tier - runs AFTER the palette is resolved and the image is upscaled to
 *      the canvas. Effects here work in full-colour RGB and can blur, warp, tint, and
 *      bloom the final image. The other ten effects in this demo live here.
 *
 * Why ten separate display-tier effects instead of one ready-made preset (like
 * BT.preset.crtPipBoy used in 024)? Because hand-composing the chain makes it possible
 * to drive individual uniforms from a state machine - the glitch state machine below
 * picks ONE of five glitch styles, ramps it up for a few frames, and ramps it down again.
 *
 * SOFTWARE FALLBACK: when the engine uses the software renderer, the bouncing sprite
 * demo still runs but the CRT stack is not registered. Overlay rows explain the reduced mode.
 *
 * Live version: https://blit-tech-demos.vancura.dev/033-basics-enhanced
 */

// @pageTitle Blit-Tech Demo 033 - Basics Enhanced

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

import { isAvailable, SOFTWARE_FALLBACK_NOTE } from './shared/post-process-backend.js';

// Palette slots match demo 001 (Basics) so the two demos feel like the same scene.
const C_BG = 1; // Almost-black with a faint green tint.
const C_OVERLAY_BAR = 2; // Bar behind overlay custom rows.
const C_OVERLAY_GREEN = 3; // PipBoy green (position, CRT status).
const C_OVERLAY_AMBER = 4; // Amber accent (bounces, glitch readout).
const C_OVERLAY_ERROR = 5; // Red tint reserved for future timing-chart error markers.

const SPRITE_BASE = 10;
const SPRITE_URL = '/sprites/logo-1.png';
const TARGET_FPS = 30;

// Run the display-tier post-process at a larger output buffer than the logical screen.
const OUTPUT_W = 960;
const OUTPUT_H = 720;

const GLITCH_COOLDOWN_MIN = 120;
const GLITCH_COOLDOWN_MAX = 360;
const GLITCH_ACTIVE_MIN = 5;
const GLITCH_ACTIVE_MAX = 30;

const GLITCH_TYPES = ['hshift', 'chromasplit', 'noise', 'flicker', 'interference'];
const GLITCH_INTENSITY_MIN = 0.35;
const GLITCH_INTENSITY_MAX = 1.0;

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

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

/** @typedef {import('blit-tech').HardwareSettings} HardwareSettings */
/** @typedef {import('blit-tech').Palette} Palette */
/** @typedef {import('blit-tech').SpriteSheet} SpriteSheet */
/** @typedef {import('blit-tech').Rect2i} Rect2i */
/** @typedef {import('blit-tech').PixelGlitch} PixelGlitch */
/** @typedef {import('blit-tech').BarrelDistortion} BarrelDistortion */
/** @typedef {import('blit-tech').ChromaticAberration} ChromaticAberration */
/** @typedef {import('blit-tech').Interference} Interference */
/** @typedef {import('blit-tech').RollLine} RollLine */
/** @typedef {import('blit-tech').Scanlines} Scanlines */
/** @typedef {import('blit-tech').RGBMask} RGBMask */
/** @typedef {import('blit-tech').Vignette} Vignette */
/** @typedef {import('blit-tech').Noise} Noise */
/** @typedef {import('blit-tech').Flicker} Flicker */
/** @typedef {import('blit-tech').Bloom} Bloom */

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min));
}

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randFloat(min, max) {
    return min + Math.random() * (max - min);
}

/**
 * @template T
 * @param {readonly T[]} arr
 * @returns {T}
 */
function randPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Demo 001 plus a hand-built CRT post-process chain and periodic glitch bursts.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // --- Bouncing sprite (same roles as demo 001) ---

    // Top-left corner of the logo on screen (whole pixels only).
    pos = new Vector2i(160, 120);

    // How many pixels the logo moves each update() tick (x and y separately).
    speed = new Vector2i(1, 1);

    // Logo width and height in pixels; filled from the loaded PNG in init().
    size = new Vector2i(16, 16);

    // Counts wall hits so overlayRows() can show a running total.
    bounces = 0;

    // Numbered paint cans for every draw call; built in init().
    /** @type {Palette | null} */
    palette = null;

    // Loaded indexed sprite sheet (GPU texture + palette mapping).
    /** @type {SpriteSheet | null} */
    spriteSheet = null;

    // Which rectangle inside the PNG to draw (full image for our logo).
    /** @type {Rect2i | null} */
    spriteRect = null;

    // --- Post-process effect handles (WebGPU only) ---

    // Pixel-tier glitch: shifts horizontal bands in the index buffer before palette resolve.
    /** @type {PixelGlitch | null} */
    pixelGlitch = null;

    // Display-tier CRT stack (runs on upscaled RGBA after palette resolve).
    /** @type {BarrelDistortion | null} */
    barrel = null;
    /** @type {ChromaticAberration | null} */
    aberration = null;
    /** @type {Interference | null} */
    interference = null;
    /** @type {RollLine | null} */
    rollLine = null;
    /** @type {Scanlines | null} */
    scanlines = null;
    /** @type {RGBMask | null} */
    mask = null;
    /** @type {Vignette | null} */
    vignette = null;
    /** @type {Noise | null} */
    noise = null;
    /** @type {Flicker | null} */
    flicker = null;
    /** @type {Bloom | null} */
    bloom = null;

    // --- Glitch state machine (same idea as demo 023) ---

    // Ticks until the next random glitch burst starts (counts down while idle).
    glitchCooldown = 0;

    // Ticks remaining in the current burst (0 = calm screen).
    glitchActive = 0;

    // How long this burst was scheduled to last (used for the fade envelope).
    glitchDuration = 0;

    // Which glitch personality is active ('none', 'hshift', 'noise', ...).
    glitchType = 'none';

    // Peak strength rolled for this burst (0..1 scale before envelope).
    glitchPeak = 0;

    // True when WebGPU post-process is available; false in software fallback.
    effectsAvailable = false;

    // Reused every frame for overlayRows() - position, bounces, CRT status, glitch readout.
    overlayRowData = [
        { leftText: 'Position: 0, 0', textPaletteIndex: C_OVERLAY_GREEN },
        { leftText: 'Bounces: 0', textPaletteIndex: C_OVERLAY_AMBER },
        { leftText: 'CRT stack: OFF', textPaletteIndex: C_OVERLAY_GREEN },
        { leftText: 'Glitch: NONE', textPaletteIndex: C_OVERLAY_AMBER },
    ];

    /**
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            displaySize: new Vector2i(320, 240),
            // Display-tier CRT runs on the upscaled RGBA buffer (3x logical here).
            drawingBufferSize: new Vector2i(OUTPUT_W, OUTPUT_H),
            // Demos layout may scale the canvas up to 4x logical on screen (default cap is 960x720).
            maxCanvasSize: new Vector2i(320 * 4, 240 * 4),
            outputUpscaleFilter: 'nearest',
            targetFPS: TARGET_FPS,
            isDetectingDroppedFrames: true,
            // Opt in to the engine timing chart band (update vs render CPU bars above the FPS row).
            // Bar colors default to overlayStyle; we set explicit indices so they match this palette.
            isOverlayTimingChartEnabled: true,
            overlayStyle: {
                barPaletteIndex: C_OVERLAY_BAR,
                textPaletteIndex: C_OVERLAY_GREEN,
                gapPaletteIndex: C_OVERLAY_BAR,
            },
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_OVERLAY_GREEN,
                renderBarPaletteIndex: C_OVERLAY_AMBER,
                warningPaletteIndex: C_OVERLAY_AMBER,
                errorPaletteIndex: C_OVERLAY_ERROR,
                tagPaletteIndex: C_OVERLAY_GREEN,
            },
        };
    }

    /**
     * @returns {Promise<boolean>}
     */
    async init() {
        // --- Palette (matches demo 001 PipBoy green scene) ---
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_BG, new Color32(16, 28, 16));
        this.palette.set(C_OVERLAY_BAR, new Color32(24, 44, 28));
        this.palette.set(C_OVERLAY_GREEN, new Color32(80, 200, 110));
        this.palette.set(C_OVERLAY_AMBER, new Color32(220, 180, 60));
        this.palette.set(C_OVERLAY_ERROR, new Color32(200, 70, 70));

        // --- Sprite load (same two-step path as demo 001) ---
        // Step 1: scan the PNG and copy every unique color into palette slots
        // starting at SPRITE_BASE so indexed drawing knows which slot each pixel uses.
        await SpriteSheet.loadColorsIntoPalette(SPRITE_URL, this.palette, SPRITE_BASE);

        // Step 2: loadIndexed builds the GPU sheet + a full-image source rectangle.
        const indexed = await SpriteSheet.loadIndexed(SPRITE_URL, this.palette, SPRITE_BASE, { sort: 'none' });
        this.spriteSheet = indexed.sheet;
        this.spriteRect = indexed.srcRect;

        BT.paletteSet(this.palette);

        this.size = new Vector2i(this.spriteSheet.size.x, this.spriteSheet.size.y);
        this.pos = new Vector2i(
            Math.floor(BT.displaySize.x / 2 - this.size.x / 2),
            Math.floor(BT.displaySize.y / 2 - this.size.y / 2),
        );

        // Post-process requires WebGPU; software renderer skips the whole CRT stack.
        this.effectsAvailable = isAvailable();

        if (!this.effectsAvailable) {
            this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
            this.glitchActive = 0;
            this.glitchDuration = 0;
            this.glitchType = 'none';
            this.glitchPeak = 0;
            return true;
        }

        // --- Pixel tier: chunky band glitch on the index buffer ---
        this.pixelGlitch = new PixelGlitch();
        this.pixelGlitch.bandHeight = 6;
        this.pixelGlitch.intensity = 0; // state machine raises this during hshift bursts
        BT.effectAdd(this.pixelGlitch);

        // --- Display tier: hand-built CRT chain (resting values; glitch machine mutates some) ---
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

        // Register every display-tier effect in draw order (first added runs first).
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

        this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
        this.glitchActive = 0;
        this.glitchDuration = 0;
        this.glitchType = 'none';
        this.glitchPeak = 0;
        return true;
    }

    update() {
        // --- Bounce logic (same rules as demo 001; game logic lives only in update()) ---
        // Move the logo by adding speed to position - one step per tick.
        this.pos = this.pos.add(this.speed);

        // Left/right wall test. pos is the sprite's top-left corner, so the right
        // edge is at pos.x + size.x. We compare against displaySize.x - size.x.
        if (this.pos.x <= 0 || this.pos.x >= BT.displaySize.x - this.size.x) {
            // Flip horizontal direction (multiply speed.x by -1).
            this.speed.x = -this.speed.x;
            this.bounces++;
            BT.assignTag('H');
        }

        // Top/bottom wall test uses the same idea on the y axis.
        if (this.pos.y <= 0 || this.pos.y >= BT.displaySize.y - this.size.y) {
            this.speed.y = -this.speed.y;
            this.bounces++;
            BT.assignTag('V');
        }

        // Animated CRT uniforms need elapsed time; skip when effects are unavailable.
        if (this.effectsAvailable) {
            const seconds = BT.timeSeconds;
            this.rollLine.time = seconds;
            this.noise.time = seconds;
            this.interference.time = seconds;
        } else {
            return;
        }

        // --- Glitch state machine (demo 023 pattern) ---
        if (this.glitchActive > 0) {
            // Inside a burst: build a 0 -> 1 -> 0 envelope so the effect ramps in and out.
            // t goes from 0 at burst start to 1 on the last tick; sin(t * PI) is a smooth hump.
            const t = 1 - (this.glitchActive - 1) / this.glitchDuration;
            const envelope = Math.sin(t * Math.PI);
            this.applyGlitchUniforms(envelope);

            this.glitchActive--;
            if (this.glitchActive <= 0) {
                // Burst finished - return effect uniforms to calm resting values.
                this.resetGlitchUniforms();
                this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
            }
            return;
        }

        // Idle between bursts: count down cooldown ticks.
        this.glitchCooldown--;
        if (this.glitchCooldown <= 0) {
            // Roll a new burst: random type, duration, and peak strength.
            this.glitchType = randPick(GLITCH_TYPES);
            this.glitchDuration = randInt(GLITCH_ACTIVE_MIN, GLITCH_ACTIVE_MAX);
            this.glitchActive = this.glitchDuration;
            this.glitchPeak = randFloat(GLITCH_INTENSITY_MIN, GLITCH_INTENSITY_MAX);
            // Fresh seed so PixelGlitch band noise looks different each burst.
            this.pixelGlitch.seed = Math.random() * 1000;
        }
    }

    /**
     * Position, bounces, CRT status, and glitch readout (same rows as 001 plus enhanced extras).
     *
     * @returns {readonly { leftText: string }[]}
     */
    overlayRows() {
        this.overlayRowData[0].leftText = `Position: ${this.pos.x}, ${this.pos.y}`;
        this.overlayRowData[1].leftText = `Bounces: ${this.bounces}`;

        if (this.effectsAvailable) {
            this.overlayRowData[2].leftText = 'CRT stack: ON';
            const glitchLabel = GLITCH_LABELS[this.glitchType] ?? 'NONE';
            const glitchValue = this.glitchActive > 0 ? Math.round(this.glitchPeak * 100) : 0;
            this.overlayRowData[3].leftText = `Glitch: ${glitchLabel} ${String(glitchValue).padStart(2, '0')}%`;
        } else {
            this.overlayRowData[2].leftText = 'CRT stack: OFF';
            this.overlayRowData[3].leftText = SOFTWARE_FALLBACK_NOTE;
        }

        return this.overlayRowData;
    }

    /**
     * @param {number} envelope
     */
    applyGlitchUniforms(envelope) {
        const peak = this.glitchPeak * envelope;
        this.resetGlitchUniforms();

        if (this.glitchType === 'hshift') {
            this.pixelGlitch.intensity = peak;
        } else if (this.glitchType === 'chromasplit') {
            this.aberration.aberration = ABERRATION_BASE + peak * 4;
        } else if (this.glitchType === 'noise') {
            this.noise.amount = NOISE_BASE + peak * 0.08;
        } else if (this.glitchType === 'flicker') {
            this.flicker.amount = FLICKER_BASE - (FLICKER_BASE - FLICKER_DIP) * envelope;
        } else if (this.glitchType === 'interference') {
            this.interference.amount = peak * 0.06;
        }
    }

    resetGlitchUniforms() {
        this.pixelGlitch.intensity = 0;
        this.aberration.aberration = ABERRATION_BASE;
        this.noise.amount = NOISE_BASE;
        this.flicker.amount = FLICKER_BASE;
        this.interference.amount = 0;
    }

    render() {
        // Clear the logical framebuffer to the PipBoy background color.
        // C_BG is palette index 1 set in init() - almost black with a faint green tint.
        BT.clear(C_BG);

        // Draw the bouncing logo at its current position (updated in update(), not here).
        // paletteOffset 0 keeps the sprite's original indexed colors from SPRITE_BASE.
        BT.drawSprite(this.spriteSheet, this.spriteRect, this.pos, 0);

        // On-canvas hint: the engine overlay (FPS, position, CRT status) toggles with
        // Backquote or the small symbol in the bottom-left corner of the upscaled canvas.
        BT.systemPrint(new Vector2i(3, 0), C_OVERLAY_GREEN, 'Press ~ or click/tap the symbol below');

        // Position, bounces, CRT stack, and glitch readout live in overlayRows(), not here.
        // After this pass finishes, WebGPU runs the CRT post-process chain on the result.
    }
}

bootstrap(Demo);
