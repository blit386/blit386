/*

Sprite Effects: palette offsets as free sprite color variants, under a Tesla Orava CRT.
@description Palette offsets as game effects: damage flash, silhouette, ghost fade, team colors, and day or night.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Sprites: https://demos.blit386.dev/sprites

Live version: https://demos.blit386.dev/sprite-effects

Guides:
  - Palette: https://blit386.dev/docs/guides/palette#per-draw-palette-offsets-zero-cost-color-variants
  - Post-process effects: https://blit386.dev/docs/guides/post-process-effects#display-tier-effects
  - Overlay: https://blit386.dev/docs/guides/overlay#custom-rows

Reference:
  - Palette: https://blit386.dev/docs/api/palette#per-draw-offset
  - Palette: https://blit386.dev/docs/api/palette#fill-a-block-of-slots
  - Assets: https://blit386.dev/docs/api/assets#register-colors-into-the-palette
  - Overlay: https://blit386.dev/docs/api/overlay#custom-rows-optional

---

WHAT YOU WILL SEE
-----------------

A 640x400 screen with the same 44x44 test sprite drawn eleven times, each copy recolored
through a different palette offset. The copies sit in three UI kit panels, each sprite
with its effect name and a one-line note on when a game would use it centered under it:

  - Static (full width, top): Normal, Silhouette, Team Red, Team Blue, Team Green, Frozen.
  - Animated (bottom left): Damage (flashes white and red for 30 ticks, once every 3
    seconds), Ghost (alpha pulsing between 40 and 180), Invincible (hue rotating through
    the rainbow), Poisoned (green tint pulsing 5 times per second).
  - Day/night cycle (bottom right): the sprite dims toward a cool blue night tint and back
    over 20 seconds, and a marker in the sprite's brightest ambient color crosses a
    180-pixel bar split into four quarters labeled Day, Sunset, Night, Dawn.

The panels fill the band between the engine overlay's top and bottom strips.

The engine overlay is visible from the start, with the palette grid, a 64-pixel timing
chart in 'rich' diagnostics mode, the renderer diagnostics bar, and two custom rows:
"Tesla Orava: ON" and "TV fault: <fault> <strength>%".

On WebGPU the whole picture runs through a display-tier stack tuned for 1970s
Czechoslovak black-and-white Tesla Orava CRT sets. On the software renderer the sprite
effects still work; a two-line warm note in the top-left corner says the CRT look is
missing, and the overlay row reads "Tesla Orava: CRT OFF (software)".

WHAT YOU WILL LEARN
-------------------

- Palette offsets: BT.drawSprite(sheet, srcRect, position, paletteOffset) shifts every
  pixel's palette index by paletteOffset, so one sprite image yields any number of color
  variants with no extra textures and no per-pixel work.
- Registering a sprite's colors with SpriteSheet.loadColorsIntoPalette() and
  SpriteSheet.loadIndexed(), and reading the registered Color32 list back.
- palette.fillBlock(start, source, transform) to write one recolored copy of the base
  colors per theme block.
- Static blocks built once in init() versus dynamic blocks rewritten every tick in
  update(), with plain loops to avoid allocating a closure per tick.
- Color32.luminance, Color32.fromHSL(), and Color32.lerp() as recoloring tools.
- BT.effectAdd() with a pixel-tier effect (PixelGlitch) and a display-tier chain, plus a
  tick-driven fault state machine timed with BT.random.
- Custom overlay rows via overlayRows(), overlay styles from configure(), and
  BT.timeSeconds-driven effect uniforms.

HOW THE THEME BLOCKS WORK
-------------------------

Every pixel of an indexed sprite stores a palette index. SpriteSheet.loadIndexed()
registers the sprite's unique opaque colors at COLOR_BASE (slot 12) - six colors for the
test sprite, so block 0 occupies slots 12-17. Each further block is a recolored copy of
those six colors, colorCount slots higher: block k starts at COLOR_BASE + k * colorCount.
Drawing with paletteOffset = k * colorCount makes every pixel land in block k instead of
block 0. Thirteen blocks fit in slots 12-89, far below the shared UI theme at 240-251.

Blocks 0-7 (original, silhouette, damage white, damage red, team red, team blue, team
green, frozen) are filled once in init(). Blocks 8-12 (damage flash, ghost, invincible,
poison, day/night) are rewritten every tick in update(); render() only changes the offset
it draws with.

FULLSCREEN CRT
--------------

The sprite grid is drawn at 640x400. The engine resolves the indexed buffer, upscales it
3x, and runs a display-tier stack: BarrelDistortion (curved tube), Interference,
RollLine (an always-on bright band scrolling top to bottom), Scanlines, RGBMask (a faint
grille), Vignette (light bezel darkening), Noise, Flicker, and Bloom (soft phosphor
halation). A pixel-tier PixelGlitch adds an occasional subtle horizontal band wobble.

TV faults fire every 150-420 ticks and last 4-24 ticks each, with a sine envelope that
ramps the chosen fault in and out: H-HOLD (band tear), SNOW (noise), DIM (flicker), GHOST
(interference), V-ROLL (a faster, brighter roll band). The fault list and labels come from
src/shared/crt-glitch.js; the chroma split used by the color CRT demos is left out
because a black-and-white tube has no color channels to split. The same building blocks
are explained in the PipBoy CRT and Basics Enhanced demos:
https://demos.blit386.dev/crt-pipboy and https://demos.blit386.dev/basics-enhanced.

Post-process needs WebGPU. The software renderer draws the sprite effects without the CRT
stack and shows the shared fallback note instead.

The panels, captions, day/night bar, and fallback note are drawn with the shared UI kit
(src/shared/ui.js), which installs its twelve UI colors in slots 240-251 via applyTheme().

TRY THIS
--------

- Watch the "TV fault" overlay row: it names the active fault and its strength in percent,
  and reads "NONE 00%" between bursts.
- Press the backquote key (`) to hide the overlay and see the full CRT picture; press it
  again to bring the overlay back.
- Add ?backend=software to the URL to force the software renderer and compare the bare
  sprite effects with the CRT version.

*/

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

import { GLITCH_LABELS, GLITCH_TYPES_VROLL } from './shared/crt-glitch.js';
import { isAvailable, SOFTWARE_FALLBACK_NOTE } from './shared/post-process-backend.js';
import { applyTheme, FONT_W, ui, UI_ANCHORS } from './shared/ui.js';

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
// each theme color will land once init() runs. UI_GAP is a static slot outside both the
// sprite theme range (12-89) and the applyTheme() range (240-251), set directly in
// init().
const UI_BG = 240; // 'ui_bg' - deep navy screen background
const UI_TEXT = 244; // 'ui_text' - off-white primary text
const UI_DIM = 245; // 'ui_text_dim' - secondary gray text
const UI_GAP = 252; // gray gap between overlay bands
const UI_HEADER = 246; // 'ui_header' - warm amber (render bars, chart warnings)
const UI_ACCENT = 247; // 'ui_accent' - phosphor green (update bars)
const UI_WARM = 248; // 'ui_accent_warm' - orange (chart error frames)
const UI_INFO = 249; // 'ui_info' - light blue (chart tags)

// Theme block indices (as palette offsets from COLOR_BASE). Each block contains one entry
// per unique sprite color - that count lives in this.colorCount, read in init(). Offset =
// blockIndex * colorCount. Blocks 0-7 are static; blocks 8-12 are dynamic (rewritten in
// update()).
//
//   Block 0 (offset 0):                 Original sprite colors.
//   Block 1 (offset colorCount):        Silhouette - all colors near-black.
//   Block 2 (offset 2 * colorCount):    Damage white - all colors bright white.
//   Block 3 (offset 3 * colorCount):    Damage red - all colors shifted red.
//   Block 4 (offset 4 * colorCount):    Team red.
//   Block 5 (offset 5 * colorCount):    Team blue.
//   Block 6 (offset 6 * colorCount):    Team green.
//   Block 7 (offset 7 * colorCount):    Frozen (cool blue).
//   Block 8 (offset 8 * colorCount):    Damage flash (dynamic: alternating white/red).
//   Block 9 (offset 9 * colorCount):    Ghost (dynamic: pulsing low alpha).
//   Block 10 (offset 10 * colorCount):  Invincibility (dynamic: hue rotation).
//   Block 11 (offset 11 * colorCount):  Poison (dynamic: pulsing green brightness).
//   Block 12 (offset 12 * colorCount):  Day/night ambient (dynamic: brightness cycle).
const BLOCK_ORIGINAL = 0;
const BLOCK_SILHOUETTE = 1;
const BLOCK_DAMAGE_WHITE = 2;
const BLOCK_DAMAGE_RED = 3;
const BLOCK_TEAM_RED = 4;
const BLOCK_TEAM_BLUE = 5;
const BLOCK_TEAM_GREEN = 6;
const BLOCK_FROZEN = 7;
const BLOCK_DAMAGE_FLASH = 8; // dynamic
const BLOCK_GHOST = 9; // dynamic
const BLOCK_INVINCIBLE = 10; // dynamic
const BLOCK_POISON = 11; // dynamic
const BLOCK_DAYNIGHT = 12; // dynamic

// Logical game resolution (where render() draws). The demos page scales this up on
// screen.
const DISPLAY_W = 640;
const DISPLAY_H = 400;

// Layout of the three kit panels. The overlay starts visible and covers the top 122 and
// the bottom 82 pixels of the screen, so the panels sit centered in the band between:
// Static across the full width on top, Animated and Day/night side by side below it.
const PANEL_X = 8;
const PANEL_GAP = 8;
const PANEL_H = 80;
const STATIC_PANEL_Y = 136;
const ANIMATED_PANEL_Y = STATIC_PANEL_Y + PANEL_H + PANEL_GAP;

// Every sprite sits in a cell this wide, with its name and note centered under it. Six
// cells fill the Static panel exactly (6 x 104 = 624 = 640 - 2 x 8).
const CELL_W = 104;

// The Animated panel holds four cells; the Day/night panel takes the rest of the row.
const ANIMATED_PANEL_W = 4 * CELL_W;
const DAYNIGHT_PANEL_X = PANEL_X + ANIMATED_PANEL_W + PANEL_GAP;
const DAYNIGHT_PANEL_W = DISPLAY_W - PANEL_X - DAYNIGHT_PANEL_X;

// A kit panel with a title is 33 pixels taller than the space a ui.spacer() reserves
// inside it (22 above the content for the rim and title, 11 below for the bottom rim).
const PANEL_SPACER = PANEL_H - 33;

// Where things sit inside a panel, measured down from its top edge: the 44x44 sprite
// frame, then the effect name, then the one-line note.
const SPRITE_TOP = 14;
const NAME_Y = 54;
const NOTE_Y = 64;

// The test sprite's visible pixels span x = 4 to 38 inside its 44-pixel frame, so their
// middle is 21 pixels in. Centering on that (not on the frame) lines the artwork up with
// the centered captions.
const ART_CENTER_X = 21;

// The day/night time bar: 180 pixels wide, so the four phase labels sit 45 pixels apart.
const DAYNIGHT_BAR_W = 180;
const DAYNIGHT_PHASES = ['Day', 'Sunset', 'Night', 'Dawn'];

// The cells of the two effect panels: which theme block to draw with, the effect's
// name and its text color role, and a note on when a game would use it.
const STATIC_CELLS = [
    { block: BLOCK_ORIGINAL, name: 'Normal', color: 'text', note: 'Default look' },
    { block: BLOCK_SILHOUETTE, name: 'Silhouette', color: 'text', note: 'Stealth' },
    { block: BLOCK_TEAM_RED, name: 'Team Red', color: 'warm', note: 'Your team' },
    { block: BLOCK_TEAM_BLUE, name: 'Team Blue', color: 'info', note: 'Enemy team' },
    { block: BLOCK_TEAM_GREEN, name: 'Team Green', color: 'accent', note: 'Ally team' },
    { block: BLOCK_FROZEN, name: 'Frozen', color: 'info', note: 'Slowed down' },
];

const ANIMATED_CELLS = [
    { block: BLOCK_DAMAGE_FLASH, name: 'Damage', color: 'warm', note: 'Hit flash' },
    { block: BLOCK_GHOST, name: 'Ghost', color: 'info', note: 'Spirit form' },
    { block: BLOCK_INVINCIBLE, name: 'Invincible', color: 'text', note: 'Power-up' },
    { block: BLOCK_POISON, name: 'Poisoned', color: 'accent', note: 'Damage over time' },
];

// How large the canvas may appear in the browser (3x logical, crisp CSS upscale).
const MAX_CANVAS_W = DISPLAY_W * 3;
const MAX_CANVAS_H = DISPLAY_H * 3;

// The display-tier CRT runs on the upscaled RGBA buffer (3x logical, like the Basics
// Enhanced demo).
const OUTPUT_W = DISPLAY_W * 3;
const OUTPUT_H = DISPLAY_H * 3;

// Analog-TV fault bursts (ticks at the default 60 ticks per second).
const GLITCH_COOLDOWN_MIN = 150;
const GLITCH_COOLDOWN_MAX = 420;
const GLITCH_ACTIVE_MIN = 4;
const GLITCH_ACTIVE_MAX = 24;
const GLITCH_INTENSITY_MIN = 0.3;
const GLITCH_INTENSITY_MAX = 0.95;

// The shared fallback note is one long sentence. split('. ') cuts the string at the
// sentence break, giving an array of two shorter lines the UI kit draws one under the
// other when the software renderer is active (same pattern as the Basics Enhanced demo).
const FALLBACK_LINES = SOFTWARE_FALLBACK_NOTE.split('. ');

// Resting values for the fault-driven display effects.
const FLICKER_BASE = 1.0;
const FLICKER_DIP = 0.78;
const NOISE_BASE = 0.038;

// Always-on bright band scrolling top to bottom (RollLine).
const ROLL_BASE = 0.26;
const ROLL_SPEED = 0.92;
const INTERFERENCE_BASE = 0;

// Occasional subtle horizontal band offset (PixelGlitch), separate from the TV fault
// bursts.
const BAND_WOBBLE_COOLDOWN_MIN = 100;
const BAND_WOBBLE_COOLDOWN_MAX = 280;
const BAND_WOBBLE_ACTIVE_MIN = 3;
const BAND_WOBBLE_ACTIVE_MAX = 10;
const BAND_WOBBLE_INTENSITY = 0.11;

// Spins the CPU until roughly `ms` milliseconds have passed. The timing chart maps bar
// height from real update()/render() time; this demo adds a gentle pulse so the scrolling
// bars are easy to see while you watch the effects.
function burnCpuMs(ms) {
    if (ms <= 0) {
        return;
    }

    // performance.now() returns a high-resolution clock in milliseconds.
    const deadline = performance.now() + ms;

    while (performance.now() < deadline) {
        // Empty loop on purpose: waiting for the clock, not doing useful work.
    }
}

// Palette-offset sprite effects under a Tesla Orava CRT stack. Static effects are
// pre-built in init(); dynamic effects are rewritten in update().
class Demo {
    // The palette holds all colors for this demo.
    /** @type {Palette | null} */
    palette = null;

    // The sprite sheet loaded from /sprites/test.png.
    /** @type {SpriteSheet | null} */
    sheet = null;

    // The source rectangle covering the whole test sprite.
    /** @type {Rect2i | null} */
    charRect = null;

    // How many unique colors the sprite has - every theme block is this many palette
    // slots wide. Set in init() after the colors are registered.
    colorCount = 0;

    // Slot map for the shared UI kit theme, filled in init() by applyTheme(). theme.bg,
    // theme.panel, and friends are palette indices for this demo's own drawing.
    theme = null;

    // The sprite's original Color32 objects, darkest first (used to build theme blocks).
    baseColors = [];

    // Seconds elapsed; drives the ghost, invincibility, and poison animations.
    animTime = 0;

    // The tick of the last "damage event" (for the damage flash).
    damageFlashTick = 0;

    // Reused for every sprite position in render(), so drawing allocates no new
    // Vector2i.
    drawPos = new Vector2i(0, 0);

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

    // True when the WebGPU backend is active and the CRT stack was built.
    effectsAvailable = false;

    // Ticks until the next TV fault burst may start.
    glitchCooldown = 0;

    // How many ticks the current TV fault burst still has to run (0 = no burst active).
    glitchTicksLeft = 0;

    // Total length of the current burst in ticks, for the sine envelope.
    glitchDuration = 0;

    // Which fault is running: a GLITCH_TYPES_VROLL key, or 'none'.
    glitchType = 'none';

    // Peak strength of the current burst, 0 to 1.
    glitchPeak = 0;

    // Ticks until the next band wobble may start.
    bandWobbleCooldown = 0;

    // How many ticks the current band wobble still has to run (0 = no wobble active).
    bandWobbleTicksLeft = 0;

    // Total length of the current wobble in ticks, for the sine envelope.
    bandWobbleDuration = 0;

    // PixelGlitch seed for the current wobble, so its bands stay put for its duration.
    bandWobbleSeed = 0;

    // Reused every frame for the two overlay rows, so no new array or object is
    // allocated. overlayRows() rewrites both leftText values.
    overlayRowData = [
        { leftText: 'Tesla Orava CRT: OFF', textPaletteIndex: UI_TEXT },
        { leftText: 'TV fault: NONE', textPaletteIndex: UI_HEADER },
    ];

    // A wider logical screen for the sprite grid; the display-tier Tesla Orava stack runs
    // at a 3x upscale. The overlay starts visible with the palette grid, a tall timing
    // chart, and the renderer diagnostics bar.
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            drawingBufferSize: new Vector2i(OUTPUT_W, OUTPUT_H),
            maxCanvasSize: new Vector2i(MAX_CANVAS_W, MAX_CANVAS_H),
            outputUpscaleFilter: 'nearest',
            isOverlayPaletteEnabled: true,
            isOverlayVisibleAtStart: true,

            // Opt in to the engine timing chart band under the title row.
            // overlayTimingChartHeight sets the band height in pixels (default 22).
            isOverlayTimingChartEnabled: true,
            overlayTimingChartHeight: 64,
            overlayTimingChartDiagnostics: 'rich',
            isOverlayRendererDiagnosticsBarEnabled: true,

            overlayStyle: {
                barPaletteIndex: UI_BG,
                textPaletteIndex: UI_DIM,
                gapPaletteIndex: UI_GAP,
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

    // Sets up the palette, builds all 13 theme blocks, loads the sprite, and builds the
    // CRT stack when WebGPU is active. Returns false when the sprite fails to load.
    async init() {
        console.log('[SpriteEffectsDemo] Initializing...');

        this.palette = BT.paletteCreate(256);

        // Install the shared UI theme: applyTheme() writes the twelve UI kit colors into
        // high palette slots (240-251), far above the sprite theme blocks (slots 12-89
        // with the 6-color test sprite), and returns a map of friendly names to those
        // slots (this.theme.bg, .panel, ...). All captions and legends draw with these.
        this.theme = applyTheme(this.palette);

        // The overlay gap color lives outside the theme's own range, so it is set
        // directly.
        this.palette.set(UI_GAP, new Color32(60, 60, 70));

        // Register the sprite colors: scan the PNG and write every unique opaque color
        // into the palette starting at COLOR_BASE. The returned array is those colors
        // sorted darkest-first by luminance. The theme-block builders below recolor each
        // of them into a higher block.
        this.baseColors = await SpriteSheet.loadColorsIntoPalette('/sprites/test.png', this.palette, COLOR_BASE);
        const colorCount = this.baseColors.length;
        this.colorCount = colorCount;

        // Build the 8 static theme blocks. Each block sits at COLOR_BASE + blockIndex *
        // colorCount.
        this.buildStaticThemeBlocks();

        // Dynamic blocks (8-12) start as copies of the original. update() replaces them
        // each tick. palette.fillBlock(start, source, transform) writes
        // transform(baseColor) into one slot per base color, starting at `start`.
        for (let block = BLOCK_DAMAGE_FLASH; block <= BLOCK_DAYNIGHT; block++) {
            this.palette.fillBlock(
                COLOR_BASE + block * colorCount,
                this.baseColors,
                (base) => new Color32(base.r, base.g, base.b, base.a),
            );
        }

        // Load and indexize the sprite. loadIndexed() registers the colors again at
        // COLOR_BASE in luminance order, matching baseColors, and overwrites block 0
        // with that list. It then converts each pixel to the palette index of its color.
        try {
            const indexed = await SpriteSheet.loadIndexed('/sprites/test.png', this.palette, COLOR_BASE);
            this.sheet = indexed.sheet;
            this.charRect = this.sheet.fullRect();
            BT.paletteSet(this.palette);
            console.log(`[SpriteEffectsDemo] Loaded sprite: ${this.charRect.width}x${this.charRect.height}px`);
        } catch (error) {
            console.error('[SpriteEffectsDemo] Failed to load sprite:', error);
            return false;
        }

        // Fault state is shared by both backends - initialize it once before the CRT
        // check. BT.random.int(min, max) returns a whole number in [min, max), so this
        // waits a random number of ticks before the first burst.
        this.glitchCooldown = BT.random.int(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
        this.glitchTicksLeft = 0;
        this.glitchDuration = 0;
        this.glitchType = 'none';
        this.glitchPeak = 0;

        this.effectsAvailable = isAvailable();

        if (!this.effectsAvailable) {
            console.log('[SpriteEffectsDemo] Initialization complete (no CRT stack).');
            return true;
        }

        // Build the full Tesla Orava effect chain (see setupCrtStack() below).
        this.setupCrtStack();

        this.bandWobbleCooldown = BT.random.int(BAND_WOBBLE_COOLDOWN_MIN, BAND_WOBBLE_COOLDOWN_MAX);
        this.bandWobbleTicksLeft = 0;
        this.bandWobbleDuration = 0;

        console.log('[SpriteEffectsDemo] Initialization complete!');
        return true;
    }

    // Advances animTime and rewrites all five dynamic theme blocks, then steps the CRT
    // fault machine when the stack is active. The damage flash alternates the
    // damage-white and damage-red recipes every 3 ticks for 30 ticks after each damage
    // event; ghost pulses alpha between 40 and 180; invincibility rotates hue around the
    // color wheel; poison pulses brightness; day/night cycles brightness over 20 seconds.
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
        // Math.sin swings between -1 and 1; * 0.5 + 0.5 remaps that to 0-1 for a smooth
        // pulse of 0.5-2.5 ms. The combined update+render busy-wait stays well under a
        // 60 FPS frame (~16 ms) so low-power devices stay responsive.
        const chartUpdateLoadMs = 0.5 + (Math.sin(BT.timeSeconds * 1.5) * 0.5 + 0.5) * 2;
        burnCpuMs(chartUpdateLoadMs);
    }

    // Runs once per screen refresh and draws all the sprite effect demonstrations. No
    // Color32 objects appear in draw calls - only palette indices and offsets.
    render() {
        // Clear the whole screen with the shared UI theme's background color.
        BT.clear(this.theme.bg);

        // Extra render() work so the timing chart shows amber scrolling bars (0.3-1.8
        // ms).
        const chartRenderLoadMs = 0.3 + (Math.cos(BT.timeSeconds * 2.2) * 0.5 + 0.5) * 1.5;
        burnCpuMs(chartRenderLoadMs);

        // Draw the Static and Animated panels.
        this.renderStaticEffects();
        this.renderDynamicEffects();

        // The Day/night panel, right of the Animated one.
        this.renderDayNightCycle();

        // Software renderer: warn on-canvas that the Tesla Orava look is missing. A small
        // borderless kit group in the top-left corner; the shared note was split into two
        // lines up top (FALLBACK_LINES) so it stays short.
        if (!this.effectsAvailable) {
            ui.begin(UI_ANCHORS.TOP_LEFT, { margin: 2, pad: 2 });

            for (const line of FALLBACK_LINES) {
                ui.label(line, { color: 'warm' });
            }

            ui.end();
        }
    }

    // Two custom overlay rows: the Tesla Orava stack state and the current analog-TV
    // fault with its strength in percent. Returns the reused overlayRowData array.
    overlayRows() {
        if (this.effectsAvailable) {
            this.overlayRowData[0].leftText = 'Tesla Orava: ON';

            const faultLabel = GLITCH_LABELS[this.glitchType] ?? 'NONE';
            const faultValue = this.glitchTicksLeft > 0 ? Math.round(this.glitchPeak * 100) : 0;

            this.overlayRowData[1].leftText = `TV fault: ${faultLabel} ${String(faultValue).padStart(2, '0')}%`;
        } else {
            // Software renderer: no CRT stack, so the fault machine never fires. The full
            // explanation lives on the canvas itself (see render()), not in the overlay.
            this.overlayRowData[0].leftText = 'Tesla Orava: CRT OFF (software)';
            this.overlayRowData[1].leftText = 'TV fault: NONE';
        }

        return this.overlayRowData;
    }

    // Builds the Tesla Orava effect chain once in init(): the pixel-tier band tear plus
    // the display-tier tube look, in back-to-front order.
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

    // Drives the RollLine scroll, the TV fault bursts, and the occasional subtle band
    // offset wobble. A fault burst takes priority: while one runs, the wobble is skipped.
    updateCrtEffects() {
        const seconds = BT.timeSeconds;
        this.rollLine.time = seconds;
        this.noise.time = seconds;
        this.interference.time = seconds;

        if (this.glitchTicksLeft > 0) {
            // t runs 0 to 1 over the burst; sin(t * PI) is a 0 -> 1 -> 0 envelope.
            const t = 1 - (this.glitchTicksLeft - 1) / this.glitchDuration;
            const envelope = Math.sin(t * Math.PI);

            this.applyRestingCrtUniforms();
            this.applyGlitchUniforms(envelope);

            this.glitchTicksLeft--;

            if (this.glitchTicksLeft <= 0) {
                this.glitchCooldown = BT.random.int(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
                this.bandWobbleCooldown = BT.random.int(BAND_WOBBLE_COOLDOWN_MIN, BAND_WOBBLE_COOLDOWN_MAX);
            }

            return;
        }

        this.applyRestingCrtUniforms();

        if (this.bandWobbleTicksLeft > 0) {
            // Same sine envelope as the fault bursts, scaled to the wobble's intensity.
            const t = 1 - (this.bandWobbleTicksLeft - 1) / this.bandWobbleDuration;
            const envelope = Math.sin(t * Math.PI);

            this.pixelGlitch.intensity = BAND_WOBBLE_INTENSITY * envelope;
            this.pixelGlitch.seed = this.bandWobbleSeed;
            this.bandWobbleTicksLeft--;

            if (this.bandWobbleTicksLeft <= 0) {
                this.pixelGlitch.intensity = 0;
                this.bandWobbleCooldown = BT.random.int(BAND_WOBBLE_COOLDOWN_MIN, BAND_WOBBLE_COOLDOWN_MAX);
            }
        } else {
            this.bandWobbleCooldown--;

            if (this.bandWobbleCooldown <= 0) {
                this.bandWobbleDuration = BT.random.int(BAND_WOBBLE_ACTIVE_MIN, BAND_WOBBLE_ACTIVE_MAX);
                this.bandWobbleTicksLeft = this.bandWobbleDuration;
                this.bandWobbleSeed = BT.random.float(0, 1000);
            }
        }

        this.glitchCooldown--;

        if (this.glitchCooldown <= 0) {
            // Start a burst: BT.random.pick() chooses one fault type from the list,
            // float() picks its peak strength and a fresh band seed.
            this.glitchType = BT.random.pick(GLITCH_TYPES_VROLL);
            this.glitchDuration = BT.random.int(GLITCH_ACTIVE_MIN, GLITCH_ACTIVE_MAX);
            this.glitchTicksLeft = this.glitchDuration;
            this.glitchPeak = BT.random.float(GLITCH_INTENSITY_MIN, GLITCH_INTENSITY_MAX);
            this.pixelGlitch.seed = BT.random.float(0, 1000);
        }
    }

    // Resting Tesla Orava look: scrolling roll band plus calm noise and flicker.
    applyRestingCrtUniforms() {
        this.pixelGlitch.intensity = 0;
        this.noise.amount = NOISE_BASE;
        this.flicker.amount = FLICKER_BASE;
        this.interference.amount = INTERFERENCE_BASE;
        this.rollLine.amount = ROLL_BASE;
        this.rollLine.speed = ROLL_SPEED;
    }

    // Layers the active fault onto the resting uniforms. `envelope` runs 0 -> 1 -> 0 over
    // the burst, so every fault ramps in and out instead of snapping.
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

    // Builds the 7 static recolored blocks (1-7) from the base colors. Called once in
    // init() - these never change after setup.
    buildStaticThemeBlocks() {
        // Block 0 (original) holds the sprite's own colors, written by the loaders in
        // init(). n is how many unique colors the sprite has - every block is n slots
        // wide.
        const n = this.colorCount;

        // Each block below is a palette.fillBlock(start, source, transform) call: it
        // walks this.baseColors once and writes transform(baseColor) into one slot per
        // color, starting at `start`. That replaces a hand-written for loop over the same
        // colors.

        // Block 1: Silhouette - near-black with slight variation to preserve depth cues.
        // Channels are floored like blocks 4-7 so every recipe hands Color32 whole bytes.
        this.palette.fillBlock(COLOR_BASE + BLOCK_SILHOUETTE * n, this.baseColors, (base) => {
            // The perceived brightness of this color (0-255).
            const lum = Math.floor(base.luminance);

            return new Color32(Math.floor(lum * 0.08), Math.floor(lum * 0.08), Math.floor(lum * 0.1), base.a);
        });

        // Block 2: Damage white - everything shifted toward bright white.
        this.palette.fillBlock(COLOR_BASE + BLOCK_DAMAGE_WHITE * n, this.baseColors, (base) => {
            const lum = Math.floor(base.luminance);
            const whitened = Math.floor(128 + lum * 0.5);

            return new Color32(whitened, whitened, whitened, base.a);
        });

        // Block 3: Damage red - everything shifted toward red.
        this.palette.fillBlock(COLOR_BASE + BLOCK_DAMAGE_RED * n, this.baseColors, (base) => {
            const lum = Math.floor(base.luminance);

            return new Color32(Math.min(255, lum + 80), Math.floor(lum * 0.3), Math.floor(lum * 0.3), base.a);
        });

        // Block 4: Team red - multiply the base colors with a red tint.
        this.palette.fillBlock(
            COLOR_BASE + BLOCK_TEAM_RED * n,
            this.baseColors,
            (base) =>
                new Color32(
                    Math.min(255, Math.floor(base.r * 1.4)),
                    Math.floor(base.g * 0.5),
                    Math.floor(base.b * 0.5),
                    base.a,
                ),
        );

        // Block 5: Team blue - multiply with a blue tint.
        this.palette.fillBlock(
            COLOR_BASE + BLOCK_TEAM_BLUE * n,
            this.baseColors,
            (base) =>
                new Color32(
                    Math.floor(base.r * 0.5),
                    Math.floor(base.g * 0.7),
                    Math.min(255, Math.floor(base.b * 1.6)),
                    base.a,
                ),
        );

        // Block 6: Team green - multiply with a green tint.
        this.palette.fillBlock(
            COLOR_BASE + BLOCK_TEAM_GREEN * n,
            this.baseColors,
            (base) =>
                new Color32(
                    Math.floor(base.r * 0.5),
                    Math.min(255, Math.floor(base.g * 1.4)),
                    Math.floor(base.b * 0.5),
                    base.a,
                ),
        );

        // Block 7: Frozen - push toward a cold blue-white.
        this.palette.fillBlock(COLOR_BASE + BLOCK_FROZEN * n, this.baseColors, (base) => {
            const lum = Math.floor(base.luminance);

            return new Color32(Math.floor(lum * 0.7 + 40), Math.floor(lum * 0.8 + 40), Math.min(255, lum + 80), base.a);
        });
    }

    // The 5 update*Block() methods below run every tick (called from update()), unlike
    // buildStaticThemeBlocks() which runs once in init(). They stay as plain for loops
    // instead of palette.fillBlock(start, source, transform) calls on purpose: fillBlock
    // takes a transform function, and writing `(base) => ...` inline at each call site
    // would create a new closure 60 times a second. A raw loop allocates nothing extra
    // per tick beyond the Color32 it writes.

    // Damage flash: alternates between the damage-white and damage-red recipes every 3
    // ticks for the first 30 ticks after a damage event, then returns to the original
    // colors.
    updateDamageFlashBlock() {
        const flashAge = BT.ticks - this.damageFlashTick;
        const n = this.colorCount;

        for (let i = 0; i < n; i++) {
            const base = this.baseColors[i];
            const lum = Math.floor(base.luminance);

            let color;

            if (flashAge < 30) {
                // Math.floor(flashAge / 3) % 2 alternates 0 and 1 every 3 ticks: 0 =
                // white, 1 = red.
                const phase = Math.floor(flashAge / 3) % 2;
                const whitened = Math.floor(128 + lum * 0.5);
                const redShift = Math.min(255, lum + 80);

                color =
                    phase === 0
                        ? new Color32(whitened, whitened, whitened, base.a)
                        : new Color32(redShift, Math.floor(lum * 0.3), Math.floor(lum * 0.3), base.a);
            } else {
                // Outside the flash window: the original color.
                color = new Color32(base.r, base.g, base.b, base.a);
            }

            this.palette.set(COLOR_BASE + BLOCK_DAMAGE_FLASH * n + i, color);
        }
    }

    // Ghost: the sprite appears semi-transparent with a blue-white tint. Alpha pulses
    // between 40 and 180 on a sine wave, three radians per second.
    updateGhostBlock() {
        // Math.sin oscillates between -1 and 1; * 0.5 + 0.5 shifts it to 0-1.
        const pulse = Math.sin(this.animTime * 3) * 0.5 + 0.5;
        const alpha = Math.floor(40 + pulse * 140); // 40-180
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

    // Invincibility: cycles the entire sprite through the rainbow. The hue rotates 200
    // degrees per second.
    updateInvincibleBlock() {
        const hue = (this.animTime * 200) % 360;
        const n = this.colorCount;

        for (let i = 0; i < n; i++) {
            const base = this.baseColors[i];

            // Color32.fromHSL(hue, saturation, lightness) takes hue in degrees (0-360)
            // and saturation and lightness as percentages (0-100). Lightness follows the
            // base color's luminance so darker parts stay darker.
            const lum = base.luminance;
            const lightness = 30 + (lum / 255) * 40; // 30-70 percent
            const rainbow = Color32.fromHSL(hue, 100, lightness);

            this.palette.set(
                COLOR_BASE + BLOCK_INVINCIBLE * n + i,
                new Color32(rainbow.r, rainbow.g, rainbow.b, base.a),
            );
        }
    }

    // Poison: a green tint whose brightness pulses, five radians per second.
    updatePoisonBlock() {
        const pulse = Math.sin(this.animTime * 5) * 0.2 + 0.8; // 0.6-1.0
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

    // Day/night: a brightness factor that cycles over 20 seconds (1200 ticks). At midday
    // the factor is 1.0; at midnight it drops to 0.3.
    updateDayNightBlock() {
        const cycle = (BT.ticks % 1200) / 1200; // 0-1
        const brightness = (Math.cos(cycle * Math.PI * 2) + 1) * 0.35 + 0.3; // 0.3-1.0
        const n = this.colorCount;

        for (let i = 0; i < n; i++) {
            const base = this.baseColors[i];

            // Blend from a fixed cool night tint (slight blue) toward the sprite's
            // daylight color as brightness approaches 1. Color32.lerp(a, b, t): t = 0 is
            // all `a`, t = 1 is all `b`.
            const nightTint = new Color32(0, 0, 30, base.a);
            this.palette.set(COLOR_BASE + BLOCK_DAYNIGHT * n + i, Color32.lerp(nightTint, base, brightness));
        }
    }

    // Draws one kit panel with a title and an empty body tall enough for a row of
    // sprite cells. The sprites and captions are drawn after ui.end(), so they land on
    // top of the panel.
    renderPanel(x, y, width, title) {
        ui.begin(UI_ANCHORS.TOP_LEFT, { x, y, width });
        ui.panel(title);
        ui.spacer(PANEL_SPACER);
        ui.end();
    }

    // Draws one effect cell: the sprite drawn with the cell's palette offset, then its
    // name and note centered under it. Every character of the system font is FONT_W (6)
    // pixels wide, so a caption is text.length * FONT_W pixels wide, and starting it half
    // that width left of the middle centers it.
    renderCell(cellX, panelY, cell) {
        const centerX = cellX + CELL_W / 2;

        // The palette offset picks the theme block: block k starts k * colorCount slots
        // above block 0, so every pixel of the sprite lands in that block's colors.
        this.drawPos.set(centerX - ART_CENTER_X, panelY + SPRITE_TOP);
        BT.drawSprite(this.sheet, this.charRect, this.drawPos, cell.block * this.colorCount);

        ui.caption(centerX - (cell.name.length * FONT_W) / 2, panelY + NAME_Y, cell.name, { color: cell.color });
        ui.caption(centerX - (cell.note.length * FONT_W) / 2, panelY + NOTE_Y, cell.note, { color: 'dim' });
    }

    // Draws the Static panel: six effects whose theme blocks were built once in init() -
    // Normal, Silhouette, Team Red, Team Blue, Team Green, Frozen.
    renderStaticEffects() {
        this.renderPanel(PANEL_X, STATIC_PANEL_Y, DISPLAY_W - 2 * PANEL_X, 'Static - blocks built once in init()');

        for (let i = 0; i < STATIC_CELLS.length; i++) {
            this.renderCell(PANEL_X + i * CELL_W, STATIC_PANEL_Y, STATIC_CELLS[i]);
        }
    }

    // Draws the Animated panel: four effects whose theme blocks update() rewrites every
    // tick - Damage, Ghost, Invincible, Poisoned. render() draws them exactly like the
    // static ones; only the colors in their blocks change.
    renderDynamicEffects() {
        this.renderPanel(PANEL_X, ANIMATED_PANEL_Y, ANIMATED_PANEL_W, 'Animated - rewritten in update()');

        for (let i = 0; i < ANIMATED_CELLS.length; i++) {
            this.renderCell(PANEL_X + i * CELL_W, ANIMATED_PANEL_Y, ANIMATED_CELLS[i]);
        }
    }

    // Draws the Day/night panel: the sprite in the current ambient light with a short
    // label beside it, and a time bar under both with a marker crossing it once every 20
    // seconds.
    renderDayNightCycle() {
        const panelX = DAYNIGHT_PANEL_X;
        const panelY = ANIMATED_PANEL_Y;

        this.renderPanel(panelX, panelY, DAYNIGHT_PANEL_W, 'Day/night cycle');

        // The bar starts 10 pixels in from the panel edge, and the sprite is shifted so
        // its visible pixels (4 pixels in from its frame) start at the same x.
        const barX = panelX + 10;
        const barY = panelY + SPRITE_TOP + 41;
        const barHeight = 6;

        this.drawPos.set(barX - 4, panelY + SPRITE_TOP);
        BT.drawSprite(this.sheet, this.charRect, this.drawPos, BLOCK_DAYNIGHT * this.colorCount);

        // The label sits right of the sprite, level with the middle of its artwork.
        ui.caption(barX + 46, panelY + SPRITE_TOP + 12, 'Ambient light', { color: 'text' });
        ui.caption(barX + 46, panelY + SPRITE_TOP + 22, '20-second loop', { color: 'dim' });

        // The bar is drawn inside the panel, so it uses ui.drawRectFill() and
        // ui.drawRect(): the same arguments as BT.drawRectFill() and BT.drawRect(), but
        // drawn as sprites so they land on top of the panel instead of under it. The
        // track is the darker screen background, so it stands out from the panel fill.
        ui.drawRectFill(new Rect2i(barX, barY, DAYNIGHT_BAR_W, barHeight), this.theme.bg);

        // The bar is split into four equal quarters, one per phase, by three thin tick
        // lines in the border color.
        const quarterW = DAYNIGHT_BAR_W / DAYNIGHT_PHASES.length;

        for (let i = 1; i < DAYNIGHT_PHASES.length; i++) {
            ui.drawRectFill(new Rect2i(barX + i * quarterW, barY, 1, barHeight), this.theme.border);
        }

        // cycle runs 0-1 over 1200 ticks, the same clock updateDayNightBlock() uses.
        const cycle = (BT.ticks % 1200) / 1200;
        const markerX = barX + Math.floor((DAYNIGHT_BAR_W - 1) * cycle);

        // The marker is painted with the last slot of the day/night block (COLOR_BASE +
        // 12 * colorCount + colorCount - 1). The base colors are sorted darkest first, so
        // that is the sprite's brightest color: bright at noon, a dim blue at midnight,
        // always visible against the dark track.
        const markerSlot = COLOR_BASE + BLOCK_DAYNIGHT * this.colorCount + this.colorCount - 1;

        ui.drawRect(new Rect2i(barX, barY, DAYNIGHT_BAR_W, barHeight), this.theme.border);
        ui.drawRectFill(new Rect2i(markerX - 1, barY - 2, 3, barHeight + 4), markerSlot);

        // Phase labels, each centered in its own quarter of the bar.
        for (let i = 0; i < DAYNIGHT_PHASES.length; i++) {
            const label = DAYNIGHT_PHASES[i];
            const labelX = barX + i * quarterW + (quarterW - label.length * FONT_W) / 2;

            ui.caption(labelX, barY + barHeight + 2, label, { color: 'dim' });
        }
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
