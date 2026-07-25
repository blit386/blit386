// @pageTitle BLIT386 Demo 034 - Logo Low-Res
//
// Demo 034 - Logo Low-Res: the BLIT386 logo on a very chunky low-res screen, wrapped
// in the same Orava B/W CRT stack used in Demo 010-Sprite Effects.
// Written for readers about 12 years old.
//
// What you will see:
//   - The logo sprite from Demo 001-Basics centered on a tiny 80x60 pixel canvas.
//     That is one quarter of the usual 320x240 in each direction - even smaller
//     than an old Game Boy screen (160x144).
//   - The engine upscales that 80x60 picture 3x to 240x180 using nearest-neighbor
//     filtering, so each logical pixel becomes a big hard-edged 3x3 block.
//   - On top of that upscaled image the engine runs the Tesla Orava B/W CRT stack:
//     scanlines, a bright scrolling roll band (RollLine),
//     light noise, brightness waver (Flicker), soft RGB halation (RGBMask), a gentle
//     vignette, soft bloom, and occasional analog-TV fault bursts (horizontal hold,
//     snow, dimming, ghosting, vertical roll).
//   - A tiny status chip in the bottom-left corner, drawn with the shared UI kit
//     (src/shared/ui.js), names the TV fault that is firing right now. It is part
//     of the picture, so the CRT effects wash over it too.
//   - Post-process needs WebGPU. The software renderer shows the logo without CRT.
//
// Why upscale first and then add CRT?
//   The engine renders the 80x60 palette-indexed picture into a 240x180 RGBA buffer
//   (the drawingBufferSize step). The CRT effects run AFTER that, on the RGBA buffer,
//   so they see 240x180 pixels and can paint convincing curved-tube scanlines across
//   the whole frame - even though the game itself only used 80x60 logical pixels.
//
// Prerequisites: 001-Basics (https://demos.blit386.dev/001-basics),
//                010-Sprite Effects (https://demos.blit386.dev/010-sprite-effects).
//
// Live version: https://demos.blit386.dev/034-logo-lowres

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

import { isAvailable } from './shared/post-process-backend.js';
import { randFloat, randInt, randPick } from './shared/rand.js';
import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
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

// The logical drawing area where BT.draw* calls happen.
// 80x60 is our tiny retro resolution - even smaller than a Game Boy screen (160x144).
const DISPLAY_W = 80;
const DISPLAY_H = 60;

// The intermediate buffer size. The engine stretches the 80x60 picture up to 240x180
// (exactly 3x) before the CRT effects run. Each logical pixel becomes a 3x3 block.
const OUTPUT_W = 240;
const OUTPUT_H = 180;

// --- Palette slot numbers ---

// Index 0 is always transparent. Our own colors start at index 1.
// Think of these numbers as labels on paint jars laid out before painting.
// The shared UI kit adds its own 12 colors at slots 240-251 in init().
const C_BG = 1; // Light gray background color.
const SPRITE_BASE = 3; // First palette slot reserved for the logo's own colors.

// --- Sprite sources ---
const SPRITE_URL = '/sprites/logo-1.png';

// --- Orava CRT constants ---
// These numbers control the base look of the old B/W CRT effect.

const FLICKER_BASE = 1.0; // Normal brightness (1.0 = full, lower = dimmer).
const FLICKER_DIP = 0.78; // How dark the screen gets during a "dim" TV fault.
const ABERRATION_BASE = 0; // No chromatic offset when the set is working correctly.
const NOISE_BASE = 0.038; // Slight film-grain noise: always present on a real CRT.

// A bright band scrolls top-to-bottom on a real CRT (caused by the tube's electron beam).
// ROLL_BASE is how bright the band appears; ROLL_SPEED is how fast it moves.
const ROLL_BASE = 0.26; // Brightness of the scrolling highlight band.
const ROLL_SPEED = 0.92; // Scroll speed of the band (higher = faster).
const INTERFERENCE_BASE = 0; // No ghost image when the set is tuned correctly.

// --- Analog-TV fault burst settings ---
// Every so often the virtual TV loses its signal and shows one of these faults.
// Cooldown is how many ticks to wait between faults; active is how long the fault lasts.
const GLITCH_COOLDOWN_MIN = 150; // At least ~2.5 seconds between faults (at 60 FPS).
const GLITCH_COOLDOWN_MAX = 420; // Up to ~7 seconds between faults.
const GLITCH_ACTIVE_MIN = 4; // Fault lasts at least 4 ticks (~0.07 s).
const GLITCH_ACTIVE_MAX = 24; // Fault lasts up to 24 ticks (~0.4 s).
const GLITCH_INTENSITY_MIN = 0.3; // Weakest fault (barely visible).
const GLITCH_INTENSITY_MAX = 0.95; // Strongest fault (almost unwatchable).

// The five kinds of B/W TV fault this demo can show.
// (Chromatic aberration is omitted because a B/W set has no color to split.)
const GLITCH_TYPES = ['hshift', 'noise', 'flicker', 'interference', 'vroll'];

// Human-readable names shown in the on-screen status chip.
const GLITCH_LABELS = {
    none: 'NONE',
    hshift: 'H-HOLD',
    noise: 'SNOW',
    flicker: 'DIM',
    interference: 'GHOST',
    vroll: 'V-ROLL',
};

// --- Occasional subtle band-wobble (pixel-tier PixelGlitch) ---
// This is separate from the bigger TV fault bursts. A real CRT sometimes has a
// tiny horizontal jitter on random scan lines that is too mild to call a fault.
const BAND_WOBBLE_COOLDOWN_MIN = 100; // At least ~1.7 seconds between wobbles (at 60 FPS).
const BAND_WOBBLE_COOLDOWN_MAX = 280; // Up to ~4.7 seconds between wobbles.
const BAND_WOBBLE_ACTIVE_MIN = 3; // Wobble lasts at least 3 ticks (~0.05 s).
const BAND_WOBBLE_ACTIVE_MAX = 10; // Wobble lasts up to 10 ticks (~0.17 s).
const BAND_WOBBLE_INTENSITY = 0.11; // Peak strength - much milder than a full TV fault.

/**
 * The BLIT386 logo centered on an 80x60 pixel canvas, upscaled 3x,
 * and wrapped in the Tesla Orava B/W CRT post-process stack.
 *
 * @implements {IBTDemo}
 */
class Demo {
    // The color palette - a numbered list of every color this demo will use.
    /** @type {Palette | null} */
    palette = null;

    // The loaded logo sprite image. null until init() finishes downloading it.
    /** @type {SpriteSheet | null} */
    spriteSheet = null;

    // Which part of the sprite sheet to draw (the full image in our case).
    /** @type {Rect2i | null} */
    spriteRect = null;

    // Pixel position of the logo's top-left corner, set once in init().
    pos = new Vector2i(0, 0);

    // --- Post-process effect objects ---
    // Each one is created in init() if WebGPU is available.
    // They stay null when the software renderer is active.

    /** @type {PixelGlitch | null} */
    pixelGlitch = null; // Pixel-tier: horizontal band shift (V-hold style tear).

    /** @type {ChromaticAberration | null} */
    aberration = null; // Red/blue fringe on bright edges (used during faults).

    /** @type {Interference | null} */
    interference = null; // Ghost image overlaid on the picture.

    /** @type {RollLine | null} */
    rollLine = null; // Bright band that scrolls top to bottom.

    /** @type {Scanlines | null} */
    scanlines = null; // Dark horizontal lines between pixel rows.

    /** @type {RGBMask | null} */
    mask = null; // Subtle phosphor-dot halation.

    /** @type {Vignette | null} */
    vignette = null; // Darkened corners, like a real tube.

    /** @type {Noise | null} */
    noise = null; // Constant film-grain noise.

    /** @type {Flicker | null} */
    flicker = null; // Brightness waver.

    /** @type {Bloom | null} */
    bloom = null; // Soft glow on bright areas.

    // true when WebGPU is active and post-process effects are registered.
    effectsAvailable = false;

    // --- TV fault state machine ---
    // glitchCooldown counts down ticks until the next fault fires.
    // glitchTicksLeft counts down ticks while a fault is running.
    // glitchDuration remembers how long the current fault was supposed to last
    //   (used to compute a smooth 0..1 envelope so faults ease in and out).
    // glitchType is a string like 'hshift' saying which fault is active.
    // glitchPeak is how strong this particular fault burst is (0..1).
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

    /**
     * Called once at startup. Sets the tiny screen resolution, the 3x upscale
     * buffer, and the nearest-neighbor filter, and turns the engine overlay off.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            // Tiny 80x60 logical canvas.
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),

            // 3x upscale to 240x180. CRT effects run on this larger buffer.
            drawingBufferSize: new Vector2i(OUTPUT_W, OUTPUT_H),

            // Keep each logical pixel as a crisp hard-edged square.
            // The CRT effects layer on top and add the soft, curved-glass look.
            outputUpscaleFilter: 'nearest',

            // Engine overlay disabled so its HUD never covers the CRT image.
            // The small kit status chip drawn in render() takes over its job.
            isOverlayEnabled: false,
        };
    }

    /**
     * Runs once before the loop starts. Sets up the palette, loads the sprite,
     * centers it, and (when WebGPU is available) registers the Orava CRT effects.
     *
     * "async" and "await" pause this function while the PNG downloads from the
     * server - think of it like pressing Pause on a video and waiting for it to buffer.
     *
     * @returns {Promise<boolean>} true when everything is ready.
     */
    async init() {
        // --- Palette setup ---
        // BT.paletteCreate(256) makes a fresh numbered list with 256 empty color slots.
        this.palette = BT.paletteCreate(256);

        // Color32(Red, Green, Blue) - each value is 0 (none) to 255 (maximum).
        this.palette.set(C_BG, new Color32(160, 160, 160)); // Light gray background.

        // Read every unique color in the logo PNG and store them starting at SPRITE_BASE.
        // The engine must know these colors before it can draw palette-indexed sprites.
        await SpriteSheet.loadColorsIntoPalette(SPRITE_URL, this.palette, SPRITE_BASE);

        // Turn the full-color PNG into a palette-indexed sprite ready for BT.drawSprite.
        // loadIndexed() also returns srcRect, which covers the whole single-sprite sheet.
        const indexed = await SpriteSheet.loadIndexed(SPRITE_URL, this.palette, SPRITE_BASE, { sort: 'none' });
        this.spriteSheet = indexed.sheet;
        this.spriteRect = indexed.srcRect;

        // Install the shared UI kit colors for the status chip drawn in render().
        // The scene only uses slot 1 (background) and slots 3-5 (the logo's three
        // colors loaded above), so the kit's default range 240-251 - way up at the
        // top of the palette - is provably free.
        applyTheme(this.palette);

        // Activate our palette. Every draw call from here on uses these colors.
        BT.paletteSet(this.palette);

        // --- Center the sprite ---
        // BT.displaySize is the logical 80x60 canvas.
        // Subtracting half the sprite size from half the screen size gives the top-left
        // corner position that puts the sprite's CENTER at the screen's CENTER.
        const screen = BT.displaySize;

        this.pos = new Vector2i(
            Math.floor(screen.x / 2 - this.spriteSheet.size.x / 2),
            Math.floor(screen.y / 2 - this.spriteSheet.size.y / 2),
        );

        // --- Post-process effects (WebGPU only) ---
        // isAvailable() checks BT.activeBackend === 'webgpu'. If the browser falls back
        // to the Canvas 2D software renderer, we skip all effect setup and show a note.
        this.effectsAvailable = isAvailable();

        if (!this.effectsAvailable) {
            // Software renderer: update() never runs the CRT state machine, so there is nothing to schedule.
            return true;
        }

        // Pixel-tier: horizontal band shift that mimics a TV losing its horizontal hold.
        // This runs BEFORE the palette-to-RGBA resolve step, so it shifts the raw
        // palette-index rows - each shifted row is then resolved to a different RGBA color.
        // intensity = 0 means no shift right now; it spikes up during H-HOLD faults.
        this.pixelGlitch = new PixelGlitch();
        this.pixelGlitch.bandHeight = 2; // Two logical-pixel-tall bands (our screen is only 60 px tall).
        this.pixelGlitch.intensity = 0;
        BT.effectAdd(this.pixelGlitch);

        // Display-tier: the effects below run on the full 240x180 RGBA buffer after upscaling.

        // Chromatic aberration splits red and blue channels slightly at bright edges.
        // On a B/W CRT this is very faint; we only raise it during fault bursts.
        this.aberration = new ChromaticAberration();
        this.aberration.aberration = ABERRATION_BASE;

        // Interference layers a faint ghost copy of the picture over itself.
        // On a real TV this appears when a signal bounces off a wall before reaching the aerial.
        this.interference = new Interference();
        this.interference.amount = INTERFERENCE_BASE;

        // RollLine simulates the bright horizontal scan band that sweeps top-to-bottom
        // on a CRT. You can see it clearly on old TV footage: a slightly bright line
        // drifting through the picture.
        this.rollLine = new RollLine();
        this.rollLine.amount = ROLL_BASE;
        this.rollLine.speed = ROLL_SPEED;

        // Scanlines darken alternate rows to recreate the gaps between phosphor lines.
        // density = DISPLAY_H aligns one scanline pair per logical pixel row (every 3 output pixels).
        // strength = negative values darken; -40 is a strong darkening (built-in CRT presets use -7 to -8).
        this.scanlines = new Scanlines();
        this.scanlines.amount = 0.05;
        this.scanlines.strength = -40;
        this.scanlines.density = DISPLAY_H;

        // RGBMask adds a subpixel pattern across the whole output image.
        //
        // How it works:
        //   size = how many output pixels make up one full R-G-B cycle.
        //   size = 3 → each subpixel is exactly 1 output pixel wide: R | G | B | R | G | B …
        //   That is the same layout as a real LCD or OLED display (RGB stripe).
        //
        //   With our 3x upscale each logical pixel is 3 output pixels wide, so one
        //   full R-G-B cycle happens to line up exactly with one logical pixel here.
        //   On a real screen the physical subpixel grid is independent of the game's
        //   pixel grid, but the stripe look is the same either way.
        //
        //   border = 0 disables the cell-edge darkening AND the vertical stagger that
        //   was causing each logical pixel to look like a 2×2 block of subpixels.
        //   With border = 0 you get clean horizontal-only RGB stripes.
        this.mask = new RGBMask();
        this.mask.intensity = 0.05;
        this.mask.size = 3;
        this.mask.border = 0;

        // Vignette darkens the corners slightly, like the shadow cast by a CRT bezel.
        this.vignette = new Vignette();
        this.vignette.amount = 0.1;

        // Noise adds a tiny random grain on every pixel, every frame.
        // On a real CRT this is thermal noise in the electron gun. amount = 0.038 is very faint.
        this.noise = new Noise();
        this.noise.amount = NOISE_BASE;

        // Flicker multiplies the overall brightness each frame.
        // amount = 1.0 is fully bright; during a "dim" fault it dips toward FLICKER_DIP.
        this.flicker = new Flicker();
        this.flicker.amount = FLICKER_BASE;

        // Bloom adds a soft glow around bright areas - the phosphor afterglow of a hot CRT.
        // spread controls the glow radius; glow controls how much it brightens the surroundings.
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

        // Pick a random delay before the first TV fault burst.
        this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
        this.bandWobbleCooldown = randInt(BAND_WOBBLE_COOLDOWN_MIN, BAND_WOBBLE_COOLDOWN_MAX);

        return true;
    }

    /**
     * Called at 60 ticks per second. The logo never moves, so we only need
     * to drive the CRT effect state machine here.
     */
    update() {
        if (this.effectsAvailable) {
            this.updateCrtEffects();
        }
    }

    /**
     * Called once per screen refresh. The logo does not move so this is simple:
     * clear the screen, draw the sprite at its fixed center position, then draw
     * the little status chip with the shared UI kit.
     */
    render() {
        // Erase the previous frame so nothing trails or ghosts.
        BT.clear(C_BG);

        // Draw the logo on top, centered.
        // paletteOffset = 0 keeps the original sprite colors.
        if (this.spriteSheet && this.spriteRect) {
            BT.drawSprite(this.spriteSheet, this.spriteRect, this.pos, 0);
        }

        // --- Status chip (shared UI kit) ---
        // The engine overlay is disabled in configure(), so this tiny one-row panel
        // is the only readout: it says whether the Orava CRT stack is running and
        // which TV fault is firing right now. Because it is drawn onto the 80x60
        // picture BEFORE the post-process step, the CRT effects wash over it too.
        // The screen is tiny, so margin, padding, and the words stay very small.
        ui.begin('bottomLeft', { margin: 2, pad: 2 });

        // panel() with no title gives the chip a dark background and border, so the
        // text stays readable on top of the light gray backdrop.
        ui.panel();

        if (!this.effectsAvailable) {
            // Software renderer: no post-process. The usual shared fallback note is
            // far too long for an 80-pixel-wide screen, so we show a short version.
            ui.label('CRT OFF', { color: 'warm' });
            ui.label('No WebGPU', { color: 'dim' });
        } else if (this.glitchTicksLeft > 0) {
            // A fault burst is running: show its friendly name and how strong this
            // particular burst is, like "H-HOLD 82%". Math.round() turns the 0..1
            // strength into the nearest whole percentage.
            const pct = Math.round(this.glitchPeak * 100);
            ui.label(`${GLITCH_LABELS[this.glitchType]} ${pct}%`, { color: 'warm' });
        } else {
            // Calm between faults: just confirm the CRT stack is on.
            ui.label('CRT ON', { color: 'dim' });
        }

        ui.end();
    }

    /**
     * Advances the TV fault state machine and the subtle band-wobble system.
     * Called every tick from update() when WebGPU effects are active.
     *
     * The machine has two layers:
     *   1. TV fault bursts - dramatic, infrequent, random type (H-HOLD, snow, etc.).
     *   2. Band wobble - mild pixel-tier jitter, always separate from fault bursts.
     */
    updateCrtEffects() {
        // Feed the current engine time into effects that need it for animation.
        // BT.timeSeconds is the total elapsed seconds since the demo started.
        const seconds = BT.timeSeconds;
        this.rollLine.time = seconds;
        this.noise.time = seconds;
        this.interference.time = seconds;

        // --- TV fault burst ---
        if (this.glitchTicksLeft > 0) {
            // We are inside a fault burst. Compute a smooth envelope (0..1..0) so
            // the fault eases in and out rather than snapping on and off instantly.
            // t = 0 at the start of the burst, t = 1 at the end.
            const t = 1 - (this.glitchTicksLeft - 1) / this.glitchDuration;
            const envelope = Math.sin(t * Math.PI); // Sine gives a bell-curve shape: 0 at edges, 1 at peak.

            this.applyRestingCrtUniforms();
            this.applyGlitchUniforms(envelope);

            this.glitchTicksLeft--;

            if (this.glitchTicksLeft <= 0) {
                // Burst finished - schedule the next cooldown and reset band-wobble too.
                this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
                this.bandWobbleCooldown = randInt(BAND_WOBBLE_COOLDOWN_MIN, BAND_WOBBLE_COOLDOWN_MAX);
            }

            // Return early: do not run the rest of the state machine during a burst.
            return;
        }

        // No fault active: apply the calm resting look.
        this.applyRestingCrtUniforms();

        // --- Band wobble (pixel-tier mild jitter) ---
        if (this.bandWobbleActive > 0) {
            // Same bell-curve envelope as fault bursts, but smaller intensity.
            const t = 1 - (this.bandWobbleActive - 1) / this.bandWobbleDuration;
            const envelope = Math.sin(t * Math.PI);
            this.pixelGlitch.intensity = BAND_WOBBLE_INTENSITY * envelope;
            this.pixelGlitch.seed = this.bandWobbleSeed;
            this.bandWobbleActive--;

            if (this.bandWobbleActive <= 0) {
                this.pixelGlitch.intensity = 0;
                this.bandWobbleCooldown = randInt(BAND_WOBBLE_COOLDOWN_MIN, BAND_WOBBLE_COOLDOWN_MAX);
            }
        } else {
            this.bandWobbleCooldown--;

            if (this.bandWobbleCooldown <= 0) {
                // Start a new band-wobble burst.
                this.bandWobbleDuration = randInt(BAND_WOBBLE_ACTIVE_MIN, BAND_WOBBLE_ACTIVE_MAX);
                this.bandWobbleActive = this.bandWobbleDuration;
                this.bandWobbleSeed = Math.random() * 1000; // Different seed = different row pattern.
            }
        }

        // --- Cooldown before the next TV fault ---
        this.glitchCooldown--;

        if (this.glitchCooldown <= 0) {
            // Time for a fault! Pick a random type and intensity.
            this.glitchType = randPick(GLITCH_TYPES);
            this.glitchDuration = randInt(GLITCH_ACTIVE_MIN, GLITCH_ACTIVE_MAX);
            this.glitchTicksLeft = this.glitchDuration;
            this.glitchPeak = randFloat(GLITCH_INTENSITY_MIN, GLITCH_INTENSITY_MAX);
            this.pixelGlitch.seed = Math.random() * 1000;
        }
    }

    /**
     * Resets all effect uniforms to the calm, between-faults Orava CRT look.
     * Called every tick, then overridden by applyGlitchUniforms during a fault.
     */
    applyRestingCrtUniforms() {
        this.pixelGlitch.intensity = 0;
        this.aberration.aberration = ABERRATION_BASE;
        this.noise.amount = NOISE_BASE;
        this.flicker.amount = FLICKER_BASE;
        this.interference.amount = INTERFERENCE_BASE;
        this.rollLine.amount = ROLL_BASE;
        this.rollLine.speed = ROLL_SPEED;
    }

    /**
     * Modifies effect uniforms to simulate one of the five Orava TV faults.
     * The envelope argument is a 0..1 value (bell-curve shaped) that controls
     * how strong the fault is at this moment in its lifetime.
     *
     * @param {number} envelope - 0 at the start and end of a burst, peaks at 1 in the middle.
     */
    applyGlitchUniforms(envelope) {
        // peak is how strong this specific burst is, scaled by the bell-curve envelope.
        const peak = this.glitchPeak * envelope;

        if (this.glitchType === 'hshift') {
            // H-HOLD: horizontal band shift in the pixel-tier index buffer.
            // The image looks like it slipped sideways on the tube.
            this.pixelGlitch.intensity = peak;

            // The torn edges also pick up a faint red/blue fringe, like a real set
            // struggling to keep the picture aligned during a horizontal-hold fault.
            this.aberration.aberration = ABERRATION_BASE + peak * 4;
        } else if (this.glitchType === 'noise') {
            // SNOW: extra random grain on top of the base noise.
            this.noise.amount = NOISE_BASE + peak * 0.1;
        } else if (this.glitchType === 'flicker') {
            // DIM: the brightness drops as if the tube needs warming up.
            // Lerp from FLICKER_BASE down to FLICKER_DIP based on the envelope.
            this.flicker.amount = FLICKER_BASE - (FLICKER_BASE - FLICKER_DIP) * envelope;
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

// Hand our Demo class to the engine. bootstrap() sets up the canvas, picks a backend,
// creates one instance of Demo, then drives configure() -> init() -> update/render loop.
bootstrap(Demo);
