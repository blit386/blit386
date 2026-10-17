/*

Basics Enhanced: the Basics bouncing sprite behind a hand-built CRT post-process chain.
@description The bouncing sprite from Basics again, with optional visual effects over the same PipBoy palette.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - PipBoy CRT: https://demos.blit386.dev/crt-pipboy
  - CRT Toggle: https://demos.blit386.dev/crt-toggle

Live version: https://demos.blit386.dev/basics-enhanced

Guides:
  - Post-Process Effects: https://blit386.dev/docs/guides/post-process-effects#pixel-tier-effects
  - Game Loop: https://blit386.dev/docs/guides/game-loop#smoothing-motion-between-updates
  - Overlay: https://blit386.dev/docs/guides/overlay#custom-rows

Reference:
  - Rendering: https://blit386.dev/docs/api/rendering#post-process-effects
  - Game Loop: https://blit386.dev/docs/api/game-loop#interpolating-render-state-with-renderalpha
  - Overlay: https://blit386.dev/docs/api/overlay#custom-rows

---

WHAT YOU WILL SEE
-----------------

The same scene as Basics: the 32x28 BLIT386 logo bouncing around a 320x240 PipBoy-green
screen at 30 ticks per second, with a dim UI kit hint in the top-left corner. Under WebGPU
the whole frame is additionally routed through eleven post-process effects: a curved tube,
scanlines, an RGB mask, vignette, grain, flicker, bloom, a slow roll line, and - every few
seconds - a short glitch burst that tears, splits, snows, dims, or ghosts the picture for
a fraction of a second before the screen settles again.

The engine overlay (Backquote) carries four custom rows: Position, Bounces, CRT stack
ON/OFF, and the current glitch type with its strength in percent. Each wall hit drops an
"H" or "V" tag on the timing chart.

WHAT YOU WILL LEARN
-------------------

- The two post-process tiers and why they differ:
  1. Pixel tier - runs on the logical index buffer (320x240 palette indices, before the
     palette is resolved into RGB). Effects here distort the indexed image itself. Only
     PixelGlitch sits here.
  2. Display tier - runs after the palette is resolved and the image is upscaled to
     drawingBufferSize (960x720 here, 3x logical). Effects here work in full-color RGB
     and can blur, warp, tint, and bloom the final image. The other ten effects in this
     demo live here.
- Why hand-compose ten display-tier effects instead of calling BT.preset.crtPipBoy() as
  CRT Toggle does: keeping each effect object lets update() drive individual uniforms
  from a state machine. The glitch machine picks one of five glitch types, ramps it up
  over a sine envelope, and ramps it down again.
- BT.effectAdd(effect) registers effects in draw order: the first added runs first.
- Animated effects (RollLine, Noise, Interference) need BT.timeSeconds fed into their
  time uniform every tick.
- Smoothing a 30-tick-per-second simulation with BT.renderAlpha and Vector2i.lerp, the
  same fix Basics explains in detail.
- Overlay customization: overlayStyle, overlayTimingChartStyle, overlayRows(), and
  BT.assignTag().

SOFTWARE FALLBACK
-----------------

Post-process needs WebGPU. Under the software renderer the bouncing sprite still runs, but
no effect is registered, the glitch state machine never starts, and a warm two-line note
drawn with the shared UI kit (src/shared/ui.js) plus the "CRT stack OFF (software)"
overlay row explain the reduced mode.

TRY THIS
--------

- Press Backquote (`) or click/tap the symbol in the bottom-left corner of the canvas to
  open the engine overlay. Watch the Glitch row during a burst: the label names the fault
  (H-HOLD, CHROMA, SNOW, DIM, GHOST) and the percentage is its rolled peak strength.
- Bursts arrive every 4-12 seconds and last 0.17-1 second (120-360 and 5-30 ticks at 30
  ticks per second).
- Add ?backend=software to the URL to see the fallback path.

*/

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
} from 'blit386';

import {
    ABERRATION_BASE,
    applyGlitchUniforms,
    FLICKER_BASE,
    GLITCH_ACTIVE_MAX,
    GLITCH_ACTIVE_MIN,
    GLITCH_COOLDOWN_MAX,
    GLITCH_COOLDOWN_MIN,
    GLITCH_INTENSITY_MAX,
    GLITCH_INTENSITY_MIN,
    GLITCH_LABELS,
    GLITCH_TYPES_CHROMA,
    NOISE_BASE,
    PIXEL_GLITCH_BAND_HEIGHT,
    resetGlitchUniforms,
} from './shared/crt-glitch.js';
import { isAvailable, SOFTWARE_FALLBACK_NOTE } from './shared/post-process-backend.js';
import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').SpriteSheet} SpriteSheet */
/** @typedef {import('blit386').Rect2i} Rect2i */
/** @typedef {import('blit386').PixelGlitch} PixelGlitch */
/** @typedef {import('blit386').BarrelDistortion} BarrelDistortion */
/** @typedef {import('blit386').ChromaticAberration} ChromaticAberration */
/** @typedef {import('blit386').Interference} Interference */
/** @typedef {import('blit386').RollLine} RollLine */
/** @typedef {import('blit386').Scanlines} Scanlines */
/** @typedef {import('blit386').RGBMask} RGBMask */
/** @typedef {import('blit386').Vignette} Vignette */
/** @typedef {import('blit386').Noise} Noise */
/** @typedef {import('blit386').Flicker} Flicker */
/** @typedef {import('blit386').Bloom} Bloom */

// Palette slots match the Basics demo so the two demos read as the same scene.
const C_BG = 1; // almost-black with a faint green tint
const C_OVERLAY_BAR = 2; // bar behind overlay custom rows
const C_OVERLAY_GREEN = 3; // PipBoy green (position, CRT status)
const C_OVERLAY_AMBER = 4; // amber accent (bounces, glitch readout)
const C_OVERLAY_ERROR = 5; // red tint for timing-chart error markers

const SPRITE_BASE = 10;
const SPRITE_URL = '/sprites/logo-1.png';
const TARGET_FPS = 30;

// The display-tier chain runs on an output buffer larger than the logical screen: 3x.
const OUTPUT_W = 960;
const OUTPUT_H = 720;

// The shared fallback note is one long sentence, too wide for a 320-pixel screen in the
// 6-pixel-wide system font. split('. ') cuts it at the sentence break into two shorter
// lines the UI kit draws one under the other.
const FALLBACK_LINES = SOFTWARE_FALLBACK_NOTE.split('. ');

// The Basics demo plus a hand-built CRT post-process chain and periodic glitch bursts.
class Demo {
    // --- Bouncing sprite (same roles as the Basics demo) ---

    // Top-left corner of the logo on screen, in whole pixels.
    pos = new Vector2i(160, 120);

    // Pixels the logo moves per update() tick, x and y separately.
    speed = new Vector2i(1, 1);

    // Logo position at the start of the most recent update() tick, before that tick moved
    // it. render() blends between this and pos using BT.renderAlpha so the logo glides
    // between ticks instead of jumping - the same fix as Basics, whose render() comment
    // explains why targetFPS 30 makes the stutter especially visible.
    prevPos = new Vector2i(160, 120);

    // Logo width and height in pixels; filled from the loaded PNG in init().
    size = new Vector2i(16, 16);

    // Counts wall hits so overlayRows() can show a running total.
    bounces = 0;

    // Every color this demo draws with; built in init().
    /** @type {Palette | null} */
    palette = null;

    // Loaded indexed sprite sheet (GPU texture plus palette mapping).
    /** @type {SpriteSheet | null} */
    spriteSheet = null;

    // Which rectangle inside the PNG to draw: the full image for this logo.
    /** @type {Rect2i | null} */
    spriteRect = null;

    // --- Post-process effect handles (WebGPU only) ---

    // Pixel tier: shifts horizontal bands in the index buffer before palette resolve.
    /** @type {PixelGlitch | null} */
    pixelGlitch = null;

    // Display tier: the CRT stack, run on the upscaled RGBA buffer after palette resolve.
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

    // --- Glitch state machine (same idea as the PipBoy CRT demo) ---

    // Ticks until the next random glitch burst starts; counts down while idle.
    glitchCooldown = 0;

    // Ticks remaining in the current burst; 0 means a calm screen.
    glitchTicksLeft = 0;

    // How long this burst was scheduled to last, used for the fade envelope.
    glitchDuration = 0;

    // Which glitch type is active: 'none' or one of GLITCH_TYPES_CHROMA.
    glitchType = 'none';

    // Peak strength rolled for this burst, 0..1 before the envelope is applied.
    glitchPeak = 0;

    // True when WebGPU post-process is available; false in the software fallback.
    effectsAvailable = false;

    // Reused every frame for overlayRows(): position, bounces, CRT status, glitch
    // readout.
    overlayRowData = [
        { leftText: 'Position (0, 0)', textPaletteIndex: C_OVERLAY_GREEN },
        { leftText: 'Bounces 0', textPaletteIndex: C_OVERLAY_AMBER },
        { leftText: 'CRT stack OFF', textPaletteIndex: C_OVERLAY_GREEN },
        { leftText: 'Glitch NONE', textPaletteIndex: C_OVERLAY_AMBER },
    ];

    configure() {
        return {
            displaySize: new Vector2i(320, 240),
            // The display-tier CRT runs on the upscaled RGBA buffer, 3x logical here.
            drawingBufferSize: new Vector2i(OUTPUT_W, OUTPUT_H),
            // The demos layout may scale the canvas up to 4x logical on screen; the
            // engine default cap is 960x720.
            maxCanvasSize: new Vector2i(320 * 4, 240 * 4),
            outputUpscaleFilter: 'nearest',
            targetFPS: TARGET_FPS,
            isDetectingDroppedFrames: true,
            // Opt in to the overlay timing chart (update vs render CPU bars above the
            // FPS row). Bar colors default to overlayStyle; explicit indices keep them
            // on this palette.
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

    async init() {
        // --- Palette (matches the Basics demo PipBoy green scene) ---
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_BG, new Color32(16, 28, 16));
        this.palette.set(C_OVERLAY_BAR, new Color32(24, 44, 28));
        this.palette.set(C_OVERLAY_GREEN, new Color32(80, 200, 110));
        this.palette.set(C_OVERLAY_AMBER, new Color32(220, 180, 60));
        this.palette.set(C_OVERLAY_ERROR, new Color32(200, 70, 70));

        // --- Sprite load (same two-step path as the Basics demo) ---
        // Step 1: scan the PNG and copy every unique color into palette slots starting at
        // SPRITE_BASE, so indexed drawing knows which slot each pixel uses.
        await SpriteSheet.loadColorsIntoPalette(SPRITE_URL, this.palette, SPRITE_BASE);

        // Step 2: loadIndexed builds the GPU sheet plus a full-image source rectangle.
        const indexed = await SpriteSheet.loadIndexed(SPRITE_URL, this.palette, SPRITE_BASE, { sort: 'none' });
        this.spriteSheet = indexed.sheet;
        this.spriteRect = indexed.srcRect;

        // Install the shared UI kit colors. The scene owns slots 1-5 and the logo owns
        // slots from SPRITE_BASE up, so the kit's default range (240-251, at the top of
        // the palette) is free. The kit colors are only for the on-canvas hint and
        // fallback note drawn in render().
        applyTheme(this.palette);

        BT.paletteSet(this.palette);

        this.size = new Vector2i(this.spriteSheet.size.x, this.spriteSheet.size.y);
        this.pos = new Vector2i(
            Math.floor(BT.displaySize.x / 2 - this.size.x / 2),
            Math.floor(BT.displaySize.y / 2 - this.size.y / 2),
        );

        // Keep prevPos in sync with the real starting position so the very first render()
        // does not slide in from the (160, 120) placeholder.
        this.prevPos = this.pos;

        // Post-process requires WebGPU; the software renderer skips the whole CRT stack.
        this.effectsAvailable = isAvailable();

        if (!this.effectsAvailable) {
            // Software renderer: update() never runs the glitch machine, so there is
            // nothing to seed.
            return true;
        }

        // --- Pixel tier: chunky band glitch on the index buffer ---
        this.pixelGlitch = new PixelGlitch();
        this.pixelGlitch.bandHeight = PIXEL_GLITCH_BAND_HEIGHT;
        // Intensity 0 means no shift; the state machine raises it during hshift bursts.
        this.pixelGlitch.intensity = 0;
        BT.effectAdd(this.pixelGlitch);

        // --- Display tier: hand-built CRT chain ---
        // Resting values; the glitch machine mutates aberration, interference, noise, and
        // flicker during a burst and restores them afterwards.
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

        // Register every display-tier effect in draw order: the first added runs first.
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

        // BT.random is the engine's shared random number generator. int(min, max) returns
        // a whole number from min up to but not including max, so this waits a random
        // number of ticks before the first burst.
        this.glitchCooldown = BT.random.int(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
        this.glitchTicksLeft = 0;
        this.glitchDuration = 0;
        this.glitchType = 'none';
        this.glitchPeak = 0;

        return true;
    }

    update() {
        // --- Bounce logic (same rules as Basics; game logic lives only in update()) ---
        // Remember where the logo was before this tick moves it, so render() can draw a
        // smooth in-between position instead of a pop.
        this.prevPos = this.pos;

        // Move the logo by adding speed to position: one step per tick.
        this.pos = this.pos.add(this.speed);

        // Left/right wall test. pos is the sprite's top-left corner, so the right edge is
        // at pos.x + size.x, compared against displaySize.x - size.x.
        if (this.pos.x <= 0 || this.pos.x >= BT.displaySize.x - this.size.x) {
            // Flip the horizontal direction.
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

        // --- Glitch state machine (PipBoy CRT demo pattern) ---
        if (this.glitchTicksLeft > 0) {
            // Inside a burst: build a 0 -> 1 -> 0 envelope so the effect ramps in and
            // out. t goes from 0 at burst start to 1 on the last tick; sin(t * PI) is a
            // smooth hump.
            const t = 1 - (this.glitchTicksLeft - 1) / this.glitchDuration;
            const envelope = Math.sin(t * Math.PI);
            applyGlitchUniforms(this, envelope);

            this.glitchTicksLeft--;

            if (this.glitchTicksLeft <= 0) {
                // Burst finished: return effect uniforms to their calm resting values.
                resetGlitchUniforms(this);

                this.glitchCooldown = BT.random.int(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
            }

            return;
        }

        // Idle between bursts: count down the cooldown ticks.
        this.glitchCooldown--;

        if (this.glitchCooldown <= 0) {
            // Roll a new burst. pick() returns one item of a list; float(min, max) is the
            // decimal counterpart of int().
            this.glitchType = BT.random.pick(GLITCH_TYPES_CHROMA);
            this.glitchDuration = BT.random.int(GLITCH_ACTIVE_MIN, GLITCH_ACTIVE_MAX);
            this.glitchTicksLeft = this.glitchDuration;
            this.glitchPeak = BT.random.float(GLITCH_INTENSITY_MIN, GLITCH_INTENSITY_MAX);

            // Fresh seed so the PixelGlitch band noise looks different each burst.
            this.pixelGlitch.seed = BT.random.float(0, 1000);
        }
    }

    render() {
        // Clear the logical framebuffer to the PipBoy background color (slot C_BG, set in
        // init()).
        BT.clear(C_BG);

        // Blend prevPos toward pos by BT.renderAlpha to get the logo's position at this
        // exact render moment instead of only its last-tick position. Same fix, same
        // reason as the Basics demo.
        const drawPos = Vector2i.lerp(this.prevPos, this.pos, BT.renderAlpha);

        // Draw the logo at its smoothed position. paletteOffset 0 keeps the sprite's
        // original indexed colors from SPRITE_BASE.
        BT.drawSprite(this.spriteSheet, this.spriteRect, drawPos, 0);

        // On-canvas text drawn with the shared UI kit: a borderless label group (no
        // ui.panel() call, so no box) pinned to the top-left corner. A small margin and
        // padding keep it tucked near the edge.
        ui.begin(UI_ANCHORS.TOP_LEFT, { margin: 2, pad: 2 });

        // Hint: the engine overlay (FPS, position, CRT status) toggles with Backquote or
        // the small symbol in the bottom-left corner of the canvas.
        ui.label('Press ~ or click/tap the symbol below', { color: 'dim' });

        // Software renderer: warn that the CRT look is missing. The shared note was split
        // into two lines up top (FALLBACK_LINES) so it fits the screen width.
        if (!this.effectsAvailable) {
            for (const line of FALLBACK_LINES) {
                ui.label(line, { color: 'warm' });
            }
        }

        ui.end();

        // Position, bounces, CRT stack, and glitch readout live in overlayRows(), not
        // here. After this pass finishes, WebGPU runs the CRT post-process chain on the
        // result.
    }

    // Position, bounces, CRT status, and glitch readout: the Basics rows plus two more.
    overlayRows() {
        this.overlayRowData[0].leftText = `Position (${this.pos.x}, ${this.pos.y})`;
        this.overlayRowData[1].leftText = `Bounces ${this.bounces}`;

        if (this.effectsAvailable) {
            this.overlayRowData[2].leftText = 'CRT stack ON';
            const glitchLabel = GLITCH_LABELS[this.glitchType] ?? 'NONE';
            const glitchValue = this.glitchTicksLeft > 0 ? Math.round(this.glitchPeak * 100) : 0;
            this.overlayRowData[3].leftText = `Glitch ${glitchLabel} ${String(glitchValue).padStart(2, '0')}%`;
        } else {
            // Software renderer: no CRT stack, so the glitch machine never fires. The
            // full explanation lives on the canvas itself (see render()), not in the
            // overlay.
            this.overlayRowData[2].leftText = 'CRT stack OFF (software)';
            this.overlayRowData[3].leftText = 'Glitch NONE';
        }

        return this.overlayRowData;
    }
}

bootstrap(Demo);
