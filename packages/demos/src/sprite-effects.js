// Demo 010 - Sprite Effects: shows how to use palette offsets to create game effects.
//
// Prerequisites: 001-Basics (https://demos.blit386.dev/001-basics),
// 008-Sprites (https://demos.blit386.dev/008-sprites).
// Live article: https://vancura.dev/articles/blit386-sprite-effects
//
// In the palette-based rendering system, each sprite pixel stores a palette index.
// By drawing the same sprite with a different palette offset (the fourth argument
// to BT.drawSprite), every pixel shifts to a different color block in the palette.
// This replaces what older APIs called "tinting" (multiplying pixels by a color).
//
// Common uses in retro games:
//   - Damage flash: swap to a block of reds, then back to normal after 30 ticks
//   - Silhouette: use a block where all colors are black
//   - Ghost: a block where all colors have low alpha
//   - Team colors: separate pre-built blocks for red/blue/green teams
//   - Status effects: frozen (all shifted to cold blues), poisoned (pulsing greens)
//   - Day/night: a block dynamically updated every tick to reflect ambient light
//
// For STATIC effects (normal, silhouette, team red/blue/green, frozen): we build color
// blocks once in init() and never change them.
//
// For DYNAMIC effects (damage flash, ghost pulse, invincibility, poison, day/night):
// we update the color block in update() every tick and draw with that offset in render().
//
// We learned about palette offsets in Demo 008-Sprites:
// https://demos.blit386.dev/008-sprites
//
// FULLSCREEN CRT (Tesla Orava TV)
// The sprite grid is drawn at 640x400, then the engine resolves and upscales it and runs
// a display-tier stack tuned for 1970s Czechoslovak B/W CRT sets (Tesla Orava 131/226/229):
// curved tube, soft phosphor halation, scanlines, light bezel vignette, a roll band
// scrolling top-to-bottom, subtle offset-band wobble, and occasional TV faults (tear,
// snow, dim, ghost, roll). Same building blocks as demo 033; chroma split is omitted (B/W).
// Post-process needs WebGPU; the software renderer still shows the sprite effects without CRT.
//
// We learned about composing effects in 023-PipBoy CRT and 033-Basics Enhanced.
//
// Captions, the day/night legend, and the software fallback note are drawn with the shared
// UI kit (src/shared/ui.js), which installs its twelve UI colors high in the palette
// (slots 240-251) via applyTheme().

import {
    BarrelDistortion,
    Bloom,
    bootstrap,
    BT,
    Color32,
    Flicker,
    Interference,
    Noise,
    PixelGlitch,
    Rect2i,
    RGBMask,
    RollLine,
    Scanlines,
    SpriteSheet,
    Vector2i,
    Vignette,
} from 'blit386';

import { isAvailable, SOFTWARE_FALLBACK_NOTE } from './shared/post-process-backend.js';
import { randFloat, randInt, randPick } from './shared/rand.js';
import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').SpriteSheet} SpriteSheet */
/** @typedef {import('blit386').Rect2i} Rect2i */
/** @typedef {import('blit386').PixelGlitch} PixelGlitch */
/** @typedef {import('blit386').BarrelDistortion} BarrelDistortion */
/** @typedef {import('blit386').Interference} Interference */
/** @typedef {import('blit386').RollLine} RollLine */
/** @typedef {import('blit386').Scanlines} Scanlines */
/** @typedef {import('blit386').RGBMask} RGBMask */
/** @typedef {import('blit386').Vignette} Vignette */
/** @typedef {import('blit386').Noise} Noise */
/** @typedef {import('blit386').Flicker} Flicker */
/** @typedef {import('blit386').Bloom} Bloom */

// Where sprite colors start in the palette. The 13 theme blocks stack upward from here:
// with the 6-color test sprite the top block ends at slot 89, far below the shared UI
// theme colors at slots 240-251.
const COLOR_BASE = 12;

// Palette slots of the shared UI theme. applyTheme() in init() writes the twelve UI kit
// colors into slots 240-251 (its default start slot). configure() runs BEFORE init(), so
// the overlay styles below cannot read this.theme yet - these constants spell out where
// each theme color will land once init() runs.
const UI_BG = 240; // 'ui_bg' - deep navy screen background.
const UI_TEXT = 244; // 'ui_text' - off-white primary text.
const UI_DIM = 245; // 'ui_text_dim' - secondary gray text.
const UI_HEADER = 246; // 'ui_header' - warm amber (render bars, chart warnings).
const UI_ACCENT = 247; // 'ui_accent' - phosphor green (update bars).
const UI_WARM = 248; // 'ui_accent_warm' - orange (chart error frames).
const UI_INFO = 249; // 'ui_info' - light blue (chart tags).

// Theme block indices (as palette offsets from COLOR_BASE).
// Each block contains one entry per unique sprite color - that count lives in
// this.colorCount, extracted in init(). Offset = blockIndex * colorCount.
// Blocks 0..7 are static; blocks 8..12 are dynamic (updated in update()).
//
// Block 0 (offset 0):                 Original stone colors.
// Block 1 (offset colorCount):        Silhouette - all colors near-black.
// Block 2 (offset 2 * colorCount):    Damage white - all colors bright white.
// Block 3 (offset 3 * colorCount):    Damage red - all colors shifted red.
// Block 4 (offset 4 * colorCount):    Team red.
// Block 5 (offset 5 * colorCount):    Team blue.
// Block 6 (offset 6 * colorCount):    Team green.
// Block 7 (offset 7 * colorCount):    Frozen (cool blue).
// Block 8 (offset 8 * colorCount):    Damage flash (dynamic: toggling white/red).
// Block 9 (offset 9 * colorCount):    Ghost (dynamic: pulsing low alpha).
// Block 10 (offset 10 * colorCount):  Invincibility (dynamic: hue rotation).
// Block 11 (offset 11 * colorCount):  Poison (dynamic: pulsing green brightness).
// Block 12 (offset 12 * colorCount):  Day/night ambient (dynamic: brightness cycle).

const BLOCK_ORIGINAL = 0;
const BLOCK_SILHOUETTE = 1;
const BLOCK_DAMAGE_WHITE = 2;
const BLOCK_DAMAGE_RED = 3;
const BLOCK_TEAM_RED = 4;
const BLOCK_TEAM_BLUE = 5;
const BLOCK_TEAM_GREEN = 6;
const BLOCK_FROZEN = 7;
const BLOCK_DAMAGE_FLASH = 8; // Dynamic.
const BLOCK_GHOST = 9; // Dynamic.
const BLOCK_INVINCIBLE = 10; // Dynamic.
const BLOCK_POISON = 11; // Dynamic.
const BLOCK_DAYNIGHT = 12; // Dynamic.

// Logical game resolution (where render() draws). The demos page scales this up on screen.
const DISPLAY_W = 640;
const DISPLAY_H = 400;

// How large the canvas may appear in the browser (3x logical, crisp CSS upscale).
const MAX_CANVAS_W = DISPLAY_W * 3;
const MAX_CANVAS_H = DISPLAY_H * 3;

// Display-tier CRT runs on the upscaled RGBA buffer (3x logical, like demo 033).
const OUTPUT_W = DISPLAY_W * 3;
const OUTPUT_H = DISPLAY_H * 3;

// Analog-TV glitch bursts (ticks at default 60 FPS).
const GLITCH_COOLDOWN_MIN = 150;
const GLITCH_COOLDOWN_MAX = 420;
const GLITCH_ACTIVE_MIN = 4;
const GLITCH_ACTIVE_MAX = 24;
const GLITCH_INTENSITY_MIN = 0.3;
const GLITCH_INTENSITY_MAX = 0.95;

// Orava B/W: horizontal tear, snow, brightness waver, ghosting, vertical roll (no chroma split).
const GLITCH_TYPES = ['hshift', 'noise', 'flicker', 'interference', 'vroll'];
const GLITCH_LABELS = {
    none: 'NONE',
    hshift: 'H-HOLD',
    noise: 'SNOW',
    flicker: 'DIM',
    interference: 'GHOST',
    vroll: 'V-ROLL',
};

// The shared fallback note is one long sentence. split('. ') cuts the string at the
// sentence break, giving us an array of two shorter lines the UI kit can draw one under
// the other when the software renderer is active (same pattern as demo 033).
const FALLBACK_LINES = SOFTWARE_FALLBACK_NOTE.split('. ');

const FLICKER_BASE = 1.0;
const FLICKER_DIP = 0.78;
const NOISE_BASE = 0.038;
// Always-on bright band scrolling top to bottom (RollLine).
const ROLL_BASE = 0.26;
const ROLL_SPEED = 0.92;
const INTERFERENCE_BASE = 0;

// Occasional subtle horizontal band offset (PixelGlitch), separate from TV fault bursts.
const BAND_WOBBLE_COOLDOWN_MIN = 100;
const BAND_WOBBLE_COOLDOWN_MAX = 280;
const BAND_WOBBLE_ACTIVE_MIN = 3;
const BAND_WOBBLE_ACTIVE_MAX = 10;
const BAND_WOBBLE_INTENSITY = 0.11;

/**
 * Spins the CPU until roughly `ms` milliseconds have passed.
 * The timing chart maps bar height from real update()/render() time; this demo adds
 * a gentle pulse so the scrolling bars are easy to see while you watch the effects.
 *
 * @param {number} ms - Target delay in milliseconds.
 */
function burnCpuMs(ms) {
    if (ms <= 0) {
        return;
    }

    // performance.now() returns a high-resolution clock in milliseconds.
    const deadline = performance.now() + ms;

    while (performance.now() < deadline) {
        // Empty loop on purpose: we are waiting for the clock, not doing useful work.
    }
}

/**
 * Demonstrates palette-offset based sprite effects.
 * Static effects are pre-built in init(); dynamic effects update in update().
 *
 * @implements {IBTDemo}
 */
class Demo {
    // The palette holds all colors for this demo.
    /** @type {Palette | null} */
    palette = null;

    // The sprite sheet loaded from /sprites/test.png.
    /** @type {SpriteSheet | null} */
    sheet = null;

    // The source rectangle for the rock sprite.
    /** @type {Rect2i | null} */
    charRect = null;

    // How many unique colors the sprite has - every theme block is this many
    // palette slots wide. Computed in init() after the colors are extracted.
    colorCount = 0;

    // Slot map for the shared UI kit theme, filled in init() by applyTheme().
    // theme.bg, theme.panel, and friends are palette indices for our own drawing.
    theme = null;

    // The extracted original Color32 objects (used to build theme blocks).
    baseColors = [];

    // animTime drives all dynamic effects.
    animTime = 0;

    // Which tick the last "damage event" occurred on (for the damage flash).
    damageFlashTick = 0;

    /** @type {PixelGlitch | null} */
    pixelGlitch = null;
    /** @type {BarrelDistortion | null} */
    barrel = null;
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

    effectsAvailable = false;
    glitchCooldown = 0;
    // How many ticks the current TV fault burst still has to run (0 = no burst active).
    glitchTicksLeft = 0;
    glitchDuration = 0;
    glitchType = 'none';
    glitchPeak = 0;

    bandWobbleCooldown = 0;
    // How many ticks the current band wobble still has to run (0 = no wobble active).
    bandWobbleTicksLeft = 0;
    bandWobbleDuration = 0;
    bandWobbleSeed = 0;

    overlayRowData = [
        { leftText: 'Orava CRT OFF', textPaletteIndex: UI_TEXT },
        { leftText: 'TV fault NONE', textPaletteIndex: UI_HEADER },
    ];

    /**
     * Wider logical screen for the sprite grid; display-tier Orava CRT runs at 3x upscale.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            drawingBufferSize: new Vector2i(OUTPUT_W, OUTPUT_H),
            maxCanvasSize: new Vector2i(MAX_CANVAS_W, MAX_CANVAS_H),
            outputUpscaleFilter: 'nearest',
            isOverlayPaletteEnabled: true,

            // Opt in to the engine timing chart band under the title row.
            // overlayTimingChartHeight sets band height in pixels (default 22).
            isOverlayTimingChartEnabled: true,
            overlayTimingChartHeight: 64,
            overlayTimingChartDiagnostics: 'rich',
            isOverlayRendererDiagnosticsBarEnabled: true,
            overlayStyle: {
                barPaletteIndex: UI_BG,
                textPaletteIndex: UI_DIM,
                gapPaletteIndex: UI_BG,
            },
            overlayTimingChartStyle: {
                updateBarPaletteIndex: UI_ACCENT,
                renderBarPaletteIndex: UI_HEADER,
                warningPaletteIndex: UI_HEADER,
                errorPaletteIndex: UI_WARM,
                tagPaletteIndex: UI_INFO,
            },
        };
    }

    /**
     * Sets up the palette, builds all 13 theme blocks, and loads the sprite.
     *
     * @returns {Promise<boolean>} Returns true when everything is ready.
     */
    async init() {
        console.log('[SpriteEffectsDemo] Initializing...');

        this.palette = BT.paletteCreate(256);

        // Install the shared UI theme: applyTheme() writes the twelve UI kit colors into
        // high palette slots (240-251), far above the sprite theme blocks (slots 12-89
        // with the 6-color test sprite), and returns a map of friendly names to those
        // slots (this.theme.bg, .panel, ...). All captions and legends draw with these.
        this.theme = applyTheme(this.palette);

        // Extract sprite colors
        // Ask the engine to scan the PNG and add every unique color it finds into our palette,
        // starting at COLOR_BASE. The returned array is the same colors in palette-write order
        // (sorted darkest-first by brightness). We keep them so the theme-block builders can
        // tint each base color and write the result into a higher slot.
        this.baseColors = await SpriteSheet.loadColorsIntoPalette('/sprites/test.png', this.palette, COLOR_BASE);
        const colorCount = this.baseColors.length;
        this.colorCount = colorCount;

        // Build the 8 static theme blocks
        // Each block sits at COLOR_BASE + blockIndex * colorCount.
        this.buildStaticThemeBlocks();

        // Dynamic blocks (8..12) start as copies of the original.
        // update() will replace them each tick.
        for (let block = BLOCK_DAMAGE_FLASH; block <= BLOCK_DAYNIGHT; block++) {
            for (let i = 0; i < colorCount; i++) {
                const base = this.baseColors[i];
                this.palette.set(COLOR_BASE + block * colorCount + i, new Color32(base.r, base.g, base.b, base.a));
            }
        }

        // Load and indexize sprite
        try {
            const indexed = await SpriteSheet.loadIndexed('/sprites/test.png', this.palette, COLOR_BASE, {
                sort: 'none',
            });
            this.sheet = indexed.sheet;
            this.charRect = this.sheet.fullRect();
            BT.paletteSet(this.palette);
            console.log(`[SpriteEffectsDemo] Loaded sprite: ${this.charRect.width}x${this.charRect.height}px`);
        } catch (error) {
            console.error('[SpriteEffectsDemo] Failed to load sprite:', error);
            return false;
        }

        this.effectsAvailable = isAvailable();

        if (!this.effectsAvailable) {
            this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
            this.glitchTicksLeft = 0;
            this.glitchDuration = 0;
            this.glitchType = 'none';
            this.glitchPeak = 0;
            console.log('[SpriteEffectsDemo] Initialization complete (no CRT stack).');
            return true;
        }

        // Build the full Orava CRT effect chain (see setupCrtStack() below render()).
        this.setupCrtStack();

        this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
        this.glitchTicksLeft = 0;
        this.glitchDuration = 0;
        this.glitchType = 'none';
        this.glitchPeak = 0;

        this.bandWobbleCooldown = randInt(BAND_WOBBLE_COOLDOWN_MIN, BAND_WOBBLE_COOLDOWN_MAX);
        this.bandWobbleTicksLeft = 0;
        this.bandWobbleDuration = 0;

        console.log('[SpriteEffectsDemo] Initialization complete!');
        return true;
    }

    /**
     * Advances animTime and updates all five dynamic theme blocks.
     *
     * The damage flash toggles between Block 2 (white) and Block 3 (red) every 3 ticks.
     * Ghost pulses alpha between 40 and 180.
     * Invincibility rotates hue around the color wheel.
     * Poison pulses brightness up and down.
     * Day/night smoothly cycles brightness over 20 seconds.
     */
    update() {
        this.animTime += BT.deltaSeconds;

        if (!this.colorCount) {
            return;
        }

        // Trigger a damage event every 3 seconds (180 ticks).
        if (BT.ticks % 180 === 0) {
            this.damageFlashTick = BT.ticks;
        }

        this.updateDamageFlashBlock();
        this.updateGhostBlock();
        this.updateInvincibleBlock();
        this.updatePoisonBlock();
        this.updateDayNightBlock();

        if (this.effectsAvailable) {
            this.updateCrtEffects();
        }

        // Extra update() work so the overlay timing chart shows green scrolling bars.
        // Math.sin swings between -1 and 1; * 0.5 + 0.5 remaps that to 0..1 for a smooth pulse.
        const chartUpdateLoadMs = 2 + (Math.sin(BT.timeSeconds * 1.5) * 0.5 + 0.5) * 8;
        burnCpuMs(chartUpdateLoadMs);
    }

    /**
     * Runs once per screen refresh to draw all the sprite effect demonstrations.
     * Notice: NO Color32 objects appear in draw calls - only palette indices and offsets.
     */
    render() {
        // Clear the whole screen with the shared UI theme's background color.
        BT.clear(this.theme.bg);

        // Extra render() work so the timing chart shows yellow scrolling bars.
        const chartRenderLoadMs = 1 + (Math.cos(BT.timeSeconds * 2.2) * 0.5 + 0.5) * 6;
        burnCpuMs(chartRenderLoadMs);

        // Draw both effect rows.
        this.renderStaticEffects();
        this.renderDynamicEffects();

        // Day/night cycle at the bottom.
        this.renderDayNightCycle();

        // Software renderer: warn on-canvas that the Orava CRT look is missing. A small
        // borderless kit group in the top-left corner; the shared note was split into
        // two lines up top (FALLBACK_LINES) so it stays short and easy to read.
        if (!this.effectsAvailable) {
            ui.begin('topLeft', { margin: 2, pad: 2 });
            for (const line of FALLBACK_LINES) {
                ui.label(line, { color: 'warm' });
            }
            ui.end();
        }
    }

    /**
     * Orava CRT stack and current analog-TV fault (overlay custom rows).
     *
     * @returns {readonly { leftText: string }[]}
     */
    overlayRows() {
        if (this.effectsAvailable) {
            this.overlayRowData[0].leftText = 'Orava CRT ON';
            const faultLabel = GLITCH_LABELS[this.glitchType] ?? 'NONE';
            const faultValue = this.glitchTicksLeft > 0 ? Math.round(this.glitchPeak * 100) : 0;
            this.overlayRowData[1].leftText = `TV fault ${faultLabel} ${String(faultValue).padStart(2, '0')}%`;
        } else {
            // Software renderer: no CRT stack, so the fault machine never fires. The full
            // explanation lives on the canvas itself (see render()), not in the overlay.
            this.overlayRowData[0].leftText = 'Orava CRT OFF (software)';
            this.overlayRowData[1].leftText = 'TV fault NONE';
        }

        return this.overlayRowData;
    }

    /**
     * Builds the Orava CRT effect chain once in init(): the pixel-tier band tear plus
     * the display-tier tube look, in back-to-front order.
     */
    setupCrtStack() {
        // Pixel tier: indexed-buffer horizontal band tear (V-hold style).
        this.pixelGlitch = new PixelGlitch();
        this.pixelGlitch.bandHeight = 4;
        this.pixelGlitch.intensity = 0;
        BT.effectAdd(this.pixelGlitch);

        // Display tier: Tesla Orava B/W tube - curved glass, faint grille, soft halation.
        this.barrel = new BarrelDistortion();
        this.barrel.curvature = 0.07;

        this.interference = new Interference();
        this.interference.amount = INTERFERENCE_BASE;

        this.rollLine = new RollLine();
        this.rollLine.amount = ROLL_BASE;
        this.rollLine.speed = ROLL_SPEED;

        this.scanlines = new Scanlines();
        this.scanlines.amount = 0.42;
        this.scanlines.strength = -7;
        this.scanlines.density = DISPLAY_H;

        this.mask = new RGBMask();
        this.mask.intensity = 0.07;
        this.mask.size = 5;
        this.mask.border = 0.45;

        this.vignette = new Vignette();
        this.vignette.amount = 0.1;

        this.noise = new Noise();
        this.noise.amount = NOISE_BASE;

        this.flicker = new Flicker();
        this.flicker.amount = FLICKER_BASE;

        this.bloom = new Bloom();
        this.bloom.spread = 2.2;
        this.bloom.glow = 0.09;

        for (const fx of [
            this.barrel,
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
    }

    /**
     * Drives RollLine scroll, TV fault bursts, and occasional subtle band offset wobble.
     */
    updateCrtEffects() {
        const seconds = BT.timeSeconds;
        this.rollLine.time = seconds;
        this.noise.time = seconds;
        this.interference.time = seconds;

        if (this.glitchTicksLeft > 0) {
            const t = 1 - (this.glitchTicksLeft - 1) / this.glitchDuration;
            const envelope = Math.sin(t * Math.PI);
            this.applyRestingCrtUniforms();
            this.applyGlitchUniforms(envelope);
            this.glitchTicksLeft--;
            if (this.glitchTicksLeft <= 0) {
                this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
                this.bandWobbleCooldown = randInt(BAND_WOBBLE_COOLDOWN_MIN, BAND_WOBBLE_COOLDOWN_MAX);
            }
            return;
        }

        this.applyRestingCrtUniforms();

        if (this.bandWobbleTicksLeft > 0) {
            const t = 1 - (this.bandWobbleTicksLeft - 1) / this.bandWobbleDuration;
            const envelope = Math.sin(t * Math.PI);
            this.pixelGlitch.intensity = BAND_WOBBLE_INTENSITY * envelope;
            this.pixelGlitch.seed = this.bandWobbleSeed;
            this.bandWobbleTicksLeft--;
            if (this.bandWobbleTicksLeft <= 0) {
                this.pixelGlitch.intensity = 0;
                this.bandWobbleCooldown = randInt(BAND_WOBBLE_COOLDOWN_MIN, BAND_WOBBLE_COOLDOWN_MAX);
            }
        } else {
            this.bandWobbleCooldown--;
            if (this.bandWobbleCooldown <= 0) {
                this.bandWobbleDuration = randInt(BAND_WOBBLE_ACTIVE_MIN, BAND_WOBBLE_ACTIVE_MAX);
                this.bandWobbleTicksLeft = this.bandWobbleDuration;
                this.bandWobbleSeed = Math.random() * 1000;
            }
        }

        this.glitchCooldown--;
        if (this.glitchCooldown <= 0) {
            this.glitchType = randPick(GLITCH_TYPES);
            this.glitchDuration = randInt(GLITCH_ACTIVE_MIN, GLITCH_ACTIVE_MAX);
            this.glitchTicksLeft = this.glitchDuration;
            this.glitchPeak = randFloat(GLITCH_INTENSITY_MIN, GLITCH_INTENSITY_MAX);
            this.pixelGlitch.seed = Math.random() * 1000;
        }
    }

    /** Resting Orava CRT look: scrolling roll band plus calm noise/flicker. */
    applyRestingCrtUniforms() {
        this.pixelGlitch.intensity = 0;
        this.noise.amount = NOISE_BASE;
        this.flicker.amount = FLICKER_BASE;
        this.interference.amount = INTERFERENCE_BASE;
        this.rollLine.amount = ROLL_BASE;
        this.rollLine.speed = ROLL_SPEED;
    }

    /**
     * @param {number} envelope
     */
    applyGlitchUniforms(envelope) {
        const peak = this.glitchPeak * envelope;

        if (this.glitchType === 'hshift') {
            this.pixelGlitch.intensity = peak;
        } else if (this.glitchType === 'noise') {
            this.noise.amount = NOISE_BASE + peak * 0.1;
        } else if (this.glitchType === 'flicker') {
            this.flicker.amount = FLICKER_BASE - (FLICKER_BASE - FLICKER_DIP) * envelope;
        } else if (this.glitchType === 'interference') {
            this.interference.amount = peak * 0.07;
        } else if (this.glitchType === 'vroll') {
            this.rollLine.amount = ROLL_BASE + peak * 0.35;
            this.rollLine.speed = ROLL_SPEED + peak * 1.8;
        }
    }

    /**
     * Builds the 8 static theme blocks by transforming the base colors.
     * Called once in init() - these never change after setup.
     */
    buildStaticThemeBlocks() {
        // Block 0 (original) is already filled by SpriteSheet.loadColorsIntoPalette above.
        // n is how many unique colors the sprite has - every block is n slots wide.
        const n = this.colorCount;

        for (let i = 0; i < n; i++) {
            const base = this.baseColors[i];

            // The average brightness of this pixel (0..255 range).
            const lum = Math.floor(base.luminance);

            // Block 1: Silhouette - near-black with slight variation to preserve depth cues.
            this.palette.set(
                COLOR_BASE + BLOCK_SILHOUETTE * n + i,
                new Color32(lum * 0.08, lum * 0.08, lum * 0.1, base.a),
            );

            // Block 2: Damage white - everything shifted toward bright white.
            const whitened = Math.floor(128 + lum * 0.5);
            this.palette.set(
                COLOR_BASE + BLOCK_DAMAGE_WHITE * n + i,
                new Color32(whitened, whitened, whitened, base.a),
            );

            // Block 3: Damage red - everything shifted toward red.
            this.palette.set(
                COLOR_BASE + BLOCK_DAMAGE_RED * n + i,
                new Color32(Math.min(255, lum + 80), lum * 0.3, lum * 0.3, base.a),
            );

            // Block 4: Team red - multiply base colors with a red tint.
            this.palette.set(
                COLOR_BASE + BLOCK_TEAM_RED * n + i,
                new Color32(
                    Math.min(255, Math.floor(base.r * 1.4)),
                    Math.floor(base.g * 0.5),
                    Math.floor(base.b * 0.5),
                    base.a,
                ),
            );

            // Block 5: Team blue - multiply with a blue tint.
            this.palette.set(
                COLOR_BASE + BLOCK_TEAM_BLUE * n + i,
                new Color32(
                    Math.floor(base.r * 0.5),
                    Math.floor(base.g * 0.7),
                    Math.min(255, Math.floor(base.b * 1.6)),
                    base.a,
                ),
            );

            // Block 6: Team green - multiply with a green tint.
            this.palette.set(
                COLOR_BASE + BLOCK_TEAM_GREEN * n + i,
                new Color32(
                    Math.floor(base.r * 0.5),
                    Math.min(255, Math.floor(base.g * 1.4)),
                    Math.floor(base.b * 0.5),
                    base.a,
                ),
            );

            // Block 7: Frozen - push toward cold blue-white.
            this.palette.set(
                COLOR_BASE + BLOCK_FROZEN * n + i,
                new Color32(Math.floor(lum * 0.7 + 40), Math.floor(lum * 0.8 + 40), Math.min(255, lum + 80), base.a),
            );
        }
    }

    /**
     * Damage flash: alternates between "all white" and "all red" every 3 ticks
     * for the first 30 ticks after damage. Fades back to normal after that.
     */
    updateDamageFlashBlock() {
        const flashAge = BT.ticks - this.damageFlashTick;
        const n = this.colorCount;

        for (let i = 0; i < n; i++) {
            const base = this.baseColors[i];
            const lum = Math.floor(base.luminance);

            let color;

            if (flashAge < 30) {
                // Math.floor(flashAge / 3) % 2 alternates 0 and 1 every 3 ticks.
                // 0 = show white flash; 1 = show red.
                const phase = Math.floor(flashAge / 3) % 2;
                const whitened = Math.floor(128 + lum * 0.5);
                const redShift = Math.min(255, lum + 80);

                color =
                    phase === 0
                        ? new Color32(whitened, whitened, whitened, base.a)
                        : new Color32(redShift, Math.floor(lum * 0.3), Math.floor(lum * 0.3), base.a);
            } else {
                // Outside the flash window: use the original color.
                color = new Color32(base.r, base.g, base.b, base.a);
            }

            this.palette.set(COLOR_BASE + BLOCK_DAMAGE_FLASH * n + i, color);
        }
    }

    /**
     * Ghost: the sprite appears semi-transparent with a blue-white tint.
     * Alpha pulses between 40 and 180 using a sine wave.
     */
    updateGhostBlock() {
        // Math.sin oscillates between -1 and 1; we shift it to 0..1.
        const pulse = Math.sin(this.animTime * 3) * 0.5 + 0.5;
        const alpha = Math.floor(40 + pulse * 140); // 40..180
        const n = this.colorCount;

        for (let i = 0; i < n; i++) {
            const base = this.baseColors[i];
            const lum = Math.floor(base.luminance);

            // Push toward a cool blue-white while reducing alpha.
            this.palette.set(
                COLOR_BASE + BLOCK_GHOST * n + i,
                new Color32(Math.floor(lum * 0.8 + 40), Math.floor(lum * 0.8 + 40), Math.min(255, lum + 60), alpha),
            );
        }
    }

    /**
     * Invincibility: cycles the entire sprite through the rainbow.
     * The hue rotates 200 degrees per second.
     */
    updateInvincibleBlock() {
        const hue = (this.animTime * 200) % 360;
        const n = this.colorCount;

        for (let i = 0; i < n; i++) {
            const base = this.baseColors[i];

            // fromHSL takes hue (0-360), saturation (0-100), lightness (0-100).
            // We use varying lightness so darker parts stay darker.
            const lum = base.luminance;
            const lightness = 30 + (lum / 255) * 40; // 30..70%
            const rainbow = Color32.fromHSL(hue, 100, lightness);

            this.palette.set(
                COLOR_BASE + BLOCK_INVINCIBLE * n + i,
                new Color32(rainbow.r, rainbow.g, rainbow.b, base.a),
            );
        }
    }

    /**
     * Poison: a green tint that pulses brighter and darker 5 times per second.
     */
    updatePoisonBlock() {
        const pulse = Math.sin(this.animTime * 5) * 0.2 + 0.8; // 0.6..1.0
        const n = this.colorCount;

        for (let i = 0; i < n; i++) {
            const base = this.baseColors[i];
            this.palette.set(
                COLOR_BASE + BLOCK_POISON * n + i,
                new Color32(
                    Math.floor(base.r * 0.5 * pulse),
                    Math.min(255, Math.floor(base.g * 1.4 * pulse)),
                    Math.floor(base.b * 0.5 * pulse),
                    base.a,
                ),
            );
        }
    }

    /**
     * Day/night: a brightness multiplier that cycles over 20 seconds (1200 ticks).
     * At midday the multiplier is ~1.0; at midnight it drops to ~0.3.
     */
    updateDayNightBlock() {
        const cycle = (BT.ticks % 1200) / 1200; // 0..1
        const brightness = (Math.cos(cycle * Math.PI * 2) + 1) * 0.35 + 0.3; // 0.3..1.0
        const n = this.colorCount;

        for (let i = 0; i < n; i++) {
            const base = this.baseColors[i];
            // Blend from a fixed cool night tint (slight blue) toward the sprite's daylight
            // colors as brightness approaches 1.
            // Color32.lerp(a, b, t): t=0 is all `a`, t=1 is all `b`; matches the old per-channel formula.
            const nightTint = new Color32(0, 0, 30, base.a);
            this.palette.set(COLOR_BASE + BLOCK_DAYNIGHT * n + i, Color32.lerp(nightTint, base, brightness));
        }
    }

    /**
     * Draws the first row: six static palette-offset effects.
     * Normal, Silhouette, Team Red/Blue/Green, Frozen.
     */
    renderStaticEffects() {
        const row1Y = 30;
        const spacing = 100;
        const n = this.colorCount;

        // Each cell is the same sprite drawn with a different palette offset, with a
        // named caption and a one-line "when you would use this" note under it.
        BT.drawSprite(this.sheet, this.charRect, new Vector2i(10, row1Y), BLOCK_ORIGINAL * n);
        ui.caption(6, row1Y + 36, 'Normal', { color: 'text' });
        ui.caption(6, row1Y + 48, 'Default look', { color: 'dim' });

        BT.drawSprite(this.sheet, this.charRect, new Vector2i(10 + spacing, row1Y), BLOCK_SILHOUETTE * n);
        ui.caption(6 + spacing, row1Y + 36, 'Silhouette', { color: 'text' });
        ui.caption(6 + spacing, row1Y + 48, 'Stealth / cutscene', { color: 'dim' });

        BT.drawSprite(this.sheet, this.charRect, new Vector2i(10 + spacing * 2, row1Y), BLOCK_TEAM_RED * n);
        ui.caption(6 + spacing * 2, row1Y + 36, 'Team Red', { color: 'warm' });
        ui.caption(6 + spacing * 2, row1Y + 48, 'Friendly fire team', { color: 'dim' });

        BT.drawSprite(this.sheet, this.charRect, new Vector2i(10 + spacing * 3, row1Y), BLOCK_TEAM_BLUE * n);
        ui.caption(6 + spacing * 3, row1Y + 36, 'Team Blue', { color: 'info' });
        ui.caption(6 + spacing * 3, row1Y + 48, 'Enemy squad color', { color: 'dim' });

        BT.drawSprite(this.sheet, this.charRect, new Vector2i(10 + spacing * 4, row1Y), BLOCK_TEAM_GREEN * n);
        ui.caption(6 + spacing * 4, row1Y + 36, 'Team Green', { color: 'accent' });
        ui.caption(6 + spacing * 4, row1Y + 48, 'Ally / coop team', { color: 'dim' });

        BT.drawSprite(this.sheet, this.charRect, new Vector2i(10 + spacing * 5, row1Y), BLOCK_FROZEN * n);
        ui.caption(6 + spacing * 5, row1Y + 36, 'Frozen', { color: 'info' });
        ui.caption(6 + spacing * 5, row1Y + 48, 'Slow freeze status', { color: 'dim' });
    }

    /**
     * Draws the second row: four dynamic palette-offset effects (updated in update()).
     * Damage Flash, Ghost, Invincibility, Poison.
     */
    renderDynamicEffects() {
        const row2Y = 100;
        const spacing = 100;
        const n = this.colorCount;

        BT.drawSprite(this.sheet, this.charRect, new Vector2i(10, row2Y), BLOCK_DAMAGE_FLASH * n);
        ui.caption(6, row2Y + 36, 'Damage', { color: 'warm' });
        ui.caption(6, row2Y + 48, 'Hit flash (white/red)', { color: 'dim' });

        BT.drawSprite(this.sheet, this.charRect, new Vector2i(10 + spacing, row2Y), BLOCK_GHOST * n);
        ui.caption(6 + spacing, row2Y + 36, 'Ghost', { color: 'info' });
        ui.caption(6 + spacing, row2Y + 48, 'Spirit / low alpha', { color: 'dim' });

        BT.drawSprite(this.sheet, this.charRect, new Vector2i(10 + spacing * 2, row2Y), BLOCK_INVINCIBLE * n);
        ui.caption(6 + spacing * 2, row2Y + 36, 'Invincible', { color: 'text' });
        ui.caption(6 + spacing * 2, row2Y + 48, 'Power-up star mode', { color: 'dim' });

        BT.drawSprite(this.sheet, this.charRect, new Vector2i(10 + spacing * 3, row2Y), BLOCK_POISON * n);
        ui.caption(6 + spacing * 3, row2Y + 36, 'Poisoned', { color: 'accent' });
        ui.caption(6 + spacing * 3, row2Y + 48, 'Poison over time', { color: 'dim' });
    }

    /**
     * Shows a day/night cycle effect: the sprite dims at night and brightens at noon.
     * A progress bar shows the current phase.
     */
    renderDayNightCycle() {
        const baseY = 178;
        const n = this.colorCount;

        ui.caption(10, baseY, 'Day/Night Cycle:', { color: 'header' });
        ui.caption(10, baseY + 12, 'Ambient light palette offset', { color: 'dim' });

        // Draw the sprite with the day/night block.
        BT.drawSprite(this.sheet, this.charRect, new Vector2i(10, baseY + 28), BLOCK_DAYNIGHT * n);

        // Progress bar showing time of day. The bar stays hand-drawn (a kit meter shows a
        // 0..1 fill, not a moving marker) but its track and outline use theme colors.
        const barX = 60;
        const barY = baseY + 36;
        const barWidth = 240;
        const barHeight = 10;

        BT.drawRectFill(new Rect2i(barX, barY, barWidth, barHeight), this.theme.panel);

        const cycle = (BT.ticks % 1200) / 1200;
        const indicatorX = barX + Math.floor(barWidth * cycle);

        // The indicator rectangle uses the current day/night color (block 12, first color).
        // We compute the actual index: COLOR_BASE + 12 * n + 0 = first slot in the day/night block.
        BT.drawRectFill(new Rect2i(indicatorX - 2, barY - 2, 4, barHeight + 4), COLOR_BASE + BLOCK_DAYNIGHT * n);
        BT.drawRect(new Rect2i(barX, barY, barWidth, barHeight), this.theme.border);

        // Phase labels.
        ui.caption(barX, barY + 14, 'Day', { color: 'dim' });
        ui.caption(barX + 60, barY + 14, 'Sunset', { color: 'dim' });
        ui.caption(barX + 120, barY + 14, 'Night', { color: 'dim' });
        ui.caption(barX + 180, barY + 14, 'Dawn', { color: 'dim' });
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
