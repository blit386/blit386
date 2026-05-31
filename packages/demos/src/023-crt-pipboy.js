// @pageTitle Blit-Tech Demo 023 - PipBoy CRT
//
// Demo 023 - PipBoy CRT: a faux Fallout terminal with scanlines, glitches, and bloom.
//
// Demo 023 in the Blit-Tech demo series.
// We learned about the demo loop in the Basics demo: https://blit-tech-demos.vancura.dev/001-basics
// We learned about bitmap fonts in the Bitmap Font demo: https://vancura.dev/articles/blit-tech-bitmap-font
//
// Live article: https://vancura.dev/articles/blit-tech-pipboy-crt
//
// WHAT YOU WILL SEE
// A green-on-black terminal that looks like an old curved CRT screen. Scanlines, a soft
// glow (called "bloom"), and tiny noise speckles make the picture look like it is coming
// from a real cathode-ray tube. Every few seconds the picture glitches: a band of pixels
// jumps sideways, the color channels split apart, the whole screen flickers darker, or
// static noise rolls.
//
// WHAT YOU WILL LEARN
//   - "Post-processing": running effects on the WHOLE screen after we are done drawing it.
//   - The two effect TIERS Blit-Tech offers, and why they exist:
//       * pixel-tier: chunky, palette-native, runs on the logical index buffer at 320x240 (one byte per pixel).
//       * between tiers: the engine looks up each index in your palette and upscales to RGBA at canvas size.
//       * display-tier: smooth, simulates the physical screen, runs on that full-size RGBA image.
//   - How to compose individual effects (BarrelDistortion, Scanlines, RGBMask, ...) instead
//     of relying on a single big shader. The preset BT.preset.crtPipBoy() does this for you
//     in one line; here we build the stack explicitly so each piece is visible.
//   - A "state machine": a tiny set of rules that decides when to start a glitch, what kind,
//     and how long it lasts.
//
// HOW POST-PROCESSING WORKS
// Normally the engine draws straight to the screen. When you add an effect with BT.effectAdd
// the engine routes the scene through one or two effect chains. Each effect reads a texture,
// writes a new one, and the last effect in the display chain writes to the swap chain.
//
// Pixel-tier effects (e.g. PixelGlitch) operate on the logical framebuffer, which stores
// palette slot indices (GPU format r8uint) at 320x240 - not full RGBA yet. They stay
// palette-native: integer texture reads, no averaging into fake in-between colors.
//
// Next the engine runs palette LUT resolve plus upscale: each index becomes a real RGBA
// color and the image grows to the canvas size (here 1280x960). Display-tier effects
// (e.g. BarrelDistortion, Scanlines) run on that RGBA output. Crucially, BarrelDistortion
// does NOT bend the curve on the 320x240 index grid - lines stay smooth instead of
// breaking into stair-steps.
//
// HOW THE GLITCH STATE MACHINE WORKS
// We keep two counters:
//   - cooldown: ticks remaining until the NEXT glitch starts.
//   - active:   ticks remaining in the CURRENT glitch (0 means "no glitch right now").
// Every frame we count one down. When `active` runs out we decrement `cooldown`. When
// `cooldown` runs out we roll a new glitch (random type, random duration, random strength)
// and reset `active` to that duration. Each burst type drives different effect uniforms.
//
// SOFTWARE FALLBACK
// If the browser uses the Canvas 2D software renderer (WebGPU missing or
// ?backend=software), post-process effects are not available. The terminal
// scene, boot animation, and status block still run; only the CRT stack is skipped.
// An on-screen note explains the reduced mode.
//
// HOW THE BITMAP FONT COLORS WORK
// The font is loaded as a sprite sheet of WHITE glyph pixels. We "indexize" the sheet
// against our palette, which replaces each white pixel with the index of the white slot
// (C_WHITE). When we draw with BT.printFont(font, pos, text, offset), the engine adds
// `offset` to that index. So passing `C_GREEN - C_WHITE` shifts every glyph pixel from
// the white slot to the green slot. Same trick the Sprite Effects demo uses for tints.

// #region Imports

// Pull in everything we need from the engine. The new two-tier post-process API exposes
// each individual effect as its own class so we can compose them however we like.
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
} from 'blit-tech';

import { isPostProcessAvailable, SOFTWARE_FALLBACK_NOTE } from './shared/post-process-backend.js';

// #endregion

// #region Configuration

// The internal pixel resolution of the demo. Small numbers keep the pixel art look.
const DISPLAY_W = 320;
const DISPLAY_H = 240;

// Output resolution. Setting this 4x larger than the logical size gives the display-tier
// effects (barrel curve, scanlines, RGB mask) enough output pixels to render smoothly,
// and turns each logical pixel into a clean 4x4 block on screen.
//
// IMPORTANT: this is the SCREEN size we present at, NOT the pixel-art size. The game still
// draws palette indices into a 320x240 logical buffer. Pixel-tier effects touch that index
// buffer; then resolve + upscale turns it into RGBA at this size; display-tier effects run
// on the RGBA image.
const OUTPUT_W = 1280;
const OUTPUT_H = 960;

// We update at this rate (60 ticks per second). The glitch state machine measures
// time in ticks, so changing this also changes how often glitches trigger.
const TARGET_FPS = 60;

// Palette indices. Index 0 is always transparent. Slot order matters: the bitmap font
// is indexized against C_WHITE, and we shift that index up to reach the colored slots.
const C_BG = 1; // Almost-black: the inside of the screen. Used by BT.clear.
const C_WHITE = 2; // Pure white: the slot the font's pixels indexize to. Never drawn directly.
const C_GREEN_DIM = 3; // Faded green: low-priority text and chrome.
const C_GREEN = 4; // PipBoy green: the main text color.
const C_GREEN_BRIGHT = 5; // Hot green: highlights and the cursor.
const C_AMBER = 6; // Amber: warning numbers (a wink at the alternative PipBoy palette).

// Layout for the terminal text. We pre-compute everything in pixels so render()
// stays a list of draw calls rather than a math exercise.
const TEXT_LEFT = 14;
const TEXT_TOP = 18;
const LINE_HEIGHT = 14;

// How many ticks each "boot line" takes to type out. 6 ticks at 60 FPS = 100ms per line spacer.
// Each character within a line is revealed every `BOOT_TICKS_PER_CHAR` ticks.
const BOOT_LINE_SPACER_TICKS = 6;
const BOOT_TICKS_PER_CHAR = 2;

// The boot sequence. Each entry is one line that appears letter-by-letter.
// Keep this short - with too many lines the demo never finishes booting.
// Tip: read this top-to-bottom to imagine how a real PipBoy might wake up.
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

// Status block contents, drawn AFTER the boot sequence finishes. These never animate;
// they sit on the screen so the CRT effect has something colorful to chew on.
const STATUS_LINES = [
    ['HP', '125 / 125', 'green'],
    ['AP', ' 75 /  75', 'green'],
    ['RAD', '  3 / 1000', 'dim'],
    ['CAPS', '   1248', 'amber'],
    ['WEIGHT', '  84 / 200', 'green'],
];

// The cursor blinks: ON for half a second, OFF for half a second.
// 30 ticks at 60 FPS = 0.5 seconds. The cursor is just a bright square.
const CURSOR_BLINK_TICKS = 30;

// Glitch state machine tuning. All durations are in ticks (60 per second).
// MIN/MAX cooldown = how long the screen stays calm BETWEEN glitches.
// MIN/MAX active   = how long each glitch lasts once it starts.
// Larger values = a calmer demo; smaller values = chaos.
const GLITCH_COOLDOWN_MIN = 120; // 2 seconds
const GLITCH_COOLDOWN_MAX = 360; // 6 seconds
const GLITCH_ACTIVE_MIN = 5; // 0.083 seconds (a brief stutter)
const GLITCH_ACTIVE_MAX = 30; // 0.5 seconds  (a noticeable hiccup)

// The glitch personalities the state machine can pick from.
// Each one drives a different combination of effect uniforms. Strings are easier to read
// in `update()` than magic numbers when you decide to tune one of them.
const GLITCH_TYPES = ['hshift', 'chromasplit', 'noise', 'flicker', 'interference'];

// Multipliers per glitch type. We pick the strength for the current burst once and then
// blend it in for the lifetime of the burst (envelope: ramp up, hold, ramp down).
const GLITCH_INTENSITY_MIN = 0.35;
const GLITCH_INTENSITY_MAX = 1.0;

// Flicker dips the brightness of the WHOLE picture briefly. 1.0 = unmodulated; lower = darker.
const FLICKER_BASE = 1.0;
const FLICKER_DIP = 0.6;

// Resting values the glitch state machine returns to between bursts.
// ABERRATION_BASE is 0 so the screen is clean between bursts - chromasplit
// glitches then clearly pop the channel split on from nothing rather than
// boosting an already-visible split. NOISE_BASE is the constant faint grain.
const ABERRATION_BASE = 0;
const NOISE_BASE = 0.025;

// #endregion

// #region Type Definitions

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #endregion

// #region Helper Functions

/**
 * Returns a random integer in the half-open range [min, max).
 * Used by the glitch state machine to pick a fresh duration / cooldown each burst.
 *
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min));
}

/**
 * Returns a random float in [min, max).
 * Used to roll the strength of each glitch.
 *
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randFloat(min, max) {
    return min + Math.random() * (max - min);
}

/**
 * Returns a random element from `arr`. Used to pick a glitch personality.
 * Strings or numbers, doesn't matter.
 *
 * @template T
 * @param {readonly T[]} arr
 * @returns {T}
 */
function randPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Maps a status-line "color name" (kept as a string in STATUS_LINES so the table
 * is human-readable) to the matching palette slot.
 *
 * @param {string} name
 * @returns {number}
 */
function colorSlot(name) {
    if (name === 'amber') return C_AMBER;
    if (name === 'dim') return C_GREEN_DIM;
    return C_GREEN;
}

// #endregion

// #region Main Logic

/**
 * PipBoy-style terminal showcase. Renders a tiny boot sequence + status block in green
 * bitmap text, then drives a JS-side glitch state machine that mutates the post-process
 * effect uniforms each frame to produce occasional glitches.
 *
 * The effect stack is built explicitly here so each piece is visible:
 *   - PixelGlitch (pixel tier) on the logical r8uint index buffer for chunky band shifts.
 *   - Palette resolve + upscale to RGBA at canvas size (handled by the engine).
 *   - BarrelDistortion + ChromaticAberration + Interference + RollLine + Scanlines +
 *     RGBMask + Vignette + Noise + Flicker + Bloom (display tier) on that RGBA for the
 *     physical CRT simulation.
 *
 * If you want the same look in one line of code, use `BT.preset.crtPipBoy()` instead.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    configure() {
        return {
            // The internal canvas is pixel-art sized. Game logic and draws write palette
            // indices into an r8uint buffer at this resolution. PixelGlitch sees that buffer.
            // Display-tier CRT effects run later on RGBA after resolve + upscale below.
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),

            // drawingBufferSize is REQUIRED to enable the display tier of the post-process
            // chain. Without it, there is no canvas-sized RGBA surface for display-tier
            // shaders, so BT.effectAdd will throw for those effects. We pick a clean
            // 4x integer scale so each logical pixel maps to a 4x4 output block.
            drawingBufferSize: new Vector2i(OUTPUT_W, OUTPUT_H),

            // Let the demos layout show the full drawing buffer (default CSS cap is 960x720).
            maxCanvasSize: new Vector2i(OUTPUT_W, OUTPUT_H),

            // 'nearest' keeps the pixel-art crispness through the upscale; 'linear' would
            // soften it like an old TV signal. Try changing this to 'linear' to see the
            // softer look.
            outputUpscaleFilter: 'nearest',

            targetFPS: TARGET_FPS,

            // Hide the little "~" toggle hint that normally sits in the bottom-left
            // corner. This is a full-screen CRT terminal, so a stray hint icon would
            // break the illusion (and show up in the curved-glass post-process). The
            // stats overlay still opens: press the Backquote key (`) to toggle the
            // full dev HUD, press ` again to hide it. The hint is only hidden, not
            // disabled.
            isOverlayToggleHintVisible: false,

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

    async init() {
        // Step 1: build the palette
        // Six colors. Every effect on screen comes from these.
        const palette = BT.paletteCreate(16);
        palette.set(C_BG, new Color32(8, 14, 8, 255)); // Almost-black with green tint
        palette.set(C_WHITE, Color32.white); // Slot the font glyph pixels resolve to
        palette.set(C_GREEN_DIM, new Color32(40, 100, 60, 255)); // Faded green
        palette.set(C_GREEN, new Color32(80, 200, 110, 255)); // PipBoy green
        palette.set(C_GREEN_BRIGHT, new Color32(170, 255, 190, 255)); // Hot green highlights
        palette.set(C_AMBER, new Color32(220, 180, 60, 255)); // Vault-Tec amber accent
        BT.paletteSet(palette);

        // Step 2: load the bitmap font
        // PragmataPro is a monospaced programming font - a perfect fit for a fictional
        // terminal. The .btfont is a Blit-Tech bitmap font: a PNG glyph atlas plus a
        // small JSON describing each character's bounds.
        this.font = await BitmapFont.load('/fonts/PragmataPro14.btfont');

        // Step 3: indexize the font
        // The font is loaded as a sprite sheet of white pixels. "Indexize" walks every
        // pixel, looks up its color in the palette, and replaces the pixel with the
        // matching slot index. After this, the font's pixels carry index = C_WHITE, and
        // BT.printFont can shift that index by an offset to recolor the glyphs at draw time.
        this.font.getSpriteSheet().indexize(palette);

        // Post-process (pixel + display tiers) needs WebGPU. Software mode skips this block.
        this.postProcessAvailable = isPostProcessAvailable();

        if (!this.postProcessAvailable) {
            this.bootStartTick = BT.ticks;
            return true;
        }

        // Step 4: pixel-tier effect (chunky glitch)
        // PixelGlitch reads/writes the logical index buffer (320x240 r8uint) so band shifts
        // stay palette-native. If the same shift ran after resolve + upscale, each band
        // would span multiple output pixels and lose the chunky retro look.
        this.pixelGlitch = new PixelGlitch();
        this.pixelGlitch.bandHeight = 6; // height of each glitch band in source pixels
        this.pixelGlitch.intensity = 0; // 0 = no glitch right now (state machine will spike it)
        BT.effectAdd(this.pixelGlitch); // tier='pixel' on the effect routes this automatically

        // Step 5: display-tier stack
        // Order matters: barrel first (warps the UVs the rest of the chain inherits),
        // then color/signal artifacts, then scanlines and mask, then noise, then flicker,
        // and finally bloom on top of the modulated image.

        // Pincushion barrel distortion: simulates the curved glass of a CRT tube. Because
        // this runs AFTER palette resolve + upscale, the curve is computed at 1280x960
        // lines stay smooth. (Bending earlier on the 320x240 grid would quantize the curve
        // and produce visible step artifacts on diagonals.)
        this.barrel = new BarrelDistortion();
        this.barrel.curvature = 0.05; // small tube; 0.10 would be a tiny pocket TV

        // Chromatic aberration: shifts the red and blue channels horizontally. Cheap CRT
        // optics produce a tiny version of this naturally.
        this.aberration = new ChromaticAberration();
        this.aberration.aberration = ABERRATION_BASE;

        // Interference: per-row horizontal jitter that simulates analog signal noise.
        // Set to 0 at rest so the screen is calm between glitch bursts; the state
        // machine spikes this during an 'interference' burst.
        this.interference = new Interference();
        this.interference.amount = 0;

        // Roll line: a horizontal bright band slowly scrolls down the screen, like an
        // old TV that isn't quite sync'd.
        this.rollLine = new RollLine();
        this.rollLine.amount = 0.1; // strength of the bright band
        this.rollLine.speed = 1.0; // how fast it scrolls

        // Scanlines: alternating bright/dark horizontal bands aligned to source pixel rows.
        this.scanlines = new Scanlines();
        this.scanlines.amount = 0.55; // mix factor: 0 disables, 1 full effect
        this.scanlines.strength = -8; // sharper bands at more negative values
        // Match scanline density to logical rows so each source pixel row gets one
        // bright/dark cycle. Without this, the scanlines would map to OUTPUT rows and
        // be 4x denser than the underlying pixel art.
        this.scanlines.density = DISPLAY_H;

        // RGB shadow mask: per-pixel R/G/B vertical-stripe pattern with darkened cell
        // borders, simulating the phosphor grille of an aperture-grille CRT.
        this.mask = new RGBMask();
        this.mask.intensity = 0.18; // 0 hides the mask, 1 = max influence
        this.mask.size = 6; // mask cell pitch in source pixels
        this.mask.border = 0.5; // border darkening within each cell

        // Vignette: edge darkening to sell the curved-glass illusion.
        this.vignette = new Vignette();
        this.vignette.amount = 0.35;

        // Per-frame noise: subtle film grain that animates each frame.
        this.noise = new Noise();
        this.noise.amount = NOISE_BASE;

        // Flicker: a brightness multiplier driven by the glitch state machine.
        this.flicker = new Flicker();
        this.flicker.amount = FLICKER_BASE;

        // Bloom: a soft glow on bright pixels - the warm phosphor halo of an old monitor.
        // Stacked LAST so the bloom sees the final post-CRT image.
        this.bloom = new Bloom();
        this.bloom.spread = 3.0; // size of the bloom kernel
        this.bloom.glow = 0.18; // mix factor onto the original pixel

        // Register all display-tier effects in order.
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

        // Step 6: boot animation timer
        // We use ticks instead of wall-clock so the boot animation stays deterministic
        // even if the browser frame rate hiccups.
        this.bootStartTick = BT.ticks;

        // Step 7: glitch state machine state
        // See the file header for what each field means. We start in a long cooldown so
        // the first burst doesn't fire on frame 1.
        this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
        this.glitchActive = 0;
        this.glitchDuration = 0;
        this.glitchType = 'none';
        this.glitchPeak = 0;
        return true;
    }

    update() {
        if (!this.postProcessAvailable) {
            this._ticksSinceBoot = BT.ticks - this.bootStartTick;
            return;
        }

        // 1. Drive the boot animation timer
        // We don't draw here - render() reads `this._ticksSinceBoot` and computes how many
        // characters to show. update() just provides time.
        this._ticksSinceBoot = BT.ticks - this.bootStartTick;

        // 2. Drive the time-based effects every frame
        // RollLine, Noise, and Interference all need a wall-clock seconds value to drive
        // their animations. Convert ticks to seconds so the animation speed is independent
        // of TARGET_FPS.
        const seconds = BT.ticks / TARGET_FPS;
        this.rollLine.time = seconds;
        this.noise.time = seconds;
        this.interference.time = seconds;

        // 3. Drive the glitch state machine
        if (this.glitchActive > 0) {
            // We are inside a glitch burst. Build an "envelope": ramps up to glitchPeak,
            // holds, then ramps down. Sounds fancy - in practice it just makes a sin curve
            // over the lifetime of the burst (sin from 0 to PI is a nice 0 -> 1 -> 0 hump).
            const t = 1 - this.glitchActive / this.glitchDuration; // 0 at start, 1 at end
            const envelope = Math.sin(t * Math.PI); // 0 -> 1 -> 0

            this.applyGlitchUniforms(envelope);

            this.glitchActive--;
            // When the burst ends, reset the uniforms so the screen calms down.
            if (this.glitchActive === 0) {
                this.resetGlitchUniforms();
                this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
            }
        } else {
            // No active glitch - count down to the next one.
            this.glitchCooldown--;
            if (this.glitchCooldown <= 0) {
                // Roll a new burst. Pick a random type, duration, and peak strength.
                this.glitchType = randPick(GLITCH_TYPES);
                BT.assignTag(`Glitch: ${this.glitchType}`);
                this.glitchDuration = randInt(GLITCH_ACTIVE_MIN, GLITCH_ACTIVE_MAX);
                this.glitchActive = this.glitchDuration;
                this.glitchPeak = randFloat(GLITCH_INTENSITY_MIN, GLITCH_INTENSITY_MAX);
                // Reset the seed so the shader uses a new band-noise pattern this burst.
                this.pixelGlitch.seed = Math.random() * 1000;
            }
        }
    }

    /**
     * Layers the chosen glitch personality onto the resting effect uniforms.
     * Different burst types drive different effect uniforms - that is what gives each
     * burst its own visual feel.
     *
     * @param {number} envelope - 0 -> 1 -> 0 over the lifetime of the burst.
     */
    applyGlitchUniforms(envelope) {
        const peak = this.glitchPeak * envelope;

        // Reset to "calm" first, then layer the chosen personality.
        // This way two bursts back-to-back never accidentally inherit each other's settings.
        this.resetGlitchUniforms();

        if (this.glitchType === 'hshift') {
            // Pixel-tier band shift: chunky and palette-correct. Lives in 320x240 space
            // so each band is one source-pixel row tall.
            this.pixelGlitch.intensity = peak;
        } else if (this.glitchType === 'chromasplit') {
            // Boost chromatic aberration for a split-color look. The display-tier effect
            // works in output-pixel space so we get smooth fringes, not jagged ones.
            this.aberration.aberration = ABERRATION_BASE + peak * 4;
        } else if (this.glitchType === 'noise') {
            // Push noise up by a multiplier of its baseline. The noise reseeds every
            // frame, so this looks like crackling static.
            this.noise.amount = NOISE_BASE + peak * 0.08;
        } else if (this.glitchType === 'flicker') {
            // Whole-screen brightness dip via the Flicker effect. This is the "lights
            // flicker" moment in a horror movie.
            this.flicker.amount = FLICKER_BASE - (FLICKER_BASE - FLICKER_DIP) * envelope;
        } else if (this.glitchType === 'interference') {
            // Per-row jitter burst. At rest the interference amount is 0 (screen calm);
            // during this burst we spike it so the rows suddenly start jittering.
            this.interference.amount = peak * 0.06;
        }
    }

    /**
     * Returns every glitch-driven uniform to its resting value. Called between bursts
     * AND at the start of each frame inside applyGlitchUniforms() so the state machine
     * never accidentally inherits settings from the previous burst.
     */
    resetGlitchUniforms() {
        this.pixelGlitch.intensity = 0;
        this.aberration.aberration = ABERRATION_BASE;
        this.noise.amount = NOISE_BASE;
        this.flicker.amount = FLICKER_BASE;
        this.interference.amount = 0;
    }

    render() {
        // Fill the background. Even with the CRT effect on top, this becomes the
        // "phosphor off" color of every empty cell.
        BT.clear(C_BG);

        // Draw the boot sequence one character at a time, line by line.
        this.renderBootSequence();

        // Once the boot lines are all visible, draw the status block on the right.
        if (this.bootFullyDone()) {
            if (!this._bootTagged) {
                this._bootTagged = true;
                BT.assignTag('Boot done');
            }
            this.renderStatusBlock();
            this.renderBlinkingCursor();
        }

        if (!this.postProcessAvailable) {
            BT.systemPrint(new Vector2i(TEXT_LEFT, DISPLAY_H - 28), C_GREEN_DIM, SOFTWARE_FALLBACK_NOTE);
        }
    }

    /**
     * Wraps BT.printFont so callers pass a target palette slot rather than the
     * raw offset the engine wants. C_WHITE is where the font's pixels live after
     * indexize, so the offset to reach `slot` is `slot - C_WHITE`.
     *
     * @param {Vector2i} pos
     * @param {string} text
     * @param {number} slot - target palette slot index (e.g. C_GREEN)
     */
    print(pos, text, slot) {
        BT.printFont(this.font, pos, text, slot - C_WHITE);
    }

    /**
     * Reveals the BOOT_LINES one character at a time. We compute how many ticks have
     * passed and use that to slice the strings in place.
     */
    renderBootSequence() {
        let ticksLeft = this._ticksSinceBoot;

        for (let i = 0; i < BOOT_LINES.length; i++) {
            const fullLine = BOOT_LINES[i];
            const y = TEXT_TOP + i * LINE_HEIGHT;

            // Empty lines just consume a small spacer of ticks (so the pause between sections
            // feels right) and don't draw anything.
            if (fullLine.length === 0) {
                ticksLeft -= BOOT_LINE_SPACER_TICKS;
                continue;
            }

            // How many characters of THIS line should be visible? Each char takes
            // BOOT_TICKS_PER_CHAR ticks. Clamp to [0, length].
            const charsToShow = Math.max(0, Math.min(fullLine.length, Math.floor(ticksLeft / BOOT_TICKS_PER_CHAR)));
            if (charsToShow === 0) {
                // Future line, not yet started. Stop - everything below is also invisible.
                return;
            }

            const visible = fullLine.slice(0, charsToShow);
            // Pick the colour: lines that finished get the brighter green; lines mid-typing
            // stay dim until they complete. Subtle but adds life.
            const slot = charsToShow >= fullLine.length ? C_GREEN : C_GREEN_DIM;
            this.print(new Vector2i(TEXT_LEFT, y), visible, slot);

            // Subtract this line's ticks from the running total before moving on.
            ticksLeft -= fullLine.length * BOOT_TICKS_PER_CHAR + BOOT_LINE_SPACER_TICKS;
            if (ticksLeft <= 0) return;
        }
    }

    /**
     * Returns true once every boot line has been fully typed out.
     */
    bootFullyDone() {
        // Sum: every line costs (length * ticksPerChar + spacer); empty lines cost just spacer.
        let totalTicks = 0;
        for (const line of BOOT_LINES) {
            totalTicks += (line.length === 0 ? 0 : line.length * BOOT_TICKS_PER_CHAR) + BOOT_LINE_SPACER_TICKS;
        }
        return this._ticksSinceBoot >= totalTicks;
    }

    /**
     * Draws the static "stats" block on the right half of the screen.
     */
    renderStatusBlock() {
        const x = DISPLAY_W / 2 + 6;
        const y0 = TEXT_TOP;
        this.print(new Vector2i(x, y0), '== STATUS ==', C_GREEN_BRIGHT);

        for (let i = 0; i < STATUS_LINES.length; i++) {
            const [label, value, colorName] = STATUS_LINES[i];
            const y = y0 + (i + 2) * LINE_HEIGHT;
            this.print(new Vector2i(x, y), label, C_GREEN_DIM);
            // Right-align the value. Label sits at column 0; value sits at column 70px.
            // Hand-tuned for this font size - fine because both label and value are short.
            this.print(new Vector2i(x + 70, y), value, colorSlot(colorName));
        }
    }

    /**
     * Draws a blinking cursor below the boot text. A bright square that's visible for half
     * a second and then off for half a second. (Old terminals worked exactly like this.)
     */
    renderBlinkingCursor() {
        const phase = Math.floor(BT.ticks / CURSOR_BLINK_TICKS) % 2;
        if (phase === 0) {
            // The "I'm here" square. Sits one line below the last boot line.
            const lastLineY = TEXT_TOP + BOOT_LINES.length * LINE_HEIGHT;
            BT.drawRectFill(new Rect2i(TEXT_LEFT, lastLineY + 4, 7, 12), C_GREEN_BRIGHT);
        }
    }
}

bootstrap(Demo);

// #endregion
