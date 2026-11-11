/*

PipBoy CRT: a faux Fallout terminal with scanlines, glitches, and bloom.
@description A faux Fallout terminal built from decomposed CRT effects: barrel warp, scanlines, mask, and glitches.
@pageTitle BLIT386 Demo – PipBoy CRT

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Bitmap Font: https://demos.blit386.dev/bitmap-font

Live version: https://demos.blit386.dev/crt-pipboy

Guides:
  - Post-Process Effects: https://blit386.dev/docs/guides/post-process-effects#architecture
  - Bitmap Fonts: https://blit386.dev/docs/guides/bitmap-fonts#custom-bitmap-fonts-btfont
  - Random: https://blit386.dev/docs/guides/random#deterministic-by-default
  - Overlay: https://blit386.dev/docs/guides/overlay#colors-and-hud-palette-slots

Reference:
  - Rendering: https://blit386.dev/docs/api/rendering#post-process-effects
  - Core: https://blit386.dev/docs/api/core#requested-vs-active-backend
  - Random: https://blit386.dev/docs/api/random#generators
  - Overlay: https://blit386.dev/docs/api/overlay#event-tags

---

WHAT YOU WILL SEE
-----------------

A green-on-black terminal on a curved CRT. The boot sequence types itself out one
character at a time (two ticks per character, a short pause after each line); a line
switches from dim to full green the moment it completes. Once the last line is in (about
10.7 seconds), a "== STATUS ==" block appears under the boot text - HP, AP, RAD, CAPS, and
WEIGHT in three columns, with RAD dimmed and CAPS in amber - and a bright cursor blinks
after the welcome line, 0.5 seconds on and 0.5 seconds off.

The whole picture passes through a CRT stack: barrel curvature, scanlines aligned to the
240 logical rows, an RGB shadow mask, a vignette, film grain, a bright band rolling down
the screen, and bloom. Roughly every 2 to 6 seconds a glitch burst lasting 5 to 29 ticks
fires. There are five kinds: a horizontal band shift, a red/blue channel split, heavier
grain, a brightness dip, and per-row interference jitter. When the player prefers
reduced motion, the grain, the brightness flicker, the rolling band, the row jitter, and
the glitch bursts are all left out.

WHAT YOU WILL LEARN
-------------------

- Post-processing: full-screen effects that run after the scene is drawn, registered with
  BT.effectAdd(effect) and routed by each effect's `tier`.
- The two effect tiers and why they exist:
  - Pixel tier: palette-native, runs on the logical index buffer (r8uint, one byte per
    pixel) at 320x240. PixelGlitch lives here.
  - Between the tiers the engine resolves each index through the palette and upscales to
    RGBA at the drawing-buffer size (1280x960).
  - Display tier: simulates the physical screen on that full-size RGBA image.
    BarrelDistortion, ChromaticAberration, Interference, RollLine, Scanlines, RGBMask,
    Vignette, Noise, Flicker, and Bloom live here.
- Composing individual effect classes instead of one monolithic shader.
  BT.preset.crtPipBoy() builds a similar stack in one call (without Vignette); this demo
  wires each piece by hand so every parameter is visible.
- Driving effect uniforms from JavaScript each tick: `time` for RollLine, Noise, and
  Interference, and the glitch fields through the shared helpers in
  src/shared/crt-glitch.js.
- A tick-driven state machine that uses BT.random for timing, type, and strength.
- Loading a .btfont with BitmapFont.load(), running indexize() on it, and recoloring
  glyphs through the BT.printFont() palette offset.
- Honoring BT.isReducedMotionPreferred: rebuilding the effect chain without the moving
  effects, and rebuilding it again from onReducedMotionChange() when the preference
  changes while the demo runs.

HOW POST-PROCESSING WORKS
-------------------------

Without effects the engine draws the scene, resolves palette indices to RGBA, upscales,
and presents. Once an effect is registered with BT.effectAdd, the engine routes the frame
through one or two effect chains. Each effect reads one texture and writes another; the
last effect in the display chain writes to the swap chain.

Pixel-tier effects (PixelGlitch here) operate on the logical framebuffer, which stores
palette slot indices (GPU format r8uint) at 320x240 - not RGBA yet. They stay
palette-native: integer texture reads, no averaging into in-between colors.

The engine then runs the palette resolve plus upscale: each index becomes an RGBA color
and the image grows to the drawing-buffer size (1280x960). Display-tier effects run on
that RGBA output. BarrelDistortion therefore computes its curve at 1280x960, not on the
320x240 index grid, so lines stay smooth instead of breaking into stair-steps.

HOW THE GLITCH STATE MACHINE WORKS
----------------------------------

Two counters drive it:

- glitchCooldown: ticks remaining until the next burst starts.
- glitchTicksLeft: ticks remaining in the current burst (0 means idle).

Every tick, update() decrements one of them. While glitchTicksLeft is above zero the burst
is running: an envelope sin(t * PI) rises from 0 to 1 and back over the burst's lifetime,
and applyGlitchUniforms() scales the chosen effect's parameter by it. When the burst ends,
resetGlitchUniforms() restores the resting values and a new cooldown is rolled. When the
cooldown reaches zero, a new burst is rolled: a type from GLITCH_TYPES_CHROMA, a duration
from GLITCH_ACTIVE_MIN..MAX ticks, a peak from GLITCH_INTENSITY_MIN..MAX, and a fresh
PixelGlitch seed. Each burst type drives a different uniform:

- hshift: PixelGlitch.intensity (the pixel-tier band shift).
- chromasplit: ChromaticAberration.aberration.
- noise: Noise.amount above its resting grain.
- flicker: Flicker.amount dips toward FLICKER_DIP.
- interference: Interference.amount.

SOFTWARE FALLBACK
-----------------

If the browser uses the Canvas 2D software renderer (WebGPU missing or ?backend=software
in the URL), post-process effects are unavailable. The terminal scene, boot animation, and
status block still run; only the CRT stack is skipped, and the glitch machine never
starts. A two-line caption drawn with the shared UI kit in the bottom-left corner
explains the reduced mode.

HOW THE BITMAP FONT COLORS WORK
-------------------------------

The font loads as a sprite sheet of white glyph pixels. indexize() against the palette
replaces each white pixel with the index of the white slot (C_WHITE). BT.printFont(font,
pos, text, offset) adds `offset` to that index, so passing `C_GREEN - C_WHITE` moves every
glyph pixel from the white slot to the green slot. The print() helper below does that
arithmetic. The Sprite Effects demo uses the same trick for tints.

TRY THIS
--------

- Press the backquote key (`) to open the engine overlay. The bottom-left toggle hint is
  hidden so it does not break the terminal illusion, but the key still works. The overlay
  draws in this demo's green palette slots, with the timing chart in rich diagnostics mode
  and the renderer diagnostics bar enabled.
- Watch the timing chart tags: "Boot done" once the boot text completes, then "Glitch:
  hshift", "Glitch: chromasplit", "Glitch: noise", "Glitch: flicker", or "Glitch:
  interference" at the start of each burst.
- Add ?backend=software to the URL to see the fallback caption.
- Add ?reducedmotion to the URL: the picture keeps its curve, scanlines, mask, and glow,
  but the grain, flicker, rolling band, row jitter, and glitch bursts stay off.

*/

// Each effect is its own class, so the stack can be composed freely.
import {
    BarrelDistortion,
    BitmapFont,
    Bloom,
    bootstrap,
    BT,
    ChromaticAberration,
    Color32,
    Flicker,
    Interference,
    Noise,
    PixelGlitch,
    Rect2i,
    RGBMask,
    RollLine,
    Scanlines,
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
    GLITCH_TYPE,
    GLITCH_TYPES_CHROMA,
    isMotionEffect,
    NOISE_BASE,
    PIXEL_GLITCH_BAND_HEIGHT,
    resetGlitchUniforms,
} from './shared/crt-glitch.js';
import { isAvailable, SOFTWARE_FALLBACK_LINES } from './shared/post-process-backend.js';
import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

// The internal pixel resolution of the demo. Small numbers keep the pixel-art look.
const DISPLAY_W = 320;
const DISPLAY_H = 240;

// Output resolution. 4x the logical size gives the display-tier effects (barrel curve,
// scanlines, RGB mask) enough output pixels to render smoothly and turns each logical
// pixel into a clean 4x4 block on screen. This is the size the frame is presented at, not
// the pixel-art size: the demo still draws palette indices into a 320x240 logical buffer.
// Pixel-tier effects touch that index buffer; resolve + upscale then turns it into RGBA
// at this size; display-tier effects run on the RGBA image.
const OUTPUT_W = 1280;
const OUTPUT_H = 960;

// Fixed update rate, 60 ticks per second. The glitch state machine measures time in
// ticks, so changing this also changes how often glitches trigger.
const TARGET_FPS = 60;

// Palette indices. Index 0 is always transparent. Slot order matters: the bitmap font is
// indexized against C_WHITE, and that index is shifted up to reach the colored slots.
const C_BG = 1; // almost-black: the inside of the screen, used by BT.clear
const C_WHITE = 2; // pure white: the font's pixels land here; never drawn directly
const C_GREEN_DIM = 3; // faded green: low-priority text and chrome
const C_GREEN = 4; // PipBoy green: the main text color
const C_GREEN_BRIGHT = 5; // hot green: highlights and the cursor
const C_AMBER = 6; // amber: warning numbers (a nod to the alternative PipBoy palette)

// Layout for the terminal text, pre-computed in pixels so render() stays a list of draw
// calls rather than a math exercise. CHAR_W is how far the font advances per character;
// PragmataPro at 14 pixels is monospaced, so every character is 7 pixels wide.
const TEXT_LEFT = 14;
const TEXT_TOP = 18;
const LINE_HEIGHT = 14;
const CHAR_W = 7;

// Boot typing speed. Each character is revealed every BOOT_TICKS_PER_CHAR ticks, and
// every line (including an empty one) adds a BOOT_LINE_SPACER_TICKS pause - 6 ticks at 60
// ticks per second is 100 ms.
const BOOT_LINE_SPACER_TICKS = 6;
const BOOT_TICKS_PER_CHAR = 2;

// The boot sequence. Each entry is one line that appears character by character. Keep it
// short - with too many lines the demo takes a long time to finish booting.
const BOOT_LINES = [
    'ROBCO INDUSTRIES (TM) PIP-BOY 3000',
    'COPYRIGHT 2075 ROBCO IND.',
    '',
    'INITIATING BOOT SEQUENCE...',
    'LOADING FIRMWARE..............[ OK ]',
    'CHECKING RAD SENSORS..........[ OK ]',
    'GEIGER COUNTER................[ OK ]',
    'VAULT-TEC LINK................[FAIL]',
    'FALLBACK: LOCAL CACHE.........[ OK ]',
    '',
    '> WELCOME, RESIDENT 101',
];

// How many ticks the whole boot sequence takes: every line costs its characters times
// BOOT_TICKS_PER_CHAR plus the spacer pause, and an empty line costs only the pause. With
// the lines above that is 289 characters x 2 + 11 lines x 6 = 644 ticks, about 10.7
// seconds. Worked out once here instead of every frame.
const BOOT_TOTAL_TICKS = BOOT_LINES.reduce(
    (total, line) => total + line.length * BOOT_TICKS_PER_CHAR + BOOT_LINE_SPACER_TICKS,
    0,
);

// Status block contents, drawn under the boot text once it finishes. These never animate;
// they sit on the screen so the CRT effects have something to work on. Each entry is a
// label, a value, and a color name resolved by colorSlot(). The entries are laid out in
// STATUS_COLUMNS columns, STATUS_COLUMN_W pixels apart, reading left to right.
const STATUS_LINES = [
    ['HP', '125/125', 'green'],
    ['AP', '75/75', 'green'],
    ['RAD', '3/1000', 'dim'],
    ['CAPS', '1248', 'amber'],
    ['WEIGHT', '84/200', 'green'],
];
const STATUS_COLUMNS = 3;
const STATUS_COLUMN_W = 14 * CHAR_W;

// The status block's heading sits on the row right after the last boot line, and its
// entries on the rows below that. Row n of the terminal is at TEXT_TOP + n * LINE_HEIGHT,
// so the whole block fits between the boot text and the bottom of the 240-pixel screen.
const STATUS_HEADING_ROW = BOOT_LINES.length;

// The cursor blinks: on for half a second, off for half a second. 30 ticks at 60 ticks
// per second is 0.5 seconds. The cursor is a bright 7x12 block that sits just after the
// welcome line, where the next typed character would go.
const CURSOR_BLINK_TICKS = 30;
const CURSOR_W = 7;
const CURSOR_H = 12;

// Maps a status-line color name (kept as a string in STATUS_LINES so the table stays
// readable) to the matching palette slot.
function colorSlot(name) {
    if (name === 'amber') {
        return C_AMBER;
    }

    if (name === 'dim') {
        return C_GREEN_DIM;
    }

    return C_GREEN;
}

// PipBoy-style terminal showcase: a boot sequence and status block in green bitmap text,
// plus a JavaScript-side glitch state machine that rewrites post-process effect uniforms
// each tick. The effect stack is built explicitly so each piece is visible:
//   - PixelGlitch (pixel tier) on the logical r8uint index buffer for chunky band shifts.
//   - Palette resolve + upscale to RGBA at the drawing-buffer size (done by the engine).
//   - BarrelDistortion, ChromaticAberration, Interference, RollLine, Scanlines, RGBMask,
//     Vignette, Noise, Flicker, and Bloom (display tier) on that RGBA image.
// For a similar look in one line, use BT.preset.crtPipBoy() instead.
class Demo {
    // True once WebGPU post-process effects were installed in init().
    effectsAvailable = false;

    // The PragmataPro bitmap font, loaded in init().
    /** @type {BitmapFont | null} */
    font = null;

    // Tick count captured when the boot sequence started.
    bootStartTick = 0;

    // Ticks elapsed since bootStartTick, refreshed every update().
    ticksSinceBoot = 0;

    // True once the "Boot done" tag went onto the overlay's timing chart.
    bootTagged = false;

    // The pixel-tier glitch effect and the display-tier CRT effects, created in init()
    // when WebGPU is available. The glitch state machine rewrites their uniforms.
    pixelGlitch = null;
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

    // Every display-tier effect above, in chain order, so applyEffects() can rebuild the
    // chain when the reduced-motion preference changes.
    crtEffects = [];

    // Ticks remaining until the next glitch burst starts.
    glitchCooldown = 0;

    // Ticks remaining in the current glitch burst (0 means idle).
    glitchTicksLeft = 0;

    // Full duration of the current burst, used to build the envelope.
    glitchDuration = 0;

    // Active glitch type key, or GLITCH_TYPE.NONE when idle.
    glitchType = GLITCH_TYPE.NONE;

    // Peak intensity of the current burst (0..1), scaled by the envelope each tick.
    glitchPeak = 0;

    // Reused for the blinking cursor every frame, so drawing allocates no new Rect2i.
    cursorRect = new Rect2i(0, 0, 0, 0);

    // Pixel-art logical size, a 4x drawing buffer for the display-tier CRT stack, and an
    // overlay tuned to the terminal look.
    configure() {
        return {
            // The internal canvas is pixel-art sized. Game logic and draws write palette
            // indices into an r8uint buffer at this resolution. PixelGlitch sees that
            // buffer; display-tier CRT effects run later on RGBA after resolve + upscale.
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),

            // drawingBufferSize is required to enable the display tier of the
            // post-process chain. Without it there is no canvas-sized RGBA surface for
            // display-tier shaders, so BT.effectAdd throws for those effects. A clean 4x
            // integer scale maps each logical pixel to a 4x4 output block.
            drawingBufferSize: new Vector2i(OUTPUT_W, OUTPUT_H),

            // Let the demos layout show the full drawing buffer (the default CSS cap is
            // 960x720).
            maxCanvasSize: new Vector2i(OUTPUT_W, OUTPUT_H),

            // 'nearest' keeps the pixel-art crispness through the upscale; 'linear' would
            // soften it like an old TV signal. Change this to 'linear' to compare.
            outputUpscaleFilter: 'nearest',

            // The fixed update rate the glitch timings are measured in.
            targetFPS: TARGET_FPS,

            // Hide the small tilde toggle hint that normally sits in the bottom-left
            // corner. This is a full-screen CRT terminal, so a stray hint icon would
            // break the illusion (and show up in the curved-glass post-process). The
            // overlay itself still works: press the backquote key (`) to toggle it. The
            // hint is hidden, not disabled.
            isOverlayToggleHintVisible: false,

            // Overlay colors from this demo's own slots, plus the timing chart in rich
            // diagnostics mode and the renderer diagnostics bar.
            overlayStyle: {
                barPaletteIndex: C_BG,
                textPaletteIndex: C_GREEN,
                gapPaletteIndex: C_BG,
            },
            isOverlayTimingChartEnabled: true,
            overlayTimingChartDiagnostics: 'rich',
            isOverlayRendererDiagnosticsBarEnabled: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_GREEN,
                renderBarPaletteIndex: C_AMBER,
                warningPaletteIndex: C_AMBER,
                errorPaletteIndex: C_GREEN_BRIGHT,
                tagPaletteIndex: C_GREEN_DIM,
            },
        };
    }

    // Builds the palette, loads the font, and - when WebGPU is available - creates the
    // CRT effect stack and arms the glitch state machine. Returns false if the font fails
    // to load, which stops the demo with the error in the console.
    async init() {
        // Step 1: build the palette. Six scene colors, all in the low slots. The palette
        // is 256 entries long so the shared UI theme can live in the high slots
        // (240-251), far away from the greens.
        const palette = BT.paletteCreate(256);
        palette.set(C_BG, new Color32(8, 14, 8, 255)); // almost-black with a green tint
        palette.set(C_WHITE, Color32.white); // slot the font glyph pixels resolve to
        palette.set(C_GREEN_DIM, new Color32(40, 100, 60, 255)); // faded green
        palette.set(C_GREEN, new Color32(80, 200, 110, 255)); // PipBoy green
        palette.set(C_GREEN_BRIGHT, new Color32(170, 255, 190, 255)); // hot green
        palette.set(C_AMBER, new Color32(220, 180, 60, 255)); // Vault-Tec amber accent

        // Install the shared UI kit colors into slots 240-251. In this demo the kit only
        // draws the software-fallback note; the terminal itself stays hand-rolled so the
        // phosphor-green PipBoy look is untouched.
        applyTheme(palette);
        BT.paletteSet(palette);

        // Step 2: load the bitmap font. PragmataPro is a monospaced programming font - a
        // good fit for a fictional terminal. A .btfont is a BLIT386 bitmap font: a JSON
        // glyph table (bounds, offsets, and advance per character) plus a PNG glyph
        // atlas. A missing or broken file throws, so the load is wrapped in try/catch.
        try {
            this.font = await BitmapFont.load('/fonts/PragmataPro14.btfont');
        } catch (error) {
            console.error('[PipBoyDemo] Failed to load the PragmataPro font:', error);

            return false;
        }

        // Step 3: indexize the font. The font loads as a sprite sheet of white pixels.
        // indexize() walks every pixel, looks up its color in the palette, and replaces
        // the pixel with the matching slot index. After this the font's pixels carry
        // index C_WHITE, and BT.printFont can shift that index by an offset to recolor
        // the glyphs at draw time.
        this.font.getSpriteSheet().indexize(palette);

        // Step 4: boot animation timer. Ticks instead of wall-clock time keep the boot
        // animation deterministic even if the browser frame rate hiccups.
        this.bootStartTick = BT.ticks;

        // Post-process (pixel and display tiers) needs WebGPU. Software mode skips the
        // rest and tags the timing chart so the reduced mode is visible there too.
        this.effectsAvailable = isAvailable();

        if (!this.effectsAvailable) {
            BT.assignTag('Software renderer');

            return true;
        }

        // Step 5: pixel-tier effect (chunky glitch). PixelGlitch reads and writes the
        // logical index buffer (320x240 r8uint), so band shifts stay palette-native. If
        // the same shift ran after resolve + upscale, each band would span multiple
        // output pixels and lose the chunky retro look. bandHeight is the height of each
        // band in source pixels.
        this.pixelGlitch = new PixelGlitch();
        this.pixelGlitch.bandHeight = PIXEL_GLITCH_BAND_HEIGHT;
        this.pixelGlitch.intensity = 0; // 0 = no glitch; the state machine spikes it
        BT.effectAdd(this.pixelGlitch); // the effect's tier 'pixel' routes it

        // Step 6: display-tier stack. Order matters: barrel first (it warps the UVs the
        // rest of the chain inherits), then color and signal artifacts, then scanlines
        // and mask, then vignette, noise, and flicker, and finally bloom on top of the
        // modulated image.

        // Barrel distortion: simulates the curved glass of a CRT tube. Because this runs
        // after palette resolve + upscale, the curve is computed at 1280x960 and lines
        // stay smooth. Bending earlier, on the 320x240 grid, would quantize the curve and
        // produce visible step artifacts on diagonals.
        this.barrel = new BarrelDistortion();
        this.barrel.curvature = 0.05; // small tube; 0.10 would be a tiny pocket TV

        // Chromatic aberration: shifts the red and blue channels horizontally. Cheap CRT
        // optics produce a tiny version of this naturally. 0 at rest here; the
        // GLITCH_TYPE.CHROMASPLIT burst spikes it.
        this.aberration = new ChromaticAberration();
        this.aberration.aberration = ABERRATION_BASE;

        // Interference: per-row horizontal jitter that simulates analog signal noise. 0
        // at rest so the screen is calm between bursts; the GLITCH_TYPE.INTERFERENCE
        // burst spikes it.
        this.interference = new Interference();
        this.interference.amount = 0;

        // Roll line: a horizontal bright band slowly scrolls down the screen, like an old
        // TV that is not quite synced.
        this.rollLine = new RollLine();
        this.rollLine.amount = 0.1; // strength of the bright band
        this.rollLine.speed = 1.0; // how fast it scrolls

        // Scanlines: alternating bright and dark horizontal bands aligned to source pixel
        // rows.
        this.scanlines = new Scanlines();
        this.scanlines.amount = 0.55; // mix factor: 0 disables, 1 full effect
        this.scanlines.strength = -8; // sharper bands at more negative values

        // Match scanline density to logical rows so each source pixel row gets one
        // bright/dark cycle. Without this the scanlines would map to output rows and be
        // 4x denser than the underlying pixel art.
        this.scanlines.density = DISPLAY_H;

        // RGB shadow mask: a per-pixel R/G/B vertical-stripe pattern with darkened cell
        // borders, simulating the phosphor grille of an aperture-grille CRT.
        this.mask = new RGBMask();
        this.mask.intensity = 0.18; // 0 hides the mask, 1 = max influence
        this.mask.size = 6; // mask cell pitch in source pixels
        this.mask.border = 0.5; // border darkening within each cell

        // Vignette: edge darkening to sell the curved-glass illusion.
        this.vignette = new Vignette();
        this.vignette.amount = 0.35;

        // Noise: subtle film grain that changes every frame.
        this.noise = new Noise();
        this.noise.amount = NOISE_BASE;

        // Flicker: a brightness multiplier driven by the glitch state machine (1.0 means
        // no change).
        this.flicker = new Flicker();
        this.flicker.amount = FLICKER_BASE;

        // Bloom: a soft glow on bright pixels - the phosphor halo of an old monitor. Last
        // in the chain so it sees the final post-CRT image.
        this.bloom = new Bloom();
        this.bloom.spread = 3.0; // size of the bloom kernel
        this.bloom.glow = 0.18; // mix factor onto the original pixel

        // Keep the display-tier effects in chain order, then register them.
        // applyEffects() leaves out the moving ones when reduced motion is preferred.
        this.crtEffects = [
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
        ];
        this.applyEffects();

        // Step 7: glitch state machine state. See the file header for what each field
        // means. BT.random is the engine's shared random number generator; int(min, max)
        // returns a whole number from min up to but not including max, so the first burst
        // waits a random number of ticks instead of firing on frame 1.
        this.glitchCooldown = BT.random.int(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
        this.glitchTicksLeft = 0; // ticks remaining in the current burst; 0 means idle
        this.glitchDuration = 0;
        this.glitchType = GLITCH_TYPE.NONE;
        this.glitchPeak = 0;

        return true;
    }

    // Runs 60 times per second: advances the boot clock, tags the moment the boot text
    // completes, and - with WebGPU - feeds the animated effects and the glitch machine.
    update() {
        // 1. Drive the boot animation timer. Nothing is drawn here - render() reads
        // ticksSinceBoot and computes how many characters to show. update() provides
        // time.
        this.ticksSinceBoot = BT.ticks - this.bootStartTick;

        // Mark the end of the boot sequence on the overlay's timing chart, once.
        if (!this.bootTagged && this.ticksSinceBoot >= BOOT_TOTAL_TICKS) {
            this.bootTagged = true;
            BT.assignTag('Boot done');
        }

        // Software mode has no effects to drive, so the rest of update() is WebGPU-only.
        if (!this.effectsAvailable) {
            return;
        }

        // 2. Drive the time-based effects. RollLine, Noise, and Interference animate from
        // a seconds value. Converting ticks to seconds keeps the animation speed
        // independent of TARGET_FPS.
        const seconds = BT.ticks / TARGET_FPS;
        this.rollLine.time = seconds;
        this.noise.time = seconds;
        this.interference.time = seconds;

        // 3. Drive the glitch state machine - unless the player prefers reduced motion,
        // in which case the screen stays calm and no burst ever starts.
        if (!BT.isReducedMotionPreferred) {
            this.stepGlitchMachine();
        }
    }

    // Draws the terminal: the boot text as far as it has typed, then the status block
    // and the blinking cursor once the boot is done, plus the software-mode note.
    render() {
        // Fill the background. Even with the CRT stack on top, this is the "phosphor off"
        // color of every empty cell.
        BT.clear(C_BG);

        // Draw the boot sequence one character at a time, line by line.
        this.renderBootSequence();

        // Once every boot line is visible, draw the status block under it and the
        // blinking cursor after the welcome line.
        if (this.ticksSinceBoot >= BOOT_TOTAL_TICKS) {
            this.renderStatusBlock();
            this.renderBlinkingCursor();
        }

        // In software mode the CRT stack is skipped - say so with kit labels. Omitting
        // ui.panel() keeps the group borderless, so it reads as a plain two-line caption.
        // The note comes as two lines because one would run off the 320-pixel screen.
        if (!this.effectsAvailable) {
            ui.begin(UI_ANCHORS.BOTTOM_LEFT);

            for (const line of SOFTWARE_FALLBACK_LINES) {
                ui.label(line, { color: 'warm' });
            }

            ui.end();
        }
    }

    // The engine calls this when the reduced-motion preference changes while the demo
    // runs. A burst in flight is cut short so the screen settles at once, and the chain
    // is rebuilt with or without the moving effects.
    onReducedMotionChange() {
        if (!this.effectsAvailable) {
            return;
        }

        if (this.glitchTicksLeft > 0) {
            this.glitchTicksLeft = 0;
            this.glitchType = GLITCH_TYPE.NONE;
            resetGlitchUniforms(this);
        }

        this.applyEffects();
    }

    // Takes every display-tier effect off, then puts back the ones that should run: all
    // of them normally, and all but the grain, the brightness flicker, the rolling band,
    // and the row jitter (isMotionEffect() from crt-glitch.js) when the player prefers
    // reduced motion.
    // Removing first keeps the chain in its original order.
    applyEffects() {
        for (const fx of this.crtEffects) {
            BT.effectRemove(fx);
        }

        for (const fx of this.crtEffects) {
            if (BT.isReducedMotionPreferred && isMotionEffect(fx)) {
                continue;
            }

            BT.effectAdd(fx);
        }
    }

    // Advances the glitch state machine by one tick; called from update(). Either a burst
    // is running (count it down and drive the effect uniforms) or the screen is calm
    // (count down the cooldown and roll a fresh burst when it reaches zero).
    stepGlitchMachine() {
        if (this.glitchTicksLeft > 0) {
            // Inside a burst. Build an envelope that ramps up to glitchPeak and back
            // down: sin over 0..PI is a 0 -> 1 -> 0 hump across the lifetime of the
            // burst. t is 0 at the start and 1 at the end.
            const t = 1 - this.glitchTicksLeft / this.glitchDuration;
            const envelope = Math.sin(t * Math.PI); // 0 -> 1 -> 0

            // Scale the chosen burst's effect parameter by the envelope (see the file
            // header for which uniform each burst type drives).
            applyGlitchUniforms(this, envelope);

            // One tick of the burst is used up.
            this.glitchTicksLeft--;

            // When the burst ends, reset the uniforms so the screen calms down and roll
            // the next cooldown.
            if (this.glitchTicksLeft === 0) {
                resetGlitchUniforms(this);
                this.glitchCooldown = BT.random.int(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
            }
        } else {
            // No active glitch - count down to the next one.
            this.glitchCooldown--;

            if (this.glitchCooldown <= 0) {
                // Roll a new burst: pick() returns one item of the list, int() a whole
                // number in [min, max), float() a decimal in [min, max). The tag marks
                // the burst on the overlay's timing chart.
                this.glitchType = BT.random.pick(GLITCH_TYPES_CHROMA);
                BT.assignTag(`Glitch: ${this.glitchType}`);
                this.glitchDuration = BT.random.int(GLITCH_ACTIVE_MIN, GLITCH_ACTIVE_MAX);
                this.glitchTicksLeft = this.glitchDuration;
                this.glitchPeak = BT.random.float(GLITCH_INTENSITY_MIN, GLITCH_INTENSITY_MAX);

                // Reseed so the shader uses a new band-noise pattern this burst.
                this.pixelGlitch.seed = BT.random.float(0, 1000);
            }
        }
    }

    // Wraps BT.printFont so callers pass a target palette slot rather than the raw offset
    // the engine wants. C_WHITE is where the font's pixels live after indexize, so the
    // offset to reach `slot` is `slot - C_WHITE`.
    print(pos, text, slot) {
        BT.printFont(this.font, pos, text, slot - C_WHITE);
    }

    // Reveals BOOT_LINES one character at a time, slicing each string by how many ticks
    // have passed.
    renderBootSequence() {
        // A running budget of ticks: each line spends its share, and whatever is left
        // decides how much of the next line shows.
        let ticksLeft = this.ticksSinceBoot;

        for (let i = 0; i < BOOT_LINES.length; i++) {
            const fullLine = BOOT_LINES[i];
            const y = TEXT_TOP + i * LINE_HEIGHT;

            // Empty lines only consume the spacer ticks (so the pause between sections
            // feels right) and draw nothing.
            if (fullLine.length === 0) {
                ticksLeft -= BOOT_LINE_SPACER_TICKS;
                continue;
            }

            // How many characters of this line should be visible? Each one takes
            // BOOT_TICKS_PER_CHAR ticks. Clamp to [0, length].
            const charsToShow = Math.max(0, Math.min(fullLine.length, Math.floor(ticksLeft / BOOT_TICKS_PER_CHAR)));

            if (charsToShow === 0) {
                // A future line, not yet started. Stop - everything below is invisible
                // too.
                return;
            }

            // The part of the line typed so far.
            const visible = fullLine.slice(0, charsToShow);

            // Finished lines get the brighter green; a line still typing stays dim until
            // it completes.
            const slot = charsToShow >= fullLine.length ? C_GREEN : C_GREEN_DIM;
            this.print(new Vector2i(TEXT_LEFT, y), visible, slot);

            // Subtract this line's ticks from the running total before moving on.
            ticksLeft -= fullLine.length * BOOT_TICKS_PER_CHAR + BOOT_LINE_SPACER_TICKS;

            // Out of ticks: this line was the last one with anything to show.
            if (ticksLeft <= 0) {
                return;
            }
        }
    }

    // Draws the static status block under the boot text: a heading row, then the
    // entries in STATUS_COLUMNS columns. Each entry is a dim label followed by its value
    // in the value's own color.
    renderStatusBlock() {
        const headingY = TEXT_TOP + STATUS_HEADING_ROW * LINE_HEIGHT;
        this.print(new Vector2i(TEXT_LEFT, headingY), '== STATUS ==', C_GREEN_BRIGHT);

        for (let i = 0; i < STATUS_LINES.length; i++) {
            const [label, value, colorName] = STATUS_LINES[i];

            // Entry i goes in column i % STATUS_COLUMNS of row Math.floor(i /
            // STATUS_COLUMNS) under the heading: `%` is the remainder after division, so
            // the columns go 0, 1, 2, 0, 1 as i counts up.
            const x = TEXT_LEFT + (i % STATUS_COLUMNS) * STATUS_COLUMN_W;
            const y = TEXT_TOP + (STATUS_HEADING_ROW + 1 + Math.floor(i / STATUS_COLUMNS)) * LINE_HEIGHT;

            // The value starts one character after the label.
            this.print(new Vector2i(x, y), label, C_GREEN_DIM);
            this.print(new Vector2i(x + (label.length + 1) * CHAR_W, y), value, colorSlot(colorName));
        }
    }

    // Draws a blinking cursor right after the welcome line: a bright block visible for
    // half a second, then off for half a second, the way old terminals did it.
    renderBlinkingCursor() {
        // Math.floor(ticks / 30) counts up once every half second, and % 2 turns that
        // count into 0, 1, 0, 1 - so the cursor shows on the even half seconds.
        const phase = Math.floor(BT.ticks / CURSOR_BLINK_TICKS) % 2;

        if (phase === 0) {
            // One character past the end of the last boot line, on that line's row.
            const lastLine = BOOT_LINES[BOOT_LINES.length - 1];
            const x = TEXT_LEFT + (lastLine.length + 1) * CHAR_W;
            const y = TEXT_TOP + (BOOT_LINES.length - 1) * LINE_HEIGHT;

            BT.drawRectFill(this.cursorRect.set(x, y, CURSOR_W, CURSOR_H), C_GREEN_BRIGHT);
        }
    }
}

bootstrap(Demo);
