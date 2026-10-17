/*

Logo Low-Res: the BLIT386 logo on an 80x60 screen, upscaled 3x inside a B/W CRT stack.
@description The BLIT386 logo on a tiny 80x60 screen, upscaled nearest-neighbor inside a monochrome CRT stack.
@pageTitle BLIT386 Demo – Logo Low-Res
@ogScale integer

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Sprite Effects: https://demos.blit386.dev/sprite-effects

Live version: https://demos.blit386.dev/logo-lowres

Guides:
  - Post-Process Effects: https://blit386.dev/docs/guides/post-process-effects#display-tier-effects

Reference:
  - Rendering: https://blit386.dev/docs/api/rendering#post-process-effects
  - Core: https://blit386.dev/docs/api/core#resolution-model

---

WHAT YOU WILL SEE
-----------------

- The 32x28 logo sprite from Basics centered on a light gray 80x60 canvas. That is one
  quarter of the usual 320x240 in each direction - smaller than a Game Boy screen
  (160x144).
- The engine upscales that 80x60 picture 3x to 240x180 with nearest-neighbor filtering,
  so each logical pixel becomes a hard-edged 3x3 block.
- On top of the upscaled image runs the Tesla Orava B/W CRT stack introduced in Sprite
  Effects: scanlines, a bright scrolling roll band (RollLine), light grain (Noise), an RGB
  stripe mask (RGBMask), a gentle vignette, soft bloom, and brightness waver (Flicker).
  ChromaticAberration and Interference are registered too but rest at zero.
- Every 2.5-7 seconds a TV fault burst lasting 4-24 ticks: horizontal hold, snow, dimming,
  ghosting, or vertical roll, each eased in and out over a sine envelope. Separately,
  every 1.7-4.7 seconds a milder 3-10 tick band wobble jitters a few rows.
- Post-process needs WebGPU. Under the software renderer the logo is drawn without any
  CRT effect, and nothing on screen says so: this demo has no HUD and the engine overlay
  is disabled.

WHAT YOU WILL LEARN
-------------------

- displaySize 80x60 plus drawingBufferSize 240x180 and outputUpscaleFilter 'nearest':
  the logical picture is drawn small and stretched to an integer multiple before the
  display tier runs.
- A pixel-tier effect (PixelGlitch, bandHeight 2) shifting palette-index rows before the
  palette resolve, and nine display-tier effects on the resolved RGBA buffer.
- Scanlines density = DISPLAY_H puts one scanline cycle on every logical row; RGBMask
  size 3 with border 0 gives one clean R-G-B stripe cycle per logical pixel.
- Two independent cooldown/active state machines driven by BT.random.int(),
  BT.random.float(), and BT.random.pick(GLITCH_TYPES_VROLL), resting uniforms restored
  every tick before the active fault is layered on.
- isOverlayEnabled: false for an immersive piece with no dev HUD.

WHY UPSCALE FIRST AND THEN ADD CRT?
-----------------------------------

The engine renders the 80x60 palette-indexed picture into a 240x180 RGBA buffer (the
drawingBufferSize step). The display-tier effects run after that, on the RGBA buffer, so
they see 240x180 pixels and can paint convincing scanlines, stripes, and glow across the
whole frame even though the game itself only used 80x60 logical pixels.

*/

import {
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

import { GLITCH_TYPES_VROLL } from './shared/crt-glitch.js';
import { isAvailable } from './shared/post-process-backend.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').SpriteSheet} SpriteSheet */
/** @typedef {import('blit386').Rect2i} Rect2i */
/** @typedef {import('blit386').PixelGlitch} PixelGlitch */
/** @typedef {import('blit386').ChromaticAberration} ChromaticAberration */
/** @typedef {import('blit386').Interference} Interference */
/** @typedef {import('blit386').RollLine} RollLine */
/** @typedef {import('blit386').Scanlines} Scanlines */
/** @typedef {import('blit386').RGBMask} RGBMask */
/** @typedef {import('blit386').Vignette} Vignette */
/** @typedef {import('blit386').Noise} Noise */
/** @typedef {import('blit386').Flicker} Flicker */
/** @typedef {import('blit386').Bloom} Bloom */

// --- Screen dimensions ---

// The logical drawing area where BT.draw* calls land. 80x60 is smaller than a Game Boy
// screen (160x144).
const DISPLAY_W = 80;
const DISPLAY_H = 60;

// The intermediate buffer size. The engine stretches the 80x60 picture to 240x180
// (exactly 3x) before the display-tier effects run, so each logical pixel is a 3x3 block.
const OUTPUT_W = 240;
const OUTPUT_H = 180;

// --- Palette slot numbers ---

// Index 0 is always transparent; this demo's own colors start at index 1.
const C_BG = 1; // light gray background
const SPRITE_BASE = 3; // first palette slot reserved for the logo's own colors

// --- Sprite source ---
const SPRITE_URL = '/sprites/logo-1.png';

// --- Orava CRT constants ---
// These numbers set the resting look of the B/W CRT between faults.
const FLICKER_BASE = 1.0; // normal brightness (1.0 = full, lower = dimmer)
const FLICKER_DIP = 0.78; // how dark the screen gets during a "dim" TV fault
const ABERRATION_BASE = 0; // no chromatic offset while the set works correctly
const NOISE_BASE = 0.038; // slight film-grain noise, always present on a real CRT

// A bright band scrolls top to bottom on a real CRT. ROLL_BASE is how bright the band
// appears; ROLL_SPEED is how fast it moves.
const ROLL_BASE = 0.26; // brightness of the scrolling highlight band
const ROLL_SPEED = 0.92; // scroll speed of the band (higher = faster)
const INTERFERENCE_BASE = 0; // no ghost image while the set is tuned correctly

// --- Analog-TV fault burst settings ---
// Every so often the virtual TV loses its signal and shows one fault. Cooldown is the
// number of ticks between faults; active is how long a fault lasts. At the default 60
// ticks per second one tick is 1/60 s.
const GLITCH_COOLDOWN_MIN = 150; // at least 2.5 seconds between faults
const GLITCH_COOLDOWN_MAX = 420; // up to 7 seconds between faults
const GLITCH_ACTIVE_MIN = 4; // a fault lasts at least 4 ticks (~0.07 s)
const GLITCH_ACTIVE_MAX = 24; // a fault lasts up to 24 ticks (0.4 s)
const GLITCH_INTENSITY_MIN = 0.3; // weakest fault (barely visible)
const GLITCH_INTENSITY_MAX = 0.95; // strongest fault (almost unwatchable)

// --- Occasional subtle band wobble (pixel-tier PixelGlitch) ---
// Separate from the bigger TV fault bursts: a real CRT sometimes shows a tiny horizontal
// jitter on random scan lines that is too mild to call a fault.
const BAND_WOBBLE_COOLDOWN_MIN = 100; // at least ~1.7 seconds between wobbles
const BAND_WOBBLE_COOLDOWN_MAX = 280; // up to ~4.7 seconds between wobbles
const BAND_WOBBLE_ACTIVE_MIN = 3; // a wobble lasts at least 3 ticks (0.05 s)
const BAND_WOBBLE_ACTIVE_MAX = 10; // a wobble lasts up to 10 ticks (~0.17 s)
const BAND_WOBBLE_INTENSITY = 0.11; // peak strength, much milder than a full TV fault

// The BLIT386 logo centered on an 80x60 canvas, upscaled 3x, and wrapped in the Tesla
// Orava B/W CRT post-process stack.
class Demo {
    // The palette: a numbered list of every color this demo uses.
    /** @type {Palette | null} */
    palette = null;

    // The loaded logo sprite sheet; null until init() finishes downloading it.
    /** @type {SpriteSheet | null} */
    spriteSheet = null;

    // Which part of the sprite sheet to draw: the full image here.
    /** @type {Rect2i | null} */
    spriteRect = null;

    // Pixel position of the logo's top-left corner, set once in init().
    pos = new Vector2i(0, 0);

    // --- Post-process effect objects ---
    // Each one is created in init() when WebGPU is available. They stay null under the
    // software renderer.

    // Pixel tier: horizontal band shift (horizontal-hold style tear).
    /** @type {PixelGlitch | null} */
    pixelGlitch = null;

    // Red/blue fringe on bright edges, raised only during hshift faults.
    /** @type {ChromaticAberration | null} */
    aberration = null;

    // Ghost image overlaid on the picture.
    /** @type {Interference | null} */
    interference = null;

    // Bright band that scrolls top to bottom.
    /** @type {RollLine | null} */
    rollLine = null;

    // Dark horizontal lines between pixel rows.
    /** @type {Scanlines | null} */
    scanlines = null;

    // Subtle RGB stripe pattern.
    /** @type {RGBMask | null} */
    mask = null;

    // Darkened corners, like a real tube.
    /** @type {Vignette | null} */
    vignette = null;

    // Constant film-grain noise.
    /** @type {Noise | null} */
    noise = null;

    // Brightness waver.
    /** @type {Flicker | null} */
    flicker = null;

    // Soft glow on bright areas.
    /** @type {Bloom | null} */
    bloom = null;

    // True when WebGPU is active and the post-process effects are registered.
    effectsAvailable = false;

    // --- TV fault state machine ---
    // glitchCooldown counts down ticks until the next fault fires. glitchTicksLeft counts
    // down ticks while a fault runs. glitchDuration remembers how long the current fault
    // was scheduled to last, for the 0..1 envelope that eases faults in and out.
    // glitchType is one of GLITCH_TYPES_VROLL or 'none'. glitchPeak is how strong this
    // particular burst is (0..1).
    glitchCooldown = 0;
    glitchTicksLeft = 0;
    glitchDuration = 0;
    glitchType = 'none';
    glitchPeak = 0;

    // --- Band-wobble state (mild pixel-tier jitter, separate from TV faults) ---
    bandWobbleCooldown = 0;
    bandWobbleActive = 0;
    bandWobbleDuration = 0;
    bandWobbleSeed = 0;

    // Runs once at startup: sets the tiny screen resolution, the 3x upscale buffer, the
    // nearest-neighbor filter, and turns the engine overlay off.
    configure() {
        return {
            // Tiny 80x60 logical canvas.
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),

            // 3x upscale to 240x180. The display-tier effects run on this larger buffer.
            drawingBufferSize: new Vector2i(OUTPUT_W, OUTPUT_H),

            // Keep each logical pixel a crisp hard-edged square; the CRT effects layer
            // the soft, curved-glass look on top.
            outputUpscaleFilter: 'nearest',

            // The engine overlay is disabled so its HUD never covers the CRT image. This
            // demo draws no HUD of its own.
            isOverlayEnabled: false,
        };
    }

    // Runs once before the loop starts: sets up the palette, loads the sprite, centers
    // it, and registers the Orava CRT effects when WebGPU is available. `await` pauses
    // this function while the PNG downloads.
    async init() {
        // --- Palette setup ---
        // BT.paletteCreate(256) makes a fresh palette with 256 empty color slots.
        this.palette = BT.paletteCreate(256);

        // Color32(red, green, blue): each channel is 0 (none) to 255 (maximum).
        this.palette.set(C_BG, new Color32(160, 160, 160)); // light gray background

        // Read every unique color in the logo PNG and store them starting at SPRITE_BASE.
        // The engine must know these colors before it can draw palette-indexed sprites.
        await SpriteSheet.loadColorsIntoPalette(SPRITE_URL, this.palette, SPRITE_BASE);

        // Turn the PNG into a palette-indexed sprite ready for BT.drawSprite.
        // loadIndexed() also returns srcRect, which covers the whole single-sprite sheet.
        const indexed = await SpriteSheet.loadIndexed(SPRITE_URL, this.palette, SPRITE_BASE, { sort: 'none' });
        this.spriteSheet = indexed.sheet;
        this.spriteRect = indexed.srcRect;

        // Activate the palette. Every draw call from here on uses these colors.
        BT.paletteSet(this.palette);

        // --- Center the sprite ---
        // BT.displaySize is the logical 80x60 canvas. Subtracting half the sprite size
        // from half the screen size gives the top-left corner that puts the sprite's
        // center at the screen's center.
        const screen = BT.displaySize;

        this.pos = new Vector2i(
            Math.floor(screen.x / 2 - this.spriteSheet.size.x / 2),
            Math.floor(screen.y / 2 - this.spriteSheet.size.y / 2),
        );

        // --- Post-process effects (WebGPU only) ---
        // isAvailable() checks BT.activeBackend === 'webgpu'. When the browser fell back
        // to the Canvas 2D software renderer, all effect setup is skipped.
        this.effectsAvailable = isAvailable();

        if (!this.effectsAvailable) {
            // Software renderer: update() never runs the CRT state machine, so there is
            // nothing to schedule.
            return true;
        }

        // Pixel tier: a horizontal band shift that mimics a TV losing its horizontal
        // hold. It runs before the palette-to-RGBA resolve, so it shifts raw
        // palette-index rows and each shifted row is then resolved to a different color.
        // Intensity 0 means no shift right now; it rises during hshift faults and band
        // wobbles.
        this.pixelGlitch = new PixelGlitch();
        this.pixelGlitch.bandHeight = 2; // two logical-pixel-tall bands on a 60 px screen
        this.pixelGlitch.intensity = 0;
        BT.effectAdd(this.pixelGlitch);

        // Display tier: the effects below run on the full 240x180 RGBA buffer after
        // upscaling.

        // Chromatic aberration splits the red and blue channels slightly at bright edges.
        // On a B/W CRT this is very faint; it only rises during hshift faults.
        this.aberration = new ChromaticAberration();
        this.aberration.aberration = ABERRATION_BASE;

        // Interference layers a faint ghost copy of the picture over itself. On a real TV
        // this appears when the signal bounces off a wall before reaching the aerial.
        this.interference = new Interference();
        this.interference.amount = INTERFERENCE_BASE;

        // RollLine simulates the bright horizontal band that sweeps top to bottom on a
        // CRT, visible on old TV footage as a slightly bright line drifting through the
        // picture.
        this.rollLine = new RollLine();
        this.rollLine.amount = ROLL_BASE;
        this.rollLine.speed = ROLL_SPEED;

        // Scanlines darken alternate rows to recreate the gaps between phosphor lines.
        // density is cycles per view: DISPLAY_H puts one cycle on each logical pixel row
        // (every 3 output pixels). strength is the gaussian falloff: more negative means
        // sharper, narrower dark bands (the engine default is -8).
        this.scanlines = new Scanlines();
        this.scanlines.amount = 0.05;
        this.scanlines.strength = -40;
        this.scanlines.density = DISPLAY_H;

        // RGBMask adds a subpixel stripe pattern across the whole output image. size is
        // how many output pixels make one full R-G-B cycle; size 3 makes each subpixel
        // exactly one output pixel wide (R | G | B | R | G | B ...), the same layout as a
        // real LCD or OLED RGB stripe. With the 3x upscale, each logical pixel is 3
        // output pixels wide, so one R-G-B cycle lines up exactly with one logical pixel.
        // border 0 disables the cell-edge darkening and the vertical stagger that would
        // make each logical pixel look like a 2x2 block of subpixels, leaving clean
        // horizontal-only RGB stripes.
        this.mask = new RGBMask();
        this.mask.intensity = 0.05;
        this.mask.size = 3;
        this.mask.border = 0;

        // Vignette darkens the corners slightly, like the shadow of a CRT bezel.
        this.vignette = new Vignette();
        this.vignette.amount = 0.1;

        // Noise adds a tiny random grain on every pixel, every frame: the thermal noise
        // of a real CRT's electron gun. 0.038 is very faint.
        this.noise = new Noise();
        this.noise.amount = NOISE_BASE;

        // Flicker multiplies the overall brightness each frame. 1.0 is fully bright;
        // during a "dim" fault it dips toward FLICKER_DIP.
        this.flicker = new Flicker();
        this.flicker.amount = FLICKER_BASE;

        // Bloom adds a soft glow around bright areas, the phosphor afterglow of a hot
        // CRT. spread sets the glow radius; glow sets how much it brightens the
        // surroundings.
        this.bloom = new Bloom();
        this.bloom.spread = 2.2;
        this.bloom.glow = 0.09;

        // Register all display-tier effects with the engine in the order they run.
        for (const fx of [
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

        // Pick a random delay before the first TV fault and the first band wobble.
        // BT.random is the engine's shared random number generator; int(min, max) returns
        // a whole number from min up to but not including max.
        this.glitchCooldown = BT.random.int(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
        this.bandWobbleCooldown = BT.random.int(BAND_WOBBLE_COOLDOWN_MIN, BAND_WOBBLE_COOLDOWN_MAX);

        return true;
    }

    // Runs at the fixed tick rate (60 per second by default). The logo never moves, so
    // only the CRT effect state machine needs driving.
    update() {
        if (this.effectsAvailable) {
            this.updateCrtEffects();
        }
    }

    // Runs once per screen refresh. The logo does not move: clear the screen, draw the
    // sprite at its fixed center position.
    render() {
        // Erase the previous frame so nothing trails or ghosts.
        BT.clear(C_BG);

        // Draw the logo on top, centered. paletteOffset 0 keeps the original sprite
        // colors.
        if (this.spriteSheet && this.spriteRect) {
            BT.drawSprite(this.spriteSheet, this.spriteRect, this.pos, 0);
        }
    }

    // Advances the TV fault state machine and the subtle band-wobble system. Called every
    // tick from update() when WebGPU effects are active. Two layers: dramatic, infrequent
    // TV fault bursts of a random type, and a mild pixel-tier band wobble. The wobble
    // counters pause while a fault burst is running.
    updateCrtEffects() {
        // Feed the current engine time into the effects that animate. BT.timeSeconds is
        // the total elapsed seconds since the demo started.
        const seconds = BT.timeSeconds;
        this.rollLine.time = seconds;
        this.noise.time = seconds;
        this.interference.time = seconds;

        // --- TV fault burst ---
        if (this.glitchTicksLeft > 0) {
            // Inside a fault burst. Compute a smooth 0..1..0 envelope so the fault eases
            // in and out instead of snapping on and off: t is 0 at the start of the burst
            // and 1 at the end, and sin(t * PI) is a bell curve, 0 at the edges and 1 at
            // the peak.
            const t = 1 - (this.glitchTicksLeft - 1) / this.glitchDuration;
            const envelope = Math.sin(t * Math.PI);

            this.applyRestingCrtUniforms();
            this.applyGlitchUniforms(envelope);

            this.glitchTicksLeft--;

            if (this.glitchTicksLeft <= 0) {
                // Burst finished: schedule the next cooldown and re-roll the band wobble
                // cooldown too.
                this.glitchCooldown = BT.random.int(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
                this.bandWobbleCooldown = BT.random.int(BAND_WOBBLE_COOLDOWN_MIN, BAND_WOBBLE_COOLDOWN_MAX);
            }

            // Return early: the rest of the state machine does not run during a burst.
            return;
        }

        // No fault active: apply the calm resting look.
        this.applyRestingCrtUniforms();

        // --- Band wobble (pixel-tier mild jitter) ---
        if (this.bandWobbleActive > 0) {
            // Same bell-curve envelope as the fault bursts, at a much smaller intensity.
            const t = 1 - (this.bandWobbleActive - 1) / this.bandWobbleDuration;
            const envelope = Math.sin(t * Math.PI);
            this.pixelGlitch.intensity = BAND_WOBBLE_INTENSITY * envelope;
            this.pixelGlitch.seed = this.bandWobbleSeed;
            this.bandWobbleActive--;

            if (this.bandWobbleActive <= 0) {
                this.pixelGlitch.intensity = 0;
                this.bandWobbleCooldown = BT.random.int(BAND_WOBBLE_COOLDOWN_MIN, BAND_WOBBLE_COOLDOWN_MAX);
            }
        } else {
            this.bandWobbleCooldown--;

            if (this.bandWobbleCooldown <= 0) {
                // Start a new band-wobble burst. A different seed gives a different row
                // pattern.
                this.bandWobbleDuration = BT.random.int(BAND_WOBBLE_ACTIVE_MIN, BAND_WOBBLE_ACTIVE_MAX);
                this.bandWobbleActive = this.bandWobbleDuration;
                this.bandWobbleSeed = BT.random.float(0, 1000);
            }
        }

        // --- Cooldown before the next TV fault ---
        this.glitchCooldown--;

        if (this.glitchCooldown <= 0) {
            // Time for a fault. pick() returns one item of a list; float(min, max) is the
            // decimal counterpart of int().
            this.glitchType = BT.random.pick(GLITCH_TYPES_VROLL);
            this.glitchDuration = BT.random.int(GLITCH_ACTIVE_MIN, GLITCH_ACTIVE_MAX);
            this.glitchTicksLeft = this.glitchDuration;
            this.glitchPeak = BT.random.float(GLITCH_INTENSITY_MIN, GLITCH_INTENSITY_MAX);
            this.pixelGlitch.seed = BT.random.float(0, 1000);
        }
    }

    // Resets every fault-driven uniform to the calm, between-faults Orava look. Called
    // every tick, then overridden by applyGlitchUniforms() during a fault.
    applyRestingCrtUniforms() {
        this.pixelGlitch.intensity = 0;
        this.aberration.aberration = ABERRATION_BASE;
        this.noise.amount = NOISE_BASE;
        this.flicker.amount = FLICKER_BASE;
        this.interference.amount = INTERFERENCE_BASE;
        this.rollLine.amount = ROLL_BASE;
        this.rollLine.speed = ROLL_SPEED;
    }

    // Layers one of the five Orava TV faults onto the resting uniforms. `envelope` is the
    // bell-curve value for this tick: 0 at the start and end of a burst, 1 in the middle.
    applyGlitchUniforms(envelope) {
        // peak is how strong this specific burst is, scaled by the bell-curve envelope.
        const peak = this.glitchPeak * envelope;

        if (this.glitchType === 'hshift') {
            // H-HOLD: a horizontal band shift in the pixel-tier index buffer, as if the
            // image slipped sideways on the tube.
            this.pixelGlitch.intensity = peak;

            // The torn edges also pick up a faint red/blue fringe, like a real set
            // struggling to keep the picture aligned during a horizontal-hold fault.
            this.aberration.aberration = ABERRATION_BASE + peak * 4;
        } else if (this.glitchType === 'noise') {
            // SNOW: extra random grain on top of the base noise.
            this.noise.amount = NOISE_BASE + peak * 0.1;
        } else if (this.glitchType === 'flicker') {
            // DIM: the brightness drops as if the tube needs warming up. Lerp from
            // FLICKER_BASE down to FLICKER_DIP, scaled by peak so a strong burst dims
            // deeper than a weak one.
            this.flicker.amount = FLICKER_BASE - (FLICKER_BASE - FLICKER_DIP) * peak;
        } else if (this.glitchType === 'interference') {
            // GHOST: a faint ghost copy of the image appears (aerial reflection).
            this.interference.amount = peak * 0.07;
        } else if (this.glitchType === 'vroll') {
            // V-ROLL: the scan band speeds up and brightens, like a vertical sync loss.
            this.rollLine.amount = ROLL_BASE + peak * 0.35;
            this.rollLine.speed = ROLL_SPEED + peak * 1.8;
        }
    }
}

// Hand the Demo class to the engine. bootstrap() sets up the canvas, picks a backend,
// creates one Demo instance, then drives configure() -> init() -> the update/render loop.
bootstrap(Demo);
